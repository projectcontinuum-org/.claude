# State: kotlin-language-server (workbench Kotlin LSP)

- Task ID: CONTNM-180 (folder reused; previous loops feature artifacts archived in `loops/`)
- shell: bash (`bash -ic`; JDK 21 via `sdk use java 21.0.11-tem`, see local-policy)
- Phase: 4 — verify. Fix round 1 done; fix round 2 (ST-11 nudge version, ST-12 BOM) done by the backend developer (215 specs, tsc ok), build #4 done 01:11 and :3005 restarted on it (theia parent PID 1789501, backend PID 1790243, wrapper shell 1789499, log files/wb-run-4.log, config dir /tmp/continuum-theia-config.3wqLQP). Pod memory: default and Small preset 2Gi/4Gi, other presets shifted (done, 279 gradle tests). RUNNING: system tester round 3 (ST-11/ST-12 re-test), backend expert round 2, frontend expert round 2. After that: apply knowledge updates, Phase 5 docs (continuum-docs on platform/0.0.23, working tree only, no commit), Phase 6 report.
- Fix rounds: 1 done (FE-A/FE-B/language id/FR-1..4; stdlib/nudge/auto-restart/jlink/dev path/seed/capabilities; pod memory default). Fix round 2 (ST-11, BOM) done. Max 3, 2 used.
- Started: 2026-11-27

## Requirement
Add Language Server (LSP) support to continuum-workbench like the official Theia IDE has for Kotlin. User addition: it
must also work for the workflow Kotlin Script node (editing its script).

## Repo baselines
| Repo | Branch | Uncommitted |
|---|---|---|
| continuum-workbench | CONTNM-180 | 0 |
| continuum-platform-core | CONTNM-180 | 0 |
| continuum-feature-base | CONTNM-180 | 0 |
| continuum-docs | platform/0.0.23 | 0 |

## Tasks
| Task | Status |
|---|---|
| BE-1..BE-5 | DONE |
| BE-6 | DONE (round 4b + fix). Orchestrator found and had fixed: the seed script defaulted to ~/.theia but the app's config folder is ~/.continuum (package.json theia.backend.config.configurationFolder), so the image would have seeded the wrong dir; drift-guard spec added. Plugin-host run still NOT VERIFIED until the browser test. Route decided 2026-11-27: `.kt`/`.kts` files use the existing `fwcd.kotlin` 0.2.36 VS Code extension (pinned + checksummed, pointed at our bundled server/JRE); the bridge-for-files code from round 4 is removed. The user was asked and was unavailable, so the orchestrator took the spike's recommendation. Fallback to the bridge only if the browser test shows the extension does not run in Theia's plugin host. |
| FE-1 | DONE (unit level) |
| FE-2 | DONE (unit/type-check only; not built with Theia, not run in a browser) |
| FE-3 | DROPPED (extension route: nothing to build browser-side); revived only if the bridge fallback is needed |
| FE-4 | MERGED INTO PHASE 4: the testers author and run `suites/ui/kotlin-lsp.mjs` and `suites/api/kotlin-lsp-bridge.mjs` (same file names as the plan) against a live workbench; a blind draft by a developer would only be rewritten. Needs no platform stack: the dialog reads its schema from the `.cwf` node, and the bridge suite talks to the workbench backend only. |
| FE-5 | PENDING (after BE-6) |
| Frontend expert review r1 | DONE: APPROVED, 0 BLOCKER/MAJOR, 9 MINOR, 7 NIT (08-frontend-review.md). Planned for the single fix round with the tester findings: FR-1 (channel open failure never retried/reported), FR-2 (thin browser-only workbench shows 'starting' forever), FR-3 (end-of-input diagnostics swallowed by hidden closing brace), FR-4 (leading comment/@file: breaks hidden header placement). |
| Backend expert review r1 | DONE: CHANGES REQUESTED, 0 BLOCKER, 3 MAJOR, 10 MINOR, 7 NIT (07-backend-review.md). BR-1 dev default install path off by one `..` (fix). BR-2 pod memory 512Mi/1Gi default vs ~0.8-0.9 GB per server (user/product decision; docs must say real numbers). BR-3 (unconfirmed) Script dialog's `kotlin` model may activate fwcd.kotlin and start a 2nd JVM with no .kt open -> browser tester answers. BR-4/5 seed script: comments in settings.json skipped, non-atomic rewrite. Fix round 1 waits for the testers. |
| Frontend browser tester r1 | RUNNING (agent e0764614), writes suites/ui/kotlin-lsp.mjs + 06-frontend-browser-tests.md |
| Backend system tester r1 | RUNNING (agent 3cced6da), writes suites/api/kotlin-lsp-bridge.mjs + 05-backend-system-tests.md, tries the Docker image build |
| Workbench builds | #1 21:19 OK (new extension bundles; frontend chunks for both modules, vscode-jsonrpc included), #2 21:24 OK (after BE-6). Logs: session files/wb-build-{1,2}.log |

## Notes for the final knowledge update and report
- Verified 2026-11-27 from eclipse-theia/theia-ide `package.json` (root `theiaPlugins`) and `applications/browser/package.json`: the official Theia IDE bundles the VS Code built-in extensions and the Java extensions (vscjava.vscode-java-pack, vscjava.vscode-java-dependency), no Kotlin extension, and ships the Open VSX Extensions view (@theia/vsx-registry). NOT VERIFIED: that Kotlin there works by a user installing an Open VSX extension (inference from the above, not tested). My question to the user said the extension route "matches how the official Theia IDE handles Kotlin"; that is only true in the loose sense that the IDE gets language support from VS Code extensions.
- Orchestrator error for the report: at Gate 2 the generic-bridge route for files was presented as saving a second server process; the spike showed either route needs a second server. Found 2026-11-27, BE-6 put on hold, user re-asked.
- Developer questions the user has not answered yet: completion trigger characters per registration; unused-variable warnings in user code; browser reconnect / duplicate-open edge case.

## Phase 4 round 2 outcome (2026-11-28)
- Frontend browser tester r2: PASS on the real build #3, no workaround. Visible completion popup confirmed (`.claude/.screenshots/CONTNM-180/round-2/r2a-04-completion-flow-dot.png`). Script dialog alone starts exactly one Kotlin JVM (own language id works). Rest/CreateTable/Claude start none. `.kt` OK, `.kts` PARTIAL (upstream false whole-file MISSING_SCRIPT_STANDARD_TEMPLATE).
- Backend system tester r2: PASS (dev 61/1/3, image 63/1/1 offline uid 1000); image stdlib blocker fixed, +6.2 MB. One new MINOR ST-11: DiagnosticsNudge sends version+1 without recording it, so the first user edit after the nudge is ignored by the server. NIT ST-12: BOM in settings.json breaks seeding.
- Decisions taken by the orchestrator (user did not object): accept 'no marker for a missing bracket' (fwcd reports no syntax errors; node reports at run time); document script-level object/enum/interface/typealias false markers; document .kts as limited; leave JSON editors uncoloured; ignore multi-instance /tmp work dir (one instance per pod).
- User instruction 2026-11-28: raise pod minimum memory; Small tier preset must have at least 2 GB. Implemented as Small 2Gi request / 4Gi limit, ladder shifted (4Gi/8Gi, 8Gi/16Gi, 16Gi/32Gi), backend default = Small. Assumption: 'minimum' = memoryRequest. Reversible.
- Open for the report: pod memory is now a cluster-manager default, existing workbenches are unchanged; continuum-charts still sets no workbench pod memory.

## Phase 4 round 3 (2026-11-28, 01:40)
- Backend expert round 2: APPROVED (0 BLOCKER, 0 MAJOR; BR-1..BR-5 closed; 12 MINOR + 11 NIT open). Frontend expert round 2: CHANGES REQUESTED for one text-only MAJOR (release notes claimed a missing closing brace is flagged; fwcd reports no syntax errors; limits and `.kts` undocumented).
- Fix round 3 (the last one): frontend (text FR-17, retry guard FR-18, clamp FR-19, stale wording FR-22/23, spec FR-21) DONE and verified by me (220 + 192 specs, tsc ok, no factory ids in product files); backend workbench polish (seed script unreadable settings.json BR-21 + mode + java.home, guard/receive refuse hostile shapes BR-23, tautological test BR-11, assertion BR-27, release note numbers + existing workbenches BR-12, README/AGENTS BR-24/BR-20) RUNNING; cluster-manager (reject request > limit with 400, BR-22) RUNNING.
- Decisions taken by the orchestrator (user away): partial `resources` with request > limit -> 400 (CPU and memory); existing workbenches keep stored resources: document + API path, no management-UI screen (out of scope); other presets stay shifted (revertible); editor heights of Rest/Claude now honour declared `rows` (side effect of the options fix; tester to look at them); FE-C/FE-D/.kts/OBS-J documented as limits.
- Next: system tester round 3 result (running) -> one rebuild + restart :3005 -> final regression (system tester short pass, browser tester round 3 incl. removing the 32 factory ids from suites/ui/kotlin-lsp.mjs) -> apply knowledge updates -> Phase 5 docs -> Phase 6 report.

## Runtime (updated 2026-11-28 ~02:00)
- Build #5 (`yarn build:workbench`, 26 s, log `files/wb-build-5.log`) includes the whole of fix round 3 (frontend FR-17..FR-23 and backend polish BR-21/BR-23/BR-11/BR-27/BR-12/BR-24/BR-20). Workbench on :3005 restarted on the same isolated config dir: `theia start` PID 1935589, backend PID 1935604 (log `files/wb-run-5.log`, HTTP 200). The old build-#4 instance (1789501 / 1790243) was stopped by PID.
- Round 3 system test: PASS (ST-11 fixed and verified in the real server, ST-12 verified, image rebuilt and tested). Final short regression handed to the system tester (seed unreadable/dir/mode, hostile shapes over the wire) and to the browser tester (Script dialog regression on build #5, retry-guard console check, editor heights of Rest/Claude dialogs, remove factory ids from `suites/ui/kotlin-lsp.mjs`).
- Open decision from the system tester: the local Docker tag `projectcontinuum/continuum-workbench:0.0.16` holds the working-tree build (with Kotlin support, 5.5 GB) instead of the published 0.0.16 (4.4 GB); `continuum-system-tests/docker/docker-compose.yml` pins that tag. Not touched by me; goes to the report as a user action (restore with `docker rmi` + `docker pull`, or keep and use a separate local tag).
- Waiting on: cluster-manager validator (request <= limit -> 400), system tester round 4, browser tester round 3. Then: knowledge updates, docs writer, reporter, cleanup.

## Phase 5 started (2026-11-28 ~02:05)
- Cluster-manager request-above-limit validation (400) DONE: 289 cluster-manager tests pass (I re-ran offline, 0 failures; OpenAPI drift test included), release notes + OpenAPI + inventory updated. I corrected an inaccurate KDoc in `WorkbenchInputValidator.validateRequestNotAboveLimit` (Kubernetes rejects the pod template; it does not "accept at admission").
- Technical writer: launching the project agent `factory-technical-writer` (and its vscode-agent twin) failed three times with "Model 'auto' is not available" (agent definition says `model: inherit`; the session model is 'auto'). Fallback: a `general-purpose` agent (id 9f6e1c71, name docs-kotlin-lsp) that reads `.claude/agents/factory-technical-writer.md` and follows it. Same fallback will be needed for the reporter. Branch rule for continuum-docs assumed by me: working tree of `platform/0.0.23`, no new branch, no commit.
- Still running: system tester round 4 (3cced6da), browser tester round 3 (e0764614), docs writer (9f6e1c71).

## Phase 6 complete (2026-11-28 ~02:15)
- Docs writer completed Phase 5 on continuum-docs branch `platform/0.0.23` (assumed branch rule, no commit): feature-nodes/base-analytics.md updated; deployment/workbench-resources.md and architecture/language-intelligence.md added. `npm run build` PASS.
- Knowledge updated: workbench.md, architecture.md, graph.json, change-log.md. Historical 10-pod-memory-default.md now explicitly marks the first 1Gi/2Gi implementation as superseded by final 2Gi/4Gi.
- Final report: REPORT.md. It records the prior browser/system passes and explicitly marks the final visual/browser regression NOT VERIFIED because the browser and final system agents failed with temporary Copilot API DNS errors.
- Final checks: language-server-extension 228 specs + tsc; system-test helper 171 tests + syntax check; cluster-manager 289 tests; workbench build #5 and HTTP 200 on :3005. Final workbench stopped by PID and isolated config removed. No commits made.
- Status: DONE WITH OPEN ITEMS. User must run the final browser/system regression after the temporary API failure, decide whether to accept documented upstream Kotlin limits, restore/pin the Docker baseline tag, review minor/nit findings, and commit through normal merge process.
