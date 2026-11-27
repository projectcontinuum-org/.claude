# Kotlin Named Arguments — Feature report
Date: 2026-11-27 · Status: READY TO MERGE

## Overview
Kotlin contributors now have a consistent, binding rule: name every supplied argument at every call to a Kotlin-declared function or constructor whenever the declaration and call syntax permit it. This includes single-argument calls, constructors, data classes, lambda arguments, and tests; a supported positional Kotlin call is a violation. Positional calls are narrowly allowed only for Java-declared APIs or Kotlin declarations/call forms where named arguments are unavailable, and wrappers must not be added solely to enable names. User story: as a Kotlin developer, I want call sites to communicate the meaning of every value so they are clear and maintainable.

## How to use it
When adding or changing Kotlin calls, follow the shared convention in `.claude/factory/CONVENTIONS.md` and the backend developer guidance. For example, use `createNode(name = nodeName)` rather than `createNode(nodeName)` when the Kotlin declaration and call syntax support named arguments. Backend reviewers are instructed to flag supported positional Kotlin calls.

## What changed
| Repo | Area | Change | Key files |
|---|---|---|---|
| `.claude` | Shared factory guidance | Made the named-argument rule mandatory and consistent for implementation, tests, and review; defined narrow language/declaration exceptions. | `factory/CONVENTIONS.md`; `agents/factory-backend-developer.md`; `agents/factory-backend-expert.md`; `README.md` |

### API changes
None.

### Documentation
`continuum-docs` was not changed. The technical-writer phase was skipped because this is internal factory/Kotlin contributor guidance, not Continuum product or operator documentation; `09-docs.md` is absent. No docs build was run.

### Breaking changes / upgrade notes
None to product behavior, API, runtime, or ABI. Named arguments couple Kotlin source call sites to parameter names, so a future parameter rename may require updating callers. No codebase-wide migration is included.

## Acceptance criteria
| AC | Criterion | Status | Evidence (test name / screenshot / review) |
|---|---|---|---|
| AC-1 | Four shared guidance files consistently require naming every eligible Kotlin argument, including single-argument calls, constructors, data classes, and tests. | PARTIALLY VERIFIED | Backend review Round 1: APPROVED; reviewer checked the four actual changed files and confirmed the rule. No test or browser scenario applies or was run. |
| AC-2 | Exceptions are limited to cases where declarations or Kotlin call syntax do not allow names; no other positional calls or wrapper requirement is permitted. | PARTIALLY VERIFIED | Backend review Round 1: APPROVED; reviewer confirmed Java/API and unsupported-call-form exceptions, with supported positional calls prohibited and no wrapper requirement. No test or browser scenario was run. |
| AC-3 | Scope is exactly the four shared guidance files, with no automation, codebase cleanup, runtime change, or release-note process. | PARTIALLY VERIFIED | `git -C .claude status --short` and `git -C .claude diff --stat` show exactly the four planned files (22 insertions, 8 deletions); backend review confirmed scope. `git diff --check` passed. No test or browser scenario was run. |

## Quality
- Unit tests: none · System tests: none · Browser tests: none · Reviews: backend APPROVED (0 findings), frontend N/A
- `git diff --check`: PASS · Runtime/build tests and automated compliance checks: not run/not in scope
- Fix rounds used: BE 0 / FE 0

## Open items
- No automated check enforces the convention; compliance is through guidance and review. Automated enforcement was explicitly out of scope.
- No runtime, unit, system, or browser tests were run; this is a documentation-only change.
- `03-backend-dev.md` is absent, as noted in the backend review, so developer-reported commands/results could not be cross-checked. The actual diff, scope, whitespace check, and review were verified directly.

## User actions before merge
- No commits were made. Commit the four `.claude` guidance changes and open/review the PR using the normal workflow.
- No `yarn.lock` update, client regeneration, OpenAPI lint, or runtime release note is needed for this change.

## Discrepancies
- The actual `.claude` diff matches the four files approved in the plan and described by state/review; no extra or missing changed files were found. `git diff --check` passes.
- `03-backend-dev.md` and the frontend/system-test/docs artifacts (`04`–`06`, `08`–`09`) are absent. The review records the missing backend developer report; frontend work was not planned and the docs phase was explicitly skipped.
