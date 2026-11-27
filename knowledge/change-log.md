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
