#!/usr/bin/env node
// Spike: does the lint of a script survive when its context document is opened immediately before it? Compares raw
// back-to-back didOpen with an awaited request on the context document in between. See spike-context-documents.md.
//
// Usage: node run-context-spike.mjs
// Needs JDK 21 on PATH (run through `bash -ic 'sdk use java 21.0.11-tem && node ...'`) and continuum-workbench/.kotlin-ls.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '../../../..');
const command = join(root, 'continuum-workbench/.kotlin-ls/bin/kotlin-language-server');
const require = createRequire(join(root, 'continuum-workbench/node_modules/x.js'));
const rpc = require('vscode-jsonrpc/node');

const workspace = mkdtempSync(join(tmpdir(), 'ctx-spike-')); // EMPTY: no seed file
const uriOf = (name) => pathToFileURL(join(workspace, name)).href;

// ---- the reported declarations (what the node ships: the API file minus its package line) -----------------------------
const DECLARATIONS = `
/**
 * The \`flow\` object of a Kotlin script: reads the flow variables of the workflow and sets or updates this node's own.
 */
interface ScriptFlowVariables {

    /** Returns the current value of flow variable [name], or null when it is not set. */
    fun get(name: String): Any?

    /** Sets or updates flow variable [name] for downstream nodes. [value] must not be null. */
    fun set(name: String, value: Any?)

    /** All flow variables visible to the script: inherited ones overridden by those set by this node. */
    fun all(): Map<String, Any>
}
`;
const contextText = (key, declarations = DECLARATIONS) => `package continuum.${key}\n${declarations}`;
const wrapped = (key, user, n) =>
  `import continuum.${key}.*\nfun continuumScript${n}(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {\n${user}\n}\n`;
const HIDDEN_BEFORE = 2; // hidden lines before the user text in `wrapped`
const folded = (user, n) =>
  `package fold${n}\n${DECLARATIONS}\nfun continuumScript${n}(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {\n${user}\n}\n`;

// ---- process + connection ----------------------------------------------------------------------------------------------
const t0 = Date.now();
const child = spawn(command, [], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', () => {});
const connection = rpc.createMessageConnection(new rpc.StreamMessageReader(child.stdout), new rpc.StreamMessageWriter(child.stdin));
const published = new Map();
connection.onNotification('textDocument/publishDiagnostics', (p) => {
  const list = published.get(p.uri) ?? [];
  list.push({ at: Date.now(), diagnostics: p.diagnostics });
  published.set(p.uri, list);
});
connection.onNotification(() => {});
for (const m of ['workspace/configuration', 'client/registerCapability', 'client/unregisterCapability', 'window/workDoneProgress/create', 'workspace/workspaceFolders', 'window/showMessageRequest']) {
  connection.onRequest(m, (p) => (m === 'workspace/configuration' ? (p.items ?? []).map(() => null) : m === 'workspace/workspaceFolders' ? [] : null));
}
connection.listen();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let version = 0;
let counter = 0;
const open = async (name, text) => {
  const uri = uriOf(name);
  const at = Date.now();
  await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'kotlin', version: ++version, text } });
  return { uri, at };
};
const settle = async (doc, settleMs = 3000, capMs = 40000) => {
  const end = Date.now() + capMs;
  while (Date.now() < end) {
    const list = published.get(doc.uri) ?? [];
    if (list.length) {
      let last = list.length;
      await sleep(settleMs);
      while ((published.get(doc.uri) ?? []).length !== last) {
        last = published.get(doc.uri).length;
        await sleep(settleMs);
      }
      const all = published.get(doc.uri);
      return { firstMs: all[0].at - doc.at, publishes: all.length, diagnostics: all[all.length - 1].diagnostics };
    }
    await sleep(300);
  }
  return { firstMs: null, publishes: 0, diagnostics: [] };
};
const userDiagnostics = (diags, hidden, userLines) =>
  diags
    .map((d) => ({ line: d.range.start.line - hidden, sev: d.severity, code: d.code, msg: String(d.message).slice(0, 110) }))
    .filter((d) => d.line >= 0 && d.line < userLines);
const completion = async (doc, line, character, tries = 15) => {
  for (let i = 0; i < tries; i++) {
    const r = await connection.sendRequest('textDocument/completion', {
      textDocument: { uri: doc.uri },
      position: { line, character },
      context: { triggerKind: 2, triggerCharacter: '.' },
    });
    const items = Array.isArray(r) ? r : r?.items ?? [];
    if (items.length) return items;
    await sleep(1000);
  }
  return [];
};
const hover = async (doc, line, character) => {
  const r = await connection.sendRequest('textDocument/hover', { textDocument: { uri: doc.uri }, position: { line, character } });
  const c = r?.contents;
  return !c ? null : typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x.value ?? x).join('\n') : c.value;
};
const hasDoc = (items, name) => {
  const item = items.find((i) => String(i.label).startsWith(name));
  const d = item?.documentation;
  return item ? /flow variable|downstream|visible to the script/.test(typeof d === 'string' ? d : d?.value ?? '') : false;
};

const results = {};
const record = (name, value) => {
  results[name] = value;
  console.error(`${name}: ${JSON.stringify(value).slice(0, 600)}`);
};
const check = async (name, fn) => {
  try {
    record(name, await fn());
  } catch (e) {
    record(name, { error: String(e.message ?? e) });
  }
};

/** The probes of one script variant; [hidden] = hidden lines before the user text. */
async function probes(prefix, buildText, hidden) {
  const out = {};
  const run = (user) => {
    counter++;
    return open(`${prefix}-${counter}.kt`, buildText(user, counter));
  };
  let doc = await run('flow.');
  await sleep(1500);
  const items = await completion(doc, hidden, 5);
  const labels = items.map((i) => String(i.label));
  const sample = items.find((i) => String(i.label).startsWith('set'));
  let resolvedDoc = null;
  try {
    const resolved = await connection.sendRequest('completionItem/resolve', sample);
    resolvedDoc = resolved?.documentation ?? null;
  } catch (e) {
    resolvedDoc = `resolve failed: ${e.message}`;
  }
  out.completionDoc = { onItem: sample?.documentation ?? null, afterResolve: resolvedDoc, detail: sample?.detail ?? null };
  out.completion = { members: ['get', 'set', 'all'].filter((m) => labels.some((l) => l.startsWith(m))), kdocOnItems: ['get', 'set', 'all'].every((m) => hasDoc(items, m)), count: items.length };

  doc = await run('flow.set("a", 1)');
  await settle(doc, 1500, 15000);
  const text = await hover(doc, hidden, 6);
  out.hover = { kdoc: /Sets or updates flow variable/.test(text ?? ''), text: text ? text.slice(0, 160) : null };

  doc = await run('val x: Int = flow.all()');
  const bad = await settle(doc);
  const badDiags = userDiagnostics(bad.diagnostics, hidden, 1);
  out.typeMismatch = { found: badDiags.some((d) => d.sev === 1 && /mismatch/i.test(d.msg)), userDiagnostics: badDiags, allMessages: bad.diagnostics.map((d) => d.message.slice(0, 90)) };
  out.msOpenToFirstDiagnostics = bad.firstMs;

  doc = await run('row["a"]?.toString() + flow.get("x")');
  const ok = await settle(doc);
  out.validScript = {
    errorsOrUnresolved: ok.diagnostics.filter((d) => d.severity === 1 || /unresolved/i.test(d.message)).map((d) => d.message.slice(0, 90)),
    allDiagnostics: ok.diagnostics.map((d) => d.message.slice(0, 90)),
  };
  return out;
}

try {
  const rootUri = pathToFileURL(workspace).href;
  await connection.sendRequest('initialize', {
    processId: process.pid,
    clientInfo: { name: 'continuum-context-spike' },
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: 'ws' }],
    capabilities: {
      textDocument: {
        synchronization: { didSave: true },
        completion: { completionItem: { snippetSupport: false, documentationFormat: ['markdown', 'plaintext'] } },
        hover: { contentFormat: ['markdown', 'plaintext'] },
        publishDiagnostics: {},
      },
      workspace: { configuration: true, workspaceFolders: true },
      window: { workDoneProgress: true },
    },
  });
  await connection.sendNotification('initialized', {});
  record('initializedMs', Date.now() - t0);

  for (const mode of ['raw', 'raw', 'raw', 'raw', 'barrier', 'barrier', 'barrier', 'barrier', 'barrier', 'barrier']) {
    await check(`T: ${mode} #${++counter}`, async () => {
      const key = `ctxq${counter}`;
      const c = await open(`${key}.kt`, contextText(key));
      if (mode === 'barrier') await connection.sendRequest('textDocument/documentSymbol', { textDocument: { uri: c.uri } });
      const doc = await open(`script${key}.kt`, wrapped(key, 'val x: Int = flow.all()', 500 + counter));
      const d = await settle(doc, 1500, 8000);
      return { firstMs: d.firstMs, mismatch: d.diagnostics.some((x) => /mismatch/i.test(x.message)) };
    });
  }
  record(
    'diagnostics the server published on the context documents (dropped by the bridge)',
    Object.fromEntries([].map((k) => [k, (published.get(uriOf(`${k}.kt`)) ?? []).slice(-1)[0]?.diagnostics.map((d) => d.message.slice(0, 80)) ?? null]))
  );
} catch (e) {
  record('fatal', String(e.message ?? e));
}

console.log(JSON.stringify(results, null, 2));
try {
  await Promise.race([connection.sendRequest('shutdown'), sleep(5000)]);
  connection.sendNotification('exit');
} catch {
  // ignore
}
await sleep(1000);
if (child.exitCode === null) child.kill('SIGKILL');
process.exit(results.fatal ? 1 : 0);
