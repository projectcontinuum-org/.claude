# Requirements: Loop Node UI Fixes

**Status:** READY FOR PLANNING

## Overview

Two frontend UI issues need fixing to improve Loop node visualization clarity and accessibility:

1. **Loop node header redundancy:** Remove duplicate "Loop" text; show node ID
2. **Loop membership accessibility:** Add parent loop ID label next to member node icon for color-blind users

Both are display-only changes in `continuum-workbench`. No backend, API, or model changes needed.

## Requirement 1: Loop Node Header Shows Node ID

**Current behavior:** Loop node header displays "LOOP Loop" (the word "Loop" twice)
**Desired behavior:** "LOOP #loop-123" (showing the unique node ID)
**Why:** Clarity — node IDs help developers identify and reference specific loops

**Location:** `LoopNode.tsx` header rendering
**Files:** `workflow-editor-extension/src/browser/components/node/LoopNode.tsx`

## Requirement 2: Parent Loop ID Label on Child Nodes

**Current behavior:** Child nodes show loop icon in top-left corner (no additional info)
**Desired behavior:** Show a tooltip or small label with parent loop's ID (e.g., "Parent: #loop-123")
**Why:** Accessibility — users with color-blindness can identify loop membership by ID alone

**Location:** Loop icon element in BaseNode
**Files:** `workflow-editor-extension/src/browser/components/node/BaseNode.tsx`

## Feasibility

✅ **Fully feasible** — both are display-only JSX/CSS changes
- Loop ID is available from node.id in component props
- Parent loop ID is available from useLoopMembership hook
- No data model or API changes needed

## Size Estimate

**Small (S):** 2–3 hours
- 2–3 minor JSX changes
- 0–1 CSS changes (for label positioning)
- 0–2 unit test updates

## Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|--------------|
| AC-1 | Loop node header shows "#node-id" instead of duplicate "Loop" | [browser] |
| AC-2 | Loop title/condition display unchanged | [browser] |
| AC-3 | Member node icon has associated parent loop ID label | [browser] |
| AC-4 | Label is readable and doesn't cover node content | [browser] |
| AC-5 | Label visible in both editor and run viewer | [browser] |
| AC-6 | Tooltip or label works in light/dark themes | [browser] |
| AC-7 | All existing tests pass | [unit tests] |

## Open Questions

None. Requirement is fully specified.

## Next

Proceed to planning.
