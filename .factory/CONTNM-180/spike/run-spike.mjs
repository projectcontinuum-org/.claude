#!/usr/bin/env node
// Spike driver: launches a Kotlin language server over stdio and runs the scenarios a Kotlin Script node editor needs
// (valid script, type error, completion, hover, signature help) against a virtual document = prelude + user script.
//
// Usage:
//   node run-spike.mjs --name <label> --mode <kt|kts> --workspace <dir> --cmd <executable> [--arg <a>]... \
//        [--env K=V]... [--init-options '<json>'] [--settings '<json>'] [--no-disk] [--timeout-ms 180000] [--no-root]
//
// Needs `vscode-jsonrpc` (resolved from continuum-workbench/node_modules, override with SPIKE_NODE_MODULES).
// Exit code 0 when the server answered `initialize` and every scenario ran (a scenario's *result* is data, not a failure).
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const multi = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const label = opt('name', 'server');
const mode = opt('mode', 'kt');
const workspace = resolve(opt('workspace', '.'));
const command = opt('cmd');
const timeoutMs = Number(opt('timeout-ms', '180000'));
const initOptions = opt('init-options') ? JSON.parse(opt('init-options')) : undefined;
const noRoot = args.includes('--no-root');
const settings = opt('settings') ? JSON.parse(opt('settings')) : undefined; // sent as workspace/didChangeConfiguration
const writeToDisk = !args.includes('--no-disk'); // documents exist only in the server's memory (didOpen), not on disk
const serverArgs = multi('arg');
const extraEnv = Object.fromEntries(multi('env').map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
if (!command) {
  console.error('--cmd is required');
  process.exit(2);
}

const nodeModules = process.env.SPIKE_NODE_MODULES ?? resolve(import.meta.dirname, '../../../../continuum-workbench/node_modules');
const require = createRequire(join(nodeModules, 'x.js'));
const rpc = require('vscode-jsonrpc/node');
const ext = mode === 'kt' ? 'kt' : 'kts';

// ---- the virtual documents -------------------------------------------------------------------------------------------
// One shared context file declares what the node binds (`ScriptFlowVariables`, `row`, `flow`); every user document is a
// small hidden prelude (package + imports [+ function header]) followed by the text the user typed. A distinct package
// per document keeps two open editors from clashing on declarations.
const CONTEXT = [
  'package continuum',
  '',
  'class ScriptFlowVariables {',
  '    /** Returns the current value of flow variable [name], or null when it is not set. */',
  '    fun get(name: String): Any? = null',
  '    /** Sets or updates flow variable [name] for downstream nodes. */',
  '    fun set(name: String, value: Any?) {}',
  '    /** All flow variables visible to the script. */',
  '    fun all(): Map<String, Any> = emptyMap()',
  '}',
  '',
  'val row: Map<String, Any> = emptyMap()',
  'val flow: ScriptFlowVariables = ScriptFlowVariables()',
  '',
].join('\n');
let documentCounter = 0;
// Leading `import` lines of the user's text stay on top (kotlin only accepts imports before declarations); the hidden
// header goes right after them. `importCount` = user lines before the header, `headerLines` = hidden lines inserted.
let importCount = 0;
let headerLines = 0;
const wrap = (userText) => {
  const id = ++documentCounter;
  const lines = userText.split('\n');
  importCount = 0;
  while (importCount < lines.length && /^\s*import\s/.test(lines[importCount])) importCount++;
  const header =
    mode === 'kt'
      ? ['import continuum.ScriptFlowVariables', `fun continuumScript${id}(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {`]
      : ['import continuum.row', 'import continuum.flow'];
  headerLines = header.length;
  const text = [...lines.slice(0, importCount), ...header, ...lines.slice(importCount)].join('\n');
  return text + (mode === 'kt' ? '\n}\n' : '\n');
};
/** Virtual line -> user line (null when the line belongs to the hidden header/footer). */
const toUserLine = (virtualLine) => {
  if (virtualLine < importCount) return virtualLine;
  if (virtualLine < importCount + headerLines) return null;
  return virtualLine - headerLines;
};
const userLine = (line) => (line < importCount ? line : line + headerLines); // user line -> virtual line

// ---- process + connection -------------------------------------------------------------------------------------------
mkdirSync(workspace, { recursive: true });
// the shared context file exists on disk before the server starts, as the bridge would create it
writeFileSync(join(workspace, 'ContinuumContext.kt'), CONTEXT);
const t0 = Date.now();
const child = spawn(command, serverArgs, { cwd: workspace, env: { ...process.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
const stderrTail = [];
child.stderr.on('data', (d) => {
  stderrTail.push(...d.toString().split('\n'));
  if (stderrTail.length > 40) stderrTail.splice(0, stderrTail.length - 40);
});
child.on('exit', (code, signal) => console.error(`[${label}] server exited code=${code} signal=${signal}`));
const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(child.stdout), new rpc.StreamMessageWriter(child.stdin));

const published = new Map(); // uri -> [{at, diagnostics}]
connection.onNotification('textDocument/publishDiagnostics', (p) => {
  const list = published.get(p.uri) ?? [];
  list.push({ at: Date.now(), diagnostics: p.diagnostics });
  published.set(p.uri, list);
});
connection.onNotification(() => {});
const answerToServerRequest = (method, params) => {
  if (method === 'workspace/configuration') return (params.items ?? []).map(() => null);
  if (method === 'workspace/workspaceFolders') return [];
  return null;
};
for (const method of ['workspace/configuration', 'client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create', 'workspace/workspaceFolders', 'window/showMessageRequest', 'workspace/diagnostic/refresh', 'workspace/semanticTokens/refresh', 'workspace/inlayHint/refresh']) {
  connection.onRequest(method, (params) => answerToServerRequest(method, params));
}
connection.listen();

/** Sum of the resident memory of the server process and all of its descendants, in MB. */
const rssMb = () => {
  try {
    const pids = new Set([String(child.pid)]);
    let frontier = [String(child.pid)];
    while (frontier.length) {
      const next = [];
      for (const pid of frontier) {
        const kids = execSync(`pgrep -P ${pid} || true`).toString().split('\n').filter(Boolean);
        for (const kid of kids) {
          if (!pids.has(kid)) {
            pids.add(kid);
            next.push(kid);
          }
        }
      }
      frontier = next;
    }
    const kb = execSync(`ps -o rss= -p ${[...pids].join(',')}`).toString().split('\n').map((s) => Number(s.trim()) || 0);
    return Math.round(kb.reduce((a, b) => a + b, 0) / 1024);
  } catch {
    return -1;
  }
};

const withTimeout = (promise, ms, what) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms: ${what}`)), ms))]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = { server: label, mode, command, serverArgs, workspace, scenarios: {} };
let documentVersion = 0;
let capabilities;

async function openDoc(fileName, userText) {
  const uri = pathToFileURL(join(workspace, fileName)).href;
  const text = wrap(userText);
  if (writeToDisk) writeFileSync(join(workspace, fileName), text);
  const openedAt = Date.now();
  await connection.sendNotification('textDocument/didOpen', {
    textDocument: { uri, languageId: 'kotlin', version: ++documentVersion, text },
  });
  return { uri, openedAt };
}

/** Collects diagnostics after didOpen: published ones (waiting for the stream to settle) or, failing that, pulled ones. */
async function diagnosticsFor(uri, openedAt, settleMs = 4000, capMs = timeoutMs) {
  const deadline = Date.now() + capMs;
  while (Date.now() < deadline) {
    const list = published.get(uri) ?? [];
    if (list.length) {
      let last = list.length;
      await sleep(settleMs);
      while ((published.get(uri) ?? []).length !== last) {
        last = published.get(uri).length;
        await sleep(settleMs);
      }
      const all = published.get(uri);
      return { firstMs: all[0].at - openedAt, settledMs: all[all.length - 1].at - openedAt, publishes: all.length, diagnostics: all[all.length - 1].diagnostics, via: 'publish' };
    }
    if (capabilities?.diagnosticProvider && Date.now() - openedAt > 3000) {
      try {
        const r = await connection.sendRequest('textDocument/diagnostic', { textDocument: { uri } });
        if (r?.items) {
          return { firstMs: Date.now() - openedAt, settledMs: Date.now() - openedAt, publishes: 1, diagnostics: r.items, via: 'pull' };
        }
      } catch {
        // pull can fail while the server is still indexing; retry
      }
    }
    await sleep(500);
  }
  return { firstMs: null, diagnostics: null, via: 'none (timeout)' };
}

/** Diagnostics mapped back to user coordinates; a diagnostic that starts in the hidden header/footer is dropped. */
const brief = (diags) =>
  (diags ?? [])
    .map((d) => ({
      sev: d.severity,
      code: d.code,
      msg: String(d.message).slice(0, 160),
      line: toUserLine(d.range.start.line),
      col: d.range.start.character,
      endLine: toUserLine(d.range.end.line),
      endCol: d.range.end.character,
    }))
    .filter((d) => d.line !== null);

async function scenario(name, fn) {
  const started = Date.now();
  try {
    results.scenarios[name] = { ...(await fn()), wallMs: Date.now() - started };
  } catch (e) {
    results.scenarios[name] = { error: String(e.message ?? e), wallMs: Date.now() - started };
  }
  console.error(`[${label}] ${name}: ${JSON.stringify(results.scenarios[name]).slice(0, 400)}`);
}

async function completionAt(uri, line, character, retries) {
  let items = [];
  for (let attempt = 0; attempt < retries; attempt++) {
    const r = await connection.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line: userLine(line), character },
      context: { triggerKind: 2, triggerCharacter: '.' },
    });
    items = Array.isArray(r) ? r : r?.items ?? [];
    if (items.length) break;
    await sleep(1000);
  }
  return items;
}

try {
  const rootUri = noRoot ? null : pathToFileURL(workspace).href;
  const init = await withTimeout(
    connection.sendRequest('initialize', {
      processId: process.pid,
      clientInfo: { name: 'continuum-spike' },
      rootUri,
      workspaceFolders: noRoot ? null : [{ uri: rootUri, name: 'ws' }],
      initializationOptions: initOptions,
      capabilities: {
        textDocument: {
          synchronization: { didSave: true },
          completion: { completionItem: { snippetSupport: false, documentationFormat: ['markdown', 'plaintext'] } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: { signatureInformation: { documentationFormat: ['markdown', 'plaintext'] } },
          publishDiagnostics: {},
          diagnostic: { dynamicRegistration: false },
          definition: {},
        },
        workspace: { configuration: true, workspaceFolders: true },
        window: { workDoneProgress: true },
      },
    }),
    timeoutMs,
    'initialize',
  );
  capabilities = init.capabilities;
  results.initializeMs = Date.now() - t0;
  results.serverInfo = init.serverInfo;
  results.capabilities = Object.keys(capabilities).filter((k) => capabilities[k]);
  await connection.sendNotification('initialized', {});
  console.error(`[${label}] initialized in ${results.initializeMs}ms`);
  if (settings) await connection.sendNotification('workspace/didChangeConfiguration', { settings });

  await scenario('type-error (expect error at 0:13..0:16 for `val x: Int = "a"`)', async () => {
    const doc = await openDoc(`Err.${ext}`, 'val x: Int = "a"');
    const d = await diagnosticsFor(doc.uri, doc.openedAt);
    results.coldStartToFirstDiagnosticsMs = d.firstMs === null ? null : doc.openedAt - t0 + d.firstMs;
    return { ...d, diagnostics: brief(d.diagnostics) };
  });

  results.rssAfterFirstDocMb = rssMb();

  await scenario('valid-script (no diagnostics expected)', async () => {
    const doc = await openDoc(`Valid.${ext}`, 'row["a"]?.toString() + flow.get("x")');
    const d = await diagnosticsFor(doc.uri, doc.openedAt, 4000, 15000);
    return { ...d, diagnostics: brief(d.diagnostics) };
  });
  
  await scenario('type-error-on-line-3', async () => {
    const doc = await openDoc(`Err3.${ext}`, '// a\n// b\nval x: Int = "a"');
    const d = await diagnosticsFor(doc.uri, doc.openedAt);
    return { ...d, diagnostics: brief(d.diagnostics) };
  });

  await scenario('fix-clears-error (didChange from error to valid)', async () => {
    const doc = await openDoc(`Fix.${ext}`, 'val x: Int = "a"');
    await diagnosticsFor(doc.uri, doc.openedAt, 1500);
    const before = (published.get(doc.uri) ?? []).length;
    const fixedText = wrap('val x: Int = 1\nx');
    const changedAt = Date.now();
    await connection.sendNotification('textDocument/didChange', { textDocument: { uri: doc.uri, version: ++documentVersion }, contentChanges: [{ text: fixedText }] });
    await sleep(6000);
    const list = published.get(doc.uri) ?? [];
    const last = list[list.length - 1];
    return { newPublishes: list.length - before, msToLastPublish: last ? last.at - changedAt : null, remainingErrors: brief(last?.diagnostics).filter((x) => x.sev === 1).length };
  });

  await scenario('script with import line (hoisted above the hidden header)', async () => {
    const doc = await openDoc(`Imp.${ext}`, 'import java.time.Instant\nval x: Int = "a"\nInstant.now().toString() + flow.get("x")');
    const d = await diagnosticsFor(doc.uri, doc.openedAt);
    const items = await completionAt(doc.uri, 2, 8, 3);
    return { ...d, diagnostics: brief(d.diagnostics), completionAfterImportCount: items.length };
  });

  await scenario('completion after `flow.`', async () => {
    const doc = await openDoc(`Compl.${ext}`, 'flow.');
    await sleep(2000);
    const started = Date.now();
    const items = await completionAt(doc.uri, 0, 5, 20);
    const labels = items.map((i) => i.label);
    return { latencyMs: Date.now() - started, count: items.length, hasGetSetAll: ['get', 'set', 'all'].every((n) => labels.some((l) => String(l).startsWith(n))), sample: labels.slice(0, 12) };
  });

  await scenario('completion of stdlib on `row.`', async () => {
    const doc = await openDoc(`Compl2.${ext}`, 'row.');
    await sleep(1000);
    const items = await completionAt(doc.uri, 0, 4, 5);
    const labels = items.map((i) => i.label);
    return { count: items.length, hasMapMembers: ['get', 'keys', 'entries'].every((n) => labels.some((l) => String(l).startsWith(n))), sample: labels.slice(0, 10) };
  });

  await scenario('hover on `flow.set`', async () => {
    const doc = await openDoc(`Hover.${ext}`, 'flow.set("a", 1)');
    await diagnosticsFor(doc.uri, doc.openedAt, 1500);
    const started = Date.now();
    const r = await connection.sendRequest('textDocument/hover', { textDocument: { uri: doc.uri }, position: { line: userLine(0), character: 6 } });
    const contents = r?.contents;
    const value = !contents ? null : typeof contents === 'string' ? contents : Array.isArray(contents) ? contents.map((c) => c.value ?? c).join('\n') : contents.value;
    return { latencyMs: Date.now() - started, text: value ? String(value).slice(0, 400) : null, mentionsKdoc: /downstream nodes|flow variable/i.test(String(value)) };
  });

  await scenario('signature help on `flow.set(`', async () => {
    const doc = await openDoc(`Sig.${ext}`, 'flow.set(');
    await diagnosticsFor(doc.uri, doc.openedAt, 1500);
    const r = await connection.sendRequest('textDocument/signatureHelp', {
      textDocument: { uri: doc.uri },
      position: { line: userLine(0), character: 9 },
      context: { triggerKind: 2, triggerCharacter: '(', isRetrigger: false },
    });
    return { signatures: (r?.signatures ?? []).map((s) => s.label) };
  });

  await scenario('stdlib type resolution (`listOf(1).map { it * 2 }.sum()`)', async () => {
    const doc = await openDoc(`Std.${ext}`, 'listOf(1).map { it * 2 }.sum()');
    const d = await diagnosticsFor(doc.uri, doc.openedAt);
    return { ...d, diagnostics: brief(d.diagnostics) };
  });

  results.rssFinalMb = rssMb();
  results.totalWallMs = Date.now() - t0;
} catch (e) {
  results.fatal = String(e.message ?? e);
  results.stderrTail = stderrTail.slice(-15);
  results.rssFinalMb = rssMb();
}

console.log(JSON.stringify(results, null, 2));
try {
  await Promise.race([connection.sendRequest('shutdown'), sleep(5000)]);
  connection.sendNotification('exit');
} catch {
  // ignore
}
await sleep(1500);
if (child.exitCode === null) child.kill('SIGKILL');
process.exit(results.fatal ? 1 : 0);
