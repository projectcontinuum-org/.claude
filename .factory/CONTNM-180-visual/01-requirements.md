# Loop Visualization Enhancements
Status: READY FOR PLANNING

## User story

As a workflow developer, I want to easily identify which nodes belong to a Loop construct and understand nesting levels at a glance, so that I can quickly comprehend complex loop structures and nested loop hierarchies without getting visually lost.

## Context — what exists today

### Loop Node Implementation
The Loop feature is fully implemented in `continuum-workbench/workflow-editor-extension/src/browser/components/`:

**LoopNode.tsx**: Main Loop container component that renders a dashed rounded box with:
- Header showing title, condition summary, max iterations, status, and progress
- Support for collapsed/expanded states
- Runtime summary with carried variables
- Resizable container with internal member nodes
- Already calculates `nestingDepth` from `enclosingLoops()` in `LoopCanvasNode.tsx`

**LoopCanvasNode.tsx**: Context provider that wraps the Loop renderer and passes:
- `memberCount` (via `descendants()`)
- `nestingDepth` (via `enclosingLoops().length`)

**LoopTopology.ts**: Pure helper functions for membership and nesting:
- `enclosingLoops(nodeId, graph)` — returns array of containing loops (outermost to innermost)
- `descendants(loopId, graph)` — returns all nested member ids
- `directMembers(loopId, graph)` — returns direct children only

**LoopPresentation.ts**: Styling constants that already support nesting levels:
- `LOOP_NESTING_STYLES` array with `fillOpacity`, `borderOpacity`, `borderWidth` for levels 0–3
- `loopNestingPresentation(depth)` — returns style object for depth
- Already used in `LoopNode.tsx` to vary border width and fill opacity by nesting level

**BaseNode.tsx**: Regular nodes (non-Loop) that render inside loops:
- Currently no visual indicator that they are part of a Loop
- Render via `BaseNode` component with their own styling (`BaseNode.css`)
- Have access to `parentNode` field in React Flow to determine their container

### Current Styling
- LoopNode.css: 500+ lines managing header, body, collapse/expand, variables, progress
- BaseNode.css: Grid-based layout with border, background, handles
- Both use MUI theme variables and Theia color palette
- Loop nesting levels already affect `--loop-border-width` and `backgroundColor` via `loop-nesting-depth-${level}` class

### Nesting Depth Calculation
- Already available in every rendered Loop via `nestingDepth` prop passed from `LoopCanvasNodeRenderer`
- For member nodes, `enclosingLoops(nodeId, graph).length` gives their depth (0 = no enclosing loop)

## Feasibility

| Part | Verdict | Evidence | Notes |
|------|---------|----------|-------|
| Loop icon on member nodes | FEASIBLE | `BaseNode.tsx`, `BaseNode.css`, `LoopNode.tsx` lines 29–44 | Loop nodes already render `LoopIcon` via MUI `@mui/icons-material/Loop`. Member nodes (`BaseNode`) must check `parentNode` and `enclosingLoops()` to know if they are Loop members. Icon placement: top-left corner is a known CSS pattern. |
| Parent loop color on members | FEASIBLE | `LoopNode.tsx` line 102 (backgroundColor based on `nestingDepth`), `LoopCanvasNodeRenderer` context | Loop node's nesting-dependent background color is derived via `alpha()` and `theme.palette.secondary.main/dark`. Member node must look up its **immediate** parent Loop in graph and inherit its nesting level's color. `LoopCanvasNodeRenderer` has access to `graph`. |
| Different colors per nesting level | FEASIBLE | `LoopPresentation.ts` lines 15–19, `LoopNode.tsx` lines 95–102 | `LOOP_NESTING_STYLES` supports levels 0–3 with distinct `fillOpacity` and `borderOpacity`. Member nodes can apply the same nesting-level styling as their enclosing Loop. Currently only Loop boxes vary by nesting; extending to members is a CSS/styling change, not a logic change. |
| Environment | OK | `environment.md` | Node.js and yarn are MISSING (required for yarn workspace commands) but `node_modules` is present. `yarn test` for verification will not work locally without Node. Backend (Kotlin, Gradle) tools available. |
| API impact | NONE | — | No API changes: purely visual/CSS rendering. No new endpoints, no model changes. |
| Data model impact | NONE | — | No data model changes; uses existing `parentNode`, `nestingDepth`, `graph` topology. |
| Multi-tenancy / Security | NONE | — | Visual styling does not affect isolation or permissions. |
| Compatibility | LOW RISK | `BaseNode.tsx`, `BaseNode.css` | Member node styling is new; Loop styling already exists. Renders side-by-side. No breaking changes to data structures or APIs. |

## Scope

### In scope
1. Add loop icon (top-left corner) to every node with a `parentNode` that is a Loop node.
2. Apply the parent Loop node's nesting-level color (fillOpacity and borderOpacity) to member nodes.
3. Use `LOOP_NESTING_STYLES` levels 0–3 to achieve distinct subtle colors for each nesting level (e.g., different fillOpacity for a node in a nested-within-nested Loop).
4. Styling works in both editor and run-viewer workflows (wherever `BaseNode` renders with a Loop parent).

### Out of scope
- **Backend Loop changes**: orchestration, execution, carried variables — all complete and not touched.
- **Non-Loop nodes**: styling changes only apply to nodes whose `parentNode` is a Loop.
- **Loop box itself**: the Loop container (`LoopNode`) is already styled; this work is for its members.
- **New configuration UI**: nesting level colors are determined automatically; no color picker or theme override.
- **Kinetic/animation effects**: styling is static CSS based on nesting level.
- **Alternative visualization shapes**: this work adds to the existing Loop box pattern, not replace it.

### Assumptions
- **Assumption A1**: "Loop members" means nodes with `parentNode === loopId` where the parent is a Loop (type `'Loop'`). Nested Loops themselves are also members and should show the icon and parent color.
- **Assumption A2**: "Parent loop color" means the color determined by the **immediate** parent Loop's nesting depth (not a merged color from all enclosing loops).
- **Assumption A3**: The icon is a solid MUI `LoopIcon` (already imported in `LoopNode.tsx`), positioned absolutely in the top-left corner.
- **Assumption A4**: Nesting levels beyond 3 clip to level 3 (already done in `loopNestingPresentation()`).

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Node icon placement overlaps existing content (title, icon, handles) | Medium: member nodes are compact, top-left corner is shared space | Position the loop icon absolutely, use `z-index`, and ensure it does not block user interaction (use `pointer-events: none` or place over padding). Test in a dense multi-nested loop scenario (3+ levels). |
| Nesting-level colors are too subtle or not distinguishable | Medium: users cannot tell nesting levels apart visually | `LOOP_NESTING_STYLES` fillOpacity range is 0.1–0.14 (4% spread). If not enough, slight adjustment to borderOpacity range (0.62–0.9) may help. Run with actual nested loops and gather feedback before ship. |
| Color inheritance from parent Loop creates monotony or visual confusion | Low: only direct parent's nesting level is used; enclosing loop structure is still clear from Loop box nesting | Nesting box structure (the Loop container's dashed border) is the primary visual cue; color is secondary. Test with 3–4 levels of nesting. |
| BaseNode rendering path not aware of Loop membership in all contexts | Medium: editor canvas vs. run viewer may have different node rendering | `BaseNode` is used in both. Check that `parentNode` and `graph` context are available in both render paths (editor canvas via `useLoopCanvas` and run viewer via its own node renderer). `LoopCanvasNodeRenderer` already has graph; run viewer must pass it too. |
| CSS cascade or theme override may suppress nesting-level styling | Low: MUI theme variables are scoped; Loop nesting is a computed className | Test in both light and dark themes. Ensure `--loop-border-width` and nesting-class CSS stays confined to `.loop-node-body`. |

## Size
**M** (Medium): 2–3 days

**Work breakdown**:
- Update `BaseNode.tsx` to detect Loop membership and render icon (~2 hours, includes prop drilling or context).
- Update `BaseNode.css` to position icon and apply nesting-level background color (~2 hours, CSS styling and class naming).
- Extend or create style rules for member nodes using existing `LOOP_NESTING_STYLES` (~1 hour, reuse constants).
- Verify in editor and run viewer, test nested loops (2 levels, 3+ levels) (~2 hours, manual testing and screenshots).
- Update README/AGENTS.md to document the visual pattern (~0.5 hours).

**Main risks**: icon placement conflict in tight node layouts, color subtlety requiring fine-tuning after first implementation.

## Draft acceptance outcomes

**AC-1: Loop icon visible on all Loop members**
- Given: an expanded Loop containing a mix of regular nodes and nested Loops
- When: the workflow editor displays the loop in the canvas
- Then: every node with `parentNode` pointing to that Loop shows a small Loop icon in its top-left corner with no visual overlap to the node's title or status badges

**AC-2: Member node color matches parent Loop nesting level**
- Given: a Loop at nesting depth 0 (top-level) containing nodes, and a nested Loop (depth 1) containing its own nodes
- When: the workflow displays both Loops and their members
- Then: nodes in the depth-0 Loop have `fillOpacity: 0.1`, nodes in the depth-1 Loop have `fillOpacity: 0.115`, and the difference is visually subtle but distinguishable

**AC-3: Nested Loop members inherit correct nesting colors**
- Given: a 3-level nested Loop structure: Loop A (depth 0) → Loop B (depth 1) → Loop C (depth 2) with a regular node D inside Loop C
- When: the editor displays the workflow
- Then: node D shows the depth-2 styling (fillOpacity 0.13), and the Loop C box itself also shows depth-2 styling; the visual hierarchy is clear

**AC-4: Icon and color work in run viewer**
- Given: a completed workflow run with Loop members visible in the run viewer
- When: the run viewer renders the same nodes
- Then: all Loop members display the icon and nesting-level color consistently with the editor

**AC-5: Styling survives theme changes**
- Given: the workbench in light theme and dark theme
- When: a Loop and its members are displayed
- Then: the Loop icon, nesting colors, and member backgrounds remain visible and distinguishable in both themes

## Decisions
*None yet — awaiting user input.*

## Open questions

**Q-1: Should nested Loops (Loops inside Loops) also show the loop icon?**

Why it matters: a nested Loop is both a container AND a member of its parent Loop. Showing the icon would emphasize the nesting hierarchy but could clutter the loop-box header. Currently, nested Loops do not show any icon in their box header.

Options:
1. **Yes, show the loop icon on nested Loop headers too** — reinforces that nested Loops are members; adds visual consistency. Risk: clutters the already-dense Loop header (title, condition, status, collapse button). Users see two or three Loop icons in a small space.
2. **No, only show the icon on regular (non-Loop) member nodes** — keeps nested Loop headers clean and readable; the Loop box itself is distinct enough. Users must infer nesting from the containing dashed boxes.
3. **Show a smaller "nested" indicator icon (not LoopIcon) on nested Loop headers** — splits the difference: a small badge (e.g., a mini-loop or upward arrow) on the nested Loop box, separate from the main Loop icon shown on regular members. Adds complexity but is clearer.

Recommended: **Option 2** — only regular members get the icon. Nested Loops are already visually distinct as boxes; the icon is for small nodes that have no other way to signal membership.

---

**Q-2: Should the loop icon be clickable or interactive?**

Why it matters: a small icon can be hard to target on a touchpad or in a dense canvas. Making it clickable (e.g., to select the parent Loop or scroll to it) could be useful, but it adds interaction logic and may confuse users if they accidentally click it.

Options:
1. **Clickable: clicking the icon selects or highlights the parent Loop** — adds a quick navigation shortcut. Must handle keyboard focus and avoid accidental clicks.
2. **Clickable: clicking the icon opens a context menu with Loop info (condition, carried variables, member count)** — richer interaction, but may feel over-engineered for a visual indicator.
3. **Not clickable; icon is purely visual (pointer-events: none)** — simpler, no interaction logic. Icon is a label, not a button. Users navigate via the Loop box itself or the graph.

Recommended: **Option 3** — not clickable. The icon is a visual cue, not a control. The Loop box and member nodes already have UI for selection and navigation.

---

**Q-3: What if a node has no `parentNode` (top-level nodes outside any Loop)?**

Why it matters: acceptance criteria must be clear on edge cases. Top-level nodes should obviously not get a Loop icon, but the requirements do not explicitly rule it out.

Options:
1. **Show no icon on top-level nodes** — obvious default.
2. **Show a different icon (e.g., a strikethrough Loop or "not in loop") on top-level nodes** — adds visual noise and confuses the message. Not recommended.

Recommended: **Option 1** — no icon on top-level nodes. The icon is exclusively for nodes with a Loop parent.

---

**Q-4: Should member-node color apply to the node's background, border, or both?**

Why it matters: member nodes have a solid border and a semi-transparent background (from `BaseNode.css`). Applying nesting-level opacity to both could make them harder to read, or applying it only to the background might be too subtle.

Options:
1. **Apply to background only (fillOpacity)** — matches how Loop boxes vary (semi-transparent fill, dashed border stays constant). Member nodes get a subtle colored background; border stays the same.
2. **Apply to border only** — gives border weight/color variation; background stays the same (white/dark by theme).
3. **Apply to both background and border** — full theming. Risk: too much color, reduced readability.

Recommended: **Option 1** — apply fillOpacity to background only, mirroring the Loop nesting style. Border stays the same (secondary.main). This preserves readability and uses the same pattern as Loop boxes.
