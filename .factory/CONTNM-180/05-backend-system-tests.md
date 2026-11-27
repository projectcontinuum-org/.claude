# Backend system tests: CONTNM-180 — Kotlin language-server support (bridge, packaging, production image)

Role: backend system tester. Black-box, over the wire (a Socket.IO + Theia channel client written for the suite) and
through the docker CLI. No production code was changed. Inputs: `02-plan.md` (the `[system-api]` ACs), `03-backend-dev.md`
rounds 1-4, `07-backend-review.md`, `spike-kotlin-ls.md`, `continuum-workbench/AGENTS.md`, `language-server-extension/README.md`.

## Round 1

Date 2026-11-27.

**Verdict: FAIL for the production image, PASS for the bridge itself.** The bridge's security, document isolation,
lifecycle, protocol and memory-ceiling behaviour hold on the dev bundle and in the image (offline, uid 1000). One BLOCKER:
in the production image the language server cannot find the Kotlin standard library, so the documented clean script
shows five false errors and completion lists are truncated (ST-1). The dev bundle passes only because the developer's
`~/.gradle` cache happens to contain the library. Two MAJOR runtime findings the unit tests could not see: the first
dialog after a cold server start gets no diagnostics until the user types (ST-2), and a few open scripts exhaust the
512 MB heap without anything restarting the server (ST-3). The measured memory also needs a decision (ST-4).

Counts: dev bundle 48 passed / 2 failed / 3 skipped (53 checks); production image as shipped, offline, uid 1000: 47 passed /
5 failed / 1 skipped (53 checks) plus 1 passed in the root pass; the same image with the Kotlin library made discoverable
(experiment): 50 / 2 / 1 plus 1. The only failures left in that last run are the two ST-2 checks.

### Environment

| Item | Value |
|---|---|
| Dev target | my own workbench instance on `:3006` (the frontend tester's `:3005` was not touched): `bash -ic 'sdk use java 21.0.11-tem && cd continuum-workbench/continuum-workbench && ./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3006'` with `THEIA_CONFIG_DIR` and `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` in fresh temp dirs, `CONTINUUM_LANGUAGE_SERVER_IDLE_TIMEOUT_SECONDS=15`, `CONTINUUM_KOTLIN_LS_HOME=<repo>/continuum-workbench/.kotlin-ls` (needed, see ST-6). Bundle built 21:24 and not rebuilt; `lib/`, `src-gen/`, `plugins/` untouched. Server: fwcd kotlin-language-server 1.3.13 on the host JDK 21.0.11-tem. No platform stack. |
| Production image | `kotlin-lsp-systest-workbench:r1`, id `e86b650d66b5`, built by me from `continuum-workbench/Dockerfile` of the working tree with a clean staged context (no `node_modules`, `lib/`, `src-gen/`, `plugins/` from the checkout). `docker build` exited 0 (Kotlin server download + checksum step 27 s; the fwcd extension's pinned download "checksum verified"). Size 4,788,550,192 bytes = 4567 MiB (4.79 GB); the released `projectcontinuum/continuum-workbench:0.0.16` is 4930 MiB (5.17 GB) — not a like-for-like delta (different build); the meaningful delta is `/opt/continuum/kotlin-ls` = 149 MB (JRE 60 MB, of which `lib/modules` 26 MB; server 90 MB). |
| How the image was run | `docker run --network none --user 1000:1000` (the cluster manager runs the pod as uid 1000), the suite copied in and run inside the container as uid 1000 (a container's root has no `CAP_SYS_PTRACE` and cannot read the backend's `/proc/<pid>/fd`), plus a short root pass for `/app` (root-owned). Pod-like runs: `--memory 1g --memory-swap 1g`. Memory from the container's cgroup files. |
| Host | Linux, 16 cores, 59 GB, Docker 29.10.0, Node 24 (nvm), JDK 21.0.11-tem. Because the host has 59 GB, an unlimited container makes the JVM size its initial heap at its `-Xmx` (higher RSS); a 1 GiB container shows the realistic pod numbers. Both are reported. |
| Not needed / not run | k6 (plain Node client), the platform stack (the bridge is workbench-only), the browser (frontend tester). |

### AC coverage

Check names are those printed by the suites (`suites/api/kotlin-lsp-bridge.mjs`, group in brackets; `suites/api/kotlin-lsp-image.mjs` for the image). A full list is in Appendix A.

| AC | Check(s) | File | Result |
|---|---|---|---|
| AC-5 clean script has no diagnostics (server side) | [diagnostics] "the documented clean script (row["a"]?.toString() + flow.get("x")) is analysed and publishes no diagnostics at all"; "a type error is published at the user's line and column (the hidden header does not shift it)"; "an error below leading imports is reported at the user's line"; "fixing the error clears the markers"; completion (`flow.`, `row.`, `"abc".le`), hover and signature-help checks | bridge | **Dev bundle: PASS (10/10).** **Production image as shipped: FAIL (5 of 10, ST-1)**: the clean script gets 10 diagnostics, 5 on the user's lines (`MISSING_BUILT_IN_DECLARATION`). **Image + stdlib made discoverable: PASS (10/10).** Caveat ST-2. |
| AC-13 works with no outbound network | image driver `asis`: container with network mode `none` (only `lo`), precondition check "this environment has no outbound network (a connect to 1.1.1.1:443 fails)", the whole bridge suite with `--offline`; `seed`: the container starts offline and the backend answers in 0.6 s | image + bridge | **FAIL as shipped, only through ST-1** (the 5 diagnostics checks). Every other group passes offline: lifecycle 11/11, handshake 3/3, documents 7/7, security 12/12, leak 2/2, memory 3/3, protocol 3/3. With the stdlib made discoverable the run is clean except the two ST-2 checks. The dev bundle was not run network-blocked (the plan only asks for that when the image build is infeasible; it was feasible). |
| AC-14 RSS within the documented cap; started with `-Xmx` | [memory] "the server process is started with -Xmx512m (and the other JVM limits)"; "one editor (a 30-line script, 100 edits, 10 completions): resident memory stays below the 1000 MB restart ceiling, no restart, every answer served"; "5 editors at once…"; image `pod-limit` (1 GiB container) and `exhaustion` runs | bridge + image | **PASS for the AC as written**: argv carries `-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m`; RSS stayed under the 1000 MB ceiling in every run (dev: 867 MB 2 s after cold start, peak 907 MB with 1 editor, 909 MB with 5 = 9 % below; image with the stdlib reachable, unlimited container: peak 877 MB = 12 % below; image in a 1 GiB container: 795-797 MB = 20 % below; as shipped, where the analysis is broken, 689-696 MB); the process was never restarted. Findings: ST-3 (the ceiling is unreachable, so it cannot protect), ST-4 (pod memory). |
| AC-15 (runtime side) | [security] "a connection for an unknown or malformed language id is refused (channel closed by the server, nothing delivered)" (7 ids) | bridge | **PASS** for what is visible from outside: only `kotlin-script` is registered. The dummy second language (zero edits to generic code) is a unit-level check and cannot be shown over the wire without a test-only registration: **NOT VERIFIED** as a system check. |
| AC-16 bridge security | [handshake] no cookie → HTTP 400, foreign Origin → HTTP 400; [security] 12 checks (19 spellings of `file:`/malformed URIs refused with -32602, nested `uri`/`*Uri` keys refused, 10 out-of-set methods refused, hostile `didOpen` produces no analysis, `initialize` cannot widen roots, wrong language id / unopened document refused, malformed JSON-RPC ignored, `shutdown`/`exit` do not stop the shared server, server cwd is the private directory holding only seeded declarations); [documents] 7 checks (owner can read; another connection cannot open or read; diagnostics never cross connections; close and vanished client release a document; full-text sync only; 50 documents per connection); [leak] a Kotlin file planted in the Theia workspace folder and in `/app` is invisible; [protocol] 3 checks (only state notices, diagnostics and responses reach a client; no server file paths; no server request ever reaches a client) | bridge | **PASS** (dev and image, offline). Every isolation check is paired with an owner-can-read check. |
| AC-17 one lazy shared server, idle stop | [lifecycle] "no server process before the first editor connects"; "one server for several editors that connect at the same instant (started lazily, reported starting then ready)"; "a later editor reuses the running server"; "closing editors keeps the server for the editors that remain"; "the server is not stopped the moment the last editor closes"; "a reconnect inside the idle window reuses the server"; "a vanished client … lets the server stop after the 15 s idle timeout, not before"; "the next connection after an idle stop starts a new server (lazily)"; "an orderly close lets the server stop after the idle timeout"; image `default-idle` | bridge + image | **PASS.** 0 processes before the first editor; 1 process for any number of editors (ready 1.2-1.4 s cold); the same pid on reconnect; idle stop at 15.3-15.5 s with a 15 s timeout and at **600.5 s with the production default** (still running at 300 s); a fresh pid on the next connection. The 2 lifecycle checks that fail (below) are about diagnostics after a (re)start, not about processes: ST-2. |
| AC-20 production image | image driver `image`: "the image starts like projectcontinuum/continuum-workbench:0.0.16: same entrypoint, command, working directory, user and ports"; "the entrypoint script differs … only by seeding the Kotlin extension settings" (0 lines removed, 3 added: a comment, the seeding command, a blank line); "the image bundles Java 21" (21.0.13.1, Temurin-21.0.13.1+2 LTS); "the Java runtime is reduced (jlink)…" (15 modules, no `javac`, no other Java on PATH); "sizes (measurement)"; "the pinned Kotlin language server is installed" (marker `1.3.13 4fe7d71d087b…` equals the pin in `scripts/download-kotlin-ls.sh`); "the server's own start script runs on the bundled runtime"; "the VS Code Kotlin extension is bundled" (fwcd.kotlin 0.2.36, vscode.git, vscode.git-base); `download`: a tampered archive is rejected ("checksum mismatch", exit 1, nothing installed), an unreachable download installs nothing (curl exit 37); `seed` ×5 | image | **PASS** for JRE 21, the pinned server, the checksum guard, no runtime download (the offline run and the seeded `initialized` marker), entrypoint/command unchanged apart from the seeding, and the seeded settings landing in `/home/continuum/.continuum`, the folder the app reads (Theia logs `Configuration directory URI: 'file:///home/continuum/.continuum'`). **NOT VERIFIED: server `--version`** — the pinned server (1.3.13) has no such option (JCommander: `Was passed main parameter '--version'`, which proves the bundled runtime runs the server class); the version is evidenced by the marker, the jar name and `serverInfo` in `initialize`. "Everything bundled" is not true for the stdlib (ST-1) and the runtime is missing modules (ST-5). |

### Results by run

| Run | Target and setup | Result |
|---|---|---|
| Dev full | `:3006`, all default groups, `BACKEND_PID`, `IDLE_TIMEOUT_SECONDS=15`, `LEAK_PROBE_DIR` = backend cwd | 48 passed, 2 failed (the two ST-2 lifecycle checks), 3 skipped (offline not requested; packaging needs `EXPECT_LS_HOME`; exhaustion is opt-in) |
| Dev exhaustion | `ONLY=exhaustion` | the 10th open script gets no answer within 45 s; the server is not replaced (same pid 45 s later, RSS 916 MB); recovers when the scripts are closed (129 ms) → 2 passed, 1 failed (ST-3) |
| Image as shipped | `--network none`, uid 1000, 15 s idle | 47 passed, 5 failed (all in `diagnostics`, ST-1), 1 skipped; root pass `/app` leak probe 1 passed. Whole container peak 833 MB, not OOM-killed |
| Image + stdlib (experiment) | the jar the server already ships copied into `<install>/m2/org/jetbrains/kotlin/kotlin-stdlib/<ver>/` and `MAVEN_REPOSITORY` pointing at it (a diagnostic aid, not a product change) | 50 passed, 2 failed (ST-2), 1 skipped; diagnostics 10/10 → ST-1 confirmed fixed by it, nothing else changes. Container peak 1013 MB (unlimited) |
| Image static groups | `image`, `download`, `seed` | all passed; 1 SKIP (`--version`, NOT VERIFIED) |
| Image default idle | production default timeout, `IDLE_CHECKS=vanished`, 611 s | 10 passed, 0 failed, 1 skipped; stopped at 600.5 s; container peak 758 MB |
| Image exhaustion (unlimited container) | stdlib reachable | the 14th open script fails (`-32603`, `OutOfMemoryError: Java heap space`, after 12-20 s; RSS 845-879 MB); not replaced; recovers after close (49-296 ms); container peak 1013-1067 MB, not OOM-killed → 2 passed, 1 failed (ST-3) |
| Image in a 1 GiB container | stdlib reachable: diagnostics + memory, then exhaustion | 13/13 passed (LS peak 676-797 MB across two runs, container sampled peak 819-940 MB); exhaustion: the 14th script fails after ~12 s, not replaced, recovers (93 ms), container peak 933 MB, not OOM-killed |

### Failures and findings

Severity scale as in `07-backend-review.md` (BLOCKER / MAJOR / MINOR / NIT). ST-n are this report's ids; the BE task is the one the fix belongs to.

#### ST-1 — BLOCKER — BE-5 — the production image has no Kotlin standard library the server can find
- **Checks failing:** image `asis` → bridge [diagnostics] ×5 (type error, error below imports, clean script, fixing clears markers, stdlib resolves). Two more diagnostics checks pass but show degraded results: `flow.` offers 7 items (18 with the library), `row.` 14 (75), `"abc".le` 1 (75).
- **Request:** `didOpen continuum-script:/<key>.kt` with the documented script `row["a"]?.toString() + flow.get("x")` after `ready`, wait for `publishDiagnostics`.
- **Expected / actual:** no diagnostics at all / 10 diagnostics, 5 on the user's lines, `MISSING_BUILT_IN_DECLARATION` ("Cannot access built-in declaration …"). The user sees red errors on a valid script, and fixing a real error never leaves a clean list.
- **Cause (decompiled and confirmed by experiment):** fwcd 1.3.13 finds the stdlib only through `kotlinc` on the PATH, a Maven repository (`MAVEN_REPOSITORY`, else `MAVEN_HOME/repository`, `M2_HOME/repository`, `~/.m2/repository`; layout `org/jetbrains/kotlin/kotlin-stdlib/<ver>/kotlin-stdlib-<ver>.jar`), the Gradle cache (`GRADLE_USER_HOME` or `~/.gradle`), or `/snap/kotlin/current/lib/kotlin-stdlib.jar`. The image has none of them. The dev bundle passes only because the developer's `~/.gradle` has the library — which is also why the unit tests and a dev-bundle UI run cannot see it.
- **Fix, verified by experiment (diagnostics 10/10, nothing else changes):** copy the jar the server already ships (`server/lib/kotlin-stdlib-2.1.0.jar`, 1.7 MB) into a Maven-layout folder inside the install (`<install>/m2/org/jetbrains/kotlin/kotlin-stdlib/2.1.0/kotlin-stdlib-2.1.0.jar`) in the Dockerfile and set `ENV MAVEN_REPOSITORY=<install>/m2` (the child process inherits the backend's environment). `~/.m2` would not work in production: the PVC mounted at `/home/continuum` hides image-owned home content. A symlink instead of a copy: NOT VERIFIED. The `.kt`/`.kts` extension runs the same server with the same lookup, so the same gap is expected there (NOT VERIFIED at run time). Alternative place for the variable: the launch spec's `env` (BE-4), which would not help the extension's server — the Dockerfile covers both.
- **Also add a suite guard** (done: the bridge's diagnostics group fails in this state) and, ideally, a Dockerfile/CI step that runs one analysis in the built image.

#### ST-2 — MAJOR — BE-3 — a document opened while the server is starting gets no diagnostics until its next edit
- **Checks failing:** [lifecycle] "a document opened while the server is still starting gets its diagnostics once the server is ready" and "a document opened while the restarted server is starting gets its diagnostics once ready" (dev; image once the stdlib is present).
- **Request:** connect (cold server), `didOpen` a script with `val x: Int = "a"` while the state is `starting`, wait for `ready`, wait for `publishDiagnostics` / expected an error on line 1 within 15 s / none (the document is replayed to the server at `ready`, but nothing is published until the user edits it).
- **Precise window (dev, cold server, a document opened N ms after `ready`):** +0 ms none within 8 s; +150, +400, +800, +1500 ms diagnostics in 95-132 ms. One document and three documents opened while starting both lose their diagnostics. As shipped, the image passes these two checks only because analysis without the stdlib finishes fast and emits its (false) errors.
- **Impact:** the first Script dialog of every session, and the first after each idle stop (10 min default), shows no markers for the script's existing content until the user types. Typing triggers a normal lint.
- **Verified workaround from outside:** after `ready`, wait ~0.5 s and send a full-text `didChange` with the same text (next version) for each replayed document → all markers arrive ~0.9 s after `ready`; no stagger needed.
- **Likely fix options (BE-3):** delay the replay by about 0.5 s after the readiness probe's `didClose`; or replay and then send one no-op `didChange` per document ~0.5 s after `ready`; or wait for the probe document's own `publishDiagnostics` before reporting `ready`. The exact mechanism inside fwcd is NOT VERIFIED (behaviour only).

#### ST-3 — MAJOR (needs a decision) — BE-3 / BE-4 / BE-5 — a handful of open scripts fill the 512 MB heap and nothing recovers the server
- **Check failing:** `ONLY=exhaustion` → "a server whose heap is full is replaced by the bridge while the editors stay open (a new process, or a fresh starting/ready cycle)" (dev and image, unlimited and 1 GiB).
- **Measured:** each open 30-line script holds ≈ 21 MB of live heap; right after `ready` the live heap is ~330 MB (`jcmd <pid> GC.heap_info`). Capacity: the 9th-10th open script on the dev bundle, the 14th in the image with the stdlib. Beyond that either `-32603 … java.lang.OutOfMemoryError: Java heap space` after 12-20 s, or no answer at all for 45 s (GC thrash). The process stays alive with RSS 789-924 MB — below the 1000 MB restart ceiling — so the watchdog never restarts it; the same pid 45 s later. It recovers when documents are closed (answers in 49-296 ms), and 60 open/complete/close cycles stayed flat (no leak).
- **Why it matters:** the ceiling the design relies on (1000 MB) is unreachable under `-Xmx512m` (RSS tops out at ~0.92 GB), and the bridge's own cap (50 documents per connection) is far above the real capacity (10-14). Realistic exposure is low for one user with one or two dialogs; it is a silent, non-self-healing failure for anyone holding many dialogs or several tabs open.
- **Options:** raise `-Xmx` together with the pod memory (ST-4); cap open documents per backend near the measured capacity and refuse further `didOpen`s visibly; restart the server after repeated `-32603`/timeouts; shrink per-document state. The unit-level restart ceiling then needs a trigger that can actually fire (heap-based, or consecutive failures).

#### ST-4 — MAJOR (needs a decision; overlaps BR-2) — docs / ops — pod memory against the 1 GiB default
- The release note says the server "uses about 0.8 GB … capped at about 1 GB and restarted above it". Measured language-server RSS: 0.68-0.80 GB in a 1 GiB container, 0.87-0.92 GB in an unlimited container (dev bundle and image; highest 924 MB at heap exhaustion). The workbench container alone, with no editor open, is ~170 MB by its cgroup (backend 169 MB RSS and `ipc-bootstrap` 75 MB RSS, shared pages counted in both).
- Whole container with the server under load: **0.82-0.94 GB in a 1 GiB limit (not OOM-killed; margin 8 %)**, up to 1.07 GB unlimited. The cluster manager's defaults are request 512Mi / limit 1Gi (`WorkbenchInstanceEntity.kt:30,32`). The `.kt` file route runs a second server of the same size (BR-3; not measured here).
- The numbers in the release note should carry the pod totals (≈ 0.95 GB with one editor open, not 0.8 GB for the process alone), and the default limit needs a decision (raise it, or accept ~8 % headroom).

#### ST-5 — MINOR — BE-5 — the jlink runtime lacks `java.net.http`, `java.rmi`, `java.compiler`, `java.security.jgss`
- Probe in the image (stdlib reachable): `java.net.http.HttpClient`, `java.rmi.Remote`, `javax.tools.ToolProvider`, `org.ietf.jgss.GSSManager` → "Unresolved reference"; 20 other JDK API groups resolve (java.base, java.sql, java.logging, java.xml, java.management, java.scripting, java.naming, java.desktop, java.prefs, java.security.sasl, kotlin stdlib). Workers run a full JDK, so valid scripts show false errors in the editor.
- Fix: add the modules to the Dockerfile's `jlink --add-modules` list (`java.net.http` costs a few MB).

#### ST-6 — MINOR (reviewer: MAJOR, = BR-1) — BE-4 / BE-5 — the documented dev recipe fails
- `KotlinServerLaunch` resolves the development install directory to `<parent of the repo>/.kotlin-ls`. `yarn download:kotlin-ls` installs into `continuum-workbench/.kotlin-ls`, so a plain `theia start` fails with "`…/.kotlin-ls/server/bin/kotlin-language-server` is missing" unless `CONTINUUM_KOTLIN_LS_HOME` is set (I had to set it). The image path is unaffected.

#### ST-7 — MINOR — upstream fwcd (BE-3 may mitigate) — opening a second document drops the first one's pending analysis
- Two documents opened ≤ 20 ms apart: the first never gets diagnostics, the second does (48-52 ms); at ≥ 100 ms apart both do. A 1500-line script followed by a small one 100 or 400 ms later: the large one never gets diagnostics (null within 20 s), the small one does; at 1500 ms apart both do. Real exposure: a large script plus a second dialog opened within ~0.4 s, or the replay at start (ST-2). Mechanism NOT VERIFIED.

#### ST-8 — NIT — BE-3 — `initialize` advertises capabilities the bridge then refuses
- The answered `initialize` lists rename, codeAction, formatting, rangeFormatting, workspaceSymbol, executeCommand, semanticTokens, inlayHint and workspaceFolders; the bridge refuses those methods with -32602. A generic client could offer features that always error.

#### ST-9 — NIT (= BR-16) — BE-3 — default private workspaces directory
- `os.tmpdir()/continuum-language-servers-<uid>/<id>` is wiped on every backend start, so two same-uid backends on one host share and delete each other's directory (I set `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` for my instance). Harmless in production (one backend per pod).

#### ST-10 — NIT — BE-5 — the image's final `USER` is root
- The image runs as root unless the platform sets a user; the cluster manager runs uid 1000 (the image keeps the 0.0.16 behaviour, identical `USER`). Everything was tested as uid 1000.

#### Observations (no action requested)
- `completionItem/resolve` with no URI passes the guard and returns -32603 (`kotlin.NotImplementedError` inside fwcd) — BR-14. It is the only server-side SEVERE entry in the final dev runs apart from the deliberate exhaustion run.
- A completion at a position past the end of the text returns -32603 "Reached end of file before reaching char N" and writes a 17-line SEVERE stack to the backend log per request (reproduced with a probe; the 32 identical entries in the early dev log came from an early probe of mine with such positions). Monaco never sends such positions.
- Raw clients see `Parameter 'row'/'flow' is never used` warnings on the hidden header lines; the browser client's position mapper drops them.
- Versions: fwcd ignores a `didChange` whose version is lower than the stored one (a probe mistake of mine, not a defect).
- The bridge's `starting` → `ready` is ~1.2-1.4 s cold on this host, both on the dev bundle and in the image.

### Files changed

All under `continuum-system-tests/` unless noted; nothing in a product repo.

| File | Change |
|---|---|
| `suites/api/kotlin-lsp-bridge.mjs` (new) | the black-box bridge suite: groups `lifecycle`, `handshake`, `offline`, `diagnostics`, `packaging`, `documents`, `security`, `leak`, `memory`, `protocol`, opt-in `exhaustion`; header documents the wire protocol and every env var |
| `suites/api/kotlin-lsp-image.mjs` (new) | docker driver for the production image: `image`, `download`, `seed`, `asis`, `experiment`; opt-in `default-idle`, `exhaustion`, `pod-limit` |
| `lib/ws-frames.mjs`, `lib/theia-wire.mjs`, `lib/theia-client.mjs`, `lib/lsp-session.mjs`, `lib/kotlin-script.mjs`, `lib/proc-info.mjs`, `lib/runner.mjs`, `lib/image-probe.mjs` (new) | k6-free helpers: WebSocket framing, Theia/Socket.IO wire format, client, LSP session, script weaving and position mapping, `/proc` and cgroup readers, check recorder, docker-output parsers |
| `test/{ws-frames,theia-wire,lsp-session,kotlin-script,proc-info,runner,image-probe}.test.js` (new) | 154 unit tests in total for the pure helpers (the whole `npm test`) |
| `package.json` | `check` also syntax-checks `lib/*.mjs`, `suites/api/*.mjs`, `suites/ui/*.mjs` |
| `Makefile` | targets `kotlin-lsp`, `kotlin-lsp-image` |
| `README.md`, `AGENTS.md` | suite rows and a section for the two suites, run recipes, the contracts they follow; the frontend tester's rows were re-read and left intact |
| `.claude/knowledge/{workbench.md,dev-environment.md,graph.json,change-log.md}` | see Knowledge updates |

### Commands run

| Command | Result |
|---|---|
| `npm test` (continuum-system-tests) | 154 tests passed |
| `npm run check` | exit 0 |
| `docker build -t kotlin-lsp-systest-workbench:r1 <staged context>` | exit 0 |
| dev backend start (see Environment) | backend ready on `:3006`; stopped at the end by pid |
| `WORKBENCH_URL=http://127.0.0.1:3006 BACKEND_PID=<pid> IDLE_TIMEOUT_SECONDS=15 LEAK_PROBE_DIR=<backend cwd> node suites/api/kotlin-lsp-bridge.mjs` | 48 passed, 2 failed, 3 skipped |
| `… ONLY=exhaustion node suites/api/kotlin-lsp-bridge.mjs` | 2 passed, 1 failed |
| `IMAGE=kotlin-lsp-systest-workbench:r1 BASELINE_IMAGE=projectcontinuum/continuum-workbench:0.0.16 node suites/api/kotlin-lsp-image.mjs` | 42 passed, 3 failed (asis diagnostics = ST-1; experiment lifecycle = ST-2; the experiment comparison, which lists the same two ST-2 checks as newly failing), 1 skipped (`--version`) |
| `ONLY=default-idle …`, `ONLY=exhaustion …`, `ONLY=pod-limit …` (image driver) | idle 3 passed; exhaustion 3 passed 1 failed; pod-limit diagnostics+memory 13/13, exhaustion 2 passed 1 failed |
| scratch probes against `:3006` and one throwaway container (`kotlin-lsp-systest-f8`, JDK-API probe) | evidence for ST-2, ST-5, ST-7 and the observations; the probes are not part of the suite and were deleted |
| cleanup | the `:3006` workbench stopped by pid (backend 1425800, CLI 1425408, `ipc-bootstrap` 1425812); `:3005` (frontend tester) untouched and still listening; `docker rmi kotlin-lsp-systest-workbench:r1`; no `kotlin-lsp-systest-*` container, volume or image remains; scratch files in `/tmp` removed (a Round 2 needs a rebuild of the image anyway) |

### NOT VERIFIED

- Server `--version`: the pinned server has no such option (see AC-20).
- The `.kt`/`.kts` extension route at run time (plugin host, activation, its own server, its stdlib lookup): needs a browser; the frontend tester's suite covers the UI. Whether opening a Script dialog also starts the extension's server (BR-3) is unconfirmed by me; the image only shows the extension and the seeded settings are present.
- A symlink instead of a copy for the stdlib folder (ST-1 fix variant).
- The mechanism inside fwcd behind ST-2 and ST-7 (behaviour only).
- AC-15's dummy second language as a system check (unit-level only).
- The dev bundle with the network blocked (replaced by the image run).
- A real pod (PVC at `/home/continuum`, the cluster manager's limits): emulated with `docker run --memory 1g`.
- Browser-visible behaviour (status chip, markers, Save): frontend tester.

### Plain-language summary (for a user decision)

1. **The production image shows wrong errors.** The Kotlin language server in the image cannot find Kotlin's own standard library, so every Script dialog would underline valid code in red and offer shortened completion lists. It works on a developer machine only because the developer's Gradle cache has the library. The fix is small and was tested: put a copy of the library (1.7 MB, already in the image) in a place the server looks, and tell it where. No decision needed except to schedule it.
2. **The reduced Java runtime is missing a few modules** (HTTP client, RMI, compiler API, Kerberos), so valid scripts that use `java.net.http` would be underlined. Adding the modules costs a few MB. Options: add them, or accept and document.
3. **The first dialog after the language server starts shows no error markers until the user types.** A tested workaround exists (a tiny no-op edit sent half a second after the server is ready). Options: fix it, or accept it.
4. **A single language server holds about 10-14 open script editors before its memory is full**, and then it stops answering until editors are closed; nothing restarts it. One user with one or two dialogs will not notice. Options: raise the memory limits, cap the open scripts, or restart the server after repeated failures.
5. **Pod memory:** the server alone uses 0.7-0.9 GB; the whole workbench pod with one editor open peaks at about 0.94 GB of the default 1 GiB limit. It survived, with about 8 % to spare. The release note says "about 0.8 GB" for the process only. Options: raise the default pod limit, or document the real total.
6. **Developer recipe:** the documented way to start the workbench for development fails unless one extra environment variable is set (the install folder is looked up one level too high).

### Knowledge updates

- `.claude/knowledge/workbench.md`: new section "Testing the bridge from outside": the raw-client wire recipe (cookie, Socket.IO, multiplexer frame layout), running a second backend, running the image offline as uid 1000 with cgroup memory, the clean-context docker build, and the verified facts (fwcd's stdlib lookup and the `MAVEN_REPOSITORY` fix, JRE module gaps, the cold-start diagnostics window, heap capacity, RSS vs container limit, baseline memory, default pod limit, the dev install path).
- `.claude/knowledge/dev-environment.md`: gotcha for black-box docker runs (uid, cgroup files, `node` through `bash -ic`).
- `.claude/knowledge/graph.json`: nodes `kotlin-lsp-bridge-suite`, `kotlin-lsp-image-suite`; edges `system-tests` contains both, bridge suite tests `lsp-backend-bridge`, image suite runs the bridge suite and tests `kotlin-ls-packaging`; the stale "BE-4 pending" text on the `lsp-backend-bridge` → `kotlin-ls-packaging` edge replaced. Validated: 41 nodes, 48 edges, no duplicate id, no undefined endpoint.
- `.claude/knowledge/change-log.md`: one line for these tests and their findings.

---

## Round 2

Date 2026-11-28. Retest of the fixes in `03-backend-dev.md` "Round 5 — fix round 1". Everything below ran against the changed code (the rebuilt dev bundle and a production image rebuilt from the working tree); nothing is marked "not verified against changed code".

**Verdict: PASS, with one new MINOR finding (ST-11).** The Round 1 BLOCKER (no Kotlin standard library in the image, ST-1) is fixed: the documented clean script publishes no diagnostics in the image and the completion counts equal the dev bundle's. Both MAJOR runtime findings are fixed in behaviour: a document opened while the server starts now gets its diagnostics (ST-2), and an exhausted server is replaced by the bridge after about 51 s instead of hanging for good (ST-3). The jlink runtime now resolves `java.net.http`, `java.sql`, `java.rmi`, `javax.tools` and `org.ietf.jgss` (ST-5), `initialize` promises only what the bridge serves (ST-8), and the image grew by 6.2 MB (+0.13 %). One new defect, a side effect of the ST-2 fix: **ST-11**, the first edit after the bridge's 500 ms "nudge" is ignored by the server (self-heals on the next keystroke).

Counts (Round 1 in brackets): dev bundle 61 passed / 1 failed / 3 skipped of 65 checks (48 / 2 / 3 of 53); production image as shipped, offline, uid 1000: 63 / 1 / 1 of 65 plus 1 passed in the root pass (47 / 5 / 1 of 53); the default-groups image driver run 42 / 1 / 1 of 44. The only failing check in every run is the ST-11 one; the skips are the opt-in exhaustion group (run separately, see below), the offline precondition on dev (the image run covers it), the dev packaging check (image only) and the server `--version` (the pinned server has no such option).

### Environment

| Item | Value |
|---|---|
| Dev target | my own workbench instance on `:3009` (not `:3005`, which is the frontend tester's): `bash -ic 'sdk use java 21.0.11-tem && cd continuum-workbench/continuum-workbench && ./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3009'` with `THEIA_CONFIG_DIR` and `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` in fresh temp dirs and `CONTINUUM_LANGUAGE_SERVER_IDLE_TIMEOUT_SECONDS=15`, and **no** `CONTINUUM_KOTLIN_LS_HOME` (no longer needed, ST-6). The backend bundle `lib/backend/main.js` was built 2026-11-27 23:48 (it contains `DiagnosticsNudge` and `ServerHealthMonitor`), the extension's `lib/node/*` compiled 23:47 and `.kotlin-ls` re-installed 23:36 (Maven-layout stdlib and launcher). I did not rebuild or touch `lib/`, `src-gen/` or `plugins/`. Server: fwcd kotlin-language-server 1.3.13 on the host JDK 21.0.11-tem. No platform stack. |
| Production image | `kotlin-lsp-systest-r2-workbench:r2`, id `1ffd2d20f968`, built fresh by me from `continuum-workbench/Dockerfile` of the working tree with a clean staged context (the Round 1 image had been removed first); `docker build` exited 0. Size 4,794,793,272 bytes = 4573 MiB. |
| How the image was run | as in Round 1: `docker run --network none --user 1000:1000` (the suite copied in and run inside as uid 1000, plus a root pass for `/app`), memory from the cgroup files; pod-like runs with `--memory 1g` and `--memory 2g` (the cluster manager's default workbench pod is now request 1Gi / limit 2Gi). Independent driver runs went in parallel against separate containers; two suites were never run against the same backend at once. |
| Host | Linux, 16 cores, 59 GB, Docker 29.10.0, Node 24, JDK 21.0.11-tem. An unlimited container on this host lets the JVM size its initial heap at `-Xmx`, so its RSS is higher than in a small container; both are reported. |
| Not needed / not run | k6 (plain Node client), the platform stack, a browser (frontend tester). |

### The six items: Round 2 against Round 1

| # | Item | Round 1 | Round 2 | Evidence (image, offline, uid 1000, unless noted) |
|---|---|---|---|---|
| 1 | AC-5: clean-script diagnostics and completion counts on the image match the dev bundle | **FAIL, BLOCKER (ST-1)**: 10 diagnostics, 5 on the user's lines (`MISSING_BUILT_IN_DECLARATION`); `flow.` 7 items, `row.` 14, `"abc".le` 1 | **PASS (fixed)** | the clean script gives 1 publish and 0 diagnostics; `flow.` 18 items, `row.` 75, `"abc".le` 75 (length and let first) = the dev bundle. The `launcher` group shows it without the bridge: the start launcher in a minimal environment (`env -i`), no network, answers `initialize` in ~0.8 s and `"abc".le` with 75 items in ~1 s; the control (the server's own start script, no launcher, no `MAVEN_REPOSITORY`) gives 1 item. `/opt/continuum/kotlin-ls/m2/org/jetbrains/kotlin/kotlin-stdlib/2.1.0/kotlin-stdlib-2.1.0.jar` (1,690,048 bytes) has the same sha256 as the server's own jar; `MAVEN_REPOSITORY` is set by the image ENV and by the launcher. |
| 2 | The first-open diagnostics window | **FAIL, MAJOR (ST-2)**: a document opened while the server starts (or at ready+0 ms) got nothing until its next edit | **PASS for diagnostics; new regression ST-11 (MINOR)** | lifecycle: a document opened while the server is starting, and one opened while a restarted server is starting, get their diagnostics once ready (4 diagnostics each, dev and image; both failed in Round 1). coldwindow: a script opened at ready+0, 150, 400, 490, 510, 700 and 1500 ms always gets diagnostics (the +0 ms one 0.86-0.92 s after the open, the others 58-318 ms; Round 1: none within 8 s at +0 ms). Three scripts opened back to back while a cold server starts all get diagnostics 0.86-1.07 s after ready. **ST-11** below. |
| 3 | Memory exhaustion (10-14 open scripts) restarts the server instead of hanging | **FAIL, MAJOR (ST-3)**: never recovered, same pid 45 s later | **PASS in behaviour (fixed)** | dev: the 11th open script fails (`-32803`, no answer in 30.0 s), the bridge starts a replacement 51 s after the first failed answer and the replacement answers for 30 s straight 86 s after it. Image unlimited / 1 GiB / 2 GiB: the 16th / 13th / 13th fails; replacement after 51 s; serving 86-87 s. A 181 s soak of edits on all open scripts after the replacement: dev 133/133 and image (1 GiB) 147/147 completions served, 0 further restarts; a fresh script is served in 34 ms (dev) / 310 ms (image) once the scripts are closed. `-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m` is unchanged in every server process. RSS in the AC-14 table. |
| 4 | Image size delta (4 jlink modules + stdlib jar) | 4,788,550,192 bytes (4567 MiB); `/opt/continuum/kotlin-ls` 149 MB | **+6,243,080 bytes (+5.95 MiB, +0.13 %)**: 4,794,793,272 bytes (4573 MiB); `/opt/continuum/kotlin-ls` 152 MB | small, as expected. In `kotlin-ls` about +3 MB (`du`, MB-rounded): the stdlib repository 1.7 MB, the runtime 60 → 61 MB (`lib/modules` 27,833,988 bytes); the other ~3 MB of the delta is not in that folder (the app layers were rebuilt from the working tree). The driver's old "Kotlin adds -357 MB" compared against the released 0.0.16, a different build, so it was meaningless; the message is replaced. |
| 5 | `initialize` no longer promises refused capabilities | **NIT (ST-8)**: promised features whose methods the guard refuses with -32602 | **PASS (fixed)** | a raw `initialize` (dev) and the new check on dev and image: `hoverProvider`, `completionProvider` (no resolve, trigger `.`), `signatureHelpProvider` (`(` and `,`), `definitionProvider`, `referencesProvider`, `documentHighlightProvider`, `documentSymbolProvider`, `textDocumentSync` open/close + full, `serverInfo` Kotlin Language Server 1.3.13, no workspace features. The check sends every promised method on an owned document: all 7 are answered, none is refused. (The developer's note also lists `typeDefinition` and `positionEncoding`; the cached answer has neither because the pinned server announces neither, so nothing is promised that is refused.) |
| 6 | AC-13 / AC-20 offline on the rebuilt image | **FAIL as shipped** (ST-1 only) | **PASS except ST-11** | `--network none`, only `lo`, uid 1000: 63 passed, 1 failed (ST-11), 1 skipped (exhaustion, opt-in) of 65, root `/app` leak 1/1; per group lifecycle 11/11, coldwindow 8/9, handshake 3/3, offline 1/1, diagnostics 13/13, packaging 1/1, documents 7/7, security 12/12, leak 2/2, memory 3/3, protocol 3/3. Static image checks all pass (AC-20 below). |

### AC coverage

Check names are those printed by the suites (`suites/api/kotlin-lsp-bridge.mjs`, group in brackets; `suites/api/kotlin-lsp-image.mjs` for the image). Round 2 additions are listed in Appendix B.

| AC | Check(s) | File | Result |
|---|---|---|---|
| AC-5 clean script has no diagnostics (server side) | [diagnostics] 13 checks: "the documented clean script (row["a"]?.toString() + flow.get("x")) is analysed and publishes no diagnostics at all"; type error at the user's line and column (the hidden header does not shift it); error below leading imports at the user's line; "fixing the error clears the markers"; completions for `flow.` (18), `row.` (75) and `"abc".le` (75, the stdlib); hover with KDoc; signature help; **new:** classes of the Java modules a script can reasonably use resolve; `initialize` promises only features the bridge serves; image `launcher` ×3 | bridge + image | **PASS: dev 13/13, image 13/13 (offline, uid 1000).** Round 1: dev 10/10, image 5 of 10 failed (ST-1). Caveat ST-11 (the first edit after the nudge is ignored; heals on the next keystroke). |
| AC-13 works with no outbound network | image driver `asis` (network mode `none`, only `lo`, the precondition check "this environment has no outbound network", the whole bridge suite with `--offline`); `seed` (offline start, backend answers after 0.6-0.7 s); `launcher` (LSP over stdio with no network) | image + bridge | **PASS except ST-11** (Round 1: failed through ST-1). The dev bundle was not run network-blocked (the plan only asks for it when the image build is infeasible). |
| AC-14 RSS within the documented cap; started with `-Xmx` | [memory] "the server process is started with -Xmx512m (and the other JVM limits)"; "one editor (a 30-line script, 100 edits, 10 completions): resident memory stays below the 1000 MB restart ceiling, no restart, every answer served"; "5 editors at once"; [exhaustion] ×6 (opt-in); image `pod-limit` (1 GiB and 2 GiB), `asis` | bridge + image | **PASS** for the AC as written: argv `-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m` in every server process of every run; RSS stayed under the 1000 MB ceiling with no restart in every run without exhaustion (table below). Exhaustion: the server is now replaced (item 3). |
| AC-15 (runtime side) | [security] "a connection for an unknown or malformed language id is refused (channel closed by the server, nothing delivered)" (7 ids) | bridge | **PASS** for what is visible from outside: only `kotlin-script` is registered. The dummy second language (zero edits to generic code) is unit-level and cannot be shown over the wire without a test-only registration: **NOT VERIFIED** as a system check. |
| AC-16 bridge security | [handshake] ×3 (no cookie → HTTP 400, foreign Origin → HTTP 400); [security] ×12 (19 spellings of `file:`/malformed URIs refused with -32602, nested `uri`/`*Uri` keys, 10 out-of-set methods, hostile `didOpen` produces no analysis, `initialize` cannot widen roots, wrong language id and unopened document refused, malformed JSON-RPC ignored, `shutdown`/`exit` do not stop the shared server, private server directory holds only the seeded declarations); [documents] ×7 (50-document cap, release on close and on a vanished client, full-text sync only); [leak] ×2; [protocol] ×3 | bridge | **PASS** (dev and image, offline), unchanged from Round 1. Every isolation check is paired with an owner-can-read check. |
| AC-17 one lazy shared server, idle stop | [lifecycle] ×11, [coldwindow] ×9, image `default-idle` | bridge + image | **PASS** for processes and timing: 0 processes before the first editor; 1 process for any number of editors (ready 1.4 s cold); the same pid on reconnect; idle stop 15.3-15.5 s at a 15 s timeout and **600.4 s with the production default** (still running at 300 s); a fresh pid on the next connection. The two Round 1 lifecycle failures (diagnostics after a (re)start) pass. [coldwindow] 8/9: ST-11. |
| AC-20 production image | image driver `image`, `download`, `launcher`, `seed` (below) | image | **PASS**, except server `--version`: **NOT VERIFIED** (the pinned 1.3.13 has no such option; the JCommander error `Was passed main parameter '--version'` proves the bundled runtime runs the server class; the version is evidenced by the marker, the jar name and `serverInfo`). |

**AC-14 measurements** (kernel high-water mark in brackets; the ceiling is 1000 MB; Round 1 in the last column):

| Target | One editor: 2 s after a cold start / when the edits began / peak | Five editors | Margin below the ceiling | Whole container, sampled peak (anonymous) | Round 1 |
|---|---|---|---|---|---|
| Dev bundle (host JDK) | 613-818 / 922-931 / 931-935 MB (942-958) | 937-942 MB | 6-7 % | n/a | peak 907-909 MB (9 %) |
| Image, unlimited container | 720-810 / 858-883 / 866-884 MB (866-884) | 868-885 MB | 11.6-13.4 % | 979-995 MB (967-983), not OOM-killed | 877 MB (12 %) |
| Image, 1 GiB container | n/a / 748 / 762-810 MB (762) | 766 MB | 19-24 % | 900-938 MB (888-926), not OOM-killed | 795-797 MB |
| Image, 2 GiB container | n/a / n/a / 868-873 MB | n/a | 12.7-13.2 % | 1007 MB (991), not OOM-killed | n/a |

The idle workbench container with no editor open is about 170 MB (Round 1). The container peaks sit at 0.94 GB in the 1 GiB container (cgroup `memory.peak` 942 MB including page cache, margin about 8 %) and 1.0 GB in the 2 GiB one. In the production-default idle run (`default-idle`) the container peaked at 852 MB.

**Exhaustion** (opt-in group; scripts of 30 lines opened one after another until one fails; Round 1 in brackets):

| Target | Failing open script | First failed answer | Replacement starts | Serving again (30 s of answers) | Server RSS peak, original / replacement | Whole container peak |
|---|---|---|---|---|---|---|
| Dev bundle | 11th (9th-10th) | `-32803` after 30.0 s, RSS 871 MB | 51 s after the first failed answer | 86 s after it | 905 / 968 MB (HWM 968) | n/a |
| Image, unlimited | 16th (14th) | `-32803` | 51 s | 87 s | 831 / 869 MB | 972 MB; 3 `OutOfMemoryError` lines in the server log |
| Image, 1 GiB | 13th (14th) | `-32803` after 30.0 s, RSS 807 MB | 51 s | 86 s | 808 / 820 MB (an earlier run 806 / 762) | 939-947 MB, not OOM-killed |
| Image, 2 GiB | 13th | `-32803` | 51 s | not recorded | 849 / 809 MB | 975 MB, not OOM-killed |

The replacement state sequence seen by the clients is `starting` then `ready` and nothing before it. The soak (180 s of edits on every open script after the replacement): dev 133 edits on 11 scripts, image (1 GiB) 147 edits on 13 scripts, every completion served, no further restart.

#### AC-20 details (image, static checks all PASS)
- Entrypoint, command, working directory, user and ports identical to `projectcontinuum/continuum-workbench:0.0.16`; environment added: `CONTINUUM_KOTLIN_LS_HOME=/opt/continuum/kotlin-ls`, `CONTINUUM_JAVA_HOME=/opt/continuum/kotlin-ls/jre`, `MAVEN_REPOSITORY=/opt/continuum/kotlin-ls/m2`; `entrypoint.sh` differs from 0.0.16's only by the added seeding lines (0 lines removed).
- `java -version` of the bundled runtime: 21.0.13.1 (Temurin-21.0.13.1+2). The jlink runtime now has 19 modules (java.base, java.compiler, java.datatransfer, java.desktop, java.instrument, java.logging, java.management, java.naming, java.net.http, java.prefs, java.rmi, java.scripting, java.security.jgss, java.security.sasl, java.sql, java.transaction.xa, java.xml, jdk.net, jdk.unsupported; Round 1: 15), `bin` = java, jrunscript, keytool, rmiregistry (no javac, no JDK compiler module, no other Java on the PATH); the four added modules export `java.net.http`, `java.rmi`, `javax.tools` and `org.ietf.jgss`.
- Pinned server: marker file `1.3.13 4fe7d71d087b…` equals the pin in `scripts/download-kotlin-ls.sh`, `server-1.3.13.jar` present; the server's own start script runs on the bundled runtime.
- Download guard: a tampered archive is rejected (exit 1, "checksum mismatch", nothing installed); an unreachable location installs nothing (curl exit 37). No download at run time (the offline runs).
- fwcd.kotlin 0.2.36, vscode.git and vscode.git-base are bundled in the plugin folder.
- Seeding (verified in the image with the home folder on a volume, as the pod's PVC): the settings land in `/home/continuum/.continuum`, the folder Theia logs as its configuration directory. `kotlin.languageServer.path` (= the launcher `<install>/bin/kotlin-language-server`) and `kotlin.java.home` (= `<install>/jre`) are rewritten on every start; `kotlin.languageServer.enabled`, `kotlin.java.opts`, `kotlin.scripts.enabled` and `kotlin.debugAdapter.enabled` are written only when absent (the user's font size and heap choice survived). `kotlin.java.opts` only affects the file-editor extension's server; the bridge's own launch spec carries `-Xmx512m`. A first start with no settings writes every default (`-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m`). A settings file with comments, trailing commas and `//` inside a string is merged and rewritten as plain JSON, the original is kept once as `settings.json.continuum-backup`, a repeat run changes nothing and leaves no temporary file. An unparsable file: exit 1, a message on stderr, the file byte-identical, no first-run marker, and the container still starts and serves (0.7 s, the entrypoint logs "could not seed"). `yarn start` runs the seed first (read in `package.json`; running it was not done because it writes the real `~/.continuum`).

### Results by run

| Run | Target and setup | Result |
|---|---|---|
| Dev full | `:3009`, all default groups, `BACKEND_PID`, `IDLE_TIMEOUT_SECONDS=15`, `LEAK_PROBE_DIR` = the backend's cwd | 61 passed, 1 failed (ST-11), 3 skipped, 65 checks |
| Dev cold window | `ONLY=coldwindow` | 8 passed, 1 failed (ST-11), 9 checks |
| Dev exhaustion and soak | `ONLY=exhaustion EXHAUSTION_SOAK_SECONDS=180` | 6 passed (replacement after 51 s, 133/133 completions during the soak, 0 further restarts) |
| Image, default groups | driver with `image`, `download`, `launcher`, `seed`, `asis` | 42 passed, 1 failed (ST-11 inside `asis`), 1 skipped (`--version`), 44 checks; `asis` = bridge suite 63 / 1 / 1 of 65 plus root pass 1/1; container peak 995 MB, not OOM-killed; the server log has 0 OOM lines |
| Image as shipped, repeated | `ONLY=asis`, final suite | 63 / 1 / 1 of 65, root 1/1; container peak 979 MB |
| Image static and seed | `image`, `download`, `launcher`, `seed` | all pass (`seed` 12 checks), 1 SKIP (`--version`) |
| Image in 1 GiB and 2 GiB | `ONLY=pod-limit POD_LIMIT_GIB=1,2` | 16 passed, 0 failed, neither container OOM-killed |
| Image in 1 GiB with a soak | `ONLY=pod-limit POD_LIMIT_GIB=1 EXHAUSTION_SOAK_SECONDS=180` | 8 passed, 0 failed: diagnostics 13/13, memory 3/3, exhaustion 6/6 (13th script fails, replacement after 51 s, 147/147 completions in the soak, fresh script in 310 ms) |
| Image, production idle timeout | `ONLY=default-idle` | 3 passed; lifecycle 10 passed, 1 skipped; the server stopped after 600.4 s, still running at 300 s |
| Image exhaustion, unlimited | `ONLY=exhaustion` | passed: the 16th script fails, replacement after 51 s, serving after 87 s |

### Failures and findings

Severity scale as in Round 1 (BLOCKER / MAJOR / MINOR / NIT). ST-n are this report's ids; the BE task is the one the fix belongs to. One check fails; every other Round 1 failure passes.

#### ST-11 — MINOR — BE-3 — the first edit after the bridge's diagnostics nudge is ignored by the server (regression from the ST-2 fix)
- **Check failing:** [coldwindow] "the first edit after the bridge re-sent the open documents is applied by the server (document version 2, as an editor numbers it; diagnostics update and a completion sees the new text)" — dev `:3009` and image (every run).
- **Request:** connect to a cold server; `didOpen` a script with an error at version 1 (the open comes 0, 150, 400 or 490 ms after the `ready` notice); wait for its first diagnostics; send a full-text `didChange` at version 2 that fixes the error, then `textDocument/completion` at the new text. Version 2 is how Continuum's own browser client numbers the first edit (`VirtualDocument` starts at 1 and increments on every update).
- **Expected / actual:** the markers are cleared and the completion sees the new text / the old markers stay and the completion fails with `-32603 Internal error.`; the next version (3) is applied. A script opened 510 ms or later after `ready` behaves correctly. The server's own log has one `RuntimeException: Reached end of file before reaching char 29` per affected offset (4 per run): the completion ran against the stale, shorter text.
- **Cause (source):** `DiagnosticsNudge.ts:33` re-sends every open document 500 ms after `ready` as a full-text `didChange` with `version: document.version + 1`, but nothing records that version: the bridge's own `OpenDocument.version` stays at v while the server now stores v+1. fwcd ignores a change whose version is not above the stored one, and the client's next edit is exactly v+1. It applies to each document that is open when the nudge fires: after every cold start, idle restart and crash/OOM restart (the replay sends `didOpen` with the recorded version, then the nudge sends +1).
- **Impact:** the first keystroke after the server (re)starts is not analysed for each editor that was already open: a stale marker, or one failed completion/hover (`-32603`), until the next keystroke, which carries the whole text and puts everything right. The editor's text is never affected. The effect in the real browser is NOT VERIFIED (the frontend tester could cross-check).
- **Fix options (not prescribed):** keep one monotonic bridge→server version per document and rewrite the `version` of every forwarded `didOpen`/`didChange` including the nudge; or nudge with `didClose` + `didOpen` of the same text instead of a versioned change; or bump the recorded version when nudging and offset the client's following versions. `ONLY=coldwindow` reproduces it in about 30 s on a cold server and is the regression check.

#### ST-12 — NIT — BE-6 — a UTF-8 byte-order mark in the user's `settings.json` makes the seeding give up
- **Check:** [seed] "a settings file saved with a UTF-8 byte-order mark (measurement)".
- **Observed:** the seed script exits 1 ("is not valid JSON (even allowing comments); left unchanged"), the file stays untouched and no `globalStorage/fwcd.kotlin` marker is written; the container still starts and serves; the `.kt` editor stays unconfigured (first-run download prompt) until the file is saved without the mark. A BOM is unlikely in a file Theia writes itself (some Windows editors add it). Suggested: drop a leading U+FEFF before parsing.

#### Observations (not defects)
1. **A replaced server is as loaded as the one it replaces.** The restart replays every open document, so the replacement starts at capacity again. On the dev bundle (full JDK) it peaked at 968 MB RSS, 32 MB under the 1000 MB ceiling that would restart it again (back-off 1 s doubling, at most 3 restarts); in the image 820-869 MB. No second restart in any 181 s soak. The capacity itself is unchanged (11th script on dev, 13th-16th in the image): the restart is a recovery, not a limit.
2. **The outage window is long.** From the first unanswered request to a serving server takes about 85 s (30 s request timeout, the third failure 51 s after the first, then the restart), and the clients see no state change meanwhile (`starting` then `ready` only after the replacement), just `-32803` answers. One or two dialogs cannot get there. Not verified: what the status chip shows in that window (frontend).
3. The server's error log shows only what the probes cause: 4 × `Reached end of file before reaching char 29` per run (ST-11) and 1 × `InvocationTargetException` / `NotImplementedError` (`completionItem/resolve` without a URI passes the guard and fails inside the server with -32603; unchanged from Round 1). No `OutOfMemoryError` line in a run without exhaustion; 3 in the unlimited exhaustion run.
4. **Log hygiene, from reading the source only (NOT VERIFIED at run time):** `ClientMessageGuard.ts` puts the client's `method` string (unbounded) and the first offending URI (cut at 200 characters) into the WARN line `Refused client message: …` without removing control characters, so a client that holds the connection token could add lines, including forged-looking ones, to the backend log. Low risk (the client is the pod's own user): NIT.
5. **Pod memory with two servers (arithmetic, NOT measured):** one language server peaked at 0.94 GB container-wide in the 1 GiB container and 1.0 GB in the 2 GiB one. If the user also opens a `.kt` file in the file editor, the extension starts a second server of the same kind: about 0.17 GB (idle workbench) + 2 × 0.76-0.94 GB = 1.7-2.05 GB, 79-96 % of the new 2 GiB default. The frontend tester's browser suite is the place to measure it.
6. **Modules outside the 19:** a class from a module the reduced runtime does not ship is reported unresolved in the editor. Measured for `com.sun.net.httpserver` (module `jdk.httpserver`): "Unresolved reference: net" in the image, resolved on the dev bundle's full JDK (this is the control that shows the JDK-module check can discriminate). By the same mechanism, not tested one by one: `javax.sql.rowset`, `javax.xml.crypto`, `jdk.management`. The workers run a full JDK, so only the editor would underline such a script.

### Round 1 findings: status now

| Id | Round 1 | Round 2 |
|---|---|---|
| ST-1 BLOCKER | no Kotlin standard library in the image | **Fixed** (item 1) |
| ST-2 MAJOR | no diagnostics for a document opened while the server starts | **Fixed** for diagnostics; **new ST-11 (MINOR)** is a side effect of the nudge |
| ST-3 MAJOR | heap exhaustion never recovered | **Fixed in behaviour** (replacement after 51 s, item 3); capacity unchanged, observations 1-2 |
| ST-4 MAJOR | pod memory tight against the 1 GiB default | addressed by the separate change of the default pod to request 1Gi / limit 2Gi; measured here: container 0.94 GB (1 GiB limit, not OOM-killed) and 1.0 GB (2 GiB). Two servers at once: observation 5. The release-note wording was not re-checked. |
| ST-5 MINOR | the jlink runtime lacks `java.net.http`, `java.rmi`, `java.compiler`, `java.security.jgss` | **Fixed** (19 modules; scripts importing those packages resolve); other modules stay absent by design (observation 6) |
| ST-6 MINOR | dev install path one folder too high | **Fixed** (my `:3009` backend ran without `CONTINUUM_KOTLIN_LS_HOME` and found `continuum-workbench/.kotlin-ls`) |
| ST-7 MINOR | a second document opened within ~20 ms drops the first one's diagnostics (upstream fwcd) | **Not re-measured** (steady state, upstream); three documents opened while the server starts now all get diagnostics |
| ST-8 NIT | `initialize` over-advertised | **Fixed** (item 5) |
| ST-9 NIT | the default workspaces folder is wiped at start, so two same-uid backends collide | unchanged; I still set `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` per instance |
| ST-10 NIT | final `USER root` (identical to 0.0.16) | unchanged; the suite runs as uid 1000 like the cluster manager's pod |

### Files changed

| File | Change |
|---|---|
| `lib/lsp-capabilities.mjs`, `test/lsp-capabilities.test.js` (new, 6 tests) | what an `initialize` answer promises, and a probe request per promise |
| `lib/lsp-stdio.mjs`, `test/lsp-stdio.test.js` (new, 9 tests) | JSON-RPC over stdio (Content-Length framing): message encoder/parser and a small client, used to talk to the start launcher |
| `suites/api/kotlin-lsp-bridge.mjs` | new group `coldwindow` (sweep of open offsets after a cold start, the first-edit check, several documents while starting); new checks for the promised capabilities and for Java-module resolution (+ a measurement control); the opt-in `exhaustion` group rewritten (watch after the failure, a soak after the replacement; env `EXHAUSTION_WATCH_SECONDS`, `EXHAUSTION_SOAK_SECONDS`, `EXHAUSTION_DOCUMENTS`, `COLDWINDOW_OFFSETS_MS`); the header documents every group and env var |
| `suites/api/kotlin-lsp-image.mjs` | new groups `launcher` and `pod-limit` (`POD_LIMIT_GIB`); `image`, `seed` and `exhaustion` follow the fixed behaviour (module list and exports, stdlib = server jar, launcher, ENV, the seed contract and its edge cases); a `SUITE_TUNING` pass-through of tuning variables into the container run; the size message no longer compares with the released image |
| `lib/image-probe.mjs`, `test/image-probe.test.js` | `seededSettingsProblems` follows the new seed contract (launcher path, bundled runtime, other defaults) |
| `README.md`, `AGENTS.md` | my rows only: suites, libs, env vars, groups, tests, image-suite contract; the frontend tester's rows were re-read and left intact |
| `.claude/knowledge/{workbench.md,dev-environment.md,graph.json,change-log.md}` | see Knowledge updates |

`npm test` now runs 170 tests (Round 1: 154). No production code was changed.

### Commands run

| Command | Result |
|---|---|
| `npm test` (continuum-system-tests) | 170 tests passed |
| `npm run check` | exit 0 |
| `docker build -t kotlin-lsp-systest-r2-workbench:r2 <staged context>` | exit 0, id `1ffd2d20f968`, 4,794,793,272 bytes |
| dev backend start (Environment) | backend ready on `:3009` (backend pid 1633104, CLI pid 1632687); stopped at the end by pid |
| `WORKBENCH_URL=http://127.0.0.1:3009 BACKEND_PID=<pid> IDLE_TIMEOUT_SECONDS=15 LEAK_PROBE_DIR=<backend cwd> node suites/api/kotlin-lsp-bridge.mjs` | 61 passed, 1 failed, 3 skipped (65 checks) |
| `… ONLY=coldwindow …` | 8 passed, 1 failed |
| `… ONLY=exhaustion EXHAUSTION_SOAK_SECONDS=180 …` | 6 passed |
| a raw `initialize` probe on `:3009` (scratch, not part of the suite) | capabilities as in item 5 |
| `NAME_PREFIX=kotlin-lsp-systest-r2 IMAGE=kotlin-lsp-systest-r2-workbench:r2 BASELINE_IMAGE=projectcontinuum/continuum-workbench:0.0.16 node suites/api/kotlin-lsp-image.mjs` | 42 passed, 1 failed (ST-11), 1 skipped (44 checks) |
| `… ONLY=asis …` (twice) | 63 passed, 1 failed, 1 skipped (65) + root 1/1, both times |
| `… ONLY=seed …`, `… ONLY=launcher …` | 12 passed; 3 passed |
| `… ONLY=pod-limit POD_LIMIT_GIB=1,2 …` | 16 passed, 0 failed |
| `… ONLY=pod-limit POD_LIMIT_GIB=1 EXHAUSTION_SOAK_SECONDS=180 …` | 8 passed, 0 failed |
| `… ONLY=default-idle …`, `… ONLY=exhaustion …` | 3 passed; passed |
| cleanup | the `:3009` workbench stopped by pid (CLI 1632687, then backend 1633104), no Kotlin JVM left, `:3005` (frontend tester) untouched and still listening; `docker rmi kotlin-lsp-systest-r2-workbench:r2`; no `kotlin-lsp-systest-*` image, container or volume remains (the pre-existing `projectcontinuum/*` images and exited platform containers are not mine and were not touched); scratch dirs under `/tmp/kotlin-lsp-systest-r2-*` removed; no `systestleak*` file left in the backend's cwd |

### NOT VERIFIED

- Server `--version`: the pinned server has no such option (see AC-20).
- The `.kt`/`.kts` extension route at run time (plugin host, its own server): needs a browser, the frontend tester's suite covers it. What is verified here: the seeded path is the launcher, the launcher finds the stdlib with no network, the seed runs and is repeatable. That the extension's server then really starts through it in the plugin host: not verified by me.
- The ST-11 effect in the real browser, and what the status chip shows during the ~85 s exhaustion window.
- ST-7 (second document opened within ~20 ms in steady state): not re-measured.
- A real pod (PVC, the cluster manager's limits, other containers' memory): emulated with `docker run --memory 1g|2g`.
- `yarn start` seeding at run time (writes the real `~/.continuum`).
- AC-15's dummy second language as a system check (unit-level only).
- `$/cancelRequest` reaching the server after a timeout (not visible from outside).
- Both servers (bridge and file-editor extension) in one pod: arithmetic only (observation 5).
- Modules outside the 19 other than `jdk.httpserver`, one by one (observation 6); the log-hygiene note (observation 4) is from the source, not from a run.
- The dev bundle with the network blocked (replaced by the image run).

### Plain-language summary (for a user decision)

1. **The blocker is fixed.** The production image now checks scripts exactly like a developer build: the documented clean script shows no errors, completion lists are complete, and it all works with no network. The image is 6 MB bigger. Nothing to decide.
2. **One new small glitch, caused by the fix for "no markers when the editor opens first".** Half a second after the language server starts (or restarts), the bridge sends every open script a harmless "please re-check", but it numbers that message so that the server throws away the user's very next keystroke in each editor that was already open. For that one keystroke the red markers or the completion list can be stale or missing (a completion can fail once); the next keystroke puts everything right and no text is ever lost. Options: fix it (a small change in the bridge, the new check confirms it), or accept it.
3. **Running out of memory now heals itself, slowly.** With too many scripts open (11 on a developer machine, 13-16 in the image) the server stops answering; the bridge notices after about 80 seconds and replaces it, and the editors work again. One user with one or two dialogs never gets near it. The replacement starts as full as the old server, which on a developer machine means up to 968 MB of the 1000 MB at which the bridge would restart it once more (the image stays at 820-870 MB). Options: leave it, or later cap the number of open scripts and announce a "degraded" state earlier than after 80 seconds.
4. **The reduced Java runtime now has the modules that scripts reasonably use** (HTTP client, SQL, RMI, compiler API, Kerberos). Classes from modules that are still absent, for example the built-in HTTP server, would be underlined in the editor although they run fine on the workers. Options: accept (rare), or add modules for a few MB each.
5. **Memory of the pod:** the new default (1 GiB requested, 2 GiB limit) fits one language server with room to spare (whole container about 1.0 GB). If a user also opens a Kotlin *file* in the file editor, a second language server of the same size starts and the pod could come close to 2 GiB (arithmetic, not measured). Options: measure it once in the browser, give the file-editor server a smaller memory setting, or raise the limit.
6. **Tiny:** a user settings file saved with a byte-order mark leaves the Kotlin file editor unconfigured until it is re-saved. A one-line fix when convenient.

### Knowledge updates

- `.claude/knowledge/workbench.md`: section "Testing the bridge from outside" brought up to round 2: the stale round 1 facts replaced (stdlib via the Maven-layout copy and the launcher, 19 runtime modules, the first-diagnostics window and ST-11 with its cause and fix options, heap exhaustion -> replacement after ~51 s with the measured capacities and RSS, `initialize` capabilities, image size delta, dev install path fixed), plus new bullets for the seed contract (and ST-12), the log-hygiene note and the two-server pod arithmetic (NOT VERIFIED); recipes updated (own backend on a spare port without `CONTINUUM_KOTLIN_LS_HOME`, new groups and env vars, parallel driver runs); the packaging paragraph's "NOT VERIFIED" for real-server/Docker runs now points to this section.
- `.claude/knowledge/dev-environment.md`: stop a dev backend by pid (the backend was still listening right after `kill <cli pid>` in round 2: kill both pids, check the port); `ps -eo ... --ppid` is a union, use `ps -o ... --ppid` or `pgrep -P`; the black-box image-run bullet gained the per-round name prefix and the `--memory` emulation. (The `CONTINUUM_KOTLIN_LS_HOME` corrections were already in the page.)
- `.claude/knowledge/graph.json`: suite node docs updated (groups, env, round 2 results); new nodes `lsp-capabilities-lib`, `lsp-stdio-lib`, `kotlin-settings-seed` (the seed contract and the BOM NIT) and `diagnostics-nudge-version-collision` (the ST-11 finding with cause, check and fix options), with 5 edges; `lsp-backend-bridge` and `kotlin-ls-packaging` docs gained the round 2 facts. Validated: valid JSON, 51 nodes, 65 edges, unique kebab-case ids, every edge endpoint defined.
- `.claude/knowledge/change-log.md`: one line for Round 2.

---

## Round 3

Date 2026-11-28 (after 01:20 IST). Short retest of `03-backend-dev.md` "Round 6 — fix round 2": ST-11 (the first edit after the bridge's diagnostics nudge was ignored) and ST-12 (a byte-order mark in `settings.json` made the seeding give up). Everything below ran against the changed code: the dev bundle `lib/backend/main.js` (workbench build #4, 2026-11-28 01:11:22) and a production image rebuilt from the working tree (same sources); nothing is marked "not verified against changed code".

**Verdict: PASS. ST-11 and ST-12 are fixed and verified; no check fails and there is no new product finding.** The first edit after the nudge (document version 2) now clears the stale markers and a completion sees the new text at every open offset (+0 … +1500 ms after the ready notice), on the dev bundle and in the image; a new check shows that a mistake typed as the very first edit gets its red marker at the typed line 0.3-0.5 s later. The seed script accepts a leading BOM (exit 0, valid file afterwards) on the host and in the image, including through the entrypoint. One environment finding that is **not** a product defect (ST-13): the local Docker tag `projectcontinuum/continuum-workbench:0.0.16` was overwritten at 01:06 IST by a local build of the working tree, so it is no longer a pre-feature baseline; the image driver now SKIPs its baseline comparisons for such a baseline, and I took the baseline from the registry by digest.

Counts (Round 2 in brackets): dev bundle 63 passed / 0 failed / 3 skipped of 66 checks (61 / 1 / 3 of 65); dev exhaustion regression 6 / 0 (6 / 0); image driver, default groups, 49 / 0 / 1 of 50 (42 / 1 / 1 of 44), of which the bridge suite inside the offline image as uid 1000 65 / 0 / 1 of 66 plus 1 passed in the root pass (63 / 1 / 1 of 65 plus 1). The skips: the dev run skips `offline` (it has network; the image run covers it), `packaging` (image only) and `exhaustion` (opt-in, run separately); the image run skips `exhaustion` (opt-in) and the server `--version` (the pinned server has no such option).

### Environment

| Item | Value |
|---|---|
| Dev target | my own workbench instance on `:3010` (not `:3005`, which is the frontend tester's; it was never touched): from `continuum-workbench/continuum-workbench`, `bash -ic 'sdk use java 21.0.11-tem && … ./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3010'` with `THEIA_CONFIG_DIR` and `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` in fresh temp dirs, `CONTINUUM_LANGUAGE_SERVER_IDLE_TIMEOUT_SECONDS=15`, the config dir seeded first with `scripts/seed-kotlin-settings.js`, the output redirected into a log file, and **no** `CONTINUUM_KOTLIN_LS_HOME`. Backend pid 1797276 (child of CLI pid 1796718). `lib/backend/main.js` is 166,716 bytes, 2026-11-28 01:11:22, and has 5 lines that mention `nextServerVersion`. I did not rebuild or touch `lib/`, `src-gen/` or `plugins/`. Server: fwcd kotlin-language-server 1.3.13 on the host JDK 21.0.11-tem. No platform stack. |
| Production image | `kotlin-lsp-systest-r3-workbench:r3`, id `d82b9ded7039`, built fresh by me from `continuum-workbench/Dockerfile` of the working tree with a clean staged context (3.2 MB, 369 files; the Round 2 image had been removed). `docker build` exited 0 after **1 min 54 s** (the Kotlin download and jlink layers were cached; `yarn install` 49 s, `turbo build` 24 s). Size 4,794,791,656 bytes = 4573 MiB. Inside: `/app/lib/backend/main.js` is 166,716 bytes with the same 5 `nextServerVersion` lines as the dev bundle (the hash was not compared), `/opt/continuum/seed-kotlin-settings.js` has the BOM strip, the bundled `java -version` is 21.0.13.1. |
| Baseline (pre-feature release) | the registry's `projectcontinuum/continuum-workbench@sha256:2c44cb8ab9d1388683fc060e8013e207c77e4ee7e28b5456273a481bc5570716` (amd64, 16 layers, 1,018 MB compressed, 4,378,995,222 bytes), pulled by digest in 1 min 40 s (this does not touch the local tag) and tagged `kotlin-lsp-systest-r3-baseline:0.0.16`. Confirmed pre-feature: no `/opt/continuum/seed-kotlin-settings.js`, an entrypoint without the seeding. Why not the local tag: ST-13. |
| How the image was run | as in Round 2: `docker run --network none --user 1000:1000` (the suite copied in and run inside as uid 1000, plus a root pass for `/app`), memory from the cgroup files; only the unlimited container in Round 3 (the 1 GiB / 2 GiB and exhaustion runs were not repeated, see NOT VERIFIED). |
| Host | unchanged from Round 2 (Linux, 16 cores, 59 GB, Docker 29.10.0, Node 24, JDK 21.0.11-tem). |
| Not needed / not run | k6 (plain Node client), the platform stack, a browser (frontend tester). |

### The items: Round 3 against Round 2

| # | Item | Round 2 | Round 3 | Evidence |
|---|---|---|---|---|
| 1 | **ST-11:** the first edit after the nudge is applied | **FAIL (MINOR)**: `coldwindow` 8/9; 4 `Reached end of file before reaching char 29` lines per run in the server log | **PASS (fixed)**: `ONLY=coldwindow` 9/9 with the Round 2 suite unchanged; 10/10 with the new typed-error check, in the full dev run and in the image | A script opened +0, 150, 400, 490, 510, 700 and 1500 ms after a cold server became ready gets its diagnostics, its first edit (document version 2) clears them, and a completion at the end of the new text offers `length`: at all 7 offsets, on dev and in the image (image: diagnostics 828 ms after the open at +0, 81-296 ms at the others; three scripts opened while the server starts get theirs 876-877 ms after ready). **New check:** a clean two-line script is open while the cold server starts, and after the nudge the first edit (version 2) appends `val oops: Int = "typed"`: a severity-1 `Type mismatch: inferred type is String but Int was expected` at 0-based line 2, column 16, 506 ms after the edit on dev and 306 ms in the image, with no error above it. The image's server log has 0 `Reached end of file` lines. The first-edit check was already a hard assertion in Round 2 (`dropped.length === 0`; it failed), so nothing had to be hardened. |
| 2 | **ST-12:** a BOM in `settings.json` | **NIT**: the seed script exited 1 and left the file alone (a measurement only) | **PASS (fixed)** | Host, the new `seedscript` group 4/4: BOM + plain JSON: exit 0, the mark is gone, valid JSON, the user's keys kept, the seeded keys right, the first-run marker written, no `.tmp` left, no backup; BOM + commented file: merged, the backup (86 bytes) is identical to the original including the mark; a file holding only a BOM counts as empty and gets the defaults; BOM + broken JSON: exit 1, the file byte-identical, no marker. In the image, `seed` 14/14 including three BOM checks (direct plain-JSON, commented with identical backup bytes, and end to end through the entrypoint on a volume: the backend answers, the file is valid and mark-free, no `could not seed`). The Round 2 "(measurement)" check is now three normal checks. |
| 3 | Regression: the whole dev bridge suite | 61 / 1 / 3 of 65 | **63 / 0 / 3 of 66** | lifecycle 11/11, coldwindow 10/10, handshake 3/3, diagnostics 13/13, documents 7/7, security 12/12, leak 1/1, memory 3/3, protocol 3/3; skipped: offline (this run has network), packaging (image only), exhaustion (opt-in). |
| 4 | Regression: memory exhaustion on the dev bundle (the restart replay now carries server-side versions) | 6 / 0 | **PASS 6 / 0** | The 11th open script fails (`-32803` after 30.0 s, RSS 903 MB); the replacement starts 51 s after the first failed answer and serves 86 s after it (the clients see `starting` then `ready`); a 60 s soak of edits on all 11 scripts: 46/46 completions served, 0 further restarts; a fresh script is served in 35 ms once the scripts are closed. |
| 5 | Image rebuilt; the driver's default groups | 42 / 1 / 1 of 44 | **49 / 0 / 1 of 50**, exit 0 | image 10 (+1 skip), download 2, launcher 3, seedscript 4, seed 14, asis 16; the skip is the server `--version`. The first run, with the local tag as baseline, had one failure, a baseline artefact (ST-13), not a product failure; see the runs table. |
| 6 | `asis`: the bridge suite inside the offline image as uid 1000 | 63 / 1 / 1 of 65, root 1/1 | **65 / 0 / 1 of 66, root 1/1** | `--network none`, only `lo`. lifecycle 11, coldwindow 10, handshake 3, offline 1, diagnostics 13, packaging 1, documents 7, security 12, leak 2, memory 3, protocol 3; the skip is `exhaustion` (opt-in). The container was not OOM-killed and the backend kept running. The server's error log has 0 `OutOfMemoryError` and 1 `InvocationTargetException` / `NotImplementedError` (the known `completionItem/resolve` without a URI). |
| 7 | Image size | 4,794,793,272 bytes | 4,794,791,656 bytes (−1,616) | The fix touches only the bundled backend and the seed script. Against the genuine release see "Image size" below. |

### AC coverage

Check names are those printed by the suites (`suites/api/kotlin-lsp-bridge.mjs`, group in brackets; `suites/api/kotlin-lsp-image.mjs` for the image). The Round 2 table lists them in full; Round 3 additions are in Appendix C.

| AC | Check(s) | File | Result |
|---|---|---|---|
| AC-5 clean script has no diagnostics (server side) | [diagnostics] ×13 (the documented clean script publishes no diagnostics at all; type error at the user's line and column; error below leading imports; fixing clears the markers; completions for `flow.` 18, `row.` 75, `"abc".le` 75; hover; signature help; Java-module classes resolve; `initialize` promises only served features); [coldwindow] ×10 incl. the new typed-error check; image `launcher` ×3 | bridge + image | **PASS: dev 13/13 and 10/10, image 13/13 and 10/10 (offline, uid 1000).** The Round 2 caveat (the first edit after the nudge ignored) is gone. |
| AC-13 works with no outbound network | image driver `asis` (network mode `none`, only `lo`, the precondition check "this environment has no outbound network", the whole bridge suite with `--offline`); `seed` (offline start, backend answers after 0.6-0.7 s); `launcher` | image + bridge | **PASS** (Round 2: PASS except ST-11). The dev bundle was not run with the network blocked (the image run covers it). |
| AC-14 RSS within the documented cap; started with `-Xmx` | [memory] ×3; [exhaustion] ×6 (opt-in, dev) | bridge + image | **PASS**: argv `-Xmx512m -XX:+UseSerialGC -XX:ReservedCodeCacheSize=64m -XX:MaxMetaspaceSize=192m` in every server process, the replacement included; one editor and five editors stayed under the 1000 MB restart ceiling with no restart (table below). |
| AC-15 (runtime side) | [security] "a connection for an unknown or malformed language id is refused" (7 ids) | bridge | **PASS** for what is visible from outside (only `kotlin-script` is registered). The dummy second language (zero edits to generic code) is unit-level: **NOT VERIFIED** as a system check. |
| AC-16 bridge security | [handshake] ×3, [security] ×12, [documents] ×7, [leak] ×1 (dev) / ×2 (image), [protocol] ×3 | bridge | **PASS** (dev and image, offline), unchanged. Every isolation check is paired with an owner-can-read check. |
| AC-17 one lazy shared server, idle stop | [lifecycle] ×11, [coldwindow] ×10 | bridge | **PASS** on dev and in the image: 0 processes before the first editor, one process for any number of editors, the same pid on reconnect, idle stop at the 15 s test timeout (not before), a fresh pid on the next connection, and documents opened while a cold or restarted server starts get their diagnostics. The production-default 600 s idle run was not repeated (Round 2: 600.4 s). |
| AC-20 production image | image driver `image` ×10 (+1 skip), `download` ×2, `launcher` ×3, `seedscript` ×4, `seed` ×14 | image | **PASS**, except the server `--version`: **NOT VERIFIED** (the pinned 1.3.13 has no such option). The image starts like the pre-feature release (entrypoint, command, working directory, user and ports identical; environment added: `CONTINUUM_KOTLIN_LS_HOME=/opt/continuum/kotlin-ls`, `CONTINUUM_JAVA_HOME=/opt/continuum/kotlin-ls/jre`, `MAVEN_REPOSITORY=/opt/continuum/kotlin-ls/m2`) and `entrypoint.sh` differs from the release's only by the seeding lines (removed 0, added a comment and the `node /opt/continuum/seed-kotlin-settings.js` line with its "could not seed" fallback), which is exactly the 3 lines `git diff HEAD -- entrypoint.sh` shows in `continuum-workbench`. Both comparisons ran against the genuine release by digest. |

**AC-14 measurements** (kernel high-water mark in brackets; the ceiling is 1000 MB; Round 2 in the last column):

| Target | One editor: 2 s after a cold start / when the edits began / peak | Five editors | Margin below the ceiling | Whole container, sampled peak | Round 2 |
|---|---|---|---|---|---|
| Dev bundle (host JDK) | not recorded / not recorded / **941 MB** (946) | 947 MB | 59 MB (6 %) | n/a | peak 931-935, five 937-942 MB (6-7 %) |
| Image, unlimited container | 524 / 860 / **862 MB** (861) | 858 MB | 138 MB (14 %), five editors 142 MB | 972 MB (anonymous 959); cgroup `memory.peak` 998 MB including page cache; not OOM-killed; the run took 255.5 s | 720-810 / 858-883 / 866-884 MB; five 868-885; container 979-995 MB |

**Exhaustion** (opt-in group; dev bundle only in Round 3; Round 2 in brackets):

| Target | Failing open script | First failed answer | Replacement starts | Serving again | Server RSS peak, original / replacement | Soak after the replacement |
|---|---|---|---|---|---|---|
| Dev bundle | 11th (11th) | `-32803` after 30.0 s, RSS 903 MB (871 MB) | 51 s after the first failed answer (51 s) | 86 s after it (86 s) | 920 / **975 MB** (kernel HWM 975) (905 / 968) | 60 s: 46/46 completions on 11 scripts, 0 further restarts (180 s: 133/133); a fresh script served in 35 ms (34 ms) |

**Image size** (`docker image inspect` `.Size`; files by `du -sm`):

| Image | Bytes | MiB |
|---|---|---|
| Genuine release 0.0.16 (digest `sha256:2c44cb8a…`) | 4,378,995,222 | 4176 |
| Round 2 image | 4,794,793,272 | 4573 |
| Round 3 image | 4,794,791,656 | 4573 |

The Kotlin support costs **+415,796,434 bytes (+415.8 MB, +9.5 %)** against the genuine release by `.Size`, but only **+231 MiB by files**: `/app` 1467 → 1482 MiB (+15, the plugin folder 5 → 9), `/opt/continuum` 1 → 152 (+151: the server, its runtime and the standard library), `/opt/claude-home` +26, `/usr/local/lib/node_modules` +27, `/root` +12. The last three (+65 MiB) are claude CLI/SDK layers that the rebuild refreshed and have nothing to do with Kotlin, so the Kotlin support itself is about 166 MiB of files. `docker history` agrees with the file level (Kotlin download layer +91, jlink runtime copy +61, `/app/continuum-workbench` +9, `node_modules` +5, claude SDK +39, claude CLI +26 MiB). The remaining gap between `.Size` (+415.8 MB) and the file sums (+231 MiB = 242 MB) is **not explained** (not investigated further).

### Results by run

| Run | Target and setup | Result |
|---|---|---|
| Dev cold window (the ST-11 repro) | `:3010`, `ONLY=coldwindow`, the Round 2 suite unchanged | 9 passed, 0 failed: the first edit at version 2 cleared the markers and the completion saw the edit at all 7 offsets |
| Dev full | `:3010`, all default groups, `BACKEND_PID`, `IDLE_TIMEOUT_SECONDS=15`, `LEAK_PROBE_DIR` = the backend's cwd | 63 passed, 0 failed, 3 skipped, 66 checks |
| Dev exhaustion and soak | `ONLY=exhaustion EXHAUSTION_SOAK_SECONDS=60` | 6 passed (replacement 51 s after the first failed answer, 46/46 completions in the soak, 0 further restarts) |
| Host seed script (ST-12) | image driver, `ONLY=seedscript` (runs the source copy of the script on temp dirs) | 4 passed |
| Image, default groups, first run | local tag `projectcontinuum/continuum-workbench:0.0.16` as `BASELINE_IMAGE` | 48 passed, **1 failed**, 1 skipped of 50: "the entrypoint script differs from the baseline only by seeding" printed "removed 0 line(s); added: nothing". A test-environment artefact (ST-13), not a product failure |
| Image, guard proof | `ONLY=image`, baseline = the overwritten local tag | 8 passed, 0 failed, 3 skipped (the two baseline comparisons, NOT VERIFIED with the reason, and `--version`) |
| Image static, genuine baseline | `ONLY=image`, baseline = `kotlin-lsp-systest-r3-baseline:0.0.16` | 10 passed, 0 failed, 1 skipped, 11 checks |
| Image, default groups, final | baseline = the genuine release | **49 passed, 0 failed, 1 skipped, 50 checks, exit 0**; `asis` = the bridge suite 65 / 0 / 1 of 66 plus root pass 1/1 |

### Failures and findings

No check fails in Round 3. ST-n are this report's ids; the BE task is the one the fix belongs to.

#### ST-11 — MINOR — BE-3 — **FIXED, verified** (item 1)
The bridge now gives every document a strictly increasing server-side version (`OpenDocument.serverVersion` and `nextServerVersion()` in `OpenDocuments.ts`, used for every forwarded `didOpen` and `didChange`, the restart replay and the nudge; the client's own version is only recorded). Verified on the dev bundle and in the image by the sweep of seven open offsets, the new typed-error check, the exhaustion replay (a replaced server still applies edits) and the image's server log without `Reached end of file`. The effect in the real browser is NOT VERIFIED (the frontend tester's scope).

#### ST-12 — NIT — BE-6 — **FIXED, verified** (item 2)
`parseSettings` strips a leading U+FEFF before parsing; the rewritten file has no mark.

#### ST-13 — environment hazard, not a product defect — the local tag `projectcontinuum/continuum-workbench:0.0.16` is a Kotlin-bearing local build, not the release
- **Observed:** `docker image inspect projectcontinuum/continuum-workbench:0.0.16` gives id `4686500514ad…`, created 2026-11-28 01:06:40 +05:30, 5,471,324,431 bytes; `docker history` shows the Kotlin server and jlink layers, the seed script, `ENV MAVEN_REPOSITORY` and `ENV CONTINUUM_KOTLIN_LS_HOME`. The registry's release (digest `sha256:2c44cb8a…`) is 4,378,995,222 bytes and has none of that. I did not create or touch that tag (my images carry my own names). In Rounds 1-2 the tag still had the pre-feature entrypoint, so the baseline comparisons passed, but its size already did not match the release (the Round 1 driver message read "Kotlin adds -357 MB"), so it probably was a local build then too.
- **Effects:** (1) My driver's two baseline comparisons ran against a Kotlin-bearing image in the first Round 3 run and one failed (above). Fixed in the test: `hasKotlinSupport` (in `lib/image-probe.mjs`) makes the driver SKIP both comparisons, NOT VERIFIED with the reason, when the baseline already carries `CONTINUUM_KOTLIN_LS_HOME`, and the genuine release is pulled by digest. (2) `continuum-system-tests/docker/docker-compose.yml` line 391 pins `projectcontinuum/continuum-workbench:0.0.16` for the stack's workbench service. By compose's default pull policy (`missing`) a `make up` would start that local build under the release's name, so other suites would silently test a different image (inferred, **not run**). (3) Any "0.0.16 against now" comparison, in release notes or by another tester, is meaningless while the tag points at it. A stopped container `continuum-workbench` (image `d4ecb8593986`, exited 7 hours ago) is not from this tag.
- **Not done:** I did not retag, remove or re-pull it: it is not mine, and whoever built it may rely on it. See the plain-language summary.

#### Observations (not defects; the Round 2 observations that were re-measured or are still open)
1. **A replaced server is as loaded as the one it replaces.** Dev: the replacement peaked at 975 MB RSS (kernel high-water mark 975 MB), 25 MB under the 1000 MB ceiling that would restart it again (Round 2: 968 MB, 32 MB; back-off 1 s doubling, at most 3 restarts). No second restart in the 60 s soak. The image's replacement peaks were 820-869 MB in Round 2 (not re-run).
2. **The outage window is unchanged:** about 86 s from the first failed answer to a serving server (replacement after 51 s), with `-32803` answers and no state change meanwhile.
3. The image's server error log shows only what the probes cause: 1 × `InvocationTargetException` / `NotImplementedError` (`completionItem/resolve` without a URI passes the guard and fails inside the server with -32603; unchanged), 0 `OutOfMemoryError`, no `Reached end of file`.
4. Unchanged and not re-checked in Round 3: the log-hygiene note on `ClientMessageGuard` (source reading only), pod memory with two servers (arithmetic, not measured) and the modules outside the 19 (`jdk.httpserver` unresolved in the image by design).

### Round 2 findings: status now

| Id | Round 2 | Round 3 |
|---|---|---|
| ST-11 MINOR | the first edit after the nudge is ignored | **Fixed** (item 1) |
| ST-12 NIT | a BOM in `settings.json` makes the seeding give up | **Fixed** (item 2) |
| ST-7 MINOR | a second document opened within ~20 ms drops the first one's diagnostics (upstream fwcd, steady state) | not re-measured |
| ST-9 NIT | the default workspaces folder is wiped at start, so two same-uid backends collide | unchanged; I still set `CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR` per instance |
| ST-10 NIT | final `USER root` (identical to 0.0.16) | unchanged |
| ST-13 ENV | the local tag `0.0.16` is a Kotlin-bearing local build | **new**, test-side fix, product unaffected |

### Files changed

| File | Change |
|---|---|
| `suites/api/kotlin-lsp-bridge.mjs` | new check `typedErrorWhileStarting` (a mistake typed as the first edit while the cold server starts), run in `coldwindow` after the several-documents check; header |
| `suites/api/kotlin-lsp-image.mjs` | the BOM "(measurement)" in `seed` replaced by three normal checks (direct plain-JSON, commented with identical backup bytes, end to end through the entrypoint on a volume; the suite writes the BOM fixtures itself); new host-run group `seedscript` (4 checks); a baseline guard (both baseline comparisons SKIP, NOT VERIFIED, when the baseline already has the Kotlin support); header (`BASELINE_IMAGE` must be a release from before the feature: pull it by digest and tag it under your own name) |
| `lib/image-probe.mjs`, `test/image-probe.test.js` | `hasKotlinSupport(image)` and one test |
| `README.md`, `AGENTS.md` | my rows only (bridge and image suites, groups, `BASELINE_IMAGE`); the frontend tester's rows were re-read before editing and left intact |
| `.claude/knowledge/{workbench.md,graph.json,change-log.md}` | see Knowledge updates |

`npm test` now runs 171 tests (Round 2: 170). No production code was changed.

### Commands run

| Command | Result |
|---|---|
| `npm test` and `npm run check` (continuum-system-tests), after the last test-file edit | 171 tests passed; exit 0 |
| dev backend: `bash -ic 'sdk use java 21.0.11-tem && cd continuum-workbench/continuum-workbench && THEIA_CONFIG_DIR=<tmp> CONTINUUM_LANGUAGE_SERVER_WORKSPACES_DIR=<tmp> CONTINUUM_LANGUAGE_SERVER_IDLE_TIMEOUT_SECONDS=15 ./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3010'` (output into a file) | backend ready on `:3010` (backend pid 1797276, CLI pid 1796718); stopped at the end by pid |
| `WORKBENCH_URL=http://127.0.0.1:3010 BACKEND_PID=1797276 IDLE_TIMEOUT_SECONDS=15 LEAK_PROBE_DIR=<backend cwd> ONLY=coldwindow node suites/api/kotlin-lsp-bridge.mjs` (the Round 2 suite unchanged) | 9 passed, 0 failed |
| the same without `ONLY` | 63 passed, 0 failed, 3 skipped (66 checks) |
| `… ONLY=exhaustion EXHAUSTION_SOAK_SECONDS=60 …` | 6 passed |
| `NAME_PREFIX=kotlin-lsp-systest-r3 IMAGE=kotlin-lsp-systest-r3-workbench:r3 ONLY=seedscript node suites/api/kotlin-lsp-image.mjs` | 4 passed (host-run group) |
| stage the context from `continuum-workbench/`: `git ls-files -co --exclude-standard -z` piped into `rsync -a --from0 --files-from=- --ignore-missing-args ./ <ctx>/`; then `docker build -t kotlin-lsp-systest-r3-workbench:r3 <ctx>` | exit 0 after 1 min 54 s, id `d82b9ded7039`, 4,794,791,656 bytes |
| `NAME_PREFIX=kotlin-lsp-systest-r3 IMAGE=kotlin-lsp-systest-r3-workbench:r3 BASELINE_IMAGE=projectcontinuum/continuum-workbench:0.0.16 node suites/api/kotlin-lsp-image.mjs` (the local tag as baseline) | 48 passed, 1 failed (ST-13), 1 skipped of 50 |
| `docker pull projectcontinuum/continuum-workbench@sha256:2c44cb8ab9d1388683fc060e8013e207c77e4ee7e28b5456273a481bc5570716`, then `docker tag` it as `kotlin-lsp-systest-r3-baseline:0.0.16` | 1 min 40 s; pre-feature confirmed (no seed script, entrypoint without the seeding), 4,378,995,222 bytes |
| `… BASELINE_IMAGE=projectcontinuum/continuum-workbench:0.0.16 ONLY=image …` (guard proof against the overwritten tag) | 8 passed, 0 failed, 3 skipped |
| `… BASELINE_IMAGE=kotlin-lsp-systest-r3-baseline:0.0.16 ONLY=image …` | 10 passed, 0 failed, 1 skipped (11 checks) |
| `… BASELINE_IMAGE=kotlin-lsp-systest-r3-baseline:0.0.16 node suites/api/kotlin-lsp-image.mjs` (default groups, final) | 49 passed, 0 failed, 1 skipped (50 checks), exit 0; `asis` 65 / 0 / 1 of 66 plus root 1/1 |
| `git diff HEAD -- entrypoint.sh` in `continuum-workbench` | exactly the 3 seeding lines (comment, seed command, blank line) |
| cleanup | the `:3010` workbench stopped by pid (CLI 1796718, backend 1797276), `:3010` free, `:3005` (frontend tester, pid 1790243) untouched and still listening; `docker rmi kotlin-lsp-systest-r3-workbench:r3 kotlin-lsp-systest-r3-baseline:0.0.16` and the digest reference I pulled (`projectcontinuum/continuum-workbench@sha256:2c44…`); no `kotlin-lsp-systest-*` image, container or volume remains; the foreign `projectcontinuum/continuum-workbench:0.0.16` (`4686500514ad`), `:0.0.14` and the exited platform containers were not touched; scratch dirs under `/tmp/kotlin-lsp-systest-r3-*` removed; no `systestleak*` file in the backend's cwd; no Kotlin JVM of mine left |

### NOT VERIFIED

- Server `--version`: the pinned server has no such option (see AC-20).
- The ST-11 effect in the real browser (the first keystroke after a (re)start) and what the status chip shows during the ~86 s exhaustion window: the frontend tester's scope.
- The dev backend's own log could not be grepped for the ST-11 signature (the tool returns only the first ~4 KB of an attached shell's output; later runs redirect the log into a file). The evidence for the log signature comes from the image's `docker logs` (0 `Reached end of file` lines); on the dev bundle the behavioural checks are the evidence.
- Not re-run in Round 3 (not requested; the fix changes only version numbers and the seed script, so the Round 2 results stand): the image in 1 GiB and 2 GiB pod-like containers, the image exhaustion run, the production-default 600 s idle stop.
- ST-7 (a second document opened within ~20 ms in steady state): not re-measured.
- A real pod (PVC, the cluster manager's limits, other containers' memory); both servers (bridge and file-editor extension) in one pod (arithmetic only).
- The `.kt` / `.kts` extension route at run time (plugin host, its own server): needs a browser, the frontend tester's suite covers it.
- `yarn start` seeding at run time (it writes the real `~/.continuum`).
- AC-15's dummy second language as a system check (unit-level only); `$/cancelRequest` reaching the server after a timeout (not visible from outside).
- Whether a `make up` stack would really start the overwritten `0.0.16` tag (inferred from compose's default pull policy, not run), and who built it and why.
- The remaining gap between the image's `.Size` and the file-level sizes (see "Image size").
- The dev bundle with the network blocked (replaced by the image run).

### Plain-language summary (for a user decision)

1. **The two small defects from the last round are fixed and checked.** The first keystroke after the language server starts or restarts is now analysed (it used to be thrown away in each editor that was already open, so a red marker or a completion could be stale for one keystroke), and a settings file saved with a byte-order mark no longer stops the Kotlin file-editor setup. The checks that showed the problems now pass on a developer build and in the production image, offline. Nothing to decide.
2. **A local Docker image has been replaced under the release's name.** The local image `projectcontinuum/continuum-workbench:0.0.16` is, since 01:06 today, a build of the current working tree with the Kotlin support (5.5 GB), not the 0.0.16 release (4.4 GB). It matters because the system tests' own stack (`continuum-system-tests/docker/docker-compose.yml`) starts its workbench from that name, so a stack started now would run the new build and other tests would not be testing the release (not run, inferred), and because any "before and after" size comparison against 0.0.16 is meaningless. I did not touch it. Options: leave it if it is deliberate and give local builds their own tag from now on (for example `0.0.17-local`), or restore the release (`docker rmi projectcontinuum/continuum-workbench:0.0.16`, then `docker pull projectcontinuum/continuum-workbench:0.0.16`, about 1 GB to download).
3. **For the record, the image size.** Against the real 0.0.16 release the Kotlin support makes the production image about 416 MB bigger (4.38 to 4.79 GB, +9.5 %). About 166 MiB of that is the Kotlin server, its Java runtime, the standard library and the editor extension; 65 MiB are unrelated assistant-tool layers that the rebuild refreshed; the rest of the difference I cannot explain. Nothing to decide unless a release note quotes a size.
4. **Unchanged from the last round, no decision needed:** on a developer machine a replaced server (after running out of memory) peaks at 975 MB of the 1000 MB at which it would be restarted again; the image stays well below.

### Knowledge updates

- `.claude/knowledge/workbench.md`: section "Testing the bridge from outside" brought up to round 3: the second-backend recipe on `:3010` (redirect the backend output into a file, seed the config dir first), the image-runs bullet (the baseline-tag pitfall with the genuine release's digest, the compose line that pins the same tag, the `hasKotlinSupport` guard, the groups including `seedscript`, run durations, the round 3 build time and size), ST-11 and ST-12 turned into FIXED and verified with the numbers, the image-size analysis (+415.8 MB by `.Size`, +231 MiB by files, the Kotlin support about 166 MiB, the gap not explained), the replacement peak 975 MB, and 171 unit tests.
- `.claude/knowledge/dev-environment.md`: the black-box image-run bullet gained the "a local image tag is not proof of a release" pitfall (compare id/created/size and `docker history`; pull the release by digest and tag it under your own name).
- `.claude/knowledge/graph.json`: suite node docs updated (round 3 counts, the new group, the guard), the ST-11 node marked verified (with the numbers), the seed node marked verified (BOM cases), the edge text for the seed group, and a new node `workbench-image-baseline-tag-pitfall` with an edge from `kotlin-lsp-image-suite`. Validated: valid JSON, 52 nodes, 66 edges, unique kebab-case ids, every edge endpoint defined.
- `.claude/knowledge/change-log.md`: one line for Round 3.

---

## Appendix A — check list of the Round 1 dev run (`:3006`, all default groups)

| Group | Check | Result |
|---|---|---|
| lifecycle | no server process before the first editor connects | PASS |
| lifecycle | one server for several editors that connect at the same instant (started lazily, reported starting then ready) | PASS |
| lifecycle | a document opened while the server is still starting gets its diagnostics once the server is ready | **FAIL** (ST-2) |
| lifecycle | a later editor reuses the running server (same process, ready at once) | PASS |
| lifecycle | closing editors keeps the server for the editors that remain | PASS |
| lifecycle | the server is not stopped the moment the last editor closes | PASS |
| lifecycle | a reconnect inside the idle window reuses the server (idle stop cancelled) | PASS |
| lifecycle | a vanished client lets the server stop after the 15 s idle timeout, not before | PASS |
| lifecycle | the next connection after an idle stop starts a new server (lazily) | PASS |
| lifecycle | a document opened while the restarted server is starting gets its diagnostics once ready | **FAIL** (ST-2) |
| lifecycle | an orderly close lets the server stop after the 15 s idle timeout | PASS |
| handshake | a client with the connection-token cookie completes the Theia handshake and the bridge channel opens | PASS |
| handshake | a WebSocket upgrade without the connection-token cookie is refused | PASS |
| handshake | a WebSocket upgrade with a foreign Origin is refused | PASS |
| offline | the run has no outbound network | SKIP (image run covers it) |
| diagnostics | initialize is answered by the bridge: full-text sync, server capabilities for the allowed features | PASS |
| diagnostics | a type error is published at the user's line and column (the hidden header does not shift it) | PASS |
| diagnostics | an error below leading imports is reported at the user's line (header goes after the imports) | PASS |
| diagnostics | the documented clean script is analysed and publishes no diagnostics at all | PASS |
| diagnostics | fixing the error clears the markers | PASS |
| diagnostics | typing `flow.` offers get, set and all | PASS |
| diagnostics | typing `row.` offers the members of Map<String, Any> | PASS |
| diagnostics | the Kotlin standard library resolves (`"abc".le` offers String.length and the stdlib's let) | PASS |
| diagnostics | hovering `flow.set` shows its signature and KDoc | PASS |
| diagnostics | signature help appears after `flow.set(` | PASS |
| packaging | the server and its runtime run from the bundled install directory | SKIP (image only; PASS in the image) |
| documents | the owner of a document can read it | PASS |
| documents | another connection cannot open or read a document the first one has open | PASS |
| documents | diagnostics of one connection's documents never reach another connection | PASS |
| documents | closing a document releases it: another connection can then open it | PASS |
| documents | a connection that vanishes releases its documents | PASS |
| documents | a full-text didChange is applied; an incremental (range) change is refused | PASS |
| documents | at most 50 documents per connection; the 51st is refused | PASS |
| security | a connection for an unknown or malformed language id is refused (7 ids) | PASS |
| security | a request on the connection's own virtual document is served (non-vacuous isolation) | PASS |
| security | requests naming a file: path or a malformed document URI are refused with -32602 (19 spellings) | PASS |
| security | didOpen of a file: or malformed URI is dropped: no analysis, no diagnostics | PASS |
| security | a document URI hidden in other parameters is refused too (nested `uri` / `*Uri` keys) | PASS |
| security | methods outside the documented set are refused with -32602 (10) | PASS |
| security | notifications that could widen the server's reach are dropped silently | PASS |
| security | a client cannot widen the roots through initialize | PASS |
| security | didOpen with another language id and a message for a never-opened document are refused | PASS |
| security | malformed JSON-RPC is ignored; the connection and the backend keep working | PASS |
| security | shutdown and exit from one client do not stop the shared server | PASS |
| security | the server runs inside its private directory, which holds only the seeded declarations | PASS |
| leak | a Kotlin file in the backend's workspace folder is invisible to the server | PASS |
| memory | the server process is started with -Xmx512m (and the other JVM limits) | PASS |
| memory | one editor: resident memory stays below the 1000 MB restart ceiling, no restart, every answer served | PASS |
| memory | 5 editors at once: every completion served, memory below the ceiling, no restart | PASS |
| exhaustion | a server whose heap is full is replaced or recovers | SKIP (opt-in; run separately: 2 pass, 1 FAIL, ST-3) |
| protocol | only state notices, diagnostics and responses reached the clients | PASS |
| protocol | the server's own file: paths and private directory never reach a client | PASS |
| protocol | the server never sends a request to a client | PASS |

---

## Appendix B — checks added or changed in Round 2 (dev `:3009` and image, offline)

| Group | Check | Dev | Image |
|---|---|---|---|
| lifecycle | a document opened while the server is still starting gets its diagnostics once the server is ready | PASS (was FAIL) | PASS |
| lifecycle | a document opened while the restarted server is starting gets its diagnostics once ready | PASS (was FAIL) | PASS |
| coldwindow | a script opened 0 / 150 / 400 / 490 / 510 / 700 / 1500 ms after a cold server became ready gets its diagnostics (7 checks) | PASS | PASS |
| coldwindow | 3 scripts opened one after another while a cold server is still starting all get their diagnostics (within 10 s of ready) | PASS (all at +877 ms) | PASS (+864 ms) |
| coldwindow | the first edit after the bridge re-sent the open documents is applied by the server | **FAIL** (ST-11) | **FAIL** (ST-11) |
| diagnostics | the documented clean script is analysed and publishes no diagnostics at all | PASS | PASS (was FAIL) |
| diagnostics | the Kotlin standard library resolves (`"abc".le`) | PASS | PASS (was FAIL; 75 items) |
| diagnostics | classes of the Java modules a script can reasonably use resolve (java.net.http, java.sql, java.rmi, javax.tools, org.ietf.jgss): no unresolved reference | PASS | PASS (ST-5 fixed) |
| diagnostics | a class of a module the image's reduced runtime does not ship (com.sun.net.httpserver, module jdk.httpserver) (measurement) | resolved | unresolved (by design) |
| diagnostics | initialize promises only features the bridge serves: every promised method is answered (not refused) on an owned document | PASS | PASS |
| exhaustion (opt-in) | how many scripts can be open at once (measurement) | 11th fails | 16th (unlimited), 13th (1 and 2 GiB) |
| exhaustion (opt-in) | a server whose heap is full is replaced by the bridge while the editors stay open (a starting state follows the first failed answer) | PASS (was FAIL) | PASS (was FAIL) |
| exhaustion (opt-in) | the exhaustion ends in a defined state, not a silent hang | PASS | PASS |
| exhaustion (opt-in) | the replaced server keeps up while the editors keep typing (180 s of edits on the open scripts) | PASS (133/133) | PASS (147/147, 1 GiB) |
| exhaustion (opt-in) | after the scripts are closed a working server answers again (within 5 s on a fresh script) | PASS (34 ms) | PASS (310 ms) |
| exhaustion (opt-in) | every server process of the run was started with -Xmx512m and stayed below the 1000 MB restart ceiling | PASS (905 / 968 MB) | PASS (808 / 820 MB, 1 GiB) |
| image | the Java runtime is reduced (jlink) but complete for the server: 19 modules, no JDK compiler module, no javac, no other Java on the PATH | n/a | PASS |
| image | those modules export the packages that need them | n/a | PASS |
| image | the Kotlin standard library is installed in a Maven-layout repository (the server's own jar), `MAVEN_REPOSITORY` points at it, the launcher is installed and executable | n/a | PASS |
| launcher | the launcher, started with a minimal environment and no network, speaks LSP over stdio; through it `"abc".le` completes with `length` and `let`; control: the server's own start script gives 1 item | n/a | PASS ×3 |
| seed | contract and edge cases (defaults, user keys kept, JSONC merged, backup once, repeatable, unparsable left unchanged, container still serves; BOM measurement) | n/a | PASS ×12 |
| pod-limit | 1 GiB and 2 GiB containers: diagnostics, memory, exhaustion, not OOM-killed | n/a | PASS (16, and 8 with the soak) |

---

## Appendix C — checks added or changed in Round 3 (dev `:3010` and image, offline)

| Group | Check | Dev | Image |
|---|---|---|---|
| coldwindow | the first edit after the bridge re-sent the open documents is applied by the server (document version 2; diagnostics update and a completion sees the new text) | PASS (was FAIL, ST-11) | PASS (was FAIL) |
| coldwindow | **new:** a mistake typed as the first edit while the cold server starts (a clean two-line script open, version 2 appends `val oops: Int = "typed"`) is reported as a severity-1 diagnostic at the typed line (0-based line 2, column 16), no error above it | PASS (506 ms after the edit) | PASS (306 ms) |
| seedscript (host-run, image driver) | **new group, 4 checks:** BOM + plain JSON (exit 0, mark gone, user keys kept, marker, no `.tmp`); BOM + commented file (merged, the backup keeps the original bytes including the mark); a file that holds only a BOM (treated as empty); BOM + broken JSON (exit 1, file byte-identical, no marker) | PASS ×4 | n/a (host) |
| seed | the "settings file saved with a UTF-8 byte-order mark (measurement)" check replaced by three normal checks: direct plain-JSON BOM, BOM + commented with identical backup bytes, end to end through the entrypoint on a volume | n/a | PASS ×3 (seed 14/14) |
| image | the two baseline comparisons (starts like the baseline; entrypoint differs only by the seeding) SKIP, NOT VERIFIED with the reason, when the baseline image already carries `CONTINUUM_KOTLIN_LS_HOME` (`hasKotlinSupport`) | n/a | PASS against the genuine release; the SKIP proven against the overwritten local tag |
