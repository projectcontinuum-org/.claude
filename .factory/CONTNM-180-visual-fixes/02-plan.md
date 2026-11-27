# Plan: Loop Node UI Fixes

**Status:** Ready for developer

## Frontend Tasks (2 tasks, independent, can run in parallel)

### FE-1: Loop Node Header — Display Node ID Instead of Duplicate "Loop"

**Repo/Module:** continuum-workbench/workflow-editor-extension

**Files to Modify:**
- `src/browser/components/node/LoopNode.tsx` (lines ~90–130, header JSX)
- `src/browser/components/node/LoopNode.css` (add `.loop-node-id` class if needed)

**Change:**
- Current: Header renders "LOOP" (kind) + "Loop" (title) → displays as "LOOP Loop"
- Fix: Header renders "LOOP" (kind) + "#node-id" in a monospace label
- Add a small monospace `.loop-node-id` label after the node kind, displaying `#{id}`
- Keep existing Loop title and condition chip unchanged (they still display)

**Result:**
Header becomes: `LOOP #loop-abc123` (or similar) instead of `LOOP Loop`

**Testing:**
- Unit: Run `yarn test` for LoopNode — verify header JSX renders correctly
- Browser: Create a workflow with a Loop node, verify header shows node ID

**Covers ACs:** AC-1, AC-2

**Depends on:** None

---

### FE-2: Member Node Loop Icon — Add Parent Loop ID Tooltip

**Repo/Module:** continuum-workbench/workflow-editor-extension

**Files to Modify:**
- `src/browser/components/node/BaseNode.tsx` (lines ~60–70, loop icon rendering)
- Possibly `src/browser/components/node/BaseNode.css` (for tooltip styling if needed)

**Change:**
- Current: `<LoopIcon className="loop-member-icon" />`
- Fix: Wrap LoopIcon in a MUI `Tooltip` component
- Tooltip text: `"Parent: #{parentLoopId}"` from useLoopMembership hook
- Example: Tooltip shows "Parent: #loop-456" when hovering over icon

**JSX Pattern:**
```jsx
{loopMembership && (
  <Tooltip title={`Parent: #${loopMembership.parentLoopId}`} placement="top">
    <LoopIcon
      className="loop-member-icon"
      fontSize="small"
      data-testid={`loop-icon-${props.id}`}
    />
  </Tooltip>
)}
```

**Testing:**
- Unit: Run `yarn test` for BaseNode — verify Tooltip wraps LoopIcon and receives correct prop
- Browser: Hover over loop icon in workflow editor on a member node, verify tooltip shows parent loop ID

**Covers ACs:** AC-3, AC-4, AC-5, AC-6

**Depends on:** None

---

## Acceptance Criteria Coverage

| AC | Description | Task |
|----|-------------|------|
| AC-1 | Loop header shows "#node-id" instead of "LOOP Loop" | FE-1 |
| AC-2 | Loop title/condition display unchanged | FE-1 |
| AC-3 | Member node icon present and visible | FE-2 |
| AC-4 | Icon has associated parent loop ID label/tooltip | FE-2 |
| AC-5 | Label visible in both editor and run viewer | FE-2 |
| AC-6 | Tooltip works in light/dark themes | FE-2 |
| AC-7 | All existing tests pass | Both |

---

## Dependencies

**None.** FE-1 and FE-2 are independent:
- FE-1 modifies LoopNode only
- FE-2 modifies BaseNode only
- No shared dependencies
- **Both can be developed in parallel**

---

## Verification Strategy

### Unit Tests
- Run: `yarn workspace @continuum/workflow-editor-extension test`
- Must pass: 182/182 existing tests + new tests for FE-1 and FE-2 (if any)
- No breaking changes to existing functionality

### Browser-Based Verification
1. Create a workflow with:
   - Loop A at top level (depth 0)
   - Loop B inside Loop A (depth 1)
   - Multiple nodes inside Loop B
2. In workflow editor canvas, verify:
   - Loop A header shows "LOOP #loop-A" (or ID)
   - Loop B header shows "LOOP #loop-B" (or ID)
   - Each node inside Loop B has loop icon with tooltip "Parent: #loop-B"
3. Hover over loop icon → tooltip appears with parent loop ID
4. Switch theme (light/dark) → tooltip and labels remain readable
5. Same verification in run viewer

---

## Release Notes

Add to `continuum-workbench/release_notes/RELEASE_NOTES_v0.0.16.md`:

> **Loop nodes:** Loop node headers now display the unique node ID (e.g., `LOOP #loop-abc123`) for clarity and reference. Child nodes inside loops display a tooltip showing the parent loop's ID when hovering over the loop icon, improving accessibility for color-blind users.

---

## Not Verifiable Locally

**None.** Both tasks are pure frontend display changes, fully verifiable in Theia workbench locally.

---

## Deployment Considerations

- **API changes:** None
- **Database migrations:** None
- **Breaking changes:** None (backward compatible)
- **Bundle size impact:** Negligible (tooltip is MUI built-in)
- **Performance impact:** None

---

## Ready for Development

✅ **Yes.** All tasks are well-scoped, unambiguous, and ready for the frontend developer.
