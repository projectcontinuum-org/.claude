# Workbench

Layout (`continuum-workbench/`): `continuum-workbench` (Theia app, run target), `continuum-workbench-thin`,
`continuum-core` (shared TS types `@continuum/core`; has a `dist/` that must be rebuilt with `npx tsc` after editing
`src/types`), `workflow-editor-extension` (main extension), `workflow-builder-extension` (chat agent).

## workflow-editor-extension (`src/`)

- `browser/components/node/` — `BaseNode.tsx` (settings gear, status), `LoopNode.tsx/.css` (container node; header
  responsive: hides condition → max → "LOOP" id → collapse text becomes icon; collapsed width 300; no variable chips
  in the body), `BaseEdge`.
- `browser/components/workflow-viewer/` — `WorkflowViewer.tsx` (React Flow viewer, top-right status icon + `HistoryGauge`
  green ≤50 %, yellow >50 %, red >80 %), `HistoryGauge.tsx`.
- `browser/widgets/workflow-viewer/WorkflowViewerWidget.tsx` — Theia widget; subscribes to live updates
  (`ExecutionService.watch`) and passes status/outputs/history counts down; for stored runs fetches via
  `WorkflowRunsService`.
- `common/` — pure, unit-tested TS (node:test via `tsconfig.test.json`, which only includes `src/common`): loop topology,
  per-depth loop colours/presentation, carried variables, condition query/validation, `HistoryUsage`, `HttpReply`.
  Put testable logic here, keep React files thin.
- `generated/` — OpenAPI clients (never hand-edit).
- Loop visuals: members get a loop badge and the parent's colour; nested loops use distinct subtle colours per depth.
  The condition editor and `common/FlowVariables.ts` mirror do not yet know about `iteration` (open gap).

## Conventions

MUI v5 (`@mui/material`, icons; no `@mui/x-charts` installed). Settings dialog expand/collapse icon is reused for loop
collapse. Specs: `yarn workspace @continuum/workflow-editor-extension test`; typecheck `npx tsc --noEmit`.
Release notes: `continuum-workbench/release_notes/RELEASE_NOTES_v0.0.16.md` (known stale in places).
