# Plan: Kotlin Named Arguments

## Acceptance criteria
| ID | Criterion | Verified by |
|---|---|---|
| AC-1 | `.claude/factory/CONVENTIONS.md`, `.claude/agents/factory-backend-developer.md`, `.claude/agents/factory-backend-expert.md`, and `.claude/README.md` consistently describe named arguments as binding for every argument at every Kotlin call site where the declaration and syntax permit them, including single-argument calls, constructors, data classes, and tests. | [review] |
| AC-2 | The guidance limits exceptions to declarations or Kotlin call forms where named arguments are unavailable; it does not permit other positional calls or require wrappers solely to enable names. | [review] |
| AC-3 | The planned change is limited to the four shared factory guidance files above. It adds no automation or codebase-wide cleanup and changes no product/runtime behavior or release-note process. | [review] |

## Backend tasks
### BE-1 Make the shared Kotlin named-argument policy binding and consistent
- Repo/module: Shared factory guidance (`.claude/`)
- Files: `.claude/factory/CONVENTIONS.md`; `.claude/agents/factory-backend-developer.md`; `.claude/agents/factory-backend-expert.md`; `.claude/README.md`
- Change: State the same mandatory rule throughout: name every argument in Kotlin calls whenever the declaration and syntax allow it, including one-argument calls, constructors, data classes, and tests. Define only unavoidable declaration/language-syntax limitations as exceptions. The backend developer guidance instructs implementation and tests to follow the rule; the backend expert guidance treats supported positional arguments as review violations; the README summarizes it consistently with the shared convention. Do not prescribe wrappers solely to enable named arguments.
- Unit tests: None; this is a shared developer/reviewer policy documentation change.
- Docs: Update the shared convention, backend developer and reviewer role instructions, and `.claude/README.md`. Do not edit project-repository `AGENTS.md` files, release notes, or establish a release-note process.
- Depends on: None.
- Covers: AC-1, AC-2, AC-3

## Frontend tasks
None — no frontend implementation, API/client change, or frontend guidance file is in the approved scope.

## Dependency graph
BE-1 has no dependencies.

## Test plan
| AC | Verifier | Check |
|---|---|---|
| AC-1 | Backend expert | Read all four changed files and confirm the rule is mandatory, covers each argument wherever named arguments are supported, and is consistent across the shared convention, developer/reviewer guidance, and README. |
| AC-2 | Backend expert | Confirm exceptions are limited to cases where the declaration or Kotlin syntax prevents named arguments; no broader positional-call exception or wrapper requirement is introduced. |
| AC-3 | Backend expert | Inspect the change list and confirm only the four approved `.claude/` files are changed, with no automated enforcement, codebase cleanup, product behavior change, project-repository guidance, or release-note process. |

## Not verifiable locally
- This policy-only change has no runtime behavior or automated compliance check in scope. Review of the four guidance files verifies the policy wording; it cannot prove future developers will follow it.
- No build, unit, system-API, or browser test is relevant. The change does not require missing Node/Yarn, browser, or OpenAPI tooling.
- No project-repository AGENTS.md or release-note files are in scope. Do not create a release-note process.

## Changelog
- Round 1: Initial plan from the READY FOR PLANNING requirements.
- Round 2: Narrowed scope to the four shared factory policy files only; made the acceptance criteria and single backend task match the orchestrator decision; removed project-repository guidance, release-note changes/process, and the release-note question.
