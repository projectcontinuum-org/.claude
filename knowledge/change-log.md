# Feature history (newest first)

Append an entry after each feature. One line of what + where.

## CONTNM-180 (loops) — uncommitted at time of writing
- Workflow viewer history gauge (`historyEventCount/Limit`, green/yellow/red at 50/80 %): workbench `HistoryGauge.tsx`.
- Orchestrator publishes `historyEventCount` + `historyEventLimit` (51,200) in every `WorkflowUpdate`: `WorkflowStatusReporter`, `WorkflowUpdate.kt`.
- Loop node no longer shows flow-variable chips in its body (`LoopNode.tsx`, `WorkflowViewer.tsx`).
- `docs/architecture/flow-variables.md` documents all default flow variables.
- Read-only `iteration` flow variable for nodes in loops and loop conditions (`vars["iteration"]`).
- Kotlin Script node `flow` binding to read/set flow variables (`ScriptFlowVariables.kt`).
- CEL confirm dialog background fixed; BaseNode settings gear; collapsed loop width 300; icon-only collapse toggle;
  responsive loop header; styled resize handles.
- Loop members: loop badge, parent colour, distinct colour per nesting depth.

Open gaps: workbench condition editor/`FlowVariables.ts` unaware of `iteration`; workbench release notes v0.0.16 stale;
`LoopRuntimePresentation`/`LoopViewerLayout` helpers now unused.

## CONTNM-180 (later)
- Showcase workflow `continuum-system-tests/docker/example-workflows/iss-orbit-tracker-loop-showcase.cwf`, built with the api-server MCP tools (validate: valid, 0 warnings). Loop over CreateTable -> REST (wheretheiss.at) -> Kotlin Script (`flow.set` travelledKm); condition `vars["travelledKm"] < 100.0`, max 15, stop-with-warning. After the loop: JsonExploder -> REST reverse-geocode -> Kotlin Script report. NOT run live: deployed feature-base:0.0.10 worker may lack the Kotlin `flow` binding.
- REST and CreateTable FreeMarker templates only see `row`, not flow variables or `iteration`.
- History gauge thresholds: green <=50, yellow >50, red >80. Screenshots go to `.claude/.screenshots/` (git-ignored).
- MCP endpoint: POST http://localhost:3002/api-server/mcp (streamable HTTP, SSE-framed).
- Showcase workflow now RUN live end to end (satellite, fetch, measure x N, unpack, geocode, report all executed). Two worker bugs found and fixed in continuum-feature-base: (1) RestNodeModel had a leftover `executionContext.getCredential("credential")` that made every REST run fail and retry forever ("stuck"); removed. (2) Worker pinned kotlin-compiler-embeddable 2.2.0 but scripting jars 2.2.21 -> NoSuchMethodError in Kotlin Script; pinned all kotlin compiler/scripting artifacts to 2.2.21 in worker/build.gradle.kts. Image rebuilt (jibDockerBuild) and worker recreated locally; not committed.
- Kotlin version mismatch fix moved from feature-base into the Gradle plugin (continuum-gradle-plugin): new `continuum { kotlinVersion }` (default 2.2.21) sets `kotlin.version` so the Spring Boot BOM aligns kotlin-compiler/scripting jars. feature-base worker/build.gradle.kts workaround reverted. Verified: plugin published to mavenLocal, worker image has 2.2.21 compiler/scripting, showcase run had 0 errors. Needs a plugin release for CI/consumers.
