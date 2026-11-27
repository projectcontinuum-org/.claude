# Architecture

Workspace root holds independent git repos side by side (no root repo); `.claude/` is its own repo. Repo list, roles
and required flags: `../factory/repos.txt`. Stack table and house rules: `../factory/CONVENTIONS.md`.

## Repos

| Repo | Role |
|------|------|
| `continuum-platform-core` | Kotlin 2.2 / Spring Boot 4 / Temporal / Kafka / Gradle (JDK 21). All backend services. |
| `continuum-workbench` | Theia IDE + React 18 + React Flow + JSONForms (Yarn 1.22, Node 24 via nvm). |

## Kotlin language intelligence and workbench resources

The Kotlin Script dialog is a standalone Monaco model, so it uses the workbench's generic language-server bridge rather
than a VS Code extension. The Kotlin registration is `kotlin-script`; the bridge owns strictly increasing document
versions because fwcd ignores repeated versions. Real workspace `.kt`/`.kts` files use the separately bundled
`fwcd.kotlin` extension. New workbenches default to 2Gi memory request and 4Gi limit; the cluster-manager validates
that each request does not exceed its matching limit, including values merged from a partial update.
| `continuum-feature-base` (+ `-ai`, `-cheminformatics`, `-knime`, `-template`) | Worker images with `@ContinuumNode` node models. Base nodes live in `features/continuum-feature-analytics`. |
| `continuum-system-tests` | k6 API suites + headless-browser UI suites; `docker/docker-compose.yml` is the local full stack (postgres, temporal, mosquitto, nginx, services). |
| `continuum-docs` | Docusaurus. `docs/` = unreleased "next"; `versioned_docs/` = released. |
| `continuum-charts`, `continuum-local-setup` | Helm / compose deploy. |
| `continuum-knowledge-graph`, `graphify-out` | Older auto-generated graph (graphify). Not curated; this folder supersedes it for orientation. |

## continuum-platform-core modules

| Module | Purpose |
|--------|---------|
| `continuum-commons` | Shared models: `ContinuumWorkflowModel`, `WorkflowUpdate`/`WorkflowUpdateEvent`, `FlowVariables` constants, loop validation (`validation/loop/LoopBudget`). |
| `continuum-orchestration-service` | Temporal workflow `ContinuumWorkflow`: DAG execution (`WorkflowDagExecutor`), loops (`workflow/loop/*`), progress + updates (`WorkflowStatusReporter`). |
| `continuum-loop-condition` | CEL condition evaluation for loops (`vars["name"]`). |
| `continuum-worker-springboot-starter` | SDK workers use: `@ContinuumNode`, node model base classes, default flow variables, progress signals. |
| `continuum-message-bridge` | Consumes workflow updates → MQTT to the UI and `workflow_runs.data` in Postgres (`WorkflowExecutionSnapshotToDbSyncHandler`). |
| `continuum-api-server` | REST API (OpenAPI committed at `docs/api/continuum-api-server.openapi.yaml`), node registry, runs, outputs. |
| `continuum-credentials-server`, `continuum-cluster-manager` | Credentials store/UI; worker cluster management. |
| `continuum-gradle-plugin`, `continuum-avro-schemas`, `continuum-knime-base` | Build tooling, Avro, KNIME translation. |

## Runtime data flow

```
workbench ──REST──> api-server ──start──> Temporal ──> orchestration-service (ContinuumWorkflow)
                                                          │ dispatch node activities (task queues)
                                                          ▼
                                            worker (feature-*) runs NodeModel.execute
                                                          │ progress signals / outputs (Parquet in object store)
orchestration WorkflowStatusReporter.publishUpdate ──Kafka──> message-bridge ──MQTT──> workbench (live viewer)
                                                                         └──> Postgres workflow_runs.data (history list)
```

- Update payload `WorkflowUpdate`: executionUUID, progressPercentage, status, nodeToOutputsMap, timestamps, workflow
  snapshot, ownedBy, workflowType/uri, scheduleId, runId, **historyEventCount, historyEventLimit** (nullable; limit is
  Temporal's 51,200).
- The stored `workflow_runs.data` (API `WorkflowRunData`) holds only `workflowSnapshot` + `nodeToOutputMap` — live-only
  fields like history counts are NOT in it.
- Frontend ↔ backend contract: workbench uses generated typescript-axios clients in
  `continuum-workbench/workflow-editor-extension/src/generated/` from the committed OpenAPI spec. Live updates use the
  websocket/MQTT types in `continuum-workbench/continuum-core/src/types` (`IJobUpdate`, `IExecution`).
- Docker image tags: compose pulls published `0.0.x` images; a local `jibDockerBuild` retags the same name.

## Conventions pointers

AGENTS.md (DOX) chains per repo; release notes `release_notes/RELEASE_NOTES_v<ver>.md` per change (core: `platformVersion`
in `gradle.properties`, currently 0.0.23; workbench: root `package.json` version, 0.0.16); Kotlin named arguments
mandatory; no git writes by agents.
