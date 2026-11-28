# System tests: nodes report script bindings (dynamic context)

## Round 1 — VERDICT: BLOCKED by one backend-bridge defect (FE-A below); nothing past "server ready" could be proven

### Environment
- Workbench rebuilt from the working tree (`yarn build:workbench`, exit 0, 21 s), run in dev mode on `:3005` with JDK 21, private `THEIA_CONFIG_DIR` seeded by `scripts/seed-kotlin-settings.js`, backend pid 2092700. Stopped by pid afterwards; temp dirs removed; `~/.continuum` untouched.
- Evidence kept in `evidence/` (`bridge.log`, `ui.log`, `run.log`, `shots/`).

### Failure (root cause)
`LspServerInitializer.waitUntilReady()` (`language-server-extension/src/node/LspServerInitializer.ts:87`) builds its readiness probe with `registration.virtualDocuments.plan('', 'readiness-probe')` — no context, no namespace. The Kotlin registration now throws for that
(`KotlinScriptRegistration.ts:54`: "A Kotlin script is planned only with the context its node reported"). So **every** Kotlin server start fails its readiness probe, is retried, and ends `unavailable`
(`run.log`: "Language server did not become ready: A Kotlin script is planned only with the context its node reported", repeated per restart). Unit specs miss it because the initializer spec uses a fake registration.
Fix direction (FE): the probe must not depend on a node context (e.g. probe with a context-free plain document / let the registration expose a probe document, or tolerate `undefined` context in `plan` for the probe).

### AC coverage
| AC | Check(s) | File | Result |
|---|---|---|---|
| AC-1 reported shape | helper `reportedContextFromFeatureSource()` = bindings `row: Map<String, Any>`, `flow: ScriptFlowVariables`; declarations (883 chars) byte-identical to the compiled `build/resources/main/script-context/ScriptFlowVariables.kt` minus the package line; node-side test `KotlinScriptReportedContextTest` result XML present (stack metadata fetch not done: no platform stack running) | `lib/kotlin-script.mjs` | PASS (suite feed == node's reported context) |
| AC-4 real fwcd server with reported declarations (completion+KDoc hover, type mismatch, valid silent) | bridge group `context` | `suites/api/kotlin-lsp-bridge.mjs` | **FAIL / NOT VERIFIED** — suite aborts at the first handshake (server `unavailable`, 90 s timeout); only 1 check passed (no process before first connect). Spike-time evidence (16/16) not repeated |
| AC-7 no/bad context ⇒ plain editor | UI `no-context` (3 checks), `bad-context` (5 malformed reports) | `suites/ui/kotlin-lsp.mjs` | PASS (no chip, footer, connection, provider, marker; typing + save OK) |
| AC-8 two contexts isolated, shared docs | bridge `context`; UI `twocontexts` | both | **FAIL** (server never ready) |
| AC-9 context docs / URI allow-list / no seed | bridge `security`, `documents`, `leak` | bridge | NOT VERIFIED (suite aborted) |
| AC-10 dialog: `flow.` completion (screenshots), hover KDoc, diagnostic, valid, save | UI `completion`, `valid`, `diagnostics`, `hover` | UI | **FAIL** (chip `unavailable`; shots `klsp-01..04-*-not-ready.png`); `save` PASS ×3 (stored text == typed text, no hidden prelude) |
| AC-2, AC-3, AC-5, AC-6, AC-11, AC-12 | unit/review ACs, not [system-api] | – | out of scope here |

Counts — bridge: 1 passed, 1 failed (aborts); UI (no-context, bad-context, twocontexts, completion, valid, diagnostics, hover, save): 11 passed, 5 failed (all the failures = "server becomes ready").

### Findings
- **FE-A:** readiness probe throws because `plan()` needs a context — expected server `ready`, actual `unavailable` for every Kotlin dialog — `LspServerInitializer.waitUntilReady` → `kotlinScriptRegistration.virtualDocuments.plan('', 'readiness-probe')`.

Plain-language: after the change, the Kotlin editor's background "is the server alive?" check no longer works, so the status chip always says "unavailable" and no completion/hover/errors appear in the Script dialog. Editing and saving still work. Needs a frontend fix; then rerun the bridge `context` group and the UI scenarios.

### Files changed
None (no test or production change this round).

### Commands run
| Command | Result |
|---|---|
| `bash -ic 'cd continuum-workbench && yarn build:workbench'` | exit 0 |
| `theia start --plugins=local-dir:./plugins --port 3005` (JDK 21, private config/workspace dirs, idle timeout 15 s) | up, pid 2092700 |
| `WORKBENCH_URL=http://127.0.0.1:3005 BACKEND_PID=2092700 IDLE_TIMEOUT_SECONDS=15 LEAK_PROBE_DIR=<cwd> node suites/api/kotlin-lsp-bridge.mjs` | 1 passed, 1 failed |
| `ONLY=no-context,bad-context,twocontexts,completion,valid,diagnostics,hover,save node suites/ui/kotlin-lsp.mjs` | 11 passed, 5 failed (server ready) |
| context comparison script (helper vs compiled resource) | bindings + declarations identical |
