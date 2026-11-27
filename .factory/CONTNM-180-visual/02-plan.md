# Plan: Loop Visualization Enhancements for Continuum Workbench

## Acceptance Criteria

| ID | Criterion | Verified by |
|----|-----------|------------|
| AC-1 | Loop icon (MUI LoopIcon) visible on all Loop member nodes in top-left corner | [browser] |
| AC-2 | Loop icon appears only on direct members of Loops; NOT on nested Loop boxes themselves | [browser] |
| AC-3 | Loop icon does not overlap node title, status badge, or interactive handles | [browser] |
| AC-4 | Member nodes inherit fillOpacity color from parent Loop's nesting level (0–3) | [browser] |
| AC-5 | Nesting-level colors are visually distinguishable: level 0 (0.1) vs. level 3 (0.14) | [browser] |
| AC-6 | Member node styling works in workflow editor canvas | [browser] |
| AC-7 | Member node styling works in run viewer canvas | [browser] |
| AC-8 | Loop icon and colors survive theme switches (light ↔ dark) | [browser] |
| AC-9 | Icon is non-interactive (pointer-events: none) and purely visual | [browser] |
| AC-10 | Styling correctly maps nested Loop structure: Loop A (depth 0) → Loop B (depth 1) → node C shows depth-1 fillOpacity on node C | [browser] |

## Backend tasks

None — no API or model changes required.

## Frontend tasks

### FE-1: Add loop-membership detection hook for BaseNode
- Repo/module: `continuum-workbench/workflow-editor-extension`
- Files to create/modify:
  - `src/browser/components/node/BaseNode.tsx` (add hook usage)
  - `src/browser/hooks/useLoopMembership.ts` (new custom hook)
- Change:
  - Create `useLoopMembership(nodeId: string)` hook that:
    - Uses React Flow's `useNodes()` to access the graph
    - Calls `enclosingLoops(nodeId, { nodes, edges })` from `LoopTopology.ts` to detect parent Loop
    - Returns object with `parentLoopId: string | null`, `nestingDepth: number`, and a helper to check if a node is a Loop
    - Handles edge case: returns null for top-level nodes and nested Loop boxes (type === 'Loop')
  - Use hook in `BaseNode` to conditionally render icon and apply styling
  - Export hook for reuse in other components (e.g., run viewer variants)
- Unit tests:
  - `useLoopMembership.spec.ts`: mock React Flow `useNodes()` with various graph topologies
    - Test: node with no parent returns `null`
    - Test: node directly in Loop returns parent Loop id and depth 0
    - Test: node nested in Loop inside Loop returns depth 1
    - Test: Loop node itself returns `null` (not styled as a member)
- Docs:
  - Add hook description to `workflow-editor-extension/README.md` under "Loop Utilities"
  - Update `src/browser/hooks/README.md` to list the hook
- Depends on: —
- Covers: AC-1, AC-2, AC-10

### FE-2: Render loop icon and apply member-node styling in BaseNode
- Repo/module: `continuum-workbench/workflow-editor-extension`
- Files to create/modify:
  - `src/browser/components/node/BaseNode.tsx` (update render + use hook)
  - `src/browser/components/node/BaseNode.css` (add loop-member classes and icon styles)
- Change:
  - Update `BaseNode` component:
    - Call `useLoopMembership(id)` hook from FE-1
    - Conditionally render MUI `LoopIcon` absolutely positioned in top-left corner when `parentLoopId !== null`
    - Add `loop-member` class to `node-body` Grid when in a Loop
    - Add `loop-member-depth-${depth}` class for nesting-level styling
  - Extend `BaseNode.css`:
    - New `.loop-member` class: position relative for icon placement
    - New `.loop-member-icon` class:
      - MUI LoopIcon styles: position absolute, top-left corner (top: 2px, right: auto, left: 2px)
      - size: `fontSize: 'small'` (20px)
      - color: `var(--mui-palette-secondary-main)` with optional opacity/contrast tweak
      - `pointer-events: none` to prevent accidental interaction
      - `z-index: 10` to stay above node content
    - New `.loop-member-depth-0`, `.loop-member-depth-1`, `.loop-member-depth-2`, `.loop-member-depth-3` classes:
      - Apply `fillOpacity` as `--loop-member-bg-opacity` CSS variable
      - Apply `backgroundColor: color-mix(in srgb, var(--mui-palette-secondary-dark) calc(var(--loop-member-bg-opacity) * 100%), transparent)` using values from `LOOP_NESTING_STYLES` in `LoopPresentation.ts`
      - Ensure the background color is distinct from the node's default background but does not make text unreadable
  - For the icon element in JSX:
    - Render as `<LoopIcon className="loop-member-icon" fontSize="small" />`
    - Wrap in a `<span>` or render directly into a container with absolute positioning
- Unit tests:
  - `BaseNode.spec.ts`: 
    - Mock `useLoopMembership` to return various values
    - Test: icon renders when `parentLoopId !== null`
    - Test: icon does not render when `parentLoopId === null`
    - Test: depth classes correctly applied (0–3)
    - Test: icon element has `pointer-events: none`
- Docs:
  - Update `BaseNode` JSDoc to document the loop-member styling and icon behavior
  - Add a note in `workflow-editor-extension/README.md` Loop Canvas section: "Member nodes display a loop icon and inherit nesting-level background color"
- Depends on: FE-1 DONE
- Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-9

### FE-3: Extend run-viewer BaseNode variant (if used)
- Repo/module: `continuum-workbench/workflow-editor-extension`
- Files to create/modify:
  - `src/browser/components/workflow-viewer/WorkflowViewer.tsx` or its node renderer (check how nodes are rendered in run viewer)
  - Verify that run-viewer nodes use the same `BaseNode` component or a variant
- Change:
  - Confirm that `useLoopMembership` hook is available to run-viewer node rendering (via context or direct hook use)
  - If run viewer renders nodes differently (e.g., a separate component), apply the same loop-member styling and icon logic
  - If run viewer shares `BaseNode`, no additional work (hook and CSS are already applied)
- Unit tests:
  - Verify that run-viewer test fixtures exercise the loop-member styling path
- Docs:
  - Document run-viewer Loop styling in README if behavior differs from editor
- Depends on: FE-1 DONE, FE-2 DONE
- Covers: AC-6, AC-7

### FE-4: Theme compatibility testing and CSS refinement
- Repo/module: `continuum-workbench/workflow-editor-extension`
- Files to create/modify:
  - `src/browser/components/node/BaseNode.css` (refine colors and contrast)
  - `src/browser/components/node/BaseNode.spec.ts` (add theme-aware snapshot tests if applicable)
- Change:
  - Review the icon color and background opacity in both light and dark themes
  - Adjust `--loop-member-bg-opacity` values or fallback colors if the nesting levels are not visually distinct
  - Use MUI theme palette variables (`secondary.dark`, `secondary.main`, `background.default`) to ensure consistent styling across theme changes
  - Run workbench in both light and dark themes and visually verify the icon and colors
- Unit tests:
  - Snapshot test or visual comparison: render a 3-level nested Loop structure in light and dark themes
  - Verify that fillOpacity values result in readable text
- Docs:
  - Document theme-specific adjustments in `BaseNode.css` comments
- Depends on: FE-2 DONE
- Covers: AC-8

### FE-5: Documentation and release notes
- Repo/module: `continuum-workbench`
- Files to create/modify:
  - `release_notes/RELEASE_NOTES_v<version>.md` (new highlights entry)
  - `README.md` (update Loop section if needed)
  - `workflow-editor-extension/README.md` (update Loop utilities section)
  - `AGENTS.md` (update Loop canvas section with new styling details)
- Change:
  - Release notes entry under "Highlights":
    ```
    **Loop visualization enhancements**: Member nodes of Loop constructs now display a small loop icon in the top-left corner and inherit a subtle background color based on their parent Loop's nesting level (0–3), making nested loop structures easier to understand at a glance. The icon is non-interactive and works in both the editor canvas and run viewer.
    ```
  - README loop utilities section:
    - Mention `useLoopMembership` hook for custom node components
    - Describe the automatic icon and nesting-color styling applied to `BaseNode` members
  - AGENTS.md Loop canvas section:
    - Add: "Member nodes display a nesting-level background color (fillOpacity from `LOOP_NESTING_STYLES`) and a small LoopIcon (top-left, non-interactive). The hook `useLoopMembership` detects membership and nesting depth."
- Depends on: FE-1 DONE, FE-2 DONE, FE-3 DONE, FE-4 DONE
- Covers: all ACs (documentation)

## Dependency Graph

```
FE-1 (useLoopMembership hook)
  ↓
FE-2 (BaseNode icon + styling)
  ↓
FE-3 (run-viewer variant check)
  ↓
FE-4 (theme refinement)
  ↓
FE-5 (docs + release notes)
```

**Start order**: FE-1 can start immediately (no dependencies). FE-2, FE-3, FE-4 follow sequentially. FE-5 is last.

## Test Plan

| AC | Verifier | Test Location / Method |
|----|----------|------------------------|
| AC-1 | Frontend-tester (browser) | Manual: Open workflow editor, create Loop with 3+ member nodes. Verify loop icon (small, top-left) appears on each member. Screenshot in Light theme. |
| AC-2 | Frontend-tester (browser) | Manual: In same 3-level nested Loop, verify that Loop B (nested Loop box) does NOT show the loop icon on its border/header; only regular nodes inside show the icon. |
| AC-3 | Frontend-tester (browser) | Manual: Verify loop icon does not overlap node title text, status badge (top-right), or connection handles (left/right edges). |
| AC-4 | Frontend-tester (browser) | Manual: Zoom in on member nodes at different nesting levels. Visually inspect fillOpacity: level 0 (lightest), level 1–3 (progressively darker). Compare against LoopNode's own nesting-level background. |
| AC-5 | Frontend-tester (browser) | Manual: 4-node test: 1 node at depth 0, 1 at depth 1, 1 at depth 2, 1 at depth 3. Take screenshot and confirm colors are distinguishable (not identical). |
| AC-6 | Frontend-tester (browser) | Manual: In editor canvas, perform node drag, edge creation, and Loop collapse/expand. Verify icon and colors persist and do not break layout. |
| AC-7 | Frontend-tester (browser) | Manual: Run a workflow with Loops. Open run viewer, expand Loop(s). Verify member nodes display icon and nesting colors as in editor. |
| AC-8 | Frontend-tester (browser) | Manual: Switch workbench theme (Preferences → Theme → Light/Dark). Verify loop icon remains visible and member backgrounds are distinguishable in both themes. |
| AC-9 | Frontend-tester (browser) + Code Review | Manual: Attempt to click loop icon; verify no interaction occurs. Code: Check `.loop-member-icon` has `pointer-events: none`. |
| AC-10 | Frontend-tester (browser) + Unit tests | Unit: `useLoopMembership.spec.ts` test for 3-level nesting, verify depth value. Browser: Visually confirm node C inside Loop B (inside Loop A) has depth-1 styling (fillOpacity 0.115). |

**Unit test execution**: 
```bash
cd continuum-workbench
yarn workspace @continuum/workflow-editor-extension test
# (or) yarn test -- useLoopMembership.spec.ts BaseNode.spec.ts
```

**Browser test execution**:
```bash
# Start workbench and stack (if not running)
cd continuum-workbench
yarn start:workbench  # or already running
# (in browser) Navigate to http://localhost:3002
# (manual testing as outlined above)
```

**Screenshots location**: `.factory/CONTNM-180-visual/screenshots/` (created by frontend-tester in `06-frontend-browser-tests.md`)

## Not Verifiable Locally

- **openapi-generator missing**: Only needed if the OpenAPI spec changes; this feature does not modify any API, so regeneration is not required. Flag if the user adds an API endpoint later.
- **Chromium-family browser for real headless tests**: Puppeteer and Playwright have bundled Chromium, but `environment.md` notes no system Chromium detected. Browser tests must run with a headed browser or via CI. For now, manual visual inspection in the running workbench is the verification method.
- **Yarn.lock regeneration**: Not needed for this feature; no dependency changes.

## Changelog

### Round 1 (Planning)

- **Initial plan created**: 5 FE tasks (hook, component styling, run-viewer check, theme refinement, docs), no BE tasks
- **Acceptance criteria**: 10 criteria covering visual rendering, theme compatibility, nesting levels, and both editor/run-viewer
- **Dependencies**: linear chain (FE-1 → FE-2 → FE-3 → FE-4 → FE-5)
- **Test plan**: manual browser scenarios + unit tests for hook and component styling
- **Findings**:
  - `useLoopMembership` hook is new (not existing) and centralizes Loop membership detection
  - `BaseNode.css` will grow ~40–60 lines for icon and depth-based styling classes
  - `LoopPresentation.ts` already exports `LOOP_NESTING_STYLES` and `loopNestingPresentation()` for reuse
  - Run-viewer check (FE-3) is a verification task; no new code if `BaseNode` is shared
  - Theme compatibility hinges on correct use of MUI theme palette variables and color-mix() CSS function
