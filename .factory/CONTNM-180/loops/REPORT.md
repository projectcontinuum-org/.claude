# Loops — Feature report
Date: 2026-11-27 · Status: **READY WITH OPEN ITEMS**

## Overview
Workflow authors can place nodes in a Loop and repeat them while a CEL condition on flow variables is true. The
workbench supports creating, nesting, resizing, collapsing and configuring loops, and the run viewer shows iteration
progress and member status. The backend validates and executes loops with carried variables, limits, replay-safe
condition outcomes and correct terminal statuses.  
**User story:** As a workflow author, I want nodes to repeat while a condition holds, so I can page through data, poll
for a result or retry work without duplicating nodes.

## How to use it
In the workbench, open **Node Explorer → Flow Control → Loop**, drag a Loop to the canvas, move nodes inside it,
configure its CEL condition and iteration policy, run the workflow, and inspect iteration/member results. REST workflow
JSON uses `type: "Loop"` and member `parentNode`; MCP uses member `parent`.

## What changed
| Repo | Area | Change | Key files |
|---|---|---|---|
| continuum-platform-core | Model, validation, CEL, orchestration, API/MCP, run status | Built-in Loop registration with retry/backoff, nested execution, carried variables, bounded evaluation, replay-safe outcomes and termination handling. | `continuum-commons/.../model/LoopNode.kt`; `continuum-loop-condition/...`; `continuum-orchestration-service/.../workflow/loop/` |
| continuum-workbench | Editor, settings, viewer, generated clients | Loop canvas/membership/collapse/resize, Builder/CEL dialog and validation feedback, runtime display and generated model updates. | `workflow-editor-extension/src/browser/components/node/LoopNode.tsx`; `.../useLoopCanvas.tsx`; `.../node-dialog/loop-condition/` |
| continuum-system-tests | API/UI harness | Loop API scenarios and helpers, UI scenarios, static checks and API-suite registration. | `suites/api/loops.js`; `lib/loopmodel.js`; `lib/loopscenarios.js`; `suites/ui/` |
| continuum-docs | Platform 0.0.23 “next” | Loop user, architecture and operations guidance, including workbench usage. | `docs/feature-nodes/loop.md`; `docs/architecture/loops.md`; `docs/deployment/loops-operations.md` |

### API changes
No endpoint, operationId or enum change. The existing contract documents Loop fields and semantics; the current core
OpenAPI diff is description-only.

### Documentation
`continuum-docs` targets unreleased platform `0.0.23`; no version snapshot was made. Round 2 updated the user and
operations pages. `npm run build` and `git diff --check` passed. Mermaid rendering and the Kotlin recipe compilation
remain **NOT VERIFIED**.

### Breaking changes / upgrade notes
- Failed node/loop runs are recorded as `FAILED`; clients filtering statuses should account for this.
- Deploy orchestration service, API server and message bridge together at 0.0.23; Loop registration requires schema
  registry support and a Loop-capable workbench.
- The pending terminate action is intentionally in-memory for a five-second grace period and can be lost on API-server
  restart; retry cancel/terminate after restart.

## Acceptance criteria
| AC | Criterion | Status | Evidence (test / browser / review) |
|---|---|---|---|
| AC-3, 6–7, 9–11, 13–15, 16–22, 24–25, 30, 32–38, 40, 44 | Loop contract, validation, topology, CEL, iteration, carried variables, nesting, statuses, UI and regression behavior | **VERIFIED** | Loop API 249/249; full API 448, smoke 10/10, tenancy 32/32; browser `ONLY=run` and status-contrast passed; workbench tests/build passed. |
| AC-5 | Built-in Loop registration retries after a real broker/schema outage | **VERIFIED** | Round 8 live outage: attempts 1–4 failed, then 5s/10s/20s/40s delays and attempt-5 recovery after restoration. |
| AC-23, 42–43 | History guard and bounded condition-evaluation behavior | **VERIFIED** | Focused current-source tests plus live system checks; no workflow-task failure in the exercised regression suites. |
| AC-22(e) | JSON-to-CEL collection/type behavior over the large-list shape | **NOT VERIFIED** | The live worker fixture cannot set the required list variables; unit/Temporal coverage exists. |
| AC-26, AC-27 | Explicit Temporal replay and recorded start-verdict behavior | **PARTIALLY VERIFIED** | Focused current-source Temporal tests pass, including replay/start-verdict coverage. External verification is **NOT VERIFIED**: HTTP cannot safely induce a changed evaluator/validator replay or inspect Temporal history. |
| Browser environment quality | Clean browser console/runtime environment | **PARTIALLY VERIFIED** | Loop assertions passed, but pre-existing Theia disposed-view errors and favicon 404s were observed. |

## Quality
- Unit tests: backend **904 passed**, PostgreSQL **3 passed**, system-test static/npm **77/77**, workbench **182/182 reported**.
- System tests: Loop API **249/249**, full API **448**, smoke **10/10**, tenancy **32/32**, zero isolation violations.
- Browser tests: focused run and status contrast passed with screenshots; environment noise remains.
- Reviews: backend **APPROVED**, frontend **APPROVED**; no unresolved review findings.
- Fix rounds used: backend developer through Round 12 / review Round 7; frontend review Round 10; browser Round 7;
  docs Round 2.

## Open items
- External Temporal replay/start-verdict verification remains unavailable through the public HTTP surface; do not
  represent focused tests as a black-box replay pass.
- AC-22(e)'s large collection live shape remains unverified.
- The five-second restart durability limitation is intentional and documented; no durable scheduler was added.
- Browser environment cleanup (Theia disposed-view errors and favicon 404) remains open and is unrelated to Loop
  assertions.
- Docs Mermaid rendering and Kotlin recipe compilation remain unverified.
- Cold-start Temporal behavior on a 0.5-CPU environment is a pre-existing, unrelated issue.
- The Round 7 stack was a freshly rebuilt local verification environment, not a released production deployment.

## User actions before merge
- Review and selectively commit intended changes in `continuum-platform-core`, `continuum-workbench`,
  `continuum-system-tests` and `continuum-docs`; no commit or push was made here.
- In `continuum-workbench`, keep `workflow-editor-extension/package.json` and `yarn.lock` together.
- Inspect recovered system-test helpers, machine-specific workflow edits, local hooks, UI tests and screenshots before
  selecting files.
- Run OpenAPI generation/lint only if the API contract changes; the current core diff has no schema/operation change.
- Commit/push the two docs edits on the unreleased `platform/0.0.23` branch; do not snapshot unreleased docs.
- If release evidence requires it, repeat the Temporal replay scenario inside the target deployment using an approved
  Temporal-native harness, not HTTP-only probes.

## Discrepancies
- `continuum-platform-core`: actual status is 16 modified tracked files plus one untracked PostgreSQL test; tracked
  diff stat is **235 insertions / 33 deletions** and excludes the untracked test.
- `continuum-workbench`: actual status is 21 modified tracked files plus untracked Loop UI/helper/spec files; tracked
  diff stat is **527 insertions / 169 deletions** and excludes untracked files.
- `continuum-system-tests`: actual status is 5 modified tracked files plus recovered untracked helpers, API/UI tests,
  tests and screenshots; tracked diff stat is **210 insertions / 89 deletions** and excludes untracked files.
- `continuum-docs`: actual status is exactly two modified tracked pages; tracked diff stat is **21 insertions / 5
  deletions**. Other pages listed in `09-docs.md` are already in repository history, not this current diff.
- `continuum-charts` and the feature-node, local-setup and website repositories are clean; no product changes were
  found there.
