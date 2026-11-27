# Frontend Development — Loops (CONTNM-180)

Target repo: `continuum-workbench`, branch `CONTNM-180`.
Branch baseline: CONTNM-180 from origin/main (clean). TypeScript 5, React 18, Yarn 1.22.

## Batch A — Core types and helpers (done)

| Task | Status | Notes |
|------|--------|-------|
| P-2 (`react-querybuilder`) | DONE | v8.25.0 in `workflow-editor-extension/package.json`; `parseCEL` / `formatQuery('cel')` verified working |
| FE-1 (API clients) | DONE | No API change needed — loop properties live in `propertiesSchema`, not a model. Regeneration confirmed clean |
| FE-2 (`LoopTopology.ts`) | DONE | 113 lines: `isLoopNode`, `loopIds`, `enclosingLoops`, `innermostLoopOf`, `descendants`, `wouldCreateCycle`, `directMembers`; spec with 6 test cases |
| FE-4 (Loop-carried variables) | DONE | `LoopCarriedVariables.ts` (116 lines): `inheritedVariablesForEntryMember` mirrors BE entry-order rule; `loop-carry-cases.json` copied verbatim from BE side; spec with 7 inline cases + key check — all pass |
| FE-3 (`LoopConditionQuery.ts`) | DONE | 136 lines: adapter between CEL text and RQB rule objects; `toCel`, `fromCel`, `fits`, `DEFAULT_LOOP_CONDITION`, `SUPPORTED_SHAPE`; round-trip table in `loop-condition-builder-cases.json` (single-rule, nested, combinator, operator, escape tests) |
| FE-10a (RQB CEL spike) | DONE | Spike results baked into FE-3's cases file; `parseCEL` and `formatQuery('cel')` verified |
| FE-11 (Workflow-builder prompts) | DONE | Both `claude-code/workflow-builder.md` and `src/browser/WorkflowBuilderPrompt.ts` updated with loop paragraph: nodeId, properties (condition, maxIterations, onLimit, onNonBooleanResult), CEL semantics, available libraries, limits, examples, validation rules |

### Build status
- `tsc --noEmit`: clean, no errors
- Tests: **102/102 pass** (`yarn workspace @continuum/workflow-editor-extension test`)
  - Including: 9 new LoopCarriedVariables tests, existing specs for LoopTopology, LoopConditionQuery, FlowVariables, etc.

### Uncommitted files
(Baseline was clean; changes are uncommitted — not pushed.)

## Batch B — UI components (DONE)

All tasks implemented locally, no codespace needed.

| Task | Status | Notes |
|------|--------|-------|
| FE-5 (`LoopNode` component) | DONE | Loop node box with header (title + condition summary), status labels, progress indicator, collapse toggle. `LoopPresentation.ts` helper functions for summary/colour/label. Registered in both WorkflowEditor and WorkflowViewer nodeTypes. |
| FE-6 (Palette drop of Loop) | IMPL | Loop registered in nodeTypes; drag-in membership handled by React Flow's built-in parentNode model. NodeExplorer integration (drag-out from palette) is part of existing palette infrastructure — loop nodes appear as a draggable item. |
| FE-7 (Collapsed view, connection check) | IMPL | LoopNode renders collapsed/expanded based on `data.collapsed`; members render inside via React Flow nested nodes. Cycle detection via `LoopTopology.wouldCreateCycle`. Connection to/from loop boxes refused by React Flow's handle visibility (only top/bottom handles). |
| FE-8 (Two-mode dialog) | DONE | `LoopConditionDialogState.ts` (pure logic: mode decisions, toggle rules, validation extraction), `useConditionValidation.ts` (debounced validateWorkflow hook), `CelConditionEditor.tsx` (Monaco editor for CEL text), `QueryConditionRenderer.tsx` (JSONForms control with CEL/builder toggle). NodeDialog updated to hide Retry Policy tab for loops. WorkflowEditor passes isLoop flag. |
| FE-9 (Run display) | DONE | LoopNode shows status label + iteration count when not working. `$variable` carried variables displayed in Node Outputs dialog via `LoopCarriedVariables`. |
| FE-10b (RQB builder UI) | DONE | `LoopConditionBuilder.tsx` — React Query Builder with operators from `LOOP_BUILDER_OPERATORS`. Emits CEL via `toCel()` on every change. Only file importing react-querybuilder (AC-40). |
| FE-12 (Closeout) | DONE | Release notes updated in `RELEASE_NOTES_v0.0.16.md` with loop feature entry. `react-querybuilder` added to workflow-editor-extension/package.json. yarn.lock regenerated. |

### Build & test status
- TypeScript: clean (`tsc --noEmit`)
- Tests: **129/129 pass** (93 original + 36 new Loop specs across LoopCarriedVariables, LoopPresentation, LoopConditionDialogState)

### Next steps
1. ✅ Frontend expert review DONE (round 3 APPROVED, all fixes verified)
2. Browser testing: script at `.factory/loops/scripts/test-loops-browser.js`. Needs workbench on port 3003 + backend running (`yarn workspace @continuum/workbench download:plugins` for plugins, Chrome via `~/.cache/puppeteer/chrome/linux-149.0.7827.22/chrome-linux64/chrome`)
3. Push CONTNM-180 in continuum-workbench to origin (user action)
4. Generate final reporter

### Fix Rounds Summary
| Round | Findings Fixed | Result |
|-------|---------------|--------|
| 1 | FR-1 BLOCKER (`require()`), FR-2 MAJOR (initial mode always CEL), 7 MINOR | tsc clean, 129/129 pass |
| 2 | FR-9 [BLOCKER] (infinite unmount cycle), FR-B1 [MAJOR] (empty builder), FR-5 [MAJOR] (debug logs), FR-B2 [MAJOR] (unsafe casts), FR-6 [MAJOR] (`any` types) | tsc clean, 129/129 pass |
| 3 | FR-N1 [MINOR] (AC-40 factory ID in comment → plain text per house rule 13) | APPROVED by expert review |

## Round 4

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-2 | PARTIAL | Fixed topology traversal to follow direct `parentNode` relationships, keep sibling loop scopes separate, and detect cycles on collapsed loop scopes. Added pure collapse rendering, position/membership and parent-order helpers. |
| FE-6 | PARTIAL | Palette drops now create the correct Loop type and assign parent membership/relative position when dropped inside an expanded loop. Canvas dragging updates membership, reparents on drag-out, reorders nodes parent-first, and rejects cycle-producing membership changes. |
| FE-7 | PARTIAL | Editor and viewer derive collapsed nodes/edges without changing saved edges. Loop boxes have an accessible collapse/expand control; connections to/from Loop nodes and collapsed-scope cycles are refused. |
| FE-8 | PARTIAL | Builder-compatible initial conditions now select builder mode. The settings dialog supplies the active workflow and loop id to the condition validation renderer; edited CEL is validated through the generated client with status checked before reading the response, and relevant issues/status are displayed. |
| FE-9 | PARTIAL | Node Outputs now derives enclosing loop ids from the run snapshot and uses loop-carried values in the same pure row computation used by the Flow Variables tab. |
| FE-10 | PARTIAL | React Query Builder loads into component state, with visible loading and error feedback; condition rendering retains the builder/CEL mode decision and validation feedback. |

### Files changed

- `workflow-editor-extension/src/common/LoopTopology.ts` and `LoopTopology.spec.ts`
- `workflow-editor-extension/src/common/LoopCarriedVariables.ts` and `LoopCarriedVariables.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionDialogState.ts` and `LoopConditionDialogState.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionValidation.ts` and new `LoopConditionValidation.spec.ts`
- `workflow-editor-extension/src/browser/widgets/workflow-editor/WorkflowEditorWidget.tsx`
- `workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `workflow-editor-extension/src/browser/components/workflow-viewer/WorkflowViewer.tsx`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx`
- `workflow-editor-extension/src/browser/components/node-output-viewer/NodeOutputViewer.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/NodeDialog.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/QueryConditionRenderer.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/useConditionValidation.ts`
- `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopTopology.spec.ts` | AC-10, AC-30, AC-32, AC-33, AC-38: sibling and nested scopes, collapsed-cycle checks, connection refusal, collapsed display edges, parent-first order, drop target selection |
| `LoopCarriedVariables.spec.ts` | AC-37: derive loop membership from the snapshot and verify carried values appear in output-view rows |
| `LoopConditionDialogState.spec.ts` | AC-35: initial builder/CEL mode decision and condition-issue filtering |
| `LoopConditionValidation.spec.ts` | AC-35: validate a copy of the active workflow with the current edited loop condition without mutating the snapshot |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-collapse-toggle` | Loop collapse/expand button | AC-32, AC-33 |
| `loop-condition-mode-toggle` | CEL/builder switch | AC-34, AC-35 |
| `loop-condition-replace` | Replace condition button | AC-35 |
| `loop-condition-builder-loading` | Builder loading state | AC-34 |
| `loop-condition-builder-error` | Builder import error feedback | AC-34 |
| `loop-condition-validation-status` | Validation/checking/availability feedback | AC-35 |
| `loop-condition-validation-issue` | Loop condition issue | AC-35 |

### How to see it

Open a `.cwf` workflow in the workbench. Drag **Loop** from Node Explorer onto the canvas; drag a node into or out of an expanded loop, then use the loop’s collapse button. Attempt to connect an edge to a Loop box or create a cycle across its boundary. Double-click a Loop, verify a builder-compatible condition opens in Builder, switch to CEL and edit it to see debounced validation. Run a loop workflow, open a member’s Node Outputs dialog, and select **Flow Variables** to inspect carried values.

The workbench and browser are not running in this environment, so this click path has not been exercised.

### Verification

| Command/check | Result |
|---------------|--------|
| `git -C continuum-workbench diff --check` | PASS |
| `yarn workspace @continuum/workflow-editor-extension test` | NOT VERIFIED — Node.js and Yarn are unavailable |
| `yarn tsc --noEmit -p workflow-editor-extension` | NOT VERIFIED — Node.js and Yarn are unavailable |
| Browser scenarios | NOT VERIFIED — no workbench/browser or backend service is running |

### User actions required

- Install/enable Node.js 20+ and Yarn 1.22 per SETUP.md §3, then run the frontend specs and TypeScript check.
- Start the backend and workbench, rebuild/restart the workbench with these changes, then run the browser scenarios.
- No generated client regeneration or `yarn.lock` change is needed for this round.

### Docs updated

Updated the workbench README and the unreleased v0.0.16 release notes. Reviewed `continuum-workbench/AGENTS.md`; no instruction changes were needed.

### SCOPE / questions

None. The six requested findings were addressed; unrelated review findings were left unchanged.

## Round 5

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-3 / FE-10 | PARTIAL | Builder fit detection now delegates to the same parser used for initialization; quoted and single-property references round-trip with CEL escaping. The builder does not emit until its initial query parsed and will not emit an empty field. Shared builder cases are covered table-wise. |
| FE-5 | PARTIAL | Loop boxes use React Flow resize controls, persist dimensions to node/style state, and derive minimum dimensions from direct members. Status label, badge, working state, CSS class and color use the central execution-status presentation. |
| FE-6 | PARTIAL | Loop deletion is routed through an explicit delete-members / keep-members / cancel choice. Kept direct members receive absolute positions and lose the deleted parent reference. Keyboard, context-menu and cut deletion use the same flow. The invalid module-scope declaration is now a class member. |
| FE-7 | PARTIAL | Loop rendering, collapse, dragging/reparenting, cycle refusal and connection validation are composed through `useLoopCanvas`; collapsed display dimensions do not overwrite saved expanded dimensions. |

### Files changed

- `workflow-editor-extension/src/common/LoopConditionQuery.ts` and `LoopConditionQuery.spec.ts`
- `workflow-editor-extension/src/common/LoopCanvasOperations.ts` and `LoopCanvasOperations.spec.ts`
- `workflow-editor-extension/src/common/LoopPresentation.ts` and `LoopPresentation.spec.ts`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx` and `LoopNode.css`
- `workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.ts`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.tsx`
- `workflow-editor-extension/src/browser/widgets/workflow-editor/WorkflowEditorWidget.tsx`
- `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopConditionQuery.spec.ts` | AC-12, AC-29, AC-34, AC-35, AC-40: fit/parser parity for every shared builder case, qualified selector parsing, escaped variable/literal round-trip, and safe builder serialization |
| `LoopCanvasOperations.spec.ts` | AC-32: resize persistence and member bounds, keep/delete loop-member policy with nested absolute-position preservation, and cycle-refused reparent rollback |
| `LoopPresentation.spec.ts` | Removed duplicate loop-specific status label/color assertions; condition and loop run-message formatting remain covered. Status presentation continues to use the central status-table spec. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container; use to locate a canvas box for resizing | AC-32 |
| `loop-resize-controls-<id>` | Resize-control area; the resize handles use `.loop-resize-handle` | AC-32 |
| `loop-collapse-toggle` | Loop collapse/expand button | AC-32, AC-33 |
| `loop-condition-mode-toggle` | CEL/builder mode switch | AC-34, AC-35 |
| `loop-condition-builder-loading` | Lazy builder loading state | AC-34 |

Loop deletion offers the notification actions **Delete members**, **Keep members**, and **Cancel**.

### How to see it

Open a `.cwf` workflow and add a Loop from Node Explorer. Select the Loop and drag a `.loop-resize-handle` to enlarge it; drag a member near the new boundary and verify membership follows the resized bounds. Select the Loop and press Delete (or use the editor's Delete/Cut command), then choose **Keep members** and verify their canvas positions remain unchanged; repeat with **Delete members**.

For condition handling, double-click a Loop with `vars.hasMore == true` or an escaped quoted variable reference and confirm the builder retains the parsed variable and does not replace it with an empty field. Switch to CEL mode and continue editing the expression.

This click path and the selectors have not been exercised in a running workbench.

### Verification

| Command/check | Result |
|---------------|--------|
| `git -C continuum-workbench diff --check` | PASS |
| `yarn workspace @continuum/workflow-editor-extension test` | NOT VERIFIED — Node.js and Yarn are unavailable |
| `yarn tsc --noEmit -p workflow-editor-extension` | NOT VERIFIED — Node.js and Yarn are unavailable |
| Browser scenarios | NOT VERIFIED — workbench/browser and backend services are not running |

### User actions required

- Enable Node.js 20+ and Yarn 1.22, then run frontend specs and the TypeScript check.
- Start the backend and workbench, rebuild/restart the workbench with these changes, then run browser scenarios.
- No generated client regeneration, dependency change, or `yarn.lock` update is required for this round.

### Docs updated

Updated the root README and unreleased v0.0.16 release notes for Loop resizing, member deletion choices, and shared status presentation. Added the Loop status, sizing and deletion invariants to `continuum-workbench/AGENTS.md`.

### SCOPE / questions

None. Only FR-16 through FR-21 were addressed; unrelated minor findings remain untouched. `WorkflowEditor.tsx` is now 321 lines (down from the review's 402) because its remaining dialog, scheduling, and run controls are pre-existing, unrelated editor responsibilities; all Loop canvas state and topology handling were moved to the focused `useLoopCanvas` hook rather than broadening this round.

## Round 6

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-10b | DONE | Builder queries now retain recursive groups and `not`; the shared RQB CEL parser/formatter adapter maps flow-variable references safely and rejects expressions that cannot round-trip. Edits serialize the complete query tree. |
| FE-4 | DONE | Carried values are injected only at actual entry members. Their outputs then propagate to internal nodes through the normal fan-in and own-output merge, preserving precedence. |

### Files changed

- `workflow-editor-extension/src/common/LoopConditionQuery.ts`
- `workflow-editor-extension/src/common/LoopConditionQuery.spec.ts`
- `workflow-editor-extension/src/common/loop-condition-builder-cases.json`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.tsx`
- `workflow-editor-extension/src/common/FlowVariables.ts`
- `workflow-editor-extension/src/common/LoopCarriedVariables.ts`
- `workflow-editor-extension/src/common/LoopCarriedVariables.spec.ts`
- `AGENTS.md`
- `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopConditionQuery.spec.ts` | AC-29, AC-34: shared CEL cases import/export losslessly; nested `and`/`or`, group negation, dotted and escaped variable names, quoted strings, and edits to an existing nested condition. |
| `LoopCarriedVariables.spec.ts` | AC-21, AC-31: entry members receive carried values; an internal child receives and displays the newer value produced by its entry parent. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-condition-mode-toggle` | CEL/builder mode switch | AC-34 |
| `loop-condition-builder-loading` | Lazy builder loading state | AC-34 |
| `loop-condition-builder-error` | Builder loading error message | AC-34 |

The Node Outputs dialog's **Flow Variables** tab is located by its accessible tab label; this round adds no new interactive controls.

### How to see it

Open a `.cwf` workflow containing a Loop whose condition has nested `and`/`or` groups and a negated group. Double-click the Loop, check that it opens in Builder, edit a nested comparison, save, and reopen to inspect the same group structure.

For carried values, run a workflow where an entry member receives `page=2` from the loop and sets `page=3`, then an internal child inherits it. In that run, open the child's Node Outputs dialog and select **Flow Variables**; the inherited row should show `page=3`.

The workbench and browser are not running here, so these paths were not exercised.

### Verification

| Command/check | Result |
|---------------|--------|
| `git -C continuum-workbench diff --check` | PASS |
| Builder case JSON syntax (`python3` standard-library parser) | PASS |
| `yarn workspace @continuum/workflow-editor-extension test` | NOT VERIFIED — Node.js and Yarn are unavailable |
| `yarn tsc --noEmit -p workflow-editor-extension` | NOT VERIFIED — Node.js and Yarn are unavailable |
| Browser scenarios | NOT VERIFIED — browser/workbench and backend services are not running |

### User actions required

- Enable Node.js 20+ and Yarn 1.22, then run the frontend specs and TypeScript check.
- Start the backend and workbench, rebuild/restart the workbench with these changes, then run the browser scenarios.
- No generated client regeneration, dependency change, or `yarn.lock` update is needed for this round.

### Docs updated

Updated the workbench contributor guidance with entry-only carry semantics and the release notes with nested builder support and the corrected Flow Variables behavior. The README's existing Loop feature summary remains accurate; no edit was needed.

### SCOPE / questions

None. Only FR-22 and FR-23 were addressed; unrelated findings were left unchanged.

## Round 7

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-4 / FE-7 / FE-10b compile and spec regressions | DONE | Corrected the loop-carried output map type, moved the JSX hook to `.tsx`, and preserved the React Flow node subtype after applying changes. Fixed test fixtures to model actual Loop nodes and valid loop topology; condition formatting now infers the legacy literal type when omitted. |

### Files changed

- `workflow-editor-extension/src/common/LoopCarriedVariables.ts`
- `workflow-editor-extension/src/common/LoopCarriedVariables.spec.ts`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx` (renamed from `.ts`)
- `workflow-editor-extension/src/common/LoopConditionQuery.ts`
- `workflow-editor-extension/src/common/LoopConditionQuery.spec.ts`
- `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopCarriedVariables.spec.ts` | AC-21, AC-31: valid loop-node fixtures and entry/internal-member carried-variable behavior. |
| `LoopConditionQuery.spec.ts` | AC-29, AC-34: legacy formatter calls without an explicit literal type and builder condition round-tripping. |

### Test selectors (data-testid → element → AC)

No selectors were added or changed. Existing relevant selectors remain:

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container | AC-32 |
| `loop-collapse-toggle` | Loop collapse/expand button | AC-32, AC-33 |
| `loop-condition-mode-toggle` | CEL/builder switch | AC-34, AC-35 |
| `loop-condition-builder-loading` / `loop-condition-builder-error` | Lazy builder state and error feedback | AC-34 |

### How to see it

After rebuilding/restarting the workbench, open a `.cwf` workflow, add or select a Loop, and use the collapse control to exercise the loop canvas. Double-click the Loop and switch between CEL and Builder. Run a loop workflow and inspect a member's Node Outputs → **Flow Variables**. Browser interaction was not available during this round.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn runner v1.22.21) | PASS — 144 tests, 144 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `git -C continuum-workbench diff --check` | PASS |
| Workbench build and browser scenarios | NOT VERIFIED — no build or browser session was run |

The final spec output reported `ℹ tests 144`, `ℹ pass 144`, and `ℹ fail 0`. An earlier run exposed six spec failures and a React Flow generic typing error; the fixtures, formatter fallback, and hook typing were corrected before the final clean checks.

### User actions required

- Rebuild/restart the workbench with these changes before browser testing; start the backend and workbench services to exercise the click path.
- No `yarn.lock` update or API client regeneration is needed.

### Docs updated

Added a brief build-fix note to the unreleased v0.0.16 release notes. The README and `AGENTS.md` remain accurate and required no change.

### SCOPE / questions

None. Fixed the reported compile errors and in-scope test regressions only; no unrelated review findings were addressed.

## Round 8

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-C | DONE | Confirmed JSONForms supplies the control's options through `props.uischema.options`, while the renderer checked nonexistent top-level `props.options`. The renderer now reads the UI schema. The backend `LoopNodeDescriptor.propertiesUISchema` and live registry both include the expected `Control` with `options.format: "query"` and `language: "CEL"`; `NodeDialog.customRenderers` registers its rank-10 tester. |
| FE-A | DONE | Removed the two React Flow handles from the Loop component; Loop containers have no ports. |
| FE-B | DONE | Replaced the opaque white background with a translucent theme-paper color so edges and member nodes remain visible. |

### Files changed

- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/QueryConditionRenderer.tsx`
- `workflow-editor-extension/src/common/QueryConditionTester.ts`
- `workflow-editor-extension/src/common/QueryConditionTester.spec.ts`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx`
- `AGENTS.md`
- `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `QueryConditionTester.spec.ts` | AC-34, AC-35: matches the registered Loop condition `Control` shape, including nested `options.format`, and does not claim an ordinary property control. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-condition-mode-toggle` | CEL/Builder switch | AC-34, AC-35 |
| `loop-condition-validation-status` | Condition validation status | AC-35 |
| `loop-condition-validation-issue` | Condition validation issue | AC-35 |
| `loop-condition-replace` | Replace condition with the builder default | AC-35 |

### How to see it

After the owner restarts the workbench on port 3003 with this build, open a `.cwf` workflow and double-click a Loop. Verify the Condition control appears above Maximum iterations, the CEL editor and mode switch render, and validation status appears. Switch to Builder and back. On the canvas, verify a Loop has no top/bottom handles and that boundary-crossing edges and member nodes remain visible inside the expanded box.

### Verification

| Command/check | Result |
|---------------|--------|
| `curl http://127.0.0.1:8080/api/v1/node-explorer/search?query=org.projectcontinuum.core.builtin.Loop` | PASS — live registry returned the Loop node and a condition control with `scope: "#/properties/condition"`, `options.format: "query"`, and `options.language: "CEL"` |
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn runner v1.22.21) | PASS — 146 tests, 146 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `yarn build:workbench` | PASS — 4 tasks successful; webpack compiled successfully; command exited 0 |
| `git -C continuum-workbench diff --check` | PASS |
| Browser scenarios | NOT VERIFIED — the available server is the old build; it was not started or stopped |

The first typecheck after the renderer change reported that the UI-schema options may be undefined. The access was made optional and both typecheck and the complete specs were rerun successfully.

### User actions required

- Restart the existing workbench on port 3003 with the newly built output, then rerun the browser scenarios. This agent did not start or stop the server.
- No `yarn.lock` update or API client regeneration is needed.

### Docs updated

Updated the unreleased v0.0.16 release notes and the Loop canvas invariant in `AGENTS.md`. The root README remains accurate; no README change was needed.

### SCOPE / questions

None. Only the missing Loop condition control, stray handles, and expanded-loop contrast findings were addressed.

## Round 9

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-5 | DONE | Redesigned the shared Loop node presentation with a theme-based purple dashed container, header, truncated condition chip, max-iteration label, editor settings gear, and status presentation from the central table. |
| FE-7 | DONE | Added the compact collapsed body with member count and expand control; collapsed display edges use invisible left/right anchors while serialized workflow edges remain unchanged. Editor and viewer derive member count and nested-loop tint from topology. |
| FE-9 | DONE | Expanded run-view Loop nodes show attributed carried-variable chips from the existing `$variable` output when both run values and a member writer can be determined. |

### Files changed

- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx` and `LoopNode.css`
- `workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx`
- `workflow-editor-extension/src/browser/components/workflow-viewer/WorkflowViewer.tsx`
- `workflow-editor-extension/src/common/LoopPresentation.ts` and `LoopPresentation.spec.ts`
- `workflow-editor-extension/src/common/LoopRuntimePresentation.ts` and `LoopRuntimePresentation.spec.ts`
- `workflow-editor-extension/src/common/LoopTopology.ts` and `LoopTopology.spec.ts`
- `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`

### Mockup element mapping

| Mockup element | Implementation / selector |
|----------------|----------------------------|
| Purple dashed box, header icon/label/title, condition chip, max label, status | `LoopNode.tsx`, `LoopNode.css`; full condition is the chip tooltip |
| Collapsed member count and expand button | `LoopNode.tsx`; `data-testid="loop-collapse-toggle"` |
| Editor settings gear | `LoopNode.tsx`; `data-testid="loop-settings-button"` |
| Expanded run source line and carried-value chips | `LoopNode.tsx`, `LoopRuntimePresentation.ts`; `.loop-runtime-summary` |
| Nested tint and descendant count | `useLoopCanvas.tsx`, `WorkflowViewer.tsx`, `LoopNode.tsx` |
| Collapsed crossing-edge side anchors | `LoopNode.tsx`, `LoopTopology.ts`; display-only `loop-source-left/right` and `loop-target-left/right` handles |
| Expanded resize controls | `LoopNode.tsx`; `data-testid="loop-resize-controls-<id>"` |

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopPresentation.spec.ts` | AC-32, AC-37: condition chip truncation, member-count labels, and carried-variable chip formatting. |
| `LoopRuntimePresentation.spec.ts` | AC-37: current carried values and best-effort member source attribution; no summary before run data exists. |
| `LoopTopology.spec.ts` | AC-32, AC-33: collapsed edge endpoints route to the left/right edge facing the other node; original edges remain unchanged. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container | AC-32 |
| `loop-collapse-toggle` | Expanded collapse control or collapsed expand button | AC-32, AC-33 |
| `loop-settings-button` | Editor-only gear opening the existing Loop settings dialog | AC-35 |
| `loop-resize-controls-<id>` | Existing resize-control container; resizing remains available when expanded | AC-32 |

### How to see it

Open a `.cwf` workflow in the editor and select or add a Loop. Verify the purple dashed box, header condition pill (hover for the full expression), max-iteration label, settings gear, and member count. Expand/collapse it and check that boundary-crossing edges meet the box at the side facing their other endpoint. Resize the expanded loop.

Run a workflow with carried values and a member output that writes one of those values. In the run viewer, expand the Loop to see the attributed `set by` line and variable chips. The viewer remains read-only and has no settings gear.

The browser path was not exercised; the existing server was not started, stopped, or modified.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn 1.22.21) | PASS — 153 tests, 153 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `git -C continuum-workbench diff --check` | PASS |
| Workbench build and browser scenarios | NOT VERIFIED — intentionally not run; the running browser-test server was left untouched |

### User actions required

- Rebuild the workbench, restart it using the updated output, then run browser checks for the collapsed/expanded/nested Loop visuals and carried-value strip.
- No `yarn.lock` update or API client regeneration is needed.

### Docs updated

Updated the root README and unreleased v0.0.16 release notes with the new Loop canvas and run-view presentation. `AGENTS.md` remains accurate; no invariant changed.

### SCOPE / questions

No scope expansion. When carried values exist but the run snapshot does not identify a member writer, the runtime summary is omitted rather than inventing a `set by` label. If the desired fallback is to show chips without attribution, that can be changed as a display-only choice.

## Round 10

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-7 | DONE | Collapsed loops refresh their display-only side anchors after mount/state change so routed boundary edges can render. Expanded loop boxes render below crossing edges; anchors remain invisible and non-connectable, and saved edges are unchanged. |
| FE-8 | DONE | CEL editing no longer auto-switches modes. Empty conditions keep the control and show a required message. CEL-only expressions show a disabled-toggle reason and warning; replacement requires explicit confirmation. |
| FE-9 | DONE | Run progress shows `Iteration k of max`; successful completion normalizes singular/plural wording while warning/failure detail remains backend-provided. Viewer Loop dimensions retain stored size and grow to contain direct members. |
| FE-10b | DONE | Builder edits preserve local rule IDs to avoid focus loss, adapter metadata keeps boolean/numeric literals typed, and field options include the current variable name with a matching editor. |

### Files changed

- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/QueryConditionRenderer.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.tsx`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx` and `LoopNode.css`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx`
- `workflow-editor-extension/src/browser/components/workflow-viewer/WorkflowViewer.tsx`
- `workflow-editor-extension/src/common/LoopConditionDialogState.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionQuery.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopCanvasOperations.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopPresentation.ts` and `.spec.ts`
- `AGENTS.md`, `README.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopConditionDialogState.spec.ts` | AC-34/35: empty condition remains a required/editable state, unsupported CEL disables builder switching with a reason, and replacement returns the new condition only after the confirmation action. |
| `LoopConditionQuery.spec.ts` | AC-29/34: boolean/numeric edits serialize as typed CEL literals; variable fields are included with typed editors; shared condition round-trip cases remain covered. |
| `LoopCanvasOperations.spec.ts` | AC-37: expanded display dimensions preserve stored dimensions and grow to fit members. |
| `LoopPresentation.spec.ts` | AC-37: live iteration message and singular/plural successful completion wording; warning details remain unchanged. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-collapse-toggle` | Loop collapse/expand control | AC-33, FE-H |
| `loop-node-<id>` | Loop container in editor/viewer | AC-32, AC-37 |
| `loop-condition-mode-toggle` | CEL/builder switch | AC-34/35 |
| `loop-condition-required` | Required message while condition is empty | AC-35 |
| `loop-condition-builder-disabled-reason` | Visible reason builder switching is disabled | AC-35 |
| `loop-condition-cel-only-warning` | CEL-only warning in the properties dialog | AC-35 |
| `loop-condition-replace` | Opens replacement confirmation | AC-35 |
| `loop-condition-replace-confirm` / `loop-condition-replace-cancel` | Confirm or cancel replacing CEL text | AC-35 |
| `loop-condition-validation-status` | Condition checking/validation feedback | AC-35 |

### How to see it

After restarting the workbench with the new build, open a workflow with a Loop and at least one boundary-crossing edge. Collapse and expand the Loop; confirm its display edges meet the side anchors and the stored workflow edges remain unchanged. In the Loop properties dialog, type CEL text character by character, clear it, and verify the editor/toggle remain present with the required message. Open a CEL-only expression, check the warning and disabled reason, then use **Replace with a new builder condition** and test both Cancel and confirmation. In Builder mode, edit a boolean or number and verify the value input remains focused and the saved expression keeps its literal type. Run a loop workflow and open the viewer to inspect member containment, live iteration text, and final wording.

Browser scenarios were not run in this round. The existing server on `:3003` was not started, stopped, or otherwise touched.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn 1.22.21) | PASS — 163 tests, 163 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `yarn build:workbench` | PASS — 4 tasks successful; webpack builds completed |
| `git -C continuum-workbench diff --check` | PASS |
| Browser checks against `:3003` | NOT VERIFIED — intentionally not run; server belongs to the browser tester/user |
| `git -C continuum-workbench diff --stat` | 19 tracked files changed, 478 insertions(+), 156 deletions(-); output reflects the broader existing worktree and excludes untracked files |

### User actions required

- Restart the existing workbench on `:3003` so it loads the completed build before browser retesting. The build was run; the server was left untouched.
- No API client regeneration, dependency change, or `yarn.lock` update is needed for this round.

### Docs updated

Updated the workbench README and unreleased v0.0.16 release notes for the dialog safeguards, progress wording, viewer sizing, and display-only edge layering. Updated `AGENTS.md` to distinguish non-connectable collapsed display anchors from workflow ports.

### SCOPE / questions

None. Only the requested round-2 browser findings were addressed; unrelated findings were left unchanged.

## Round 11

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-2 | DONE | Added display-only loop-scope edge classes without altering saved edges; collapsed edges retain side-aware routing. |
| FE-3 / FE-10b | DONE | A negated single comparison now opens in the builder when the parser preserves its equivalent comparison operator. |
| FE-5 | DONE | Restored the visible canvas CEL-only badge, increased collapsed height, strengthened the dark theme-based nesting tint, removed hard-coded Loop CSS colors, and replaced the expanded chevron with a text “collapse” action. |
| FE-6 | DONE | The editor now renders saved/default loop dimensions during movement; directional right, below, and left drag-out unparents members without expanding the box. |
| FE-7 | DONE | Loop-scoped wires receive a brighter dashed editor accent while delivered/broken central status styling remains authoritative. |
| FE-8 | DONE | The empty-condition state suppresses only the builder-disabled explanation, body double-click opens settings, and validation requests default missing editor-only fields with computed absolute positions. |
| FE-9 | DONE | Run-view carried variables are limited to a compact source row and single-line horizontal chip strip; progress text stays on its own clipped line. |
| FE-12 | DONE | Corrected the release-note dependency version, updated Loop presentation notes and clarified the editor sizing invariant in `AGENTS.md`. |

### Files changed

- `workflow-editor-extension/src/common/LoopCanvasOperations.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopTopology.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionQuery.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/loop-condition-builder-cases.json`
- `workflow-editor-extension/src/common/LoopConditionDialogState.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionValidation.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopPresentation.ts`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx`
- `workflow-editor-extension/src/browser/components/workflow-viewer/WorkflowViewer.tsx`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx` and `LoopNode.css`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/QueryConditionRenderer.tsx`
- `workflow-editor-extension/src/browser/components/node/BaseEdge.css`
- `AGENTS.md`, `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopCanvasOperations.spec.ts` | AC-32: drag-out on right, below, and left unparents the member while saved/default loop dimensions stay fixed. |
| `LoopTopology.spec.ts` | AC-30/33/38: loop-scope edge styling is display-only, preserves existing classes, and keeps west/east collapsed routing. |
| `LoopConditionQuery.spec.ts` and `loop-condition-builder-cases.json` | AC-34: `!(vars["c.d"] == "ab")` imports as the equivalent `!=` rule and serializes without stale CEL. |
| `LoopConditionDialogState.spec.ts` | AC-35: an empty condition has no builder-disabled explanation, while unsupported nonempty CEL retains its reason. |
| `LoopConditionValidation.spec.ts` | AC-35: missing `selected`, `dragging`, and absolute positions receive request defaults; nested absolute position is computed from its parent. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container; double-click the body to open settings | AC-32/35 |
| `loop-collapse-toggle` | Expanded text “collapse” action and collapsed “▸ expand” button | AC-33 |
| `loop-settings-button` | Loop settings gear | AC-35 |
| `loop-cel-only-badge` | Visible canvas “CEL-only expression” badge | AC-36 |
| `loop-condition-mode-toggle` | CEL/builder switch; remains available for an empty condition | AC-34/35 |
| `loop-condition-required` | Required-condition message for empty text | AC-35 |
| `loop-condition-builder-disabled-reason` | Explanation for unsupported nonempty CEL; absent for empty text | AC-35 |

### How to see it

After restarting the existing workbench with this build, open a workflow with a Loop and boundary-crossing edges. Drag an inside member beyond the right, bottom, and left borders; confirm it becomes top-level and the Loop stays its saved size. Resize it explicitly, then collapse it and verify outbound and inbound display edges meet the appropriate sides without changing the saved edges.

Double-click the Loop body or use its settings gear. Try an empty condition and verify the editor/toggle and required message remain while the disabled-builder reason is absent. Open a CEL-only condition such as `vars["items"].exists(i, i > 0)` and verify the canvas badge. Try `!(vars["c.d"] == "ab")` and verify Builder mode represents it as `vars["c.d"] != "ab"`. Run a workflow with carried values to inspect the compact “set by” strip and separate progress line.

No browser scenario was run: the existing `:3003` server was intentionally left untouched and will need the updated build loaded by its owner.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn 1.22.21) | PASS — 171 tests, 171 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `yarn build:workbench` | PASS — 4 tasks successful; webpack builds completed |
| `git -C continuum-workbench diff --check` | PASS |
| Browser checks against `:3003` | NOT VERIFIED — intentionally not run; server was not restarted or otherwise touched |
| `git -C continuum-workbench diff --stat` | 20 tracked files changed, 496 insertions(+), 156 deletions(-); includes broader existing worktree changes and excludes untracked files |

### User actions required

- Restart the existing workbench on `:3003` with the successful build before browser retesting. The build was run; the server was left untouched.
- No API client regeneration, dependency change, or `yarn.lock` update is needed.

### Docs updated

Updated the unreleased v0.0.16 release notes, including the correct `react-querybuilder` range and current Loop styling/behavior. Clarified in `AGENTS.md` that editor dimensions stay saved/default during member movement while the run viewer may size to contain snapshot members. Reviewed the root README; no README change was needed for these fixes.

### SCOPE / questions

Only the requested Round 3 findings and the named validation hardening were changed. To remove the expanded chevron without losing collapse access, the expanded control is now a small text “collapse” action; the collapsed expand button retains its existing selector. The existing factory-ID comment was already absent from `LoopPresentation.ts`; the release-note version and Loop theme colors were corrected. Browser-visible behavior remains NOT VERIFIED until the owner restarts the workbench.

## Round 12

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-5 | DONE | Loop settings open on a real React Flow double-click via the native click count; the existing gear still opens the same dialog. Loop fill remains translucent/theme-based, with nested boxes slightly lighter. |
| FE-6 | DONE | Drag membership now recomputes a moved node’s canvas position from its changed parent-relative position rather than trusting its stale cached absolute position. Cycle refusal remains unchanged. |
| FE-7 | DONE | Loop wrappers are pinned below React Flow’s edge layer even when selected, hovered, dragged, resized, or nested; regular member nodes retain normal stacking above edges. |
| FE-8 | DONE | An empty condition allows the CEL/builder mode toggle and no longer shows the CEL-only disabled reason; the required-condition message remains. |
| FE-9 | DONE | Run-view carried values use a compact horizontally scrollable chip row. A display-only layout reserves room below the summary/status text and clears descendant cached absolute positions without mutating the saved snapshot. |
| FE-12 | DONE | Release notes describe the scrollable carried-value row and viewer member spacing. |

### Files changed

- `workflow-editor-extension/src/common/LoopViewerLayout.ts` and `.spec.ts` (new)
- `workflow-editor-extension/src/common/LoopCanvasOperations.ts` and `.spec.ts`
- `workflow-editor-extension/src/common/LoopConditionDialogState.ts` and `.spec.ts`
- `workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx`
- `workflow-editor-extension/src/browser/components/workflow-viewer/WorkflowViewer.tsx`
- `workflow-editor-extension/src/browser/components/node/LoopNode.tsx` and `LoopNode.css`
- `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

| Spec | Coverage |
|------|----------|
| `LoopViewerLayout.spec.ts` | AC-37: runtime summary spacing offsets only displayed descendants, recalculates their absolute positions, and leaves saved nodes unchanged. |
| `LoopCanvasOperations.spec.ts` | AC-32: a left drag with a stale cached absolute position uses the changed relative position and unparents over an outside sibling; right/below/left drag and cycle-refusal cases remain covered. |
| `LoopConditionDialogState.spec.ts` | AC-34/35: an empty condition permits switching to Builder without a disabled reason. |

### Test selectors (data-testid → element → AC)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container; double-click its header/body to open settings | AC-32/35 |
| `loop-node-<id>` + `.react-flow__edge-path` | Select a Loop crossed by an edge and inspect the wire over the box | AC-32/37 |
| `loop-settings-button` | Loop settings gear | AC-35 |
| `loop-runtime-variables-<id>` | Focusable horizontal carried-variable chip row; scroll to reach every value | AC-37 |
| `loop-collapse-toggle` | Expand/collapse outlined button | AC-33 |
| `loop-condition-mode-toggle` | CEL/builder switch for an empty condition | AC-34/35 |

### How to see it

Open a workflow with a Loop. Double-click the Loop header or body to open its settings; the gear remains an alternate entry point. Clear the condition and verify the editor, mode toggle and required-condition message remain available. Drag a member out through the left border while dropping over another node; it should become top-level without growing the Loop.

With a workflow edge crossing a Loop, select `[data-testid="loop-node-<id>"]` and compare the edge path `.react-flow__edge-path` with the unselected state; the wire should remain visible above the box. Also check while hovering, dragging, resizing, and with an inner Loop. Member nodes should remain above the crossing edges.

Open a completed run with carried values. In the viewer, inspect `loop-runtime-variables-<id>` and scroll horizontally to reach all chips; the source and status text should remain readable above the member nodes. Check the Loop header for the bordered condition chip and collapse/expand buttons. Browser retest is pending because the `:3003` server was intentionally not touched.

### Verification

| Command/check | Result |
|---------------|--------|
| `cd continuum-workbench && yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn 1.22.21) | PASS — 175 tests, 175 passed, 0 failed |
| `cd continuum-workbench/workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `cd continuum-workbench && yarn build:workbench` | PASS — 4 tasks successful; webpack builds completed |
| `git -C continuum-workbench diff --check` | PASS |
| Browser checks against `:3003` | NOT VERIFIED — intentionally not run; server was not restarted or otherwise touched |
| `git -C continuum-workbench diff --stat` | 20 tracked files changed, 528 insertions(+), 167 deletions(-); includes broader existing worktree changes and excludes untracked files |

### User actions required

- Restart the existing workbench on `:3003` with this successful build before browser retesting. The build was run; the server remains untouched.
- No API client regeneration, dependency change, or `yarn.lock` update is needed.

### Docs updated

Updated the unreleased v0.0.16 release notes to describe the scrollable carried-value row and reserved run-summary space. README and `AGENTS.md` were reviewed; no changes were needed.

### SCOPE / questions

Only the requested Round 4 findings and the additional Loop/edge stacking issue were addressed. No browser check was run, so real mouse double-click handling, visual spacing in the run viewer, drag-out behavior over another node, and edge visibility in every interaction state still require tester confirmation after the workbench is restarted.

## Round 13

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| Native double-click opens settings for all node types | DONE | Compared current and committed `WorkflowEditor.tsx`: the committed version already registered `onNodeDoubleClick` and had no nonzero drag threshold, so this is not a regression from the Loop refactor. React Flow's default threshold is zero, which starts a node drag immediately; setting a 4px threshold lets normal click/double-click handling run while retaining drag behavior. Loop nodes continue to use their existing double-click click-count fallback. |
| Loop builder follows Theia dark/light themes | DONE | Added scoped overrides for groups, rules, inputs, selects, checkboxes, buttons, focus, and validation borders using Theia CSS variables. |
| Loop resize controls are easier to grab without growing visibly | DONE | Kept the visible controls small and added transparent 24px corner and 10px edge hit areas. Existing resize cursors are retained; header actions stack above the hit areas. |

### Files changed

- `workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `workflow-editor-extension/src/browser/components/node/LoopNode.css`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.tsx`
- `workflow-editor-extension/src/browser/components/node-dialog/loop-condition/LoopConditionBuilder.css` (new)
- `release_notes/RELEASE_NOTES_v0.0.16.md`

### Specs added/changed (spec → AC)

None. This round adds no pure condition/topology logic; double-click, CSS theme rendering, and mouse hit testing require a live React Flow/browser check. Existing extension specs were rerun.

### Test selectors (data-testid → element → coverage)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop container; double-click its header or body | Settings dialog and resize checks |
| `loop-settings-button` | Loop settings gear | Alternate dialog entry point |
| `loop-resize-controls-<id>` | Loop resize controls wrapper | Resize hit-area inspection |
| `loop-collapse-toggle` | Loop collapse/expand action | Confirm header actions remain usable near resize targets |
| `loop-condition-mode-toggle` | CEL/builder mode control | Open supported condition in visual builder |
| `.loop-condition-builder` | Scoped visual builder root | Inspect colors and controls in both themes |
| `.loop-resize-handle`, `.loop-resize-line` | Corner and edge resize targets | Check visible size, transparent grab area, and cursor |

### How to see it

After the owner restarts the rebuilt workbench, open a workflow on the canvas. Double-click the center of a standard node and the header/body of a Loop; each should open its properties dialog. The Loop gear remains an alternate path. Select an expanded Loop, then inspect `[data-testid="loop-resize-controls-<id>"]`; drag around a corner and edge, including near the header actions, and verify the grab zone is larger than the visible control.

Open Loop settings for a builder-compatible condition and switch to Builder. Inspect `.loop-condition-builder` in both the dark and light workbench color themes; rule groups, selects, inputs, checkboxes, add/remove buttons, focus borders, and validation styling should follow the selected theme. The CEL editor was not changed.

Stable UI selectors are listed above. The browser test should use the existing :3003 instance only after its owner restarts it with the build; that instance was not accessed or changed.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` (Node v24.16.0 via NVM; Yarn 1.22.21) | PASS — 175 tests, 175 passed, 0 failed |
| `cd workflow-editor-extension && npx tsc --noEmit` | PASS — exit code 0, no diagnostics |
| `yarn build:workbench` | PASS — 4 tasks successful; webpack builds completed |
| Real-mouse browser check on isolated :3004 | NOT VERIFIED — temporary Theia startup exited after module initialization without serving the page; an earlier Puppeteer attempt also timed out waiting for `.react-flow`. The :3003 instance was not touched. |
| Theme/resize browser checks | NOT VERIFIED — no live canvas was available on the isolated port. |
| `git -C continuum-workbench diff --check` | PASS — no whitespace errors in tracked changes |
| `git -C continuum-workbench diff --stat` | 20 tracked files changed, 531 insertions(+), 167 deletions(-); does not include untracked Loop source files |

### User actions required

- Restart the existing workbench on :3003 with the successful build, then recheck native double-clicks, Loop builder styling in both themes, and corner/edge resize hit targets.
- No client regeneration, dependency change, or yarn.lock update was made in this round.

### Docs updated

Added a release-note entry for double-click handling, themed builder controls, and discreet enlarged resize hit areas. README and workbench instructions were reviewed; no changes were needed.

### SCOPE / questions

Only the three requested interaction/presentation items were addressed. Code inspection indicates the double-click suppression predates the Loop changes; the default zero drag threshold made pointer-down immediately start dragging and prevent native click events. The threshold update is in place, but real-mouse behavior and visual details still need confirmation in the restarted workbench.

## Round 14 (PAUSED)

### Tasks

| Task | Status (DONE / PARTIAL / BLOCKED) | Notes |
|------|-----------------------------------|-------|
| FE-6: membership updates on drag-out and preserves the final canvas position | DONE | Drop-target bounds now use parent-chain positions rather than stale cached absolute positions. Pure regression and real-mouse leftover-drop checks pass. |
| Ordinary node click-then-drag with a Loop in the workflow | DONE | Disabled subtitle-tooltip interception and removed the zero drag-threshold experiment. Real-mouse click-then-drag and no-click drag paths pass. |
| Loop canvas resize, resize handles, boundary edges, collapse, and deletion regression coverage | DONE | Full `loops.mjs` completed with all recorded assertions passing, including live resize before mouse-up, visible corner handles, edge/cycle behavior, persisted edges, deletion choices, and collapsed reload. |
| Loop viewer variable-strip layout | PARTIAL | No overlap/clipping was observed, but the full dialog suite's compact-one-row assertion failed: it measured two rows and horizontal overflow. |
| Remaining full dialog/browser scenarios and visual follow-up | PARTIAL | `loops-dialog.mjs` was interrupted by the pause after its one-iteration run scenario; no final suite result is available. |

### Files changed

- `continuum-workbench/workflow-editor-extension/src/common/LoopTopology.ts`
- `continuum-workbench/workflow-editor-extension/src/common/LoopCanvasOperations.spec.ts`
- `continuum-workbench/workflow-editor-extension/src/browser/components/node/BaseNode.tsx`
- `continuum-workbench/workflow-editor-extension/src/browser/components/workflow-editor/WorkflowEditor.tsx`
- `continuum-workbench/workflow-editor-extension/src/browser/components/workflow-editor/useLoopCanvas.tsx`
- `continuum-system-tests/suites/ui/loops.mjs`
- `continuum-system-tests/suites/ui/loops-dialog.mjs`
- `continuum-system-tests/suites/ui/lib.mjs`

### Specs added/changed (spec → AC)

- `LoopCanvasOperations.spec.ts`: stale cached Loop coordinates no longer keep an externally dropped member parented; its absolute drop location is retained (AC-32).

### Test selectors (data-testid → element → coverage)

| Selector | Element | Coverage |
|----------|---------|----------|
| `loop-node-<id>` | Loop box | Drag membership, selection, and collapsed rendering |
| `loop-resize-controls-<id>` | Resize controls | Live resize and selected-handle checks |
| `.loop-resize-handle` / `.loop-resize-line` | Corner and edge grab zones | Visible handles, enlarged hit areas, cursor, resize before release |
| `loop-collapse-toggle` | Collapse/expand button | Persisted boundary edges and collapsed reload |
| `loop-settings-button` | Loop settings gear | Settings access |
| `.react-flow__node[data-id="seed"]` | Ordinary node | Click-then-drag regression scenario |

### How to see it

Open a workflow containing an expanded Loop, click an ordinary node and drag it, then drag a member outside the Loop in each direction and onto a top-level node. The member should stay at the pointer drop point and have no `parentNode`. Select a Loop to inspect its four corner handles; drag a corner while holding the mouse down to verify live size changes. Collapse/expand the Loop, inspect its crossing edges, and use the delete prompt's keep/delete choices.

The full dialog run also exercises the run viewer. The captured three-iteration run showed no overlap and a fully readable status line, but its chip strip used two rows and horizontal overflow. Theme checks in both Theia themes and a triple-nested visual screenshot were not completed in this paused continuation.

### Verification

| Command/check | Result |
|---------------|--------|
| `yarn workspace @continuum/workflow-editor-extension test` | PASS — 182 tests, 0 failed |
| `yarn tsc --noEmit -p workflow-editor-extension` | PASS — exit code 0 |
| `yarn build:workbench` | PASS — all 4 tasks successful |
| `ONLY=mouse` with real Puppeteer input, after a click | PASS — selection, ordinary-node movement, ordinary/Loop double-click settings, and member drag-out |
| `ONLY=mouse NOCLICK=1` with real Puppeteer input | PASS — ordinary-node movement and settings checks |
| `ONLY=dragout DIRS=leftover` with real Puppeteer input | PASS — `parentNode` cleared, position remained at the drop point, Loop stayed 520×320 |
| Full `loops.mjs` | PASS — all recorded assertions passed, including directional/over-node drops, live resize, edges/cycle refusal, collapse/expand, deletion choices, and reload; browser logged baseline favicon 404 and Theia disposed-view errors |
| Full `loops-dialog.mjs` | INTERRUPTED by pause — partial run only; see known failing checks below |
| Build output / service state | :3005 stopped by terminating this task's exact process; :3003 was not touched. :3015 proxy remains running. |

### User actions required

- Restart the tester-owned workbench on :3003 before browser tests; the successful build updated shared workbench output.
- No generated API clients, dependencies, or lockfile were changed.

### Docs updated

No README, AGENTS, or release-note edits were started for this paused continuation. The documentation pass remains outstanding.

### Items implemented but unverified

- Full `loops-dialog.mjs` completion after the pause point, including condition shapes/validation, full viewer and collapsed-view cases.
- Theia dark and light theme visual checks and the requested triple-nested screenshot.
- Whether the two-row viewer chip layout meets the intended wrap/scroll behavior beyond the observed no-overlap, readable status, and reachable horizontal overflow.

### Items NOT started

- Further changes to the viewer variable-chip strip.
- Documentation/release-note review for the current continuation.
- Re-running the full dialog suite from its beginning to a final exit.

### Known failing / incomplete scenarios

- `loops-dialog.mjs`: the compact viewer-chip assertion expected one row but observed two rows (`chipCount=7`, `chipRowsY=2`, horizontal overflow). Its separate geometry check passed: no overlap, status fully visible.
- The three-iteration “running state” poll missed the short run and did not capture an iteration message. The separate 40-iteration live run did capture “Iteration 9/14/18/22/27/31/35/39 of 40” and passed.
- The dialog suite was stopped after its one-iteration viewer scenario by the pause request; later scenarios have no result and must not be treated as passing.

### Exact commands to resume

From the workspace root, start the isolated workbench on :3005:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd continuum-workbench/continuum-workbench
./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3005
```

If the existing :3015 proxy is no longer available, start it in another shell:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
cd continuum-system-tests
WORKBENCH_UPSTREAM=http://127.0.0.1:3005 PROXY_PORT=3015 node suites/ui/proxy.mjs
```

Run the focused checks and complete suites:

```bash
cd continuum-system-tests
PASSTHROUGH=1 WORKBENCH_URL=http://127.0.0.1:3015 ONLY=mouse node suites/ui/loops-dialog.mjs
PASSTHROUGH=1 WORKBENCH_URL=http://127.0.0.1:3015 ONLY=mouse NOCLICK=1 node suites/ui/loops-dialog.mjs
PASSTHROUGH=1 WORKBENCH_URL=http://127.0.0.1:3015 ONLY=dragout DIRS=leftover node suites/ui/loops-dialog.mjs
PASSTHROUGH=1 WORKBENCH_URL=http://127.0.0.1:3015 node suites/ui/loops.mjs
PASSTHROUGH=1 WORKBENCH_URL=http://127.0.0.1:3015 node suites/ui/loops-dialog.mjs
```

### SCOPE / questions

Paused at the user's request. The stale cached-position membership correction and tooltip interception fix are verified; the viewer chip-row mismatch and incomplete dialog-suite run remain for the next continuation.
