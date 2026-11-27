# Workflows, loops and flow variables

## Execution

- `ContinuumWorkflow` (Temporal) runs a DAG. `WorkflowDagExecutor` picks ready nodes (`NodeReadiness`), builds node
  inputs (`getNodeInputs`), dispatches activities, and merges flow variables (`FlowVariableMerger`).
- Replay safety: workflow code must stay deterministic; `Workflow.getInfo()` reads are fine. `WorkflowStatusReporter`
  publishes only when not replaying.

## Loop node (`org.projectcontinuum.core.builtin.Loop`)

- Properties: condition (CEL), maxIterations, onLimit, onNonBooleanResult, check position (before / after).
- Code: `orchestration/workflow/loop/` — `LoopRunner` (iteration engine, `checkCondition`, `iterationOf`),
  `LoopRunState`, `LoopReset` (clears member state per iteration), `LoopCarriedVariables`, `LoopHistoryGuard`,
  `WorkflowLoops` (topology lookups incl. `iterationOf(nodeId)` = innermost running loop's iteration), condition
  evaluators/timeboxed runner. Nested loops are supported; members inherit the innermost loop.
- Condition CEL gets the flow variables as `vars["name"]`; read-only `iteration` is `vars["iteration"]` (iteration that
  just ended; 0 before the first). Loop-validation helpers in `continuum-commons/.../validation/loop`.

## Flow variables

- Default SDK variables per node: `<prefix>.executionStatus|errorMessage|startTimestamp|endTimestamp|durationMs|
  inputCount|outputCount`. Platform-injected: `iteration` (read-only; never carried, never inherited, stripped by
  `LoopCarriedVariables.afterIteration` and `FlowVariableMerger.available`).
- Variables inherit downstream along edges; 64 KiB cap; a node's `$variable` output holds only its own variables.
- Kotlin Script node: `flow.get/set/all` (`ScriptFlowVariables.kt`). Reference page:
  `continuum-docs/docs/architecture/flow-variables.md`.

## Temporal history limits

- Hard: 51,200 events / 50 MiB per run. Loop guard stops earlier: `LoopBudget.MAX_HISTORY_EVENTS = 40_000`, 40 MiB
  (`LoopHistoryGuard`, `RunHistory.TEMPORAL` reads `historyLength`/`historySize`).
- Cost model: 10 events per member node per iteration + 1 per condition check (`LoopBudget`, verified by
  `ContinuumWorkflowLoopHistoryBudgetTest`).
- Workflow updates expose `historyEventCount` / `historyEventLimit(51,200)`; viewer shows a gauge.

## Tests worth knowing

`ContinuumWorkflowLoopTest` (+ `LoopRunHarness`, `LoopFixtures`, fake node activity with `flowVariablesByInvocation`),
`CelIterationVariableTest` (loop-condition), `KotlinScriptNodeModelTest`, shared case lists
`loop-carry-cases.json` / `loop-condition-builder-cases.json` in the workbench `src/common`.
