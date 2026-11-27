# Plan: Kotlin language-server support in the workbench (Kotlin Script node + `.kt`/`.kts` files)

Source: `01-requirements.md` (READY FOR PLANNING, option 1, decisions D-1…D-6). Round 1.
Run every command through `bash -ic` with `sdk use java 21.0.11-tem` (environment.md Local policy). Node 24 / Yarn 1.22 are available.

## Design in one paragraph (so tasks stay small and generic)
A **new Yarn workspace** `continuum-workbench/language-server-extension` (`@continuum/language-server-extension`, Theia extension with `common/`, `node/` and `browser/`) holds all LSP plumbing and knows **no language**. Per language there is one *language registration* (a data object implementing `LanguageServerRegistration`: language id, server launch spec, virtual-document factory = prelude + position mapping, status texts). Kotlin is the only registration, living in `src/kotlin/` (+ `src/node/…` launch spec). `workflow-editor-extension` only gets a thin hook (`useLanguageIntelligence`) in `MonacoEditorWrapper`/`CodeEditorRenderer` that asks the generic client "attach to this model for language X"; if no registration exists for X nothing happens (today's behaviour for Rest/CreateTable/Claude nodes).

Units (single responsibility each):
- `common/LanguageServerRegistration.ts` – interfaces: `LanguageServerRegistration`, `ServerLaunchSpec`, `VirtualDocumentFactory` (`wrap(userText) → {text, toUser(position), toVirtual(position)}`), `StatusTexts`. Pure types.
- `common/PositionMapper.ts` – pure line/column mapping between user text and virtual (prelude + text) document; also range/diagnostic filtering (drop diagnostics inside the prelude, shift others).
- `common/DiagnosticFilter.ts` – pure: removes registration-declared known false positives.
- `common/LspProtocolPaths.ts` – channel path constants (`/services/language-server/<languageId>`), URI scheme validation helper (`isAllowedVirtualUri`).
- `node/LanguageServerProcess.ts` – spawns/stops one child process from a `ServerLaunchSpec`, `-Xmx` cap, stderr to logger; no knowledge of channels.
- `node/LanguageServerLifecycle.ts` – lazy start on first connection, idle shutdown timer, crash restart with back-off, state events (`starting|ready|unavailable`); depends on a `ProcessFactory` + `Clock` interfaces (injectable for tests).
- `node/LanguageServerBridgeContribution.ts` – Theia `MessagingService.Contribution`: for each registered language opens a WS channel and relays JSON-RPC (stdio ⇄ channel) using `LanguageServerLifecycle`; rejects unknown language ids and non-virtual URIs.
- `node/LanguageServerRegistry.ts` – inversify multi-binding collector (`LanguageServerRegistration` contribution provider).
- `browser/LspConnection.ts` – frontend JSON-RPC (`vscode-jsonrpc`) connection over the Theia WS channel; reconnect; exposes status.
- `browser/MonacoLspAdapter.ts` – registers Monaco providers (completion, hover, signature help, definition) and diagnostics → `setModelMarkers` for one attached model; disposes everything on detach. Uses the position mapper. (Thin custom adapter chosen unless the spike proves `monaco-languageclient` fits Monaco 1.108 – D-2/risk table.)
- `browser/LanguageIntelligenceService.ts` – `attach(model, languageId) → Disposable`; owns per-document virtual URI (`continuum-script:/<uuid>.<ext>`), didOpen/didChange/didClose, so two dialogs never cross-talk; exposes `status$`.
- `browser/LanguageStatusView` (React `LanguageServerStatus.tsx`) – tiny presentational status chip.
- `src/kotlin/KotlinScriptRegistration.ts` + `KotlinScriptPrelude.ts` – the only Kotlin-specific frontend code (language id `kotlin`, prelude text, status texts, known false-positive filter).
- `src/node/kotlin/KotlinServerLaunchSpec.ts` – the only Kotlin-specific backend code (command to the bundled server, `-Xmx`, classpath for the script context).
- workflow-editor-extension: `browser/hooks/useLanguageIntelligence.ts` (attach/detach effect + status) and a 3-line delegation in `MonacoEditorWrapper.tsx`; status chip rendered in `CodeEditorRenderer.tsx`.

## Acceptance criteria
| ID | Criterion | Verified by |
|---|---|---|
| AC-1 | Spike result recorded: both candidate servers (`fwcd/kotlin-language-server`, JetBrains `kotlin-lsp`) were launched on a prelude+script document; document records startup time, RSS, whether `row`/`flow` resolve, whether `.kts`/script text is accepted; the chosen server is named with reasons | [review] of `.claude/.factory/CONTNM-180/spike-kotlin-ls.md` + spike script reproducible (`[unit]`-style node script exit 0) |
| AC-2 | `PositionMapper` maps user ↔ virtual positions exactly (line and column, first/last line, prelude of N lines, CRLF, empty text); diagnostics whose range lies wholly in the prelude are dropped; a diagnostic spanning the boundary is clamped to the user text | [unit] `src/common/PositionMapper.spec.ts` |
| AC-3 | `KotlinScriptPrelude` declares `val row: Map<String, Any>` (type confirmed from `NodeInputReader.read()` in the spike) and `val flow: ScriptFlowVariables` with `get(String): Any?`, `set(String, Any?)`, `all(): Map<String, Any>` and KDoc; its member list equals the public members of `ScriptFlowVariables.kt` (drift guard) | [unit] `KotlinScriptPrelude.spec.ts` (parses the Kotlin source of `ScriptFlowVariables.kt` if reachable, otherwise compares to a committed fixture) + [unit] feature-analytics test BE-4 |
| AC-4 | Typing `flow.` in a Kotlin Script node dialog offers `get`, `set`, `all` | [browser] |
| AC-5 | Script `row["a"]?.toString() + flow.get("x")` shows no diagnostics at all (no unresolved `row`/`flow`, no "top-level expression" noise) once the server is ready | [browser] + [system-api] bridge test with a raw LSP client (publishDiagnostics empty) |
| AC-6 | Script `val x: Int = "a"` (typed on line 1 col 1 and also on line 3) gives an error marker whose line/column equals the text shown in the editor (prelude hidden, no shift) | [browser] marker line/col read via `monaco.editor.getModelMarkers`; [unit] AC-2 for the mapping |
| AC-7 | Hovering `flow.set` shows the signature and its KDoc | [browser] |
| AC-8 | Signature help appears when typing `flow.set(` | [browser] |
| AC-9 | With the language server stopped/not started/crashed, the node dialog editor still edits with Monarch highlighting, the status chip reads "Kotlin language server starting…/unavailable", and **Save is never blocked** (script saved) | [browser] (kill the server process during the scenario) + [unit] `LanguageServerLifecycle.spec.ts` (state transitions, restart back-off, idle shutdown with fake clock/process) |
| AC-10 | Opening a `.kt` file and a `.kts` file in the file editor gives completion, hover and diagnostics (stdlib symbol, deliberate type error) | [browser] |
| AC-11 | Two node dialogs open at once keep independent diagnostics; closing a dialog sends `didClose` and removes its markers/providers (no leak: provider count returns to baseline) | [browser] + [unit] `LanguageIntelligenceService.spec.ts` with fake connection |
| AC-12 | The stored node property `script` equals exactly the typed text; the prelude never reaches `onChange`/save | [unit] `MonacoLspAdapter`/service spec (user text round-trip) + [browser] save and read the `.cwf` |
| AC-13 | Kotlin intelligence works with the workbench started with outbound network blocked (everything bundled: server, JRE, stdlib/script classpath) | [system-api] launch of the production image with `--network none` (docker) + raw-LSP bridge check; if image build is infeasible → NOT VERIFIED locally (see list), with the same check run against the local dev bundle with proxies unset |
| AC-14 | With the server running and a Kotlin editor open, backend process RSS ≤ the documented cap (`-Xmx` + overhead; value fixed after the spike, documented in release notes) and the process is started with `-Xmx` | [system-api] script measures RSS of the LS child during AC-5 check; [unit] launch-spec spec asserts `-Xmx` is present |
| AC-15 | **Generic/pluggable:** no language-specific string or logic (`kotlin`, `row`, `flow`, `.kt`, prelude text, server command) exists in `language-server-extension/src/common`, `src/node` (except `src/node/kotlin/`), `src/browser`, nor in `workflow-editor-extension` outside a data-only language id passed to the hook. A dummy second registration (`echo-language`, a fake server script) registered in a test connects through the same bridge/client and gets completions, **with zero edits to generic code** | [unit] `GenericityGuard.spec.ts` (greps the generic source dirs for forbidden tokens; fails if found) + [unit]/[system-api] `PluggableRegistration.spec.ts` registering a fake language with a stub server |
| AC-16 | Bridge security: connection for an unknown language id is refused; a document URI whose scheme is not `continuum-script`/`file` under the allowed roots is rejected; the node-dialog server instance is given no workspace roots (sees only the virtual doc + stdlib) | [unit] `LanguageServerBridgeContribution.spec.ts` + [system-api] raw-LSP client attempts `file:///etc/passwd` |
| AC-17 | At most one LS process per backend per language, started lazily on the first connection (no process before an editor opens) and stopped after the idle timeout; a second dialog reuses it | [unit] lifecycle spec + [system-api] process count check |
| AC-18 | Other `code`-format nodes (Rest, CreateTable, Claude agent) behave exactly as before: no LSP connection, no status chip, no markers for a non-registered language | [unit] hook spec (`useLanguageIntelligence` no-op for unregistered language) + [browser] open a Rest node dialog |
| AC-19 | `ScriptFlowVariables`/binding contract is pinned in feature-base: a unit test fails if `row` or `flow` binding names or `ScriptFlowVariables` public API change without updating the workbench prelude pointer | [unit] feature-analytics test |
| AC-20 | Production image contains JRE 21 + the pinned Kotlin server, downloaded at build with checksum verification (build fails on mismatch), no runtime download; `entrypoint.sh`/CMD unchanged otherwise | [review] Dockerfile + [system-api] `docker build` and `docker run … java -version` / server `--version` (if feasible) |
| AC-21 | Release notes (Highlights + Upgrade notes: JRE+server in image, higher memory, charts follow-up), root README, workbench `AGENTS.md`, new workspace README, knowledge graph updated; no factory IDs in them | [review] |
| AC-22 | No API/OpenAPI/`@continuum/core` change was needed (confirm) | [review] |
| AC-23 | `yarn.lock` regenerated and `yarn install --frozen-lockfile --ignore-scripts` + `yarn test` + `tsc --noEmit` pass | [unit] CI commands run locally |

## Backend tasks
(The Theia node-side bridge is "backend" here; all of it lives in `continuum-workbench`, plus one feature-base task.)

### BE-1 Spike: choose the Kotlin language server (D-2)
- Repo/module: `continuum-workbench` (scratch under `mktemp -d`; only the report is kept), report in `.claude/.factory/CONTNM-180/spike-kotlin-ls.md`.
- Files: create `spike-kotlin-ls.md` and a reproducible driver `.claude/.factory/CONTNM-180/spike/run-spike.mjs` (raw LSP client using `vscode-jsonrpc` from workbench `node_modules`). No product files.
- Change: download both candidates (GitHub releases; record version + sha256), launch each with JDK 21 under SDKMAN, send `initialize` / `didOpen` of a virtual doc = prelude + user script, and measure: cold-start-to-first-diagnostics, RSS, completion for `flow.`, hover on `flow.set`, diagnostics for `val x: Int = "a"`, no unresolved `row`/`flow` for the valid script, whether the classpath for `ScriptFlowVariables` (jar of feature-analytics classes or a stub source in the prelude) is needed, whether text must be `.kt` vs `.kts`, and the minimal `-Xmx`. Confirm the exact type of `row` from `NodeInputReader.read(): Map<String, Any>?` and the hidden-prelude approach. Also test whether `monaco-languageclient` matches Theia's Monaco 1.108 (npm peer ranges only; no integration) and record the adapter decision. Check the licence of the chosen server and the Kotlin 2.2 level. Record: chosen server, pinned version + checksum URL, JRE flavour, memory cap, known false-positive diagnostics for the filter, and (if neither server is acceptable) a stop-and-ask result for the orchestrator.
- Unit tests: n/a (spike).
- Docs: none in product.
- Depends on: —
- Covers: AC-1 (feeds AC-3, AC-14, AC-20)

### BE-2 Generic LSP core: registration contracts + pure logic
- Repo/module: `continuum-workbench/language-server-extension` (new workspace; add to root `package.json` workspaces/turbo; package `@continuum/language-server-extension`, `theiaExtensions` frontend + backend entries; `tsconfig.test.json` like `workflow-editor-extension`).
- Files: create `package.json`, `tsconfig*.json`, `README.md`, `src/common/LanguageServerRegistration.ts`, `PositionMapper.ts`, `PositionMapper.spec.ts`, `DiagnosticFilter.ts`(+spec), `LspProtocolPaths.ts`(+spec), `GenericityGuard.spec.ts`; modify root `package.json` (workspace + dependency of `continuum-workbench/package.json`), `yarn.lock`.
- Change: the pure types and functions listed in "Units". Direct dependency additions limited to `vscode-jsonrpc` (already transitive; pin to the version Theia uses to avoid duplicate copies). Regenerate `yarn.lock`; verify removed/added entries.
- Unit tests: AC-2 cases; filter; path/URI validation; `GenericityGuard` (initially covers common/node/browser dirs; the Kotlin dirs are whitelisted explicitly).
- Docs: workspace README (purpose, how to register a language: the 4 things a registration provides, CEL-style example in prose only), release notes entry.
- Depends on: BE-1 (only for the final prelude/mapper edge cases; scaffolding can start now)
- Covers: AC-2, AC-15 (guard), AC-23

### BE-3 Backend bridge: process, lifecycle, Theia channel
- Repo/module: `continuum-workbench/language-server-extension/src/node`
- Files: create `LanguageServerProcess.ts`, `LanguageServerLifecycle.ts`, `LanguageServerRegistry.ts`, `LanguageServerBridgeContribution.ts`, `LanguageServerBackendModule.ts` (inversify, bound via `theiaExtensions.backend`), matching `*.spec.ts`; `PluggableRegistration.spec.ts` with a stub server script `test/fixtures/echo-language-server.mjs`.
- Change: see Units. Behaviour: lazy spawn on first channel; one process per language; shared by connections; idle shutdown (configurable, default 10 min, env override); restart with back-off up to N tries then `unavailable`; lifecycle state pushed to clients via a small status JSON-RPC notification (`continuum/status`) in the same channel; `-Xmx` taken from the launch spec; unknown language/URI scheme rejected; per-registration workspace roots passed in `initialize` (node-dialog registration: none).
- Unit tests: lifecycle with fake `ProcessFactory`/`Clock` (start once, idle stop, crash restart, give-up); bridge rejects unknown language and bad URIs; pluggable registration with the stub server (AC-15).
- Docs: workspace README (config env vars), `continuum-workbench/AGENTS.md` (new workspace row + invariants), release notes.
- Depends on: BE-2
- Covers: AC-9 (backend half), AC-15, AC-16, AC-17, AC-14 (spec for `-Xmx`)

### BE-4 Kotlin registration (backend) + prelude single source of truth + feature-base pin
- Repo/module: `continuum-workbench/language-server-extension/src/node/kotlin`, `src/kotlin`; `continuum-feature-base/features/continuum-feature-analytics`.
- Files: create `src/node/kotlin/KotlinServerLaunchSpec.ts`(+spec), `src/kotlin/KotlinScriptPrelude.ts`(+spec), `src/kotlin/KotlinScriptRegistration.ts`; bind in the backend module; in feature-analytics create `src/test/kotlin/.../KotlinScriptBindingsContractTest.kt` and add KDoc to `KotlinScriptNodeModel.kt` bindings (`row`, `flow`) and `ScriptFlowVariables.kt` pointing at the workbench prelude (no factory IDs).
- Change: launch spec = bundled server path (env `CONTINUUM_KOTLIN_LS_HOME`, default `/opt/continuum/kotlin-ls` in the image, dev: `continuum-workbench/.kotlin-ls/`), JRE from `CONTINUUM_JAVA_HOME`/`PATH`, `-Xmx` from spike. Prelude per spike: declares `row`, `flow`, `ScriptFlowVariables` stub class (decided by spike: stub in prelude vs. jar on classpath), line count constant exported for the mapper. Feature-base test pins: binding names `"row"`/`"flow"`, and reflectively the public method names/signatures of `ScriptFlowVariables` (AC-19), using named arguments (house rule 5).
- Unit tests: launch spec (contains `-Xmx`, no shell interpolation of user input); prelude spec (AC-3); Kotlin test (`./gradlew --offline :features:continuum-feature-analytics:test --tests '*KotlinScriptBindingsContractTest'` — confirm module path in the task).
- Docs: feature-base release notes (note: contract pinned for the workbench prelude), README of the analytics module if it lists the Kotlin Script bindings.
- Depends on: BE-1, BE-2, BE-3
- Covers: AC-3, AC-14, AC-19

### BE-5 Packaging: JRE + Kotlin server bundled at build time, dev setup
- Repo/module: `continuum-workbench` (`Dockerfile`, `scripts/`, `continuum-workbench/package.json`, `.gitignore`), `continuum-local-setup` (only if it builds/runs the workbench image and needs the env var — check its AGENTS.md).
- Files: create `scripts/download-kotlin-ls.sh` (pinned URL + sha256 from the spike, `set -euo pipefail`, `sha256sum -c`, idempotent) and a `download:kotlin-ls` script in `continuum-workbench/package.json`; modify `Dockerfile` (builder stage downloads the server; production stage installs a JRE 21 headless (e.g. `openjdk-21-jre-headless`, or Temurin tarball with checksum — per spike), copies the server to `/opt/continuum/kotlin-ls` outside the PVC-mounted home, sets `CONTINUUM_KOTLIN_LS_HOME`); `.gitignore` for `.kotlin-ls/`.
- Change: no runtime download; image-owned files outside `/home/continuum` (see Dockerfile comment). Document a chart memory follow-up (no chart change here).
- Unit tests: shell script checked with `bash -n` and a checksum-mismatch negative run.
- Docs: release notes "Upgrade notes" (image gains JRE + server, bigger image, higher memory request, chart follow-up), root README (requirements/dev setup: `yarn download:kotlin-ls`), AGENTS.md.
- Depends on: BE-1
- Covers: AC-13, AC-20

### BE-6 Kotlin file-editor support (`.kt`/`.kts`)
- Repo/module: `continuum-workbench/continuum-workbench` + `language-server-extension`.
- Files: modify `continuum-workbench/package.json` `theiaPlugins` (add the extension pinned the same way as git, only if the spike server has a VS Code extension, e.g. `fwcd.kotlin` vsix from Open VSX at a pinned version) **or**, if the chosen server has no usable extension, add `src/browser/KotlinFileEditorContribution.ts` that attaches the same generic `LanguageIntelligenceService` to Theia's Monaco editors for `file:` URIs of language `kotlin` (reusing the registration; file registration has workspace roots). Decision recorded by BE-1. Include the extension's settings (server path to the bundled server, `-Xmx`, no auto-download) in `continuum-workbench/package.json` `theia.frontend.config.preferences` or `settings.json` seeding in `entrypoint.sh`.
- Change: no second server process if the generic bridge route is chosen (reuse one process); if the extension route is chosen, memory cap for the extension's server is set via its setting and the second process is called out in release notes.
- Unit tests: contribution spec (only `kotlin` + `file:` documents attach) if the bridge route; otherwise config test asserting the pinned vsix URL + sha present.
- Docs: release notes, README, AGENTS.md (plugin list).
- Depends on: BE-1, BE-3, BE-4, BE-5
- Covers: AC-10, AC-17, AC-21

## Frontend tasks

### FE-1 Browser LSP client (generic): connection, service, Monaco adapter
- Repo/module: `continuum-workbench/language-server-extension/src/browser`
- Files: create `LspConnection.ts`, `LanguageIntelligenceService.ts`, `MonacoLspAdapter.ts`, `LanguageServerStatus.tsx`, `LanguageServerFrontendModule.ts` (bind via `theiaExtensions.frontend`), specs for service and adapter (fake connection, fake monaco-like model).
- Change: see Units. Adapter registers completion / hover / signature-help / definition providers scoped to the model's virtual URI only (provider `selector` filtered by model URI, never global for the language) so file-editor providers and other dialogs are not affected; diagnostics → `setModelMarkers` after `PositionMapper` shift/filter; didChange sends the virtual text (prelude + user) with incremental or full sync per the server's capabilities; detach sends `didClose`, clears markers, disposes providers. `monaco` instance comes through an injected `MonacoProvider` interface (the editor-extension passes the instance it already keeps in `useMUIThemeStore`) so the generic module does not import the store.
- Unit tests: AC-11, AC-12 (user text never altered; `getValue()` unchanged after attach), AC-9 status transitions from `continuum/status`, AC-18 no-op without registration.
- Docs: workspace README (client usage), release notes.
- Depends on: BE-2 (contracts). Can start now against the contracts; real wiring tested after BE-3.
- Blocked until: BE-2 DONE
- Covers: AC-9, AC-11, AC-12, AC-18

### FE-2 Kotlin Script node dialog wiring
- Repo/module: `continuum-workbench/workflow-editor-extension`
- Files: create `src/browser/hooks/useLanguageIntelligence.ts` (+ spec if the test config can host it; else extract pure logic to `src/common/LanguageIntelligenceDecision.ts` + spec: "attach only when a registration exists for the language id"); modify `components/monaco/MonacoEditorWrapper.tsx` (call the hook after editor creation; thin delegation, no logic), `components/node-dialog/CodeEditorRenderer.tsx` (render the status chip; pass nothing Kotlin-specific — language id comes from the existing schema/uischema), `WorkflowEditorExtentionModule.ts` only if a new binding is needed; `package.json` dependency on `@continuum/language-server-extension`.
- Change: editor shows `LanguageServerStatus` ("Kotlin language server starting…", "unavailable") in a small footer; Save/OK handlers untouched (AC-9, AC-12). Rest/CreateTable/Claude dialogs unchanged (AC-18).
- Unit tests: decision function spec; `tsc --noEmit`.
- Docs: workbench `AGENTS.md` (hook + invariants: never save the prelude, never block save), release notes Highlights.
- Depends on: FE-1, BE-4
- Blocked until: FE-1 DONE and BE-4 DONE
- Covers: AC-4…AC-9, AC-12, AC-18

### FE-3 Wire Kotlin file editor (frontend side of the BE-6 decision)
- Repo/module: `continuum-workbench/language-server-extension` (+ `continuum-workbench/package.json` if needed)
- Files: only if BE-6 chose the bridge route: `src/browser/FileEditorLanguageContribution.ts` (generic: for every registration declaring `fileExtensions`, attach to opened Theia text editors) + spec; otherwise `None — handled by the VS Code extension configured in BE-6`.
- Depends on: FE-1, BE-6 (decision), BE-4
- Blocked until: FE-1 DONE and BE-6 DONE
- Covers: AC-10

### FE-4 Browser scenario suite and system checks
- Repo/module: `continuum-system-tests`
- Files: create `suites/ui/kotlin-lsp.mjs` (puppeteer, reuse `lib.mjs` helpers `launch`, `openFile`, `makeWorkspace`; scenarios: `completion`, `valid`, `diagnostics`, `hover`, `sighelp`, `fallback`, `twodialogs`, `save`, `rest-unchanged`, `kt-file`), `suites/api/kotlin-lsp-bridge.mjs` (raw-LSP client against the workbench backend WS: AC-5 server side, AC-13 offline, AC-14 RSS, AC-16, AC-17), `package.json` `check` globs already cover `suites/*/*.js` — add `.mjs` if not matched; `README.md` + `AGENTS.md` suite list; a header comment on how to run (`WORKBENCH_URL=… ONLY=…`).
- Change: scenarios assert Monaco markers via `window.monaco`/store access exposed by Theia; screenshots go to `.claude/.screenshots/CONTNM-180/round-<n>/`.
- Unit tests: `npm run check` (syntax) and `npm test`.
- Docs: system-tests README, release notes if that repo keeps them.
- Depends on: FE-2, FE-3, BE-3, BE-5 (to run); can be drafted earlier.
- Blocked until: FE-2 DONE
- Covers: AC-4…AC-14, AC-16, AC-17, AC-18

### FE-5 Docs, knowledge graph, release notes consolidation
- Repo/module: `continuum-workbench` (release notes `RELEASE_NOTES_v0.0.16.md` — **check first that no `release/0.0.16` tag exists; if it does, ask the orchestrator to bump the version**), `.claude/knowledge/workbench.md`, `graph.json`, `change-log.md`.
- Change: Highlights (Kotlin code intelligence in script node + `.kt/.kts`), Upgrade notes (JRE + server in image, memory, charts follow-up, no network needed), Changes; root README (workspace table, project structure tree, setup `download:kotlin-ls`); `AGENTS.md` workspace table row; knowledge graph nodes (`language-server-extension`, `kotlin-ls-registration`, `kotlin-script-prelude`) and edges. Update the stale "No LSP code anywhere" lines in the knowledge pages. Technical-writer later handles `continuum-docs`.
- Depends on: BE-4, BE-5, BE-6, FE-2
- Covers: AC-21, AC-22

## Dependency graph
```
BE-1 → BE-2 → BE-3 → BE-4 → FE-2 → FE-4
BE-1 → BE-5 → BE-6
BE-2 → FE-1 → FE-2
BE-3, BE-4, BE-5 → BE-6 → FE-3 → FE-4
BE-4, BE-5, BE-6, FE-2 → FE-5
```
Can start now: **BE-1** (spike, first, gates everything that is server-specific), BE-2 scaffolding (contracts/pure logic need no server), FE-1 after BE-2's contracts land (mock connection, no server needed). FE-2 waits for BE-4 (prelude + registration) and FE-1. No cycles.

## Test plan
| AC | Verifier | Location |
|---|---|---|
| AC-1 | backend-developer, backend-expert | `spike-kotlin-ls.md`, `spike/run-spike.mjs` |
| AC-2 | backend-developer [unit] | `language-server-extension/src/common/PositionMapper.spec.ts`, `DiagnosticFilter.spec.ts` |
| AC-3 | backend-developer [unit] | `src/kotlin/KotlinScriptPrelude.spec.ts` |
| AC-4–AC-8 | frontend-tester [browser] | `continuum-system-tests/suites/ui/kotlin-lsp.mjs` (`completion`, `valid`, `diagnostics`, `hover`, `sighelp`) |
| AC-5 (server side) | backend-system-tester | `suites/api/kotlin-lsp-bridge.mjs` |
| AC-9 | frontend-tester [browser] + backend-developer [unit] | `kotlin-lsp.mjs` `fallback`; `LanguageServerLifecycle.spec.ts` |
| AC-10 | frontend-tester [browser] | `kotlin-lsp.mjs` `kt-file` |
| AC-11 | frontend-tester + frontend-developer [unit] | `kotlin-lsp.mjs` `twodialogs`; `LanguageIntelligenceService.spec.ts` |
| AC-12 | frontend-developer [unit] + frontend-tester | service spec; `kotlin-lsp.mjs` `save` |
| AC-13 | backend-system-tester | `kotlin-lsp-bridge.mjs --offline` (docker `--network none` if image builds) |
| AC-14 | backend-system-tester + backend-developer [unit] | bridge suite RSS check; `KotlinServerLaunchSpec.spec.ts` |
| AC-15 | backend-developer [unit], backend-expert/frontend-expert [review] | `GenericityGuard.spec.ts`, `PluggableRegistration.spec.ts` |
| AC-16 | backend-developer [unit] + backend-system-tester | `LanguageServerBridgeContribution.spec.ts`; bridge suite |
| AC-17 | backend-developer [unit] + backend-system-tester | `LanguageServerLifecycle.spec.ts`; bridge suite |
| AC-18 | frontend-developer [unit] + frontend-tester | decision spec; `kotlin-lsp.mjs` `rest-unchanged` |
| AC-19 | backend-developer [unit] | `KotlinScriptBindingsContractTest.kt` (feature-analytics) |
| AC-20 | backend-system-tester, backend-expert [review] | docker build output; Dockerfile review |
| AC-21, AC-22 | experts [review], technical-writer | checklist: no factory IDs, README/AGENTS/release notes/knowledge updated |
| AC-23 | frontend-developer | `yarn install --frozen-lockfile --ignore-scripts`, `yarn test`, `npx tsc --noEmit` |

## Not verifiable locally
- **Production image behaviour** (AC-13 offline in the real image, AC-20 size/JRE): `docker build` of the workbench is possible (Docker daemon running) but slow and pulls `claude.ai/install.sh`; if the build is skipped or fails for reasons unrelated to this change, report `NOT VERIFIED`. The offline check then runs against the local dev bundle only.
- **Pod memory behaviour / PVC / charts** (`continuum-charts` memory limit): no cluster available → NOT VERIFIED; follow-up item, not in this change.
- **Open VSX reachability from user pods**: avoided by bundling; not testable locally.
- **`openapi-generator` missing**: not needed (no API change).
- **Playwright missing**: browser scenarios use puppeteer (bundled Chromium); no system Chromium for headed runs.
- **Theia build of the new workspace** (`yarn build` / `theia build`) is long; if the local policy or time forbids it, the browser scenarios (AC-4…AC-12) cannot run → NOT VERIFIED and reported up front. `yarn install` with the new workspace and `yarn.lock` regeneration need network (reachable: npm 200, GitHub 200).
- **Server quality on real-world scripts** and startup time on small pods: known only from the spike on this machine.
- **`.kts` support** in the chosen server is partial/unknown until BE-1.

## Changelog
- Round 1: initial plan.
