# Backend review: CONTNM-180 — Kotlin language-server support (Script node dialog bridge, packaging, `.kt`/`.kts` route)

## Round 1

Date 2026-11-27. Repos `continuum-workbench` (branch `CONTNM-180`; 12 tracked files modified, 10 untracked paths, one of
them the whole new `language-server-extension/` workspace) and `continuum-feature-base` (branch `CONTNM-180`; 2 files
modified, 1 new test). Everything is uncommitted. Reviewed: `language-server-extension/src/common`, `src/node` (bridge,
lifecycle, multiplexer, host, translator, process, framing, guard, initializer), `src/kotlin`, `src/node/kotlin`,
`scripts/*`, `Dockerfile`, `entrypoint.sh`, `continuum-workbench/package.json`, AGENTS/README/release notes, and the
feature-base binding constants and contract test. The browser side (`src/browser`, `workflow-editor-extension`) belongs
to `08-frontend-review.md`. Inputs: `02-plan.md` (BE-1..BE-6, ACs 1-3, 13-17, 19-23), `03-backend-dev.md` rounds 1-4,
`01-requirements.md`, `spike-kotlin-ls.md`, `state.md`. DOX chain: `continuum-workbench/AGENTS.md` (the only AGENTS.md of
that repo; the new workspace's row is in it) and `continuum-feature-base/AGENTS.md`.

**Verdict: CHANGES REQUESTED** — 0 BLOCKER, 3 MAJOR (one of them UNCONFIRMED at run time), 10 MINOR, 7 NIT.

### Summary

The bridge core is sound. The URI policy and the client-message guard hold against every attack I could construct
(`file:///etc/passwd`, traversal, odd `continuum-script:` keys, unknown language ids, other connections' documents); the
lifecycle does what the plan says and the system tester's log shows it working at run time; the packaging pins and
verifies its downloads. The three MAJOR findings are all at the edges, not in the core:

1. the development install-directory default is wrong inside the bundled Theia backend (BR-1);
2. the memory the feature needs does not fit the default workbench pod, and the release note gives no numbers (BR-2);
3. opening a Script node dialog very likely also starts the file-editor extension's own Kotlin JVM, which the release
   note says happens only when a Kotlin file is open (BR-3, not yet confirmed by running).

The seed script's treatment of a user's `settings.json` (BR-4, BR-5) is the next most important item.

### What I verified myself

| Check | Result |
|---|---|
| `yarn test` in `language-server-extension` (`node --test`, 17 suites) | 179 pass, 0 fail; includes the cross-repo drift guard between `KotlinScriptPrelude.ts` and `continuum-feature-base` (it runs because the sibling repo is present) |
| `npx tsc --noEmit` with `tsconfig.json` and `tsconfig.test.json` | exit 0 |
| `./gradlew --offline :features:continuum-feature-analytics:test --tests "*KotlinScriptBindingsContractTest*" --tests "*KotlinScriptNodeModelTest*"` (JDK 21.0.11) | BUILD SUCCESSFUL; contract test 4/4, node-model test 32/32 |
| Factory-ID grep over changed and new files | only the ticket id `CONTNM-180` in a release-notes heading, the file's house style (CONTNM-145/161/167/177 headings) — no finding |
| Kotlin named-argument rule in the contract test and constants | satisfied; `put(ROW_BINDING, row)` calls Java's `Bindings.put` (exempt) |
| Pinned artefacts | the vsix at the pinned Open VSX URL has the pinned sha256 (`79be50d4…3a2d`); its entries contain no traversal path or symlink; its manifest has no `extensionDependencies`/`extensionPack`; the `server.zip` sha256 in `download-kotlin-ls.sh` equals the spike's; the temurin digest resolves to an OCI index (amd64, arm64, ppc64le, s390x) |
| `javap` on `server-1.3.13.jar` | `resolveCompletionItem` is `TODO("not implemented")` (see BR-14) |
| Installed `@theia/*` sources | bundler `__dirname` setting, language-activation chain, reconnect protocol, backend shutdown hook, socket.io limits — cited in the findings |
| System tester's log `/tmp/kotlin-lsp-systest-3006.log` | idle stop (their configured 15 s) and channel close on socket close both appear at run time |
| Housekeeping | the idle Gradle/Kotlin daemons my offline runs left behind (about 2 GB RSS) were stopped; the `fwcd.kotlin` vsix I unpacked lived only in `/tmp` and is deleted; nothing of mine is running |

I did not build Theia, run Docker, start a workbench or touch `lib/`, `src-gen/` or `plugins/` (two testers are using
them); what that leaves unverified is listed under "NOT VERIFIED".

### Findings

#### BR-1 — MAJOR — BE-4 / BE-5 — the development install-directory default is wrong in the bundled backend

- **Where:** `continuum-workbench/language-server-extension/src/node/kotlin/KotlinServerLaunchSpec.ts:29`
  (`developmentDirectory: path.resolve(__dirname, '..', '..', '..', '..', '.kotlin-ls')`), used by `installDirectory()` at
  `:62-67`. `KotlinServerLaunchSpec.spec.ts` always injects `developmentDirectory`, so `systemLaunchEnvironment()` has no test.
- **What is wrong:** four `..` are right only for the unbundled file `language-server-extension/lib/node/kotlin/…`. Theia
  webpacks the backend with `node: { __dirname: false }` (`node_modules/@theia/application-manager/lib/generator/bundler-generator.js:486`),
  so in the running backend `__dirname` is the real directory of the bundle, `<repo>/continuum-workbench/lib/backend` (the
  bundled copy of this very expression is at `continuum-workbench/lib/backend/main.js:2453`). Four levels up from there is
  `/home/maximus/Projects/Project-Continuum/.kotlin-ls`, outside the repository, where nothing exists. Three levels give
  `<repo>/.kotlin-ls`, where `yarn download:kotlin-ls` installs the server and where `seed-kotlin-settings.js` (not bundled,
  so its own `path.resolve(__dirname, '..', '.kotlin-ls')` is correct) points the file-editor extension.
- **Why it matters:** the documented development flow (README: `yarn --cwd continuum-workbench download:kotlin-ls`, then
  `yarn start`) leaves the Script dialog `unavailable` with "The Kotlin language server is not installed (…/.kotlin-ls/server/bin/kotlin-language-server
  is missing)", while the file-editor route (seeded with the right path) works — a confusing split. The image is not
  affected (`ENV CONTINUUM_KOTLIN_LS_HOME`). Evidence that this bites: the system tester's backend on :3006 was started with
  `CONTINUUM_KOTLIN_LS_HOME=<repo>/.kotlin-ls` exported; the browser tester's backend on :3005 has no such variable (both read
  from `/proc/<pid>/environ`). If the browser tester sees the Script dialog stuck on `unavailable` with that message, this is the cause.
- **Fix:** do not derive the directory from the bundle layout: walk up from `process.cwd()` (the app directory) until
  `.kotlin-ls/server/bin/kotlin-language-server` exists, or have the `start*` scripts export `CONTINUUM_KOTLIN_LS_HOME`.
  Make the resolution a function of an injected start directory and add a spec with a bundle-like layout. State in the
  README and the release note that the variable is what makes development work, not an optional extra.

#### BR-2 — MAJOR (needs a user decision) — BE-5 / BE-6 — the memory the feature needs does not fit the default workbench pod

- **Where:** `continuum-workbench/Dockerfile:51-54` ("the whole process stays near 1 GB"),
  `release_notes/RELEASE_NOTES_v0.0.16.md:137` ("uses about 0.8 GB … capped at about 1 GB … raise the pod's memory
  request/limit accordingly (the Helm chart is not changed here)"), `KotlinServerLaunchSpec.ts:9-13`; pod defaults in
  `continuum-platform-core/continuum-cluster-manager/src/main/kotlin/org/projectcontinuum/core/cluster/manager/model/ResourceSpec.kt:15-18`
  and `.../entity/WorkbenchInstanceEntity.kt:28-31`.
- **Facts:**
  - A workbench created without explicit `resources` gets request 512Mi / limit 1Gi. `continuum-charts` sets no
    workbench-pod memory (its `workbench` block only names image, namespace and overlays).
  - The spike measured the Script-dialog server at about 0.8 GB resident, 0.87 GB at the end of a run
    (`spike-kotlin-ls.md:24`). The heap cannot be lowered to help: the same line records `-Xmx384m` still at 0.8 GB and
    `-Xmx256m` failing with an internal error.
  - The measured figures alone — Theia backend 168 MB plus an 84 MB file-watcher process (observed on the dev backend at
    review time) plus 0.77-0.87 GB for the server — add up to about 1.0-1.1 GB, i.e. already at or above a 1 GiB limit
    before the plugin host, git, terminals or the Claude agent are counted.
  - The bridge's own ceiling is 1000 MB (`SERVER_MEMORY_LIMIT_MB`), only 15-30 % above what the spike measured after 39 s;
    it can therefore never fire before the kernel's limit does in a default pod.
  - The file route adds a second JVM (`-Xmx512m`, no idle stop, no ceiling, managed by the extension), and when the bridge
    restarts a server the old JVM may still be alive for up to 3 s (SIGTERM, SIGKILL after 3 s,
    `LanguageServerProcess.ts:94-99`) while the new one starts after a back-off of at least 1 s
    (`LanguageServerLifecycle.ts:197-217`).
  - The three statements disagree: the Dockerfile comment says "near 1 GB", the release note "about 0.8 GB … capped at
    about 1 GB", the launch-spec comment "near 0.8 GB resident"; none says what the pod needs.
- **Why it matters:** in a default pod the kernel OOM-kills the container — the whole workbench (editor, terminals, Claude
  agent), not just the language server — before the bridge's ceiling matters. My sum is an estimate; it was not measured
  inside a pod (NOT VERIFIED).
- **Options (user decision):**
  - (a) raise the cluster-manager's default workbench resources (a `continuum-platform-core` change, outside this ticket's
    repos) and state concrete numbers in the Upgrade notes — my estimate: a 2 GiB limit for the dialog server alone, 3 GiB
    when a second JVM runs too;
  - (b) make the file-route server opt-in (see BR-3), so the default pod carries at most one JVM;
  - (c) accept the requirement and document it with explicit numbers (request and limit) in the Upgrade notes, the README
    and the Dockerfile comment, all three consistent.
  Lowering `-Xmx` is not an option (spike, above). Whatever is chosen, the three statements above must agree.

#### BR-3 — MAJOR (UNCONFIRMED at run time; strongly supported by code) — BE-5 / BE-6 — opening a Script dialog very likely starts the extension's own Kotlin server too

- **Where:** `continuum-workbench/package.json` `theiaPlugins` (`fwcd.kotlin`), `scripts/seed-kotlin-settings.js:47`
  (`kotlin.languageServer.enabled: true`), `release_notes/RELEASE_NOTES_v0.0.16.md:138`; the developer already listed
  "activation timing" as NOT VERIFIED in `03-backend-dev.md`.
- **What is wrong (by code reading):** a Script dialog creates its editor model with language id `kotlin`, and that alone
  activates `fwcd.kotlin`, which starts its own JVM, with no `.kt` file open:
  1. the dialog calls `monaco.editor.create(container, { value, language, … })` on Theia's Monaco
     (`workflow-editor-extension/src/browser/components/monaco/MonacoEditorWrapper.tsx:35`; language from
     `CodeEditorRenderer.tsx:31`, which also falls back to `'kotlin'` when a field names no language);
  2. creating the text model calls `requestRichLanguageFeatures` (`@theia/monaco-editor-core/esm/vs/editor/common/model/textModel.js:276`),
     which calls `requestBasicLanguageFeatures` (`.../services/languageService.js:96-106`) and fires
     `onDidRequestBasicLanguageFeatures` once per language;
  3. Theia's `HostedPluginSupport` listens and calls `activateByLanguage`, i.e. `activateByEvent('onLanguage:kotlin')`
     (`@theia/plugin-ext/lib/hosted/browser/hosted-plugin.js:104-108, 315-318`) — by language id only, whatever the URI scheme;
  4. the pinned `fwcd.kotlin` 0.2.36 declares `activationEvents` `["onLanguage:kotlin", "onDebugResolve:kotlin"]` and its
     `activate()` (with the seeded `kotlin.languageServer.enabled` true and the seeded `config.json` skipping the first-run
     dialog) builds the `LanguageClient` and calls `start()` (`dist/extension.js`, `activateLanguageServer`:
     `new LanguageClient("kotlin", …)` then `let D=P.start()`), which spawns `kotlin.languageServer.path` at once. Its
     `documentSelector` (`file` and `kls` schemes) only limits what is synchronised, not whether the server starts.
- **Why it matters:** a Script dialog would then cost two JVMs (the second one has no workspace to index, so it may be
  smaller than the 0.8 GB of the first — not measured), contradicting the release note ("starts only when a Kotlin editor
  opens … adding about 0.8 GB while a Kotlin file is open") and making BR-2 worse; the extension's server has no idle stop
  and stays up as long as the plugin host does.
- **Confirm first:** ask the browser tester to open a Script dialog with no `.kt` file open and look at `ps` for a second
  `java … kotlin-language-server` (parent: the plugin host, not the Theia backend; the first is the bridge's, parent: the
  Theia backend). The extension's "Kotlin" output channel shows the same.
- **Fix, if confirmed:** either accept it and reflect it in BR-2's sizing and in the release note, or avoid the activation:
  a dialog-only language id for the dialog's model that does not fire `onLanguage:kotlin` (frontend-owned, needs
  highlighting kept), or seed `kotlin.languageServer.enabled: false` by default and document the opt-in for the file route.

#### BR-4 — MINOR — BE-5 — a commented `settings.json` is left unseeded and the extension then downloads its own server

- **Where:** `continuum-workbench/scripts/seed-kotlin-settings.js:61` (`JSON.parse`), `:83-88`; `entrypoint.sh:19`.
- **What is wrong:** Theia's `settings.json` is JSONC; comments and trailing commas are legal and common once a user edits
  it by hand. `mergeSettings` uses `JSON.parse`, so such a file is "left unchanged" with a warning (`:85`) and none of the
  six `kotlin.*` keys is written — while the `config.json` marker (`:92`) is still written.
- **Why it matters:** `fwcd.kotlin` then has no `kotlin.languageServer.path`, `kotlin.java.home` or `kotlin.java.opts`; it
  downloads its own server from GitHub at run time and looks for a Java on the `PATH` (the image has none: the jlink JRE is
  not on the `PATH` and the extension does not read `CONTINUUM_JAVA_HOME`). That contradicts "never downloads anything /
  nothing is downloaded at run time" (script header, `entrypoint.sh:18`, Dockerfile, release note) and fails at activation.
  Trigger: a hand-commented `settings.json` on the PVC; the only trace is a warning in the container log.
- **Fix:** parse with a JSONC-tolerant parser (`jsonc-parser` is a Theia dependency, but it resolves from `/app/node_modules`,
  not from `/opt/continuum`, so it needs an absolute path or `NODE_PATH`) and edit in place, or deliver the owned keys as
  application-level default preferences so the user's file is never touched. Add a spec with a commented file.

#### BR-5 — MINOR — BE-5 — the six owned keys are overwritten on every start, and the write is not atomic

- **Where:** `scripts/seed-kotlin-settings.js:8-9, 47-52, 88`; `release_notes/RELEASE_NOTES_v0.0.16.md:138`.
- **What is wrong:** all six keys, including `kotlin.languageServer.enabled`, `kotlin.java.opts`, `kotlin.scripts.enabled`
  and `kotlin.debugAdapter.enabled`, are rewritten on each start. The script header says so; the release note says only
  "your other settings are kept". A user who switches the second JVM off, or tunes the JVM options, finds it reverted at
  the next pod start. The write (`fs.writeFileSync` straight onto `settings.json`) is not atomic: a kill during the write
  (an OOM kill, see BR-2, or an eviction) can truncate the file; in development it can race a running Theia that writes the
  same file. The merge also re-serialises the file (two-space indent), so formatting is lost (the data of a plain-JSON file is kept).
- **Fix:** write only the path-bearing keys unconditionally and the others only when absent (or document them as fixed and
  give a different off switch); write to a temporary file in the same directory and `rename` it; state the semantics in
  the release note.

#### BR-6 — MINOR — BE-3 — no size or flow limits on what a connection can send

- **Where:** `language-server-extension/src/node/LanguageServerMultiplexer.ts:162-200` (`forwardNotification`,
  `recordChange`), `OpenDocuments.ts:11, 18-28`, `LanguageServerProcess.ts:79`, `LspFraming.ts:10, 27`.
- **What is wrong:** per connection only the document count is capped (50). Nothing caps the text of a `didOpen`/`didChange`
  (Theia's websocket accepts up to 100 MB per message, `@theia/core/lib/node/messaging/websocket-endpoint.js:28`), the total
  text retained for replay, the number of connections or of in-flight requests. `stdin.write` ignores back-pressure (the
  return value is dropped), so a flood buffers in the backend's heap; `FrameDecoder` does `Buffer.concat` per chunk
  (bounded by the 64 MiB frame cap). `version: Number(...)` (`:171`, `:199`) can be `NaN`, which becomes `null` on replay.
- **Why it matters:** a pathological paste of tens of MB goes straight into the backend, the retained copy and the JVM.
  The practical risk is low (a single-user pod behind authentication); I note it because the guard validates everything else.
- **Fix:** cap document text (for example 1-2 MB) in `isAcceptable` and the retained total; honour `write()` back-pressure;
  validate `version` as a safe integer.

#### BR-7 — MINOR — BE-3 / BE-4 — the whole backend environment reaches the third-party JVM, and its stderr is logged at info

- **Where:** `language-server-extension/src/node/LanguageServerProcess.ts:57` (`env: { ...process.env, ...spec.env }`), `:62`
  (`[server stderr] …` logged at info for every chunk).
- **What is wrong:** the language server receives every variable the backend holds (credentials included), and an inherited
  `JAVA_TOOL_OPTIONS` or `KOTLIN_LANGUAGE_SERVER_OPTS` can override `-Xmx512m` and defeat the cap. Server stderr can quote
  script fragments and lands in the backend log at info level.
- **Fix:** pass an allow-list (`PATH`, `HOME`, `LANG`, `TMPDIR`, plus the launch spec's `env`); log stderr at debug or truncated.

#### BR-8 — MINOR — BE-2 — "whole process tree" ceiling reads one pid

- **Where:** `src/common/LanguageServerRegistration.ts:46` (doc: "resident-memory ceiling of the whole server process tree"),
  `src/node/LanguageServerProcess.ts:124-135` (`ProcFsMemoryReader` reads `VmRSS` of the one pid).
- **What is wrong:** today the Kotlin start script `exec`s java, so the pid is the JVM and the cap works. A launch that does
  not `exec` (a wrapper script, `sh -c`) would measure the wrapper (a few MB) and the cap would silently never fire. Not
  enforced off Linux (documented).
- **Fix:** sum the children (`/proc/<pid>/task/<tid>/children`) or reword the doc to "the server process" and add a spec
  that fixes the pid the reader is given.

#### BR-9 — MINOR — BE-2 / BE-3 — modularity (house rule 12)

- **Where:** `src/node/LanguageServerLifecycle.ts` (293 lines; `LifecycleCollaborators` has eight members, `:34-45`; the
  class doc at `:54-58` lists lazy start, lease sharing, idle stop, back-off restart, give-up, memory ceiling and answering
  the server's own requests), `src/node/LanguageServerMultiplexer.ts` (326 lines, class body 278: per-wire routing,
  request-id remapping and cancellation, document recording, replay, state fan-out).
- **What is wrong:** each class does several jobs. All functions are under 40 lines and the new behaviour already lives in
  collaborators (guard, translator, open-documents, initializer, responder, framing), so this is a design smell, not a MAJOR.
  `03-backend-dev.md` says every class stays below about 300 lines; the multiplexer does not (326).
- **Fix:** extract the restart policy (failure count, back-off, give-up, stability reset) and the memory watchdog from the
  lifecycle, and the forwarded-request table (id remapping, cancel, fail-in-flight) from the multiplexer; correct the size note.

#### BR-10 — MINOR — BE-3 / BE-4 — client document keys share a namespace with the seed files

- **Where:** `src/node/VirtualUriTranslator.ts:20-24, 33`, `src/kotlin/KotlinScriptPrelude.ts:17`
  (`CONTEXT_FILE_NAME = 'ContinuumContext.kt'`), `src/node/PrivateWorkspace.ts:23-24`, `src/node/LspServerInitializer.ts:28`
  (probe key `readiness-probe`).
- **What is wrong:** a client key maps to `<private dir>/<key>.<ext>`, the directory that also holds the seed files. A client
  that opens `continuum-script:/ContinuumContext.kt` (the URI shape allows it) makes its own text the server's view of the
  prelude, which every script of that server depends on; the probe key lives in the same space.
- **Why it matters:** self-inflicted only (one user's pod), but a buggy client breaks diagnostics for every dialog of that
  user until the document is closed.
- **Fix:** map client documents into a subdirectory apart from the seeds, or refuse keys equal to a seed's name.

#### BR-11 — MINOR — BE-4 — one contract test asserts nothing

- **Where:** `continuum-feature-base/features/continuum-feature-analytics/src/test/kotlin/org/projectcontinuum/feature/base/analytics/node/KotlinScriptBindingsContractTest.kt:56-61`.
- **What is wrong:** "flow variables are built from an execution context" constructs `ScriptFlowVariables(executionContext = mock<ExecutionContext>())`
  and asserts `ScriptFlowVariables::class == flow::class`, which is always true. The other three tests are meaningful: they
  pin `ROW_BINDING`/`FLOW_BINDING` and, by reflection, the public API of `ScriptFlowVariables` (names, parameter names and
  types, return types, no public properties).
- **Fix:** delete it, or assert real behaviour (`set` delegates to `setFlowVariable(name = …, value = …)`, `get` falls back
  from output to input flow variables, `all()` merges them, `set` with null throws).

#### BR-12 — MINOR — BE-5 / BE-6 — release-note and README claims that the code does not back up

- **Where:** `release_notes/RELEASE_NOTES_v0.0.16.md:137-138`, `README.md` Kotlin section, `Dockerfile:51-54`.
- **What is wrong:**
  - README lists `CONTINUUM_KOTLIN_LS_HOME` as optional; because of BR-1 it is required for `yarn start` in development.
  - "nothing is downloaded at run time" holds only while seeding succeeds (BR-4).
  - "capped at about 1 GB and restarted above it" applies only to the dialog server (the next bullet says the file route's
    server has no cap, which is correct), and the three memory statements disagree (BR-2).
  - The seed script's rewrite semantics (BR-5) and the probable activation on dialog open (BR-3) are not mentioned.
  - No pod request/limit numbers (BR-2).
  The "about 150 MB" image growth is consistent with 90 MB of server plus 60 MB of JRE (the vsix adds a little); I could
  not measure the image (NOT VERIFIED).
- **Fix:** correct these lines when BR-1..BR-5 are settled.

#### BR-13 — MINOR — BE-5 — `install-pinned-plugins.js` relies on an undeclared transitive dependency

- **Where:** `scripts/install-pinned-plugins.js:51` (`require('decompress')`).
- **What is wrong:** `decompress` is not declared in any `package.json` of the repository; it resolves because
  `@theia/cli` pulls it in and it is hoisted (4.2.1, the first release with the Zip-Slip fix). A hoisting change or a Theia
  upgrade can break `yarn download:plugins` — loudly, at build time, not silently.
- **Fix:** declare `decompress` (at least 4.2.1) in a `devDependencies`, or extract with a tool already declared.

#### BR-14 — NIT — BE-3 — `completionItem/resolve` is a dead, URI-less allowance

- **Where:** `src/node/ClientMessageGuard.ts:9`, `src/node/LanguageServerMultiplexer.ts:149-150`.
- **What is wrong:** the pinned server's `resolveCompletionItem` is `TODO("not implemented")` (`javap` on `server-1.3.13.jar`)
  and the browser client never sends it, yet it is the only forwarded message accepted without a document URI check, and
  its `data` payload is opaque. If a later server version implemented it, the payload might carry server-defined
  references (UNCONFIRMED).
- **Fix:** drop it from the allow-list until a client needs it.

#### BR-15 — NIT — BE-3 — a malformed server request can throw out of the stdout handler

- **Where:** `src/node/ServerRequestResponder.ts:29` (`(request.params?.items ?? []).map(...)`),
  `src/node/LanguageServerProcess.ts:103-112` (only the decoder is inside the `try`; the listeners run outside it).
- **What is wrong:** a `workspace/configuration` request whose `items` is not an array throws a `TypeError` that escapes the
  `data` listener. The server is trusted and pinned, so this is hypothetical.
- **Fix:** `Array.isArray` guard.

#### BR-16 — NIT — BE-3 — the default private-workspaces directory

- **Where:** `src/node/BridgeSettings.ts:31` (`os.tmpdir()/continuum-language-servers-<uid>`), `src/node/PrivateWorkspace.ts:15, 17`.
- **What is wrong:** `mkdirSync(..., { mode: 0o700 })` does not tighten a pre-existing directory and follows symlinks, and the
  name is predictable, so on a shared multi-user development host another user could pre-create it. Two development
  backends on one machine share the same default directory (the system tester had to set
  `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR`). In the pod there is one user, so this is development-only.
- **Fix:** `mkdtemp` under the base or include the port; check owner and mode after `mkdir`.

#### BR-17 — NIT — BE-3 — file-URI encoding of a custom workspaces directory (UNCONFIRMED)

- **Where:** `src/node/LanguageServerHost.ts:86` (`pathToFileURL`) against Java's `Path.toUri()` in the server.
- **What is wrong:** for a custom `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` with spaces or non-ASCII characters the two
  encodings may differ, so the `publishDiagnostics` URIs might not map back through `VirtualUriTranslator` and diagnostics
  would be dropped silently. The default directory has no such characters. I could not confirm this against the real server.

#### BR-18 — NIT — BE-3 — `unavailable` outlives its cause while any editor is open

- **Where:** `src/node/LanguageServerLifecycle.ts:222-229` (`releaseOne`).
- **What is wrong:** the state returns to `stopped` only when the last lease is released, so while one editor stays open,
  every new editor sees `unavailable`, even after the cause (for example a missing install) was fixed, until all editors close.
- **Fix:** allow a new `acquire()` in `unavailable` to try again once.

#### BR-19 — NIT — BE-5 — packaging details

- `scripts/download-kotlin-ls.sh:49-50`: `rm -rf server` then `mv` is not atomic (image build and idempotent re-run only).
- `scripts/install-pinned-plugins.js:45`: `fetch(url)` has no retry; a transient 5xx fails the image build. A failed
  extraction leaves a directory without the marker, which is harmless in the `&&` chain of `download:plugins` (the run aborts)
  and is removed by the next run.
- No `.dockerignore` (pre-existing): the builder's `ADD . .` (`Dockerfile:6`) sends a developer's local `.kotlin-ls/`
  (90 MB) into the build context. Nothing of it reaches the final image: only `/app/node_modules` and `/app/continuum-workbench` are copied.

#### BR-20 — NIT — BE-5 — AGENTS.md workspace count

- **Where:** `continuum-workbench/AGENTS.md:7` says "Turborepo monorepo with 4 Yarn workspaces"; its table now lists six and
  the root `package.json` `workspaces` has six entries (the count was already stale at five). Fix: "6".

### Decisions for the user

1. **Memory.** How much memory may Kotlin support need in a workbench pod, and who raises the default 512Mi/1Gi: the
   cluster-manager defaults (another repo), the Helm chart, or the deployer, with numbers in the Upgrade notes (BR-2)?
2. **The second JVM.** If the browser tester confirms that opening a Script dialog starts the file-editor extension's JVM,
   should that stay (and be sized and documented), or should the file route be opt-in, or the dialog avoid activating it (BR-3)?
3. **Settings seeding.** How careful must the seed script be with a user's `settings.json`: tolerate comments, leave
   user-chosen `kotlin.*` values alone, write atomically (BR-4, BR-5)?

### Verified OK (no finding)

**URI policy and client guard**
- `isAllowedDocumentUri` (`src/common/LspProtocolPaths.ts`) accepts only `^continuum-script:/[A-Za-z0-9_-]{1,64}\.[a-z0-9]{1,10}$`
  or `file:///` URIs inside a registration's allowed roots (no `.`/`..`/empty segments, NUL, backslash, query or fragment;
  percent-decoding is applied before the checks). The Kotlin Script registration has `allowedFileRoots: []`, so
  `file:///etc/passwd`, `file:///<private dir>/../x` and `continuum-script:/../x.kt` are all refused; specs cover them.
- `ClientMessageGuard.ts:3-17` has a 12-method allow-list (no `workspace/executeCommand`, `didChangeWatchedFiles`,
  `applyEdit`, `rename`, `didSave`) and scans every `uri`/`*Uri` property to depth 8; a non-string value is refused.
- `LanguageServerBridge.ts:39-41`: an unknown or invalid registration id in the channel path logs a warning and closes the channel.
- A wrong `languageId`, an incremental `didChange`, a duplicate open and more than 50 documents per connection are refused
  (`OpenDocuments.ts`, `LanguageServerMultiplexer.ts:162-186`). A message about a document the connection has not opened is refused.

**Isolation of the shared server**
- `initialize`, `shutdown`, `initialized` and `exit` from a client are answered from the cached result or swallowed, so a
  client cannot shut down or reconfigure the shared server. Diagnostics go only to the owning connection. Server-originated
  requests are answered inside the lifecycle (`ServerRequestResponder`) and never reach clients.
- A private registration's server root is its private directory (`LanguageServerHost.ts:112-117`, `allowedFileRoots` empty
  at `~73-76`): the dialog server sees the seed files and virtual documents, never a user workspace.

**Lifecycle**
- Lazy start on the first connection; one host per registration; idle stop 600 s; restart back-off 1, 2, 4 s (cap 30 s);
  `maxRestarts` 3; failure count reset after 60 s of stable running; memory check every 5 s; stale generations ignored
  after `abandonCurrent`; readiness means a real completion request was answered (`LspServerInitializer.ts`).
- Documents are replayed on each `ready` with their latest text; a closed connection's documents are `didClose`d.
- Spawn: `shell: false`, fixed argument list, `JAVA_OPTS` a constant, command resolved from the launch spec only; no user
  input reaches a command line.

**Process cleanup**
- The Kotlin start script `exec`s java; the server exits on stdin EOF (`ExitingInputStream`), so a killed backend leaves no JVM.
- Theia's `BackendApplication` calls the contributions' `onStop` on SIGINT/SIGTERM/exit; the bridge's shutdown disposes the
  hosts, which kill the process (SIGTERM, SIGKILL after 3 s on an `unref`'d timer). No zombie JVM expected; the system
  tester's log shows the idle stop and the channel close at run time.

**Reconnects and duplicate opens** (read in `@theia/core/lib/node/messaging/websocket-frontend-connection-service.js`)
- The backend keeps a frontend's channel for `frontendConnectionTimeout` after a drop and re-attaches it on `RECONNECT`
  with the same frontend id (no sub-channel closes or reopens). `INITIAL_CONNECT` for a known id closes the old connection
  synchronously before creating the new one, so there is no duplicate-open race and no leaked document.

**Packaging**
- sha256 of the whole download is verified before extraction (`install-pinned-plugins.js:15-24, 51-54`); the pinned
  installer runs first in `download:plugins` (`continuum-workbench/package.json:42`), so Theia's own unverified download
  never fetches `fwcd.kotlin`; `download-kotlin-ls.sh` (`set -euo pipefail`, pinned 1.3.13, sha256 `4fe7d71d…b6d2`,
  temp dir with `trap`, check before `unzip`); Open VSX publishes no checksum, so the vsix pin is pin-on-first-use (recorded).
- Dockerfile: temurin base pinned by digest (OCI index); jlink JRE with nine modules; `RUN java -version` smoke test;
  everything image-owned lives in `/opt/continuum/kotlin-ls`, root-owned and world-readable/executable (the start script is
  `-rwxr-xr-x` after `unzip`), outside the PVC-mounted home. The final stage keeps `USER root` from `Dockerfile:44`
  (pre-existing, not changed here). `.gitignore` ignores `/.kotlin-ls/`.
- `entrypoint.sh:19` runs the seed with `|| echo … >&2` under `set -eu`, so a seed failure cannot stop the container.
- `seed-kotlin-settings.js` keeps every non-owned key, leaves a non-JSON file untouched (but see BR-4) and creates the
  directories it needs.

**Genericity (AC-15) and tests**
- My own scan finds no Kotlin, `row` or `flow` strings in `src/common`, `src/node` (outside `src/node/kotlin`) or
  `src/browser` apart from `GenericityGuard.spec.ts`, which lists the forbidden words and scans those directories.
- The feature-base diff is two constants and KDoc (`ROW_BINDING`, `FLOW_BINDING`, KDoc on `ScriptFlowVariables`); the
  contract test names every argument and its first three tests would fail without the constants or on an API change.
- The specs prove behaviour: fakes (clock, process factory, server) drive the lifecycle, and one spec runs a real child
  process (`test/fixtures/echo-language-server.mjs`). I found no assertion-free spec. The generic `user-workspace`
  capability has no Kotlin user yet; the plan allows it and it has spec coverage.
- `.test-out/kotlin/KotlinFileRegistration.js` is a harmless, ignored leftover of a removed source.

### NOT VERIFIED

- A full Docker image build, `--network none`, the memory of the server inside the image and the "about 150 MB" image
  growth (the system tester is building).
- Activation of `fwcd.kotlin` in a running plugin host, whether a Script dialog starts the extension's JVM, and that JVM's size (BR-3).
- Pod memory behaviour: BR-2's sum mixes measured and unmeasured parts and was not tried in a pod.
- The `/proc` memory reader against a real JVM in the image, and a memory-ceiling restart at run time.
- A real server's `publishDiagnostics` round trip through `VirtualUriTranslator` (specs use an echo server only).
- The Monarch/TextMate `kotlin` language-id collision (frontend side).
- The thin app's runtime (`continuum-workbench-thin`, which depends on this workspace through the workflow-editor extension).
- Zip-Slip behaviour of `decompress` against a hostile archive (I checked its version and inspected the pinned vsix instead).

### Verdict

**CHANGES REQUESTED.** No BLOCKER. Fix BR-1, settle BR-2 and BR-3 (BR-3 after the browser tester's `ps` check), and either
fix or consciously accept BR-4 and BR-5. A re-review checks every finding above as RESOLVED / STILL OPEN.

## Knowledge updates

For `.claude/knowledge/` (all verified in code or by command this session):

1. **`workbench.md` — Theia bundling pitfall.** The backend is webpacked with `node: { __dirname: false }`, so `__dirname`
   of bundled code is the runtime directory `<app>/lib/backend` (here `continuum-workbench/continuum-workbench/lib/backend`),
   not the source file's directory; a relative `path.resolve(__dirname, '..', …)` that is right for unbundled
   `lib/node/…` is wrong in the running backend. Evidence: `node_modules/@theia/application-manager/lib/generator/bundler-generator.js:486`,
   `continuum-workbench/continuum-workbench/lib/backend/main.js:2453`; current instance `KotlinServerLaunchSpec.ts:29`.
2. **`workbench.md` — `fwcd.kotlin` 0.2.36 internals.** `activationEvents` `onLanguage:kotlin`, `onDebugResolve:kotlin`,
   `main ./dist/extension`; `activate()` reads `kotlin.languageServer.enabled` / `kotlin.debugAdapter.enabled`, shows a
   first-run dialog unless `<globalStorage>/config.json` holds `{"initialized":true}`, finds Java through `kotlin.java.home`
   → `JAVA_HOME` → `PATH`, uses `kotlin.languageServer.path` when set (otherwise downloads the server from GitHub), runs
   `chmod +x` on the start script and calls `LanguageClient.start()`, which spawns the JVM at activation; `documentSelector`
   is `file`/`kls` (it only filters synchronised documents). Defaults: `languageServer.enabled` true, `indexing.enabled`
   true, `scripts.enabled` false, `debugAdapter.enabled` true, `languageServer.watchFiles` = `**/*.kt, **/*.kts, **/*.java,
   pom.xml, build.gradle, settings.gradle`. Evidence: the pinned vsix `package.json` and `dist/extension.js` (minified onto one line).
3. **`workbench.md` — language activation in Theia.** Any Monaco text model created with language id X — including the
   Script dialog's standalone `monaco.editor.create({ language: 'kotlin' })` — fires `requestRichLanguageFeatures` →
   `requestBasicLanguageFeatures` → `HostedPluginSupport.activateByLanguage` → `activateByEvent('onLanguage:X')`, by
   language id only (the URI scheme is irrelevant). So an installed extension that activates on `onLanguage:kotlin` is
   activated by the dialog (UNCONFIRMED at run time). Evidence: `@theia/monaco-editor-core/esm/vs/editor/common/model/textModel.js:276`,
   `.../services/languageService.js:96-106`, `@theia/plugin-ext/lib/hosted/browser/hosted-plugin.js:104-108, 315-318`.
4. **`workbench.md` — settings and plugin storage.** Theia's `settings.json` is JSONC; the config directory here is
   `~/.continuum` (`theia.backend.config.configurationFolder` in `continuum-workbench/package.json:76`), overridable with
   `THEIA_CONFIG_DIR`; a plugin's global storage is `<configDir>/globalStorage/<publisher.name>`
   (`@theia/plugin-ext/lib/plugin/plugin-manager.js:280`).
5. **`workbench.md` — Theia reconnect protocol.** `WebsocketFrontendConnectionService` keeps a frontend's channel after a
   socket drop and re-attaches it on `RECONNECT` with the same frontend id; `INITIAL_CONNECT` for a known id closes the
   old connection first. socket.io: `maxHttpBufferSize` 100 MB (`websocket-endpoint.js:28`), `checkAliveTimeout` 30 s.
6. **`workbench.md` — Kotlin language server 1.3.13.** The start script `exec`s java; the server exits on stdin EOF
   (`ExitingInputStream`); `resolveCompletionItem` is not implemented (`TODO("not implemented")`); jar
   `.kotlin-ls/server/lib/server-1.3.13.jar`; the heap does not drive RSS (`-Xmx384m` still 0.8 GB, `-Xmx256m` fails) —
   `spike-kotlin-ls.md:24`.
7. **`workbench.md` (or `architecture.md`) — workbench pod sizing.** The cluster manager's default pod is request 512Mi /
   limit 1Gi (`ResourceSpec.kt:15-18`, `WorkbenchInstanceEntity.kt:28-31`); `continuum-charts` sets none. One Kotlin
   dialog server alone measures 0.77-0.87 GB resident, which does not fit.
8. **`workbench.md` — packaging recipe.** `theia download:plugins` skips an existing target directory without verifying it,
   hence `scripts/install-pinned-plugins.js` runs first in `download:plugins` (`continuum-workbench/package.json:42`); the
   temurin digest pinned in the Dockerfile is an OCI index (amd64, arm64, ppc64le, s390x); `decompress` (4.2.1) is an
   undeclared transitive dependency of `@theia/cli`.
9. **`workbench.md` — code layout and testing.** `language-server-extension/src/node/LanguageServerMultiplexer.ts` is 326
   lines and `LanguageServerLifecycle.ts` 293 (`03-backend-dev.md` claims all below about 300);
   `src/node/TestDoubles.spec.ts` is the shared-helper convention; the cross-repo drift guard of `KotlinScriptPrelude.ts`
   runs only when `continuum-feature-base` is a sibling directory. Two development backends share the default private
   workspaces dir unless `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` differs.
10. **`dev-environment.md` — running the contract test.** `bash -ic 'sdk use java 21.0.11-tem && ./gradlew --offline
    :features:continuum-feature-analytics:test --tests "*KotlinScriptBindingsContractTest*"'` from `continuum-feature-base`
    works offline; it leaves an idle Gradle daemon plus Kotlin compile daemon (about 2 GB RSS) behind, which a reviewer
    should stop (`kill <pid>`) while testers share the machine.

## Round 2

Date 2026-11-28. Re-review after the developer's fix rounds 1 and 2 (`03-backend-dev.md` "Round 5" and "Round 6"), the
pod-memory change in `continuum-platform-core/continuum-cluster-manager` (`10-pod-memory-default.md`,
`RELEASE_NOTES_v0.0.23.md`) and the system tester's Round 2 (`05-backend-system-tests.md`: PASS; ST-11 is fixed by fix
round 2, its re-run is still in progress and I did not wait for it). Repos: `continuum-workbench` (uncommitted),
`continuum-feature-base` (unchanged since Round 1: its mtime is older than the Round 1 review, so I did not re-run its
contract test) and `continuum-platform-core` (branch `CONTNM-180`, 13 files modified, uncommitted).

**Verdict: APPROVED** — 0 BLOCKER, 0 MAJOR. BR-1, BR-2 and BR-3 are closed, and so are BR-4 and BR-5. Still open from
Round 1: 8 MINOR (BR-6..BR-13; BR-6 and BR-12 reduced) and 7 NIT (BR-14..BR-20). New in this round: 4 MINOR (BR-21..BR-24)
and 4 NIT (BR-25..BR-28). Nothing is a release blocker; BR-21, BR-22, BR-23, BR-12 and BR-11 are the ones I would fix
before merging because each is a few lines.

### Summary

The fix rounds did what they were asked to, and the new code is sound. I attacked the version translation, the health
monitor, the diagnostics nudge, the launcher/stdlib packaging and the seed script with scratch harnesses against the
compiled bridge (nothing in the repositories was touched) and found no defect in the new logic:

- The server never sees a client's document version any more; the version it sees is a per-document counter that only
  goes up, across duplicate opens, close/reopen, a connection leaving, a restart with replay and the nudge. I also read
  the server's own bytecode to make sure that is what it needs (see "Verified OK").
- The health monitor's restarts are bounded by the lifecycle's limits and its timers are all cleared; a server that never
  answers cannot cause a restart storm.
- The three Round 1 MAJOR findings are closed: the dev install directory (walk up to the download script), the pod memory
  (default and Small preset are now 2Gi/4Gi in the cluster manager) and the dialog no longer wakes the file-editor
  extension's JVM (the browser tester counted exactly one bridge JVM and no extension JVM with only a Script dialog open).

What is left is small: two data/validation edges (an unreadable `settings.json` is replaced by the seed; a partial
`resources` request with a small memory limit now fails in Kubernetes with a 500), a guard that throws on two hostile
message shapes instead of refusing them, one stale workbench release-note sentence about the pod memory, and the Round 1
MINOR items the developer did not touch.

### What I verified myself

| Check | Result |
|---|---|
| `yarn test` in `continuum-workbench/language-server-extension` | 215 pass, 0 fail, 0 skipped (Round 1: 179). The feature-base drift guard in `KotlinScriptPrelude.spec.ts` ran (the sibling repo is present); `GenericityGuard.spec.ts` passes with the new `src/node` classes |
| `npx tsc --noEmit -p tsconfig.json` in `language-server-extension` | exit 0 |
| `npx --no-install tsc --noEmit -p tsconfig.json` in `continuum-cluster-manager/frontend` | exit 0 (eslint not run) |
| `./gradlew --offline :continuum-cluster-manager:test --tests "*ResourceSpecTest*" --tests "*WorkbenchInstanceEntityTest*" --tests "*WorkbenchServiceTest*" --tests "*OpenApiSpecTest*"` (JDK 21.0.11) in `continuum-platform-core` | BUILD SUCCESSFUL: 5 + 6 + 74 + 8 tests; `OpenApiSpecTest` includes "the public spec equals the committed docs-api spec" |
| `javap -p -c` on `org.javacs.kt.SourceFiles` extracted from `.kotlin-ls/server/lib/server-1.3.13.jar` into `/tmp` (removed afterwards) | how the server treats document versions: see "Verified OK" |
| Scratch harnesses in `/tmp/br-scratch` that `require` the compiled `.test-out` modules (`LanguageServerLifecycle` + `LanguageServerMultiplexer` over the spec doubles `FakeClock`, `FakeProcessFactory`, …) | 35 hostile client messages, version sequences, restart/replay, health restarts, idle shutdown, 200 connect/open/close cycles, dispose: results in BR-23, BR-26 and "Verified OK" |
| Seed script run against throw-away `THEIA_CONFIG_DIR` directories (removed afterwards) | an unreadable `settings.json` is replaced (BR-21); a 0600 file becomes 0644 (BR-25) |
| `grep` over `continuum-platform-core`, `continuum-charts`, `continuum-local-setup`, `continuum-docs` for the old 512Mi/1Gi default | no remaining code path or document uses it as the workbench default |
| Gradle daemons | my Gradle run reused the daemon and Kotlin compile daemons that were already running before I started (PIDs 1593202, 1593723, 1763290); I started none and killed none |

Not done: no Theia build, no Docker, nothing on :3005, no browser. See "NOT VERIFIED".

### Round 1 findings — status

| ID | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| BR-1 | MAJOR | **RESOLVED** | `KotlinServerLaunchSpec.ts:40-49` `findDevelopmentDirectory` walks up from `__dirname` (used at `:56`) to the first folder that holds `scripts/download-kotlin-ls.sh` and returns its `.kotlin-ls`, else `<start>/.kotlin-ls`. `KotlinServerLaunchSpec.spec.ts:67-82` covers the bundled layout (`<app>/lib/backend`), the source layout and the fallback. The system tester started the dev workbench without `CONTINUUM_KOTLIN_LS_HOME` and the server came up |
| BR-2 | MAJOR | **RESOLVED** in substance | Default and Small preset are request 2Gi / limit 4Gi in the cluster manager (see "Cluster-manager review"); tests green. The workbench's own wording is still stale: tracked in BR-12 |
| BR-3 | MAJOR (UNCONFIRMED) | **RESOLVED** | `workflow-editor-extension/src/common/DialogEditorLanguage.ts:11` maps the schema's `kotlin` to `continuum-kotlin-script`; `CodeEditorRenderer.tsx:31` uses it; the id is registered with the Kotlin tokenizer and no file extension (`MonacoLanguageRegistration.ts:208, 295`), so the extension's `onLanguage:kotlin` is not triggered. Browser tester Round 2, Q3 PASS ×3: exactly one bridge JVM and no extension JVM with only a Script dialog open; "Activating Kotlin Language Server" appears 2× (real `.kt` files only) against 24× in Round 1. No `\|\| 'kotlin'` default remains in the frontend |
| BR-4 | MINOR | **RESOLVED** | `seed-kotlin-settings.js:74-152` `stripJsonc`, `removeTrailingCommas`, `parseSettings` (strict, then lenient; BOM stripped); a one-time backup `settings.json.continuum-backup` for JSONC input (`:197-202`); a file that does not parse even leniently is left untouched, exit 1 (`:189-195`). The system tester checked it on the image (ST-12 BOM) |
| BR-5 | MINOR | **RESOLVED** | `writeAtomically` (temp file + `renameSync`, `:177-181`); `mergeSettings` (`:154-166`) rewrites only `kotlin.languageServer.path` and `kotlin.java.home` on every run and the four `USER_OVERRIDABLE_KEYS` only while absent; the v0.0.16 note states this. Residue: BR-21, BR-25 |
| BR-6 | MINOR | **STILL OPEN** (reduced) | The client's version is no longer forwarded (`LanguageServerMultiplexer.ts:201-239, 303`, `DiagnosticsNudge.ts:34`). Still open: no cap on the text of a `didOpen`/`didChange` (scratch run: a 64 MB `didOpen` is forwarded unchanged; only 50 documents per connection are limited, `OpenDocuments.ts:24`), `stdin.write` back-pressure ignored (`LanguageServerProcess.ts:79`), and `Number(...)` of the client's version is recorded at `:210, :252` (can be `NaN`, never sent) |
| BR-7 | MINOR | **STILL OPEN** | `LanguageServerProcess.ts:57` still spreads the whole `process.env`; `:62` still logs server stderr at info |
| BR-8 | MINOR | **STILL OPEN** | `ProcFsMemoryReader` still reads one pid; the registration doc still says "process tree". Harmless today because the start script `exec`s java |
| BR-9 | MINOR | **STILL OPEN** (slightly worse) | `LanguageServerMultiplexer.ts` 404 lines (was 326), `LanguageServerLifecycle.ts` 305 (was 293); both past the ~300 signal, `03-backend-dev.md` still says all stay below it. Mitigation: the new behaviour went into collaborators (`DiagnosticsNudge`, `ServerHealthMonitor`, `OpenDocuments`), and the longest method is 31 lines (`fromClient`), so I keep it MINOR; the multiplexer still builds its collaborators itself and hand-wires them (`:74-96`). The next change to it should first extract the forwarded-request table and the initialize/capability handling |
| BR-10 | MINOR | **STILL OPEN** | client keys still share the private directory with the seed files (`LspServerInitializer.ts:28` `readiness-probe`, `ContinuumContext.kt`) |
| BR-11 | MINOR | **STILL OPEN** | `KotlinScriptBindingsContractTest.kt:56-61` ("flow variables are built from an execution context") still asserts `flow::class == ScriptFlowVariables::class` right after constructing it. The other three tests pin real contract values |
| BR-12 | MINOR | **STILL OPEN** (reduced) | Fixed: the README no longer needs `CONTINUUM_KOTLIN_LS_HOME` for development (BR-1), the seed semantics and the JSONC backup are in the note, the "second process" is stated only for real Kotlin files, the stdlib/launcher/no-runtime-download text matches the code. Open: `release_notes/RELEASE_NOTES_v0.0.16.md:137` still says "the default pod (request 512Mi, limit 1Gi) has only about 8 % headroom: raising the pod's memory limit is an open decision for the cluster manager's defaults", which the platform change makes false, and nothing tells the operator that **existing workbenches keep their stored 512Mi/1Gi** until they are updated (the platform note says "keeps its stored values" but does not connect it to Kotlin). Also: "an unreadable file is left untouched" (README, note `:138`) is not true for a permission error (BR-21). Wording drift: `Dockerfile:51-54` "the whole process stays near 1 GB" vs `KotlinServerLaunchSpec.ts:9` "near 0.8 GB resident" vs the note's 0.7-0.8 GB (the 1000 MB ceiling is what "1 GB" is) |
| BR-13 | MINOR | **STILL OPEN** | `scripts/install-pinned-plugins.js:51` still `require('decompress')`; no `package.json` declares it (hoisted 4.2.1 via `@theia/cli`) |
| BR-14 | NIT | **STILL OPEN** | `ClientMessageGuard.ts:9` still allows `completionItem/resolve` |
| BR-15 | NIT | **STILL OPEN** | `ServerRequestResponder.ts:29` unchanged |
| BR-16 | NIT | **STILL OPEN** | unchanged (`BridgeSettings.ts:31`, `PrivateWorkspace.ts:15-17`) |
| BR-17 | NIT | **STILL OPEN** (UNCONFIRMED) | unchanged (`LanguageServerHost.ts:86` `pathToFileURL`) |
| BR-18 | NIT | **STILL OPEN** | `LanguageServerLifecycle.ts` `releaseOne` unchanged: `unavailable` persists while any lease is open |
| BR-19 | NIT | **STILL OPEN** | `download-kotlin-ls.sh` still does `rm -rf` + `mv` (now for `server` and `m2`), `install-pinned-plugins.js` has no fetch retry, no `.dockerignore` |
| BR-20 | NIT | **STILL OPEN** | `AGENTS.md:7` still says "4 Yarn workspaces"; the root `package.json` lists six |

### New findings

#### BR-21 — MINOR — BE-5 — the seed script replaces a `settings.json` it cannot read, and loses the user's settings

- **Where:** `continuum-workbench/scripts/seed-kotlin-settings.js:168-174` (`readIfPresent`), `:183-207` (`seed`, whose
  own comment says it returns false when "settings.json was unreadable"); the claims it breaks: `README.md` ("an
  unreadable file is left untouched") and `release_notes/RELEASE_NOTES_v0.0.16.md:138` ("one that cannot be read at all
  is left untouched").
- **What is wrong:** `readIfPresent` catches every error (`EACCES`, `EIO`, …) and returns `undefined`, which `seed` reads as
  "there is no settings file yet". The merge then holds only the six seeded keys and `renameSync` replaces the file (a
  rename needs the directory's permission, not the file's). No backup is made because the backup is only written for
  JSONC input.
- **Confirmed by experiment** (throw-away `THEIA_CONFIG_DIR`, uid 1000, `settings.json` mode 000 holding
  `{"workbench.colorTheme":"Dark","my.setting":1}`): exit status 0, the file afterwards held only the six `kotlin.*` keys;
  both user keys were gone and nothing was reported.
- **Why it matters:** silent loss of a user's settings, against a documented promise. Likelihood is low: in the pod the
  container runs as uid 1000 (`deployment.ftl:23-26`), so it needs a file that uid cannot read (for example a 0600
  root-owned file left by a `kubectl exec --user 0` edit); in development any unreadable file will do.
- **Fix:** treat only `ENOENT` as absent (`if (error.code !== 'ENOENT') throw error`), let `seed` report the error and
  exit 1 without writing, and add a spec with an unreadable file (or a directory named `settings.json`).

#### BR-22 — MINOR (needs a user decision; UNCONFIRMED at run time, no cluster here) — platform — a partial `resources` request with a small memory limit now fails with 500

- **Where:** `continuum-platform-core/continuum-cluster-manager/src/main/kotlin/org/projectcontinuum/core/cluster/manager/service/WorkbenchInputValidator.kt:120-134`
  (`validateResources` checks each quantity's syntax only), `model/ResourceSpec.kt` (defaults), `service/WorkbenchService.kt:115-116`
  (create) and `:480-481` (update merge), `exception/GlobalExceptionHandler.kt:46-50` (`KubernetesClientException` → 500).
- **What is wrong:** `POST /api/v1/workbench` with `{"resources":{"memoryLimit":"1Gi"}}` now resolves to request 2Gi
  (default) and limit 1Gi. Before this change the default request was 512Mi, so the same call produced a valid pod.
  Nothing compares request with limit (I grepped every `memoryRequest`/`memoryLimit` use in `src/main`), so the
  Deployment reaches Kubernetes, which rejects a request above its limit (422); the handler turns that into HTTP 500
  "Kubernetes operation failed: …" and `createWorkbench` rolls the create back. The update path has the same gap
  (`request.resources?.memoryLimit ?: entity.memoryLimit`, validated only per quantity), which already existed.
- **Why it matters:** a client error is answered with a server error, and a call that worked yesterday fails today. The
  management UI always sends complete objects and I found no in-repo client that sends a partial one, so the reach is
  limited to external API users; the release note says the new default applies "when `resources` is omitted or partial"
  but not that this combination now fails. The system suite's partial-`resources` check
  (`continuum-system-tests/suites/api/cluster-manager.js:143-145`) sends only a bad quantity (400), so it stays green and
  does not cover this case.
- **Fix (user's choice, see "Decisions for the user"):** either validate request ≤ limit for CPU and memory in
  `validateResources` (Fabric8's `Quantity` is already used for the syntax check) and answer 400 through the existing
  `IllegalArgumentException` handler, with a test in `WorkbenchServiceTest` and one sentence in the Upgrade notes; or
  clamp a defaulted request to a given limit.

#### BR-23 — MINOR — BE-3 — two hostile client message shapes make the guard/multiplexer throw instead of refuse

- **Where:** `language-server-extension/src/node/LanguageServerMultiplexer.ts:245` (`last.range` after only a
  `last === undefined` check), `ClientMessageGuard.ts:54` (`String(child)`), call site `LanguageServerBridge.ts:45`
  (`channel.onMessage(provider => connection.receive(...))`, no `try`).
- **Confirmed** with the scratch harness on the compiled bridge (35 hostile messages: 33 refused cleanly, 2 threw out of
  `connection.receive`): `textDocument/didChange` with `contentChanges: [null]` → `TypeError: Cannot read properties of
  null (reading 'range')`; a document URI that is an object with a non-callable `toString`
  (`{"textDocument":{"uri":{"toString":"x"}}}`) → `TypeError: Cannot convert object to primitive value`.
- **Effect:** nothing is forwarded and no state has been changed when the error is thrown, and the backend survives,
  because Theia's `Emitter` catches listener errors and logs them (`@theia/core/lib/common/event.js:147-162`,
  `console.error`). But a request with an id gets no `-32602` reply, and every such message writes a stack trace to the
  backend log. The guard is the security boundary of the bridge; its contract is "refuse", so a throw is a hole in the
  contract even though no data flows.
- **Fix:** guard `last` with `typeof last !== 'object' || last === null`; describe the offending value with `typeof`
  or `JSON.stringify` (inside a try) instead of `String(child)`; wrap `connection.receive` in the bridge in a `try` that
  logs a warning without the payload and answers a request with `-32602`. Add both shapes to the guard and multiplexer specs.

#### BR-24 — MINOR — BE-3 / BE-6 — the documentation does not carry the new invariants and classes

- **Where:** `language-server-extension/README.md:47-54` (the table of pieces lists neither `ServerHealthMonitor.ts` nor
  `DiagnosticsNudge.ts`), `continuum-workbench/AGENTS.md:16` (the `language-server-extension` row).
- **What is wrong:** the rule that broke once (ST-11) is written only in code comments: the version a server sees for a
  document is generated by the bridge (`OpenDocument.serverVersion`, `nextServerVersion`) and must never be the client's,
  because a server ignores a change whose version it has already seen. The AGENTS.md row also does not say that the
  server needs the standard-library copy (`<install>/m2`, `MAVEN_REPOSITORY`, the launcher) although it says what installs
  the server. A future agent that adds another message path (for example a `didSave` or a second replay) has nothing to
  tell it to use `nextServerVersion`.
- **Fix:** two rows in the README table and one sentence each in the README and the AGENTS.md row (version rule; stdlib
  copy and launcher). Correct "workspaces" at the same time (BR-20).

#### BR-25 — NIT — BE-5 — more side effects of the seed's rewrite

- **Where:** `seed-kotlin-settings.js:177-181` (`writeAtomically`), `:57-70` (`kotlinSettings`, the `kotlin.java.home` value at `:60, 64`).
- **What is wrong:** (a) the temporary file is created with the default mode, so a 0600 `settings.json` becomes 0644
  (confirmed, umask 022); (b) a symlinked `settings.json` is replaced by a regular file (by reading; `renameSync` replaces
  the link; UNCONFIRMED by a run); (c) in development, with no bundled JRE and no `CONTINUUM_JAVA_HOME`, `kotlin.java.home`
  is rewritten to `''` at every `yarn start`, overriding a developer's own value; (d) the JSONC backup is made only once,
  so a second commented edit is not backed up.
- **Fix:** write the temporary file with the existing file's mode; resolve a symlink first; leave `kotlin.java.home`
  alone when there is no runtime to point at.

#### BR-26 — NIT — BE-2 — disposal is not terminal and the host does not dispose the multiplexer

- **Where:** `LanguageServerHost.ts:70-72` (`dispose()` calls only `lifecycle.dispose()`), `LanguageServerLifecycle.ts:135-138`.
- **What is wrong:** confirmed with the harness: after `dispose()` the crash/back-off paths do not respawn (good), but a
  new `connect()` → `acquire()` starts a server again; and the multiplexer's nudge/health timers are not cancelled (they are
  `unref`'d and harmless once the server is gone). In production this happens at backend shutdown, a window of milliseconds.
- **Fix:** a `disposed` flag in the lifecycle that makes `acquire()` throw or return an inert lease, and a
  `multiplexer.dispose()` called by the host.

#### BR-27 — NIT — BE-4 — a roundabout assertion

- **Where:** `LanguageServerMultiplexerHealth.spec.ts:132` — `assert.ok(seen.at(-1)! > 7 === false, 'the client number 7 is not forwarded as is')`.
- **What is wrong:** it asserts `seen <= 7`, not what the message says; the next line (`notEqual(seen.at(-1), 7)`) is the
  real check. Delete the first or assert the exact expected server version.

#### BR-28 — NIT (UNCONFIRMED) — BE-2 — out-of-memory detection by pattern over the whole error

- **Where:** `ServerHealthMonitor.ts:48` (`/OutOfMemoryError/.test(JSON.stringify(error))`).
- **What is wrong:** any error answer whose serialised text contains the word counts as an out-of-memory failure, even
  one that merely quotes a user's identifier; three in a row restart the server. Contrived, I did not build such a case.
  The pattern is also JVM-specific knowledge inside the generic core. Matching `error.message` only, or taking the
  pattern from the registration, would fix both.

### Cluster-manager review (`continuum-platform-core/continuum-cluster-manager`, 13 files, uncommitted)

| Area | Result | Evidence |
|---|---|---|
| Kotlin defaults | OK | `model/ResourceSpec.kt`: `memoryRequest = "2Gi"`, `memoryLimit = "4Gi"`, and the `@Schema` `defaultValue`/`example` say the same; `entity/WorkbenchInstanceEntity.kt:30, 32` |
| Which default applies to a real create | OK, the application-level one | `WorkbenchCreateRequest.resolvedResources()` is `resources ?: ResourceSpec()`; `WorkbenchService.createWorkbench` passes every column explicitly (`:115-116`, `:164`), so the SQL `DEFAULT 2Gi/4Gi` clauses in `src/main/resources/schema.sql` and `src/test/resources/schema-h2.sql` are never used by an insert, and `CREATE TABLE IF NOT EXISTS` never alters an existing table. Existing databases keep `512Mi/1Gi` as column defaults (harmless) and existing rows keep their values |
| Another code path with the old default | none found | the update path merges nullable request fields with the entity (`WorkbenchService.kt:480-481`); the FreeMarker templates have no defaults; the remaining `512Mi` hits are a quantity-syntax example in a description (`ResourceSpec.kt:7`, copied into `openapi.yaml:1109` and `ENDPOINT_INVENTORY.md:335`), the "raised from 512Mi/1Gi" notes (`ENDPOINT_INVENTORY.md:336`, the release notes), tests with explicit values (`WorkbenchInputValidatorTest.kt:18`, `OverlayServiceTest.kt:57, 130`, `WorkbenchInputValidationHttpTest.kt:48`) and complete `resources` objects with explicit values in the system tests (`continuum-system-tests/suites/api/cluster-manager.js:44-49, 180, 194`); `continuum-charts` sets no workbench-pod memory (its `512Mi` entries are platform service pods); `continuum-local-setup` and `continuum-docs` have none |
| OpenAPI and docs | OK | examples (`WORKBENCH_EXAMPLE`, the GPU example → 4Gi/8Gi) and `@Schema` defaults changed; the committed spec is regenerated (5 places) and `OpenApiSpecTest` "the public spec equals the committed docs-api spec" passes; `ENDPOINT_INVENTORY.md:335-336` updated |
| Tests | OK | `ResourceSpecTest`, `WorkbenchInstanceEntityTest` and `WorkbenchServiceTest` moved with the defaults: `createWorkbench with default request values uses defaults` (`:176-190`, asserts 2Gi/4Gi in the response) and `updateWorkbench rejects hostile values and leaves existing resources untouched` (`:1226-1246`, the Deployment and the stored row keep the default `4Gi` after the rejected updates); 93 tests green (5 + 6 + 74 + 8). No test compares request with limit (BR-22); the system test of a partial `resources` object (`cluster-manager.js:143-145`) only sends a bad quantity (400), so it stays green and does not cover the new case |
| Frontend | OK | `CreateWorkbenchModal.tsx:23-64` (`SIZE_PRESETS`) Small 2Gi/4Gi, Medium 4Gi/8Gi, Large 8Gi/16Gi, XL 16Gi/32Gi (CPU and storage unchanged); `MEMORY_OPTIONS` (`:68`) gained `32Gi`, so XL's limit exists in the Advanced dropdown; Small is pre-selected (`:141`) and on reset (`:218`); `types/api.ts:54-61` `DEFAULT_RESOURCES` 2Gi/4Gi (no other reference to it). `tsc --noEmit` exit 0; eslint and a render check NOT VERIFIED; the app has no frontend tests (pre-existing) |
| Release notes | true, with one gap | `RELEASE_NOTES_v0.0.23.md` (headed "0.0.23 (proposed)"; the newest platform tag is `release/0.0.22` and no tag contains the file's last commit, so it is the version being prepared) has a bullet under `### continuum-cluster-manager` and one under Upgrade notes. True against the code: the values, the preset ladder, "applies to `POST /api/v1/workbench` when `resources` is omitted or partial", "an existing workbench keeps its stored values until updated", "the Helm chart sets no workbench-pod memory", "custom values are not restricted". Gap: the consequence for a partial request (BR-22). An estimate is stated as a number: "up to about 2 GB when the file-editor extension's own server also runs" is arithmetic, not a measurement |
| Pod user | for BR-21 | `templates/deployment.ftl:23-26`: `runAsUser`/`runAsGroup`/`fsGroup` 1000 |

The user asked for a floor only on the default and the Small preset; Advanced sliders and the API still accept lower
memory, as intended. The other three presets were moved up as well (see "Decisions for the user").

### Decisions for the user

1. **The other size presets.** The floor was asked for the default and for "Small". The developer also multiplied the
   other presets by four so the ladder still increases: Medium 1Gi/2Gi → 4Gi/8Gi, Large 2Gi/4Gi → 8Gi/16Gi, XL
   4Gi/8Gi → 16Gi/32Gi (request/limit). It is stated in the release notes. Options: keep it (an XL workbench then needs a
   node with 16Gi free); keep the old Medium/Large/XL numbers (then Medium's 1Gi request is below Small's 2Gi, so the
   ladder is no longer in order); or a smaller shift.
2. **Partial `resources` with a small limit (BR-22).** `{"resources":{"memoryLimit":"1Gi"}}` used to work and now ends
   in a 500 from Kubernetes. Options: reject request > limit with a 400 (my recommendation, it also fixes the update
   path), or let a defaulted request follow a smaller limit.
3. **Existing workbenches.** They keep their stored 512Mi/1Gi until someone updates them. With one Script dialog open the
   whole pod peaked at 0.94 GB in the system tester's 1 GiB-container runs (about 8 % under the limit, not killed), so an
   old workbench is at the edge, and a `.kt` file open at the same time would add a second server. Options: only say so
   in the workbench release note (BR-12) and in the platform Upgrade notes; or also give the management UI a way to raise
   the memory of existing workbenches (the API already has `PUT /api/v1/workbench/{name}` with `resources`, and the
   frontend's `api/workbench.ts` and `hooks/useWorkbenches.ts` wrap it, but no screen calls it).

### Verified OK (new code since Round 1)

**Document versions** (the focus of this round)
- Every message that hands the server a document's text carries a bridge-made number: the first `didOpen` and each
  `didChange` through `withServerVersion` (`LanguageServerMultiplexer.ts:201-239`), the replay on `ready` (`:303`) and the
  nudge (`DiagnosticsNudge.ts:34`). `nextServerVersion` (`OpenDocuments.ts:18-21`) increments before it returns. A
  `didClose` has no version. The client's number is only recorded (`:210`, `:252`) and never sent. The
  `document === undefined` branch of `withServerVersion` (which would pass the client's params through) is unreachable:
  `isAcceptable` demands ownership for everything but `didOpen`, and a `didOpen` records before it sends.
- Scratch runs on the compiled bridge with a fake server: client versions 5, 3, 3, 9 and `NaN` → the server saw
  1, 2, 3, 4, 5; close and reopen of one URI by one connection restarts at 1 after the `didClose`; a connection that
  leaves (its documents are closed) and another that opens the same URI → open:1, change:2, close, open:1; a duplicate
  `didOpen` and the 51st document of a connection are refused; after a restart the replayed text carries a number above
  anything the previous server saw; the nudge and the user's next edit keep increasing. The specs assert this too
  (`LanguageServerMultiplexerHealth.spec.ts:84-135`).
- The server side, from its bytecode (`javap -p -c` on `org.javacs.kt.SourceFiles` in `server-1.3.13.jar`):
  `open(uri, content, version)` stores the new version unconditionally; `edit(uri, newVersion, changes)` ignores a change
  whose version is ≤ the stored one ("Ignored {} version {}") and throws for a uri it never stored (`Intrinsics.checkNotNull`
  on the stored document); `close(uri)` forgets the document, or re-reads the file from disk with version −1 when one
  exists. So a reopen at 1 always applies, a restarted JVM has nothing stored, and the bridge's counter can never be
  ignored. This settles the "~95 %" I carried from Round 1's reading of the spike.

**Diagnostics nudge:** one timer, re-armed at every `ready` and cancelled when the server leaves `ready`; it reads the
open documents when it fires (a document closed meanwhile is not sent, one opened after `ready` is); it sends the
latest recorded text, so it cannot overwrite a newer edit; the user's next edit gets a number above the nudge's.

**Health monitor:** it counts only a request with no answer within 30 s and an error answer that mentions
`OutOfMemoryError`; any other answer resets the count and `-32800` (cancelled) is ignored. Three in a row call
`lifecycle.restartUnhealthy` (gated on `ready`), which kills the server (SIGTERM, SIGKILL after 3 s), counts a failure
and restarts with back-off 1/2/4 s (cap 30 s) up to `maxRestarts` 3, then `unavailable`. A server that never answers its
readiness probe never becomes `ready`, so it earns no "stable" credit and is restarted at most 3 times. A server that
answers the probe but hangs on user requests can be restarted once per at least 60 s of ready time (the failure count is
cleared after `stableAfterMs` 60 s), bounded by the user's activity and the idle stop: not a storm. Timers are cleared on
answer, abandon, reset and fire; a late answer after a timeout is ignored; `SystemClock` timers are `unref()`'d.
Scratch runs: three unanswered requests → every client request answered `-32803`, the server killed and restarted; the
idle stop leaves 0 timers; 200 connect/open/close cycles leave one server and a constant timer count; a crash during
back-off followed by `dispose()` does not respawn.

**Launcher, standard library, Dockerfile**
- `scripts/kotlin-language-server-launcher.sh`: `set -euo pipefail`, quoted, finds its install from its own location,
  exports `MAVEN_REPOSITORY=<install>/m2`, then `exec`s the server (no extra process; signals and stdin EOF reach the JVM).
- `scripts/download-kotlin-ls.sh`: the checksum is compared before `unzip` and fails closed; the early exit needs the
  marker, a stdlib jar, the executable launcher, the exact `VERSION SHA256` inside the marker and the server script; the
  marker is written last; it fails when the archive ships no `kotlin-stdlib-<digits>` jar; `server` and `m2` are removed
  before the move (`:64-65`). Nothing is downloaded at run time: `language-server-extension/src` holds no `curl`, `wget` or
  URL outside the specs (grep), and the one `curl` is `scripts/download-kotlin-ls.sh:42`, run at image build.
- Dockerfile: four jlink modules added, `RUN java -version` smoke test, `ENV MAVEN_REPOSITORY`, `CONTINUUM_KOTLIN_LS_HOME`,
  `CONTINUUM_JAVA_HOME`; the download script and the launcher are copied together and removed after the run. The system
  tester measured +6,243,080 bytes (+0.13 %) for the change and 152 MB for `/opt/continuum/kotlin-ls`, consistent with
  the note's "about 150 MB".
- The seed points `kotlin.languageServer.path` at the launcher (`seed-kotlin-settings.js:42, 63`); the extension's
  `chmod +x` of that script is fire-and-forget, so a root-owned launcher cannot break activation; the backend's own server
  receives `MAVEN_REPOSITORY` through its launch environment. Both routes find the standard library (system tester: 75
  completion items, 1 without it).

**Install directory, seed script, `yarn start`, capabilities**
- Development install directory: `findDevelopmentDirectory` (`KotlinServerLaunchSpec.ts:40-49`) walks up from the compiled
  file's directory to the first folder that holds `scripts/download-kotlin-ls.sh` and uses its `.kotlin-ls` (a folder next
  to the start directory when there is none). The specs drive the two real layouts, the bundled backend's
  `continuum-workbench/lib/backend` and this workspace's compiled `lib/node/kotlin`, against the actual repository
  (`KotlinServerLaunchSpec.spec.ts:67-82`), and the image sets `CONTINUUM_KOTLIN_LS_HOME` (`Dockerfile:60`). The seed
  script resolves its own development directory as `<workbench>/.kotlin-ls` (`seed-kotlin-settings.js:216`) and prefers
  `CONTINUUM_KOTLIN_LS_HOME`, then the image path when its server script exists (`:49-55`).
- Seed script: reads leniently (a UTF-8 byte-order mark is stripped, `:132`; comments and trailing commas are removed
  outside strings, `stripJsonc` `:74`, `removeTrailingCommas` `:102`); a file that is not an object even then → message,
  exit 1, nothing written (`:189-195`). The two path keys follow the install on every run, the four others only when the
  user has not set them (`USER_OVERRIDABLE_KEYS` `:44`, `mergeSettings` `:154-166`). Writes go through a temporary file
  and a rename in the same directory (`:177-181`); the original is kept once as `settings.json.continuum-backup` when
  comments had to go (`:197-201`). The first-run marker `globalStorage/fwcd.kotlin/config.json` = `{"initialized":true}`
  is all the extension itself ever stores there (its bundled `extension.js` reads `initialized` and only calls
  `updateConfig({initialized:true})`), so rewriting it loses nothing. The system tester verified JSONC, BOM, the backup,
  a repeat run that changes nothing and leaves no temporary file, and the unparsable-file path on the image. Findings:
  BR-21, BR-25.
- `continuum-workbench/package.json:49` (`start`): `(node ../scripts/seed-kotlin-settings.js || true) && theia start …`, so a
  seed failure cannot stop the start; `entrypoint.sh:19` tolerates a failure too (`|| echo … >&2` under `set -eu`).
- `initialize` sent to clients lists only what the guard lets through (`ADVERTISED_CAPABILITIES`,
  `LanguageServerMultiplexer.ts:16-26`, applied at `:363`: completion, hover, signatureHelp, definition, typeDefinition,
  references, documentHighlight, documentSymbol, positionEncoding) and `textDocumentSync: { openClose: true, change: 1 }`.
  The server declares incremental sync, but the bridge refuses ranged changes and a range-less change replaces the
  whole document under any sync kind, so the two do not conflict.

**Genericity and security of the new code:** `src/common/GenericityGuard.spec.ts` passes with the new `src/node` classes (the only
JVM-specific item in generic code is the pattern in BR-28); no new input reaches a command line; the seed script writes
only inside the configuration directory.

### NOT VERIFIED

- A Docker build or run, a Theia build, anything in a browser, and anything on :3005 (testers are using them).
- Kubernetes' rejection of a request above its limit (BR-22): the rule is standard and no code compares the two, but I
  had no cluster.
- Fix round 2 against a real server: the system tester's round-3 re-run was not awaited. My evidence is the scratch
  harness plus the server's bytecode.
- The two-server pod memory (the file-editor extension's server next to the dialog's): the 1.7-2.05 GB figure is the
  system tester's estimate, the release note's "about 2 GB" is arithmetic; neither was measured.
- `yarn install --frozen-lockfile` (every `language-server-extension` dependency pattern is present in `yarn.lock`,
  including `react@^18`, so it should pass); eslint for the cluster-manager frontend; a symlinked `settings.json`
  (BR-25(b), by reading only).

### Verdict

**APPROVED.** No BLOCKER, no MAJOR. BR-1, BR-2, BR-3, BR-4 and BR-5 are closed. Open: 12 MINOR (BR-6..BR-13, BR-21..BR-24)
and 11 NIT (BR-14..BR-20, BR-25..BR-28). Cheap and worth doing before the merge: BR-21 (3 lines and a spec), BR-23
(guard `null`, `try` around `receive`), BR-12 (the stale pod-memory sentence and the existing-workbenches note), BR-11
(delete or strengthen one test), BR-22 once the user has chosen. The rest can be tracked.

### Knowledge updates (Round 2)

For `.claude/knowledge/` (verified in code or by command this session):

1. **`workbench.md` ("Testing the bridge from outside") and graph node `diagnostics-nudge-version-collision` — how fwcd 1.3.13
   treats document versions (bytecode).** `SourceFiles.open(uri, content, version)`
   stores a new `SourceVersion` without comparing; `edit(uri, newVersion, changes)` logs "Ignored {} version {}" and
   returns when `newVersion <= stored.version`, and calls `Intrinsics.checkNotNull` on the stored document, so a change for
   a uri that was never opened throws; `close(uri)` forgets the document, or re-reads the file from disk with version −1
   when one exists (`readFromDisk`). Hence the bridge rule: every message that
   carries text uses `nextServerVersion(document)` (`OpenDocuments.ts:18-21`; `LanguageServerMultiplexer.ts:201-239, 303`;
   `DiagnosticsNudge.ts:34`); the client's version is only recorded. The node's "fix options" text is obsolete: the chosen
   fix is the per-document `OpenDocument.serverVersion`. Recipe: `unzip -q -o
   .kotlin-ls/server/lib/server-1.3.13.jar 'org/javacs/kt/SourceFiles*' -d /tmp/x && javap -p -c -classpath /tmp/x
   org.javacs.kt.SourceFiles`.
2. **`workbench.md` and node `lsp-backend-bridge` — Theia swallows listener exceptions.** `@theia/core/lib/common/event.js:147-162` (`CallbackList.invoke`)
   catches a listener's error and calls `console.error`; a throw inside the bridge's channel `onMessage` handler therefore
   drops one message and logs a stack trace, without crashing the backend or answering the client. Two shapes still make
   the guard/multiplexer throw: `didChange` with `contentChanges: [null]` (`LanguageServerMultiplexer.ts:245`) and an
   object-valued `uri` with a non-callable `toString` (`ClientMessageGuard.ts:54`) — fix pending.
3. **`workbench.md:62` (the "Seeding" bullet) and node `kotlin-settings-seed` — limit of the "untouched" guarantee.** "An
   unparsable file: exit 1, the file untouched" holds only for a file that does not parse, even leniently. A file the process
   cannot read (`EACCES`, …) is treated as absent: `readIfPresent` swallows every error (`seed-kotlin-settings.js:168-174`),
   the six seeded keys replace the file and no backup is made (confirmed with a mode-000 file; BR-21, fix pending), although
   the README and the v0.0.16 release note say an unreadable file is left untouched. The rewrite also widens a 0600 file to
   the default mode, and a development run rewrites `kotlin.java.home` to `''` when no runtime is bundled (BR-25). The
   `globalStorage/fwcd.kotlin/config.json` marker is exactly what the extension stores (its `extension.js` reads
   `initialized` and only calls `updateConfig({initialized:true})`).
4. **`workbench.md` and node `kotlin-ls-packaging` — packaging pitfall.** `scripts/install-pinned-plugins.js:51` requires
   `decompress` without declaring it (4.2.1, hoisted from `@theia/cli`; its `index.js:20-50` refuses a directory outside the
   output path and a write through a symlink — read, not exercised against a hostile archive);
   `theia download:plugins` does not verify anything and skips a plugin that is already installed (the installer's header,
   `install-pinned-plugins.js:3-7`), which is why the pinned installer runs first (`continuum-workbench/package.json:42`).
5. **`workbench.md` and node `lsp-backend-bridge` — bridge health bounds.** `DEFAULT_HEALTH_CONFIG`
   (`ServerHealthMonitor.ts:3`): 3 failed requests (no answer in 30 s, or an error
   mentioning `OutOfMemoryError`) → `restartUnhealthy`; the lifecycle allows `maxRestarts` 3 with back-off 1/2/4 s (cap 30 s)
   and clears the count after 60 s of `ready`. A server that never answers its readiness probe is restarted at most 3
   times; one that answers it but hangs on user requests can restart once per at least 60 s of ready time. Class sizes:
   `LanguageServerMultiplexer.ts` 404 lines (Round 1 item 9 said 326), `LanguageServerLifecycle.ts` 305; the extension README's
   table of pieces does not list `ServerHealthMonitor.ts` and `DiagnosticsNudge.ts`.
6. **`architecture.md:28` (the `continuum-cluster-manager` row) and a new graph node `cluster-manager-resource-defaults` (edges
   to `platform-core` and `kotlin-ls-packaging`; the graph has no cluster-manager node) — workbench pod resources.** The default
   is request 2Gi / limit 4Gi in
   `continuum-cluster-manager/.../model/ResourceSpec.kt` and `entity/WorkbenchInstanceEntity.kt:30, 32`. It is an
   application-level default: `WorkbenchCreateRequest.resolvedResources()` is `resources ?: ResourceSpec()` and
   `WorkbenchService.createWorkbench` supplies every column, so the `schema.sql`/`schema-h2.sql` column `DEFAULT`s are
   cosmetic and `CREATE TABLE IF NOT EXISTS` never alters an existing table; existing rows keep their values. UI presets
   (`frontend/src/components/CreateWorkbenchModal.tsx`, `SIZE_PRESETS`): Small 2Gi/4Gi, Medium 4Gi/8Gi, Large 8Gi/16Gi, XL
   16Gi/32Gi, Small pre-selected (`:141`, `:218`), `MEMORY_OPTIONS` up to 32Gi. `WorkbenchInputValidator.validateResources`
   (`:120-134`) checks quantity syntax only, so a partial `resources` whose limit is below the 2Gi default request reaches
   Kubernetes and comes back as HTTP 500 (`GlobalExceptionHandler.kt:46-50`; UNCONFIRMED at run time). Workbench pods run as
   uid/gid/fsGroup 1000 (`templates/deployment.ftl:23-26`). **Round 1 item 7 of this file ("default pod is 512Mi/1Gi") is
   outdated.**
7. **`dev-environment.md` — two recipes.** (a) Driving the bridge without Theia: after `yarn test` in
   `language-server-extension`, `require()` the compiled `.test-out/node/TestDoubles.spec.js` (exports `FakeClock`,
   `FakeProcessFactory`, `ManualInitializer`, `FixedMemoryReader`, `RecordingLog`, `makeRegistration`) from a scratch script
   outside the repository to script `LanguageServerLifecycle` + `LanguageServerMultiplexer` through restarts, timeouts and
   hostile messages. (b) `./gradlew --offline` reuses a Gradle daemon that is already running (it may belong to a tester):
   look at `ps` start times and stop only the PIDs you started.
8. **`change-log.md`.** "CONTNM-180 backend review round 2: APPROVED; BR-1..BR-5 closed; 12 MINOR and 11 NIT open (new:
   BR-21 seed replaces an unreadable settings.json, BR-22 request above limit for a partial `resources`, BR-23 hostile
   message shapes throw, BR-24 docs)."
