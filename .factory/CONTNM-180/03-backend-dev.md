# Backend dev report — CONTNM-180

## Round 1

**Spike result: no user decision forced.** A working server exists (fwcd kotlin-language-server 1.3.13). Things to tell the user: about 0.8 GB RAM per language-server process (a file-editor server would add a second one); the server's Kotlin compiler is 2.1 vs the node runtime's 2.2.21; `.kts` files are only partially supported (experimental), so the Script node uses a `.kt` wrapper. Full evidence: `spike-kotlin-ls.md`.

### Tasks
| Task | Status | Notes |
|---|---|---|
| BE-1 spike | DONE | `spike-kotlin-ls.md`; fwcd 1.3.13 chosen, JetBrains kotlin-lsp rejected; file-editor route = extension (`fwcd.kotlin` 0.2.36), unverified in plugin host; `row` is `Map<String, Any>` |
| BE-2 generic LSP core | PARTIAL | Contracts, position mapper, diagnostic filter, URI policy, genericity guard, workspace wiring done. Node-side process manager / websocket bridge and the browser adapter are not in this round (they are the node and frontend parts of the plan); `theiaExtensions` entries are omitted until those module files exist |

### Contracts landed (`continuum-workbench/language-server-extension/src/common/`)
- `LanguageServerRegistration`: `id`, `languageId`, `fileExtension`, `workspace` (`private` with `seedFiles` | `user-workspace`), `virtualDocuments` (`VirtualDocumentFactory.plan(userText, documentKey)` → `VirtualDocumentPlan {hiddenBlocks: {beforeUserLine, lines}[], trailingLines}`), `diagnosticFilter`, `statusTexts`; `LanguageServerLaunch.resolveLaunchSpec()` → `ServerLaunchSpec {command, args, env, memoryLimitMb?}`; `LanguageServerState = 'starting' | 'ready' | 'unavailable'`.
- `PositionMapper(userText, plan)`: virtual text, user/virtual position and range mapping, `toUserDiagnostics` (drops diagnostics wholly in hidden text, clamps partial ones).
- `filterDiagnostics(diags, rules)` with `DiagnosticFilterRule {code?, messagePattern?, severity?}`.
- `LspProtocolPaths`: channel `/services/language-server/<id>`; server-state notification **`continuum/serverState`** `{state}` (the plan said `continuum/status`; renamed); virtual URI `continuum-script:/<key><ext>`; `isAllowedDocumentUri(uri, {allowedFileRoots})` — backend must apply it to every URI.
- Kotlin design for the later tasks: `.kt` wrapper with hoisted user imports; hidden header `import continuum.ScriptFlowVariables` + `fun continuumScript<N>(row: Map<String, Any>, flow: ScriptFlowVariables): Any? = run {`; trailer `\n}\n`; stub `ScriptFlowVariables` + context file on disk before server start; server must be sent only registrations from the registry.

### Inputs for later tasks
- Packaging: fwcd zip sha256 `4fe7d71d…9b6d2`, 59 MB jlink JRE 21, `JAVA_OPTS=-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m`, RSS cap ~1 GB; install e.g. `/opt/continuum/kotlin-ls`.
- Readiness: use a completion request, not "diagnostics published".
- File editor: `fwcd.kotlin` 0.2.36 vsix (sha256 in the spike doc).

### Files changed
- continuum-workbench: `language-server-extension/` (new: package.json, tsconfig.json, tsconfig.test.json, .gitignore, README.md, `src/common/*.ts` and 4 specs); `package.json` (workspace + test script); `continuum-workbench/package.json` (dependency); `AGENTS.md`, `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`.
- `yarn.lock`: unchanged (workspace deps already satisfied; `vscode-jsonrpc@8.2.0` already locked).
- Factory: `spike-kotlin-ls.md`, `spike/` (driver + results). Knowledge: `workbench.md`, `graph.json`, `change-log.md`.

### Unit tests (41, all in the new workspace)
- `PositionMapper.spec.ts` (hidden header/trailer mapping, CRLF, clamping, diagnostics) → AC-2 (mapping), AC-23
- `DiagnosticFilter.spec.ts` → AC-2 (filtering)
- `LspProtocolPaths.spec.ts` (id validation, channel path, virtual URI, file-root policy, traversal encodings) → AC-23 (security)
- `GenericityGuard.spec.ts` (no language tokens in generic code; guard self-check) → AC-15
- Spike evidence → AC-1

### Verification
- `yarn install --ignore-scripts` → PASS (links the workspace).
- `yarn workspace @continuum/language-server-extension test` → PASS, 41/41.
- `npx tsc --noEmit -p tsconfig.json` in the workspace → PASS.
- `yarn install --frozen-lockfile` / full `yarn test` of other workspaces → NOT RUN.
- Redocly / Gradle: not applicable (no API change).

### API contract changes
None (no HTTP endpoint). TypeScript contracts above are new.

### Docs updated
Release notes (Highlights), workbench AGENTS.md (workspace row + CI line), root README (table + tree), workspace README, knowledge graph.

### SCOPE / questions
- `theiaExtensions` for the new package is deferred until module files exist.
- Notification renamed `continuum/status` → `continuum/serverState`.
- User-facing heads-up: memory (~0.8 GB per server), Kotlin 2.1 compiler gap, `.kts` partial.

## Round 2

### Tasks
| Task | Status | Notes |
|---|---|---|
| BE-2 generic LSP core | DONE (node side) | Backend module bound through `theiaExtensions.backend` (`lib/node/LanguageServerBackendModule`); the `frontend` entry is the frontend developer's. Deps added to the workspace: `@theia/core`, `@theia/workspace` (`latest`, already locked) |
| BE-3 backend bridge | DONE | Lazy start, one process per language, idle stop (default 600 s), restart with doubling back-off, `unavailable` after `maxRestarts` (default 3), Theia channel route, URI/method guard, memory ceiling, per-connection multiplexing |
| BE-5 packaging | DONE (image build of the full Dockerfile NOT run) | Script, `download:kotlin-ls`, Dockerfile JRE stage, `.gitignore`. A reduced Dockerfile (same JRE stage + same COPY/RUN lines on `node:24-slim`) was built and the fwcd server started on the jlink JRE there |
| BE-4 (Kotlin launch spec/registration) | NOT STARTED | Out of scope this round. It must read `CONTINUUM_KOTLIN_LS_HOME` (server at `<home>/server/bin/kotlin-language-server`), `CONTINUUM_JAVA_HOME` (set `JAVA_HOME` for the child), `JAVA_OPTS=-Xmx512m ...`, `memoryLimitMb` about 1000 |

### Design (units in `src/node`)
`LspFraming` (stdio framing) · `Clock` · `ServerLog` · `LanguageServerProcess` (`ServerProcess`/`ProcessFactory` interfaces, child-process implementation without a shell, `/proc` RSS reader) · `LanguageServerLifecycle` · `LspServerInitializer` (initialize + readiness probe = completion request on the registration's own virtual document) · `ServerRequestResponder` (neutral answers to the server's own requests) · `ClientMessageGuard` (method allow-list + `isAllowedDocumentUri` on every `uri`/`*Uri` property, depth-limited) · `OpenDocuments` · `LanguageServerMultiplexer` · `LanguageServerHost` · `LanguageServerRegistry` · `LanguageServerBridge` (Theia types only as `import type`) · `LanguageServerBridgeContribution` + `LanguageServerShutdown` + `LanguageServerBackendModule` (the only Theia-bound files) · `BridgeSettings` · `PrivateWorkspace` · `BackendWorkspaceRoots`. All below ~300 lines (largest: `LanguageServerMultiplexer` ≈ 290).

Behaviour the frontend can rely on (matches the existing browser client): one channel message = one JSON-RPC string; the bridge answers `initialize` itself (client need not send it; if it does it gets the cached result), advertises full-text sync (incremental `didChange` is refused), sends `continuum/serverState` on connect and on every change, replays open documents after a server restart, routes diagnostics to the opening connection only, closes a document owned by another connection to nobody. Allowed client methods: didOpen/didChange/didClose, completion, completionItem/resolve, hover, signatureHelp, definition, typeDefinition, references, documentHighlight, documentSymbol. Private registrations accept only virtual URIs; user-workspace registrations accept `file:` URIs inside the backend workspace folder (or `CONTINUUM_LANGUAGE_SERVER_WORKSPACE_ROOTS`).

### Files changed
- continuum-workbench `language-server-extension/`: `src/node/*` (new, 15 source files + 9 specs incl. `TestDoubles.spec.ts`), `test/fixtures/echo-language-server.mjs`, `package.json` (deps, `theiaExtensions.backend`), `README.md` (bridge section)
- continuum-workbench: `scripts/download-kotlin-ls.sh` (new), `continuum-workbench/package.json` (`download:kotlin-ls`), `Dockerfile` (JRE stage, server install, env), `.gitignore` (`/.kotlin-ls/`), `AGENTS.md`, `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`
- `.claude/knowledge`: `workbench.md`, `graph.json`, `change-log.md`
- `yarn.lock`: unchanged (checked with `--frozen-lockfile`)

### Unit tests added (node specs; AC mapping)
- `LspFraming.spec` (6) → framing robustness
- `LanguageServerLifecycle.spec` (18): lazy start, shared process, idle stop/cancel/restart, double release, back-off doubling, give-up → `unavailable`, init failure restart, stability reset, launch failure, stale process events ignored, memory ceiling restart, no ceiling when undeclared, server requests answered, send only when ready → AC-9 (backend), AC-14, AC-17
- `LanguageServerMultiplexer.spec` (15): state notifications, initialize wait/unavailable, id remap, diagnostics isolation, URI/method refusal, foreign documents, wrong language/incremental refusal, close → didClose + idle stop, replay after restart, in-flight failure, shutdown/exit handling, document cap → AC-11 (backend half), AC-16, AC-17
- `ClientMessageGuard.spec` (7) → AC-16 (incl. `file:///etc/passwd`, `..`, `%2e%2e`, nested/deep parameters)
- `LanguageServerBridge.spec` (7): unknown/invalid id closed, one host per language, relay as text, close releases, dispose → AC-16, AC-17
- `LspServerInitializer.spec` (5): handshake order, readiness by completion, probe text from the registration, retry/give up, initialize timeout → readiness decision
- `LanguageServerRegistry.spec` (8, includes settings and private workspace): startup validation, env parsing, seed path traversal refused → AC-16
- `PluggableRegistration.spec` (4, real child process, echo stub server): a language added by registration only gets completion + diagnostics, readiness waits for completion, file URI refused, seed files written → AC-15
- Shell script: `bash -n` OK; negative run (`KOTLIN_LS_URL` to a wrong file) exits 1 with a checksum-mismatch message and installs nothing; real download verified and a second run is a no-op → AC-20

### Verification
- `yarn workspace @continuum/language-server-extension test` → PASS, 144/144 (includes the frontend developer's specs and the genericity guard over `src/node`)
- `npx tsc --noEmit -p tsconfig.json` (workspace) → PASS
- `yarn install --frozen-lockfile --ignore-scripts --offline` → PASS
- `scripts/download-kotlin-ls.sh` real download + checksum → PASS; negative run → PASS (fails as intended)
- Docker: reduced Dockerfile (`kotlin-ls-jre` stage + install lines on `node:24-slim`) → built; jlink JRE 60 MB, server 90 MB, `kotlin-language-server` JVM starts on it (it rejected my `--version` flag, i.e. the program ran). Full production Dockerfile build, `--network none` run and RSS check → NOT VERIFIED (heavy: Claude install, theia build)
- `/proc` RSS reader and the real Theia messaging wiring (`LanguageServerBridgeContribution` inversify bindings) → NOT VERIFIED at runtime (no workbench start); bridge logic is covered with fake `MessagingService`/channel, the container wiring type-checks only. The system tester should open the channel on a running workbench.
- Gradle/Redocly: not applicable.

### API contract changes
None (no HTTP endpoint; channel contract is in the workspace README).

### Docs updated
Workspace README (bridge, wire format, env vars), workbench `AGENTS.md`, root `README.md` (dev setup, script table, tree), release notes (Highlights + Upgrade notes: image +150 MB, ~0.8 GB RAM, chart follow-up), knowledge graph. No factory IDs in the product docs beyond the pre-existing ticket key heading.

### SCOPE / questions
- Dev default install dir is repository-level `continuum-workbench/.kotlin-ls/` (script default), and `yarn --cwd continuum-workbench download:kotlin-ls` is the command. The Kotlin launch spec (next task) must use the same layout (`server/bin/...`, `CONTINUUM_KOTLIN_LS_HOME`).
- The image's JRE comes from the `eclipse-temurin:21-jdk-jammy` tag (not digest-pinned); the server release is checksum-pinned. Pin a digest if the user wants reproducible JREs.
- Memory ceiling is enforced on the server process only (start script `exec`s java so this is the JVM); child processes of the server are not summed.
- User heads-up (plain language): one shared language-server process per language is started when the first Kotlin editor opens and stopped after 10 idle minutes; it needs about 0.8 GB, so the pod's memory request must be raised (charts not changed here). If the server is missing or keeps crashing, editors keep working without hints and show "unavailable".

## Round 3

### Tasks
| Task | Status | Notes |
|---|---|---|
| BE-4 Kotlin registration + launch spec + prelude + feature-base pin | DONE | Plus one bridge fix found by running the real server (below). JRE image now pinned by digest (round-2 SCOPE item resolved) |

### What was built
- `src/kotlin/KotlinScriptPrelude.ts`: hidden header placed after the user's leading imports (blank/`//` lines allowed between), closing `}`; `ScriptFlowVariables` declaration (`ContinuumContext.kt`, with KDoc copied from the node's class) written as the private workspace seed file; `SCRIPT_BINDING_NAMES`, `FLOW_VARIABLE_MEMBERS`; unique wrapper function name per document key.
- `src/kotlin/KotlinScriptRegistration.ts`: registration `kotlin-script`, language `kotlin`, extension `.kt`, private workspace, diagnostic filter for the wrapper's own unused `row`/`flow` parameter warnings, status texts "Kotlin language server starting… / ready / unavailable".
- `src/kotlin/KotlinFrontendModule.ts` (binds the registration to the browser `LanguageServerRegistrations`) and `src/node/kotlin/KotlinBackendModule.ts` (registration + launch); both listed in the workspace `package.json` `theiaExtensions` as a second entry.
- `src/node/kotlin/KotlinServerLaunchSpec.ts` (`KotlinServerLaunch`): install dir `CONTINUUM_KOTLIN_LS_HOME` → `/opt/continuum/kotlin-ls` → repo `.kotlin-ls/`; runtime `CONTINUUM_JAVA_HOME` → `<install>/jre` → PATH; command is the start script with no arguments (no shell, no user input); `JAVA_OPTS=-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m`; `memoryLimitMb` 1000; missing install throws an actionable message (lifecycle then reports `unavailable`).
- **Bridge fix (generic, round-2 code):** the fwcd server ignores documents whose URI is not `file:` (found by driving the real server: no diagnostics, null hover). New `VirtualUriTranslator` + `TranslatingProcessFactory`: for private-workspace registrations the server is shown `continuum-script:/<key>.kt` as `file:///<private dir>/<key>.kt` (never written to disk) and every `uri`/`targetUri` coming back is mapped to the virtual name. Wired in `LanguageServerHost`.
- feature-base (`continuum-feature-analytics`): constants `ROW_BINDING`/`FLOW_BINDING` used by `KotlinScriptNodeModel`, KDoc on them and on `ScriptFlowVariables` pointing at the workbench prelude (no factory IDs), new `KotlinScriptBindingsContractTest` (4 tests: binding names, public member signatures via reflection, no public properties).
- Dockerfile: `eclipse-temurin:21-jdk-jammy@sha256:b2711c65…a25040` (multi-arch index digest resolved with `docker buildx imagetools inspect`; `docker pull` of the digest succeeded) with the update recipe in a comment.

### Files changed
- workbench `language-server-extension`: `src/kotlin/*` (4 files + prelude spec), `src/node/kotlin/*` (3 files + launch spec), `src/node/{VirtualUriTranslator,TranslatingProcessFactory}.ts` (+ translator spec), `src/node/LanguageServerHost.ts`, `package.json`, `README.md`
- workbench: `Dockerfile` (digest), `AGENTS.md`, `release_notes/RELEASE_NOTES_v0.0.16.md` (registration sentence)
- feature-base: `KotlinScriptNodeModel.kt`, `ScriptFlowVariables.kt`, new `KotlinScriptBindingsContractTest.kt`
- `.claude/knowledge`: `workbench.md`, `graph.json` (re-serialised, indent 2), `change-log.md`

### Unit tests (AC mapping)
- `KotlinScriptPrelude.spec` (11): row/flow declared (AC-3), header/imports/closing layout, user lines unchanged, error line maps to the user's line (AC-6 mapping), function-name safety, member list = stub = the node's real `ScriptFlowVariables.kt` when reachable (AC-3 drift guard), KDoc present (AC-7)
- `KotlinServerLaunchSpec.spec` (6): `-Xmx` present, no shell/args, install/runtime resolution order, missing install message (AC-14 unit part)
- `VirtualUriTranslator.spec` (5): both directions, untouched outside dir, user text never rewritten
- `GenericityGuard.spec` still green with the Kotlin code in the whitelisted dirs (AC-15)
- feature-base `KotlinScriptBindingsContractTest` (4) → AC-19

### Verification
- `npx tsc --noEmit -p tsconfig.json` (language-server-extension) → PASS
- `yarn test` (language-server-extension) → PASS 166/166
- `./gradlew --offline :features:continuum-feature-analytics:test --tests '*KotlinScript*'` → PASS (contract 4/4, existing node model 32/32)
- End-to-end with the REAL fwcd 1.3.13 server (downloaded by `scripts/download-kotlin-ls.sh` into `.kotlin-ls/`, JDK 21 on PATH), driven through `LanguageServerHost` + `KotlinServerLaunch` + the registration (throwaway driver, not committed): initialize and ready OK; `row["a"]?.toString() + flow.get("x")` → no diagnostics; `val x: Int = "a"` on user line 3 → TYPE_MISMATCH at line 2 (0-based) cols 13–16 after mapping, hidden-header warnings land in hidden lines; `flow.` → `get/set/all` first; hover on `get` → signature + KDoc. → PASS (AC-4..8 server side; browser half is for the UI suite)
- Full production image build / `--network none`, RSS measurement, Theia container wiring at runtime → NOT VERIFIED (unchanged from round 2)

### API contract changes
None over HTTP. For FE-2 (frontend):
- Registration id `kotlin-script`; editor language id `kotlin` (exports `KOTLIN_SCRIPT_REGISTRATION_ID`, `KOTLIN_LANGUAGE_ID`, `kotlinScriptRegistration` from `language-server-extension/src/kotlin/KotlinScriptRegistration.ts`). `attach(model, 'kotlin')` finds it; the Kotlin frontend module is already in `theiaExtensions`, so no extra binding is needed.
- The client sends the woven text from `registration.virtualDocuments.plan` (via `PositionMapper`) with `continuum-script:/<key>.kt` URIs, as before; the backend does the `file:` translation.
- Diagnostics: `Parameter 'row'/'flow' is never used` is filtered by the registration; an unused user variable still shows a warning (`Variable 'x' is never used`).

### Docs updated
AGENTS.md, workspace README (Kotlin language section), release notes (sentence), knowledge graph. feature-base: no release notes or README change (no release notes file exists there; README lists the node unchanged); its AGENTS.md is an unindexed template, left unchanged.

### SCOPE / questions
- None blocking. Note for the user: unused-variable warnings in user code are shown (not filtered); say if scripts should hide them.
- `.kts` file editing and the file-editor registration (BE-6) are not started.

## Round 4 (partial, paused on the file-editor route decision)

BE-6 is paused: the choice between the `fwcd.kotlin` VS Code extension and our bridge for `.kt`/`.kts` files is open. No route-specific work was added after the pause. Tree is green: `tsc --noEmit` PASS, `yarn test` 166/166 PASS.

### What exists for the bridge route (kept in place, small, generic)
- `src/kotlin/KotlinFileRegistration.ts`: registration `kotlin-file`, `user-workspace`, identity virtual-document plan, `fileExtensions` `.kt`/`.kts`, `serverSettings` `{kotlin:{scripts:{enabled:true}}}`. A separate server process from the script editor's.
- Contract: `LanguageServerRegistration` gained optional `fileExtensions` and `serverSettings` (generic, unused by existing registrations).
- Initializer: sends `workspace/didChangeConfiguration` with `serverSettings` when set; readiness probe is a (never written) `file:` URI in the first workspace folder for user-workspace registrations (virtual URI otherwise).
- Host: a user-workspace registration with no open folder now fails to start (`unavailable`) instead of using the process directory.
- `KotlinServerLaunch` takes the registration id; both Kotlin backend/frontend modules bind both registrations. Existing specs updated for that.
- NOT added: any browser-side file-editor contribution (the attach-on-opened-text-editor code), and no specs for the file registration, the probe URI or the settings notification.

### Known problem, not resolved
A real-server run of the file registration (throwaway driver, workspace `/tmp/ktws` with `Main.kt`, `tool.kts`, `build.gradle.kts`) did NOT become ready: "Language server did not become ready", so nothing about file diagnostics/hover/definition, `.kts` handling, or whether the server runs Gradle/Maven for a workspace with build files is verified. Likely causes to check on resume: the probe on a non-existent file in a real workspace (the server may answer slowly or not at all while it indexes), or the classpath resolution of a workspace with build files. The script-editor registration (private workspace) is unaffected and verified.

### If the bridge route is chosen, FE-3 needs
Per registration with `fileExtensions`, attach `LanguageIntelligenceService` to opened Theia text editors whose `file:` URI ends with one of them (registration id `kotlin-file`), send `didOpen` with the file's real URI, `languageId` equal to `registration.languageId` (`kotlin`, also for `.kts`, because the bridge refuses any other id), the full text, and full-text `didChange`; the bridge only accepts URIs inside the backend workspace folder. Backend work left: fix readiness, specs, verify `.kts`, decide Gradle/Maven classpath handling, release notes.

### If the extension route is chosen
The file registration and the contract additions above become unused and can be removed (keeping them costs nothing); the extension needs a pinned vsix, settings for the bundled server path and `-Xmx`, and release-note mention of a second server process.

## Round 4 — BE-6 final (extension route)
Decision applied: `.kt`/`.kts` files use VS Code extension `fwcd.kotlin` 0.2.36 (Open VSX); the Script node editor keeps the bridge.

### Tasks
| Task | Status | Notes |
|---|---|---|
| BE-6 | DONE (config) / plugin-host run NOT VERIFIED | Needs the browser test. |

### Files changed (continuum-workbench)
- `continuum-workbench/package.json` — `theiaPlugins["fwcd.kotlin"]` (0.2.36 URL), `pluginChecksums`, `download:plugins` now runs `scripts/install-pinned-plugins.js` first, new `seed:kotlin-settings`.
- `scripts/install-pinned-plugins.js` (new) — downloads pinned vsix, asserts sha256, unpacks into `plugins/<id>` with a marker; Theia's `download:plugins` then skips it (Theia never checks hashes).
- `scripts/seed-kotlin-settings.js` (new) — writes `kotlin.languageServer.{enabled,path}`, `kotlin.java.home`, `kotlin.java.opts` (= `SERVER_JAVA_OPTIONS`, -Xmx512m…), `kotlin.scripts.enabled=true`, `kotlin.debugAdapter.enabled=false` into `<THEIA_CONFIG_DIR|~/.theia>/settings.json` (merge; non-plain-JSON file left alone) plus `globalStorage/fwcd.kotlin/config.json` `{"initialized":true}` to suppress the extension's first-run download prompt.
- `Dockerfile` (COPY seed script, comment), `entrypoint.sh` (seed call before exec, failure tolerated).
- Docs: `README.md`, `AGENTS.md`, `release_notes/RELEASE_NOTES_v0.0.16.md` (SECOND process, ~0.8 GB extra while a Kotlin file is open, extension-managed), `language-server-extension/README.md`; knowledge `workbench.md`, `change-log.md`.
- language-server-extension: round-4 bridge-for-files code removed — `KotlinFileRegistration.ts` deleted, `fileExtensions`/`serverSettings` contract fields, initializer `didChangeConfiguration` + `probeUri`, `KotlinServerLaunch` back to fixed id, module bindings. **Kept** as standalone fix: `LanguageServerHost` refuses to start a user-workspace server when no workspace folder is open (previously fell back to `process.cwd()`), with spec `LanguageServerHost.spec.ts`.

### Seeding mechanism and why
Script run at start (entrypoint in Docker, `yarn seed:kotlin-settings` in dev) writing env-resolved absolute paths to `settings.json`. Static `theia.frontend.config.preferences` in package.json cannot express dev `.kotlin-ls/` vs `/opt/continuum/kotlin-ls`. Owned keys are rewritten each start; other user keys kept.

### Compatibility checks
- `engines.vscode` ^1.52.0; Theia 1.74 supports 1.130.0 API (builtins 1.108.2) → compatible.
- `activationEvents`: `onLanguage:kotlin`, `onDebugResolve:kotlin`.
- Contributes language `kotlin` (.kt/.kts) and grammar `source.kotlin`. COLLISION RISK: workflow-editor-extension `MonacoLanguageRegistration` registers Monaco language `kotlin` with a Monarch tokenizer (also used by the node dialog editor); last provider wins. NOT VERIFIED at runtime.
- Risk: `onLanguage:kotlin` might fire for the Script dialog's model and start a second server with no file open. Its documentSelector is scheme `file`/`kls` only, so the dialog model is not sent to it, but activation timing is NOT VERIFIED.
- No server path set: it auto-downloads the latest fwcd release from GitHub (and the debug adapter too unless disabled) and prompts on first run; hence the seeding of path, `debugAdapter.enabled=false` and the first-run marker. The global-storage path (`<configDir>/globalStorage/fwcd.kotlin`) was read from hosted-plugin code; NOT VERIFIED at runtime.
- sha256 `79be50d4…453a2d` was computed by me from the download (Open VSX `.sha256` endpoint was empty).

### Earlier finding (bridge route for files)
A real-server run with the file registration never became ready ("Language server did not become ready"): workspace `/tmp/ktws` (Main.kt, tool.kts, build.gradle.kts), readiness probe on a never-written `file:` URI. Cause unknown (probe on missing file, or classpath resolution with build files). Also: fwcd ignores non-`file:` URIs (why `VirtualUriTranslator` exists for the Script editor).

### Tests (→ behaviour)
`KotlinExtensionConfig.spec.ts` (9): pinned URL/0.2.36, checksum value and install-before-Theia chain, checksum mismatch rejected, settings for image/dev/bundled JRE, merge keeps user keys, invalid JSON untouched, CLI writes settings + first-run marker, heap options equal the bridge's. `LanguageServerHost.spec.ts`: no workspace → unavailable, no spawn.

### Verification
- `node scripts/install-pinned-plugins.js` (real network) → PASS, "checksum verified", re-run skips; wrong checksum → exit 1, nothing installed.
- `npx tsc --noEmit` → PASS; `yarn test` → 177/177 PASS.
- Plugin-host activation, tokenizer collision, prompt suppression, no second server on dialog open: NOT VERIFIED (browser test).
- Docker build: NOT RUN.

### API contract changes
none. FE-3 needs: nothing in code; browser-test checks listed above.

## Round 4 — BE-6 fix (configuration directory)
- Bug: `seed-kotlin-settings.js` defaulted to `~/.theia`, but the app sets `theia.backend.config.configurationFolder` to `.continuum`, so seeded settings and the first-run marker would never be read.
- Fix: `resolveConfigDirectory(env, home)` → `THEIA_CONFIG_DIR`, else `<home>/.continuum` (constant `CONFIGURATION_FOLDER`). Script header and workbench README corrected; no other file (AGENTS.md, release notes, knowledge page, Dockerfile, entrypoint) mentioned `~/.theia`.
- Specs added in `KotlinExtensionConfig.spec.ts`: drift guard (constant equals the application package.json `configurationFolder`, read from the file), default resolution with a fake home, `THEIA_CONFIG_DIR` override.
- Plugins dir check: `install-pinned-plugins.js` writes to `theiaPluginsDir` (`plugins`) relative to the app dir (`yarn --cwd continuum-workbench`). Dev start uses `--plugins=local-dir:./plugins` (same dir). Docker builder puts it at `/app/continuum-workbench/plugins`, copied to `/app/plugins`, matching `--plugins=local-dir:/app/plugins`. Confirmed by reading, not run.
- Verification: `tsc` PASS; `yarn test` 179/179 PASS. Did not build or start Theia, nor touch lib/, src-gen/ or plugins/.

## Round 5 — fix round 1
### Tasks
| # | Finding | Status | Notes |
|---|---|---|---|
| 1 | stdlib (ST-1) | DONE, not run in Docker | `download-kotlin-ls.sh` copies `server/lib/kotlin-stdlib-<v>.jar` into `<install>/m2/org/jetbrains/kotlin/kotlin-stdlib/<v>/` (verified on a real download, 2.1.0; early-exit re-installs when m2/launcher are missing). `MAVEN_REPOSITORY=<install>/m2` set in the Dockerfile ENV and in the bridge's launch env (`KotlinServerLaunch`). The extension's server gets it through a new launcher `<install>/bin/kotlin-language-server` (`scripts/kotlin-language-server-launcher.sh`; seeded as `kotlin.languageServer.path`), because a dev `yarn start` does not inherit an env var; launcher smoke-run starts the real server. Drift guard in `KotlinExtensionConfig.spec.ts` (Dockerfile ENV, launcher, jlink modules) and `KotlinServerLaunchSpec.spec.ts`. Dev no longer depends on `~/.gradle` *by construction*; real analysis run NOT VERIFIED. |
| 2 | first diagnostics (ST-2) | DONE | New `DiagnosticsNudge`: 500 ms after `ready`, a no-op full-text `didChange` (version+1, latest text) for every open document (covers docs opened while starting and right after ready); cancelled if the server leaves ready. Generic. |
| 3 | OOM / stuck server (ST-3/4) | DONE | New `ServerHealthMonitor` (3 failures = `-32603` with OutOfMemoryError or no answer within 30 s; any proper answer resets) → `LanguageServerLifecycle.restartUnhealthy` (counts as a failure: existing back-off and `maxRestarts` apply; documents replayed on ready). A timed-out request is answered with an error and cancelled on the server. `-Xmx512m` unchanged. Release notes/README carry the real numbers (server 0.7-0.8 GB, pod peak ~0.94 GB in 1 GiB, default 512Mi/1Gi, 10-14 scripts per server). **Open user decision, other repo, not edited:** raise the cluster manager's default pod memory (WorkbenchInstanceEntity 512Mi/1Gi). |
| 4 | jlink (ST-5) | DONE | Added `java.compiler, java.net.http, java.rmi, java.security.jgss`. Measured locally with the same JDK 21 jlink flags: 60.29 MB → 61.71 MB (+1.4 MB: compiler +0.1, net.http +0.6, rmi +0.2, jgss +0.5); stdlib copy +1.7 MB. Image delta ≈ +3 MB total. Docker build NOT RUN. |
| 5 | BR-1 / dev start | DONE | `findDevelopmentDirectory` walks up to the folder holding `scripts/download-kotlin-ls.sh` (right in both `src/node/kotlin` and the bundled `<app>/lib/backend`). Specs use the real repository layout (`<repo>/continuum-workbench/lib/backend` and the source dir) against the real filesystem. `yarn start` now runs `(node ../scripts/seed-kotlin-settings.js || true) && theia start …` (single natural place; spec asserts it). |
| 6 | seed script | DONE | JSONC tolerated (comment/trailing-comma stripper aware of strings); atomic write (temp + rename) for settings and marker; path keys (`languageServer.path`, `java.home`) rewritten every run, `enabled`, `java.opts`, `scripts.enabled`, `debugAdapter.enabled` only when the user has not set them; a JSONC file is rewritten as plain JSON (comments lost) with a one-time `settings.json.continuum-backup`; unparsable → left untouched, error on stderr, exit 1, no marker written (the extension then prompts rather than silently downloading). |
| 7 | minor | DONE | `initialize` now advertises only completion, hover, signatureHelp, definition, typeDefinition, references, documentHighlight, documentSymbol, positionEncoding + text sync. Image `USER root`: pre-existing (Dockerfile line 44, set for the claude install before our block; identical to 0.0.16) — not changed. |

### Files changed
- continuum-workbench: `Dockerfile` (jlink modules, ENV MAVEN_REPOSITORY, copy launcher with download script), `scripts/download-kotlin-ls.sh`, `scripts/kotlin-language-server-launcher.sh` (new), `scripts/seed-kotlin-settings.js`, `continuum-workbench/package.json` (`start`), README, release notes v0.0.16.
- language-server-extension: `src/node/{DiagnosticsNudge,ServerHealthMonitor}.ts` (new), `LanguageServerMultiplexer.ts` (wiring, trimmed capabilities, request timeout), `LanguageServerLifecycle.ts` (`restartUnhealthy`), `LanguageServerHost.ts` (passes clock), `kotlin/KotlinServerLaunchSpec.ts`.
- knowledge: `workbench.md`, `change-log.md`.

### Unit tests
New `LanguageServerMultiplexerHealth.spec.ts` (12: nudge timing/latest text/after-ready doc/cancelled on crash/after restart; OOM ×3 restarts and replays; proper answer resets; ordinary -32603 ignored; timeout answers+restart; gives up within limit; closed client's timers; trimmed capabilities). `KotlinServerLaunchSpec.spec.ts` (+4: MAVEN_REPOSITORY, dev dir in bundled/source/no-repo layouts). `KotlinExtensionConfig.spec.ts` (launcher path, user-kept defaults, JSONC, unreadable file exit 1 + nothing written, backup + no temp file, start script seeds, Dockerfile ENV + jlink modules).

### Verification
- `npx tsc --noEmit`: PASS. `yarn test` in language-server-extension: 209/209 PASS (was 179).
- `scripts/download-kotlin-ls.sh` real run into a temp dir and `.kotlin-ls`: PASS (stdlib at `m2/…/2.1.0/`, launcher present, re-run no-op). Launcher starts the real server (its own argument parser answered).
- jlink size measurement: local JDK 21.0.11, see table.
- NOT VERIFIED: Docker build, stdlib resolution in the image, extension via launcher in a plugin host, restart on real OOM, nudge against the real server (the outside tester's workaround was the model). feature-base untouched (no gradle run).

### API contract changes
none (initialize capability set is narrower).

### Knowledge updates
`.claude/knowledge/workbench.md` (packaging facts, launcher, dev dir walk, nudge/health, seed semantics) and `change-log.md`.

## Round 6 — fix round 2
### Tasks
| Finding | Status | Notes |
|---|---|---|
| ST-11 nudge/edit version collision | DONE (re-test pending) | `OpenDocument.serverVersion` + `nextServerVersion()` (OpenDocuments.ts): every `didOpen`, `didChange`, restart replay and nudge re-send that the bridge sends to the server carries the document's next, strictly higher server-side version (counter per document). The client's own `version` is only recorded, never forwarded as is, and the browser side is untouched. A bump spent on a message dropped while the server is not ready is harmless (numbers only need to rise). |
| ST-12 BOM | DONE | `parseSettings` strips a leading U+FEFF before strict or lenient parsing; the rewritten file has no BOM. |

### Files changed (continuum-workbench/language-server-extension, scripts)
`src/node/OpenDocuments.ts`, `LanguageServerMultiplexer.ts` (versions on open/change/replay), `DiagnosticsNudge.ts` (uses the next server version), `scripts/seed-kotlin-settings.js`; specs `LanguageServerMultiplexerHealth.spec.ts` (+4: increasing after nudge then real edit, across restart replay, per document, client numbering not forwarded; existing nudge-closed-document spec added), `LanguageServerMultiplexer.spec.ts` (replay version now 3: open, edit, replay), `KotlinExtensionConfig.spec.ts` (+1 BOM plain/commented).

### Verification
`npx tsc --noEmit` PASS; `yarn test` 215/215 PASS (was 209). Real-server check of the first edit after the nudge (`ONLY=coldwindow`): NOT RUN here (system tester re-test).

### API contract changes
none.

### Knowledge updates
`graph.json` node `diagnostics-nudge-version-collision` marked FIXED (mechanism recorded), seed-script node notes ST-12 fixed; `change-log.md` line added.

## Round 7 — fix round 3 (backend)
### Tasks
| Task | Status | Notes |
|---|---|---|
| Seed script data-loss, mode, java.home | DONE | Only ENOENT means no file; other read errors exit 1 and write nothing; rewrite keeps the mode (0600 stays 0600); `kotlin.java.home` untouched without a runtime. |
| Guards refuse, never throw | DONE | `recordChange` refuses non-object change entries; `ClientMessageGuard` describes values safely; the bridge wraps `connection.receive`, logs a warning without payload and answers requests with -32602. Server-version logic untouched. |
| Test cleanups (Kotlin contract test, health spec) | DONE | Redundant class assertion replaced by a pinned contract (null flow variable refused with its message); health spec asserts exact server versions [2,3,4]. |
| Release notes / comments with real memory numbers | DONE | 0.7-0.9 GB per server, 1000 MB restart ceiling, platform 0.0.23 defaults 2Gi/4Gi, existing workbenches via `PUT /api/v1/workbench/{name}`; two-server 1.7-2 GB marked an estimate. Dockerfile and launch-spec comments match. |
| Docs | DONE | Table rows for ServerHealthMonitor/DiagnosticsNudge, the version rule and stdlib-copy note (README + AGENTS.md), workspace count 4 -> 6. |
### Files changed
workbench: scripts/seed-kotlin-settings.js, language-server-extension src/node/{LanguageServerBridge,LanguageServerMultiplexer,ClientMessageGuard}.ts and specs (+Health spec, KotlinExtensionConfig.spec), KotlinServerLaunchSpec.ts, Dockerfile, README, AGENTS.md, RELEASE_NOTES_v0.0.16.md. feature-base: KotlinScriptBindingsContractTest.kt.
### Unit tests added/changed
Seed: directory as settings.json, unreadable file (skipped as root), missing file, mode kept, java.home kept. Guard: object uri without usable toString. Multiplexer: non-object contentChanges. Bridge: throwing receive -> -32602 / no reply for notifications / no payload in log. Kotlin: null flow variable contract.
### Verification
- `npx tsc --noEmit` in language-server-extension: PASS. `yarn test`: 228 tests, 228 pass.
- `./gradlew --offline :features:continuum-feature-analytics:test --tests "*KotlinScriptBindingsContractTest*" --tests "*KotlinScriptNodeModelTest*"` (JDK 21): BUILD SUCCESSFUL; daemons stopped.
### API contract changes
none
### Docs updated
Release notes, README, AGENTS.md, Dockerfile/launch-spec comments; graph nodes kotlin-settings-seed, lsp-backend-bridge, change-log.
### SCOPE / questions
none
