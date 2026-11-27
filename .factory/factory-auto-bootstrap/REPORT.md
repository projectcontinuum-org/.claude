# Automatic workspace bootstrap for `/factory` — Feature report
Date: 2026-11-27 · Status: READY WITH OPEN ITEMS

## Overview
Starting `/factory <requirement>` in a fresh workspace now prepares it automatically: missing required repositories are cloned beside `.claude/` before requirements work begins. Existing Git repositories and worktrees are recognized and left untouched; occupied non-Git paths and clone failures stop preparation with an actionable error instead of destructive cleanup. Missing system tools no longer block requirements work, but checks that depend on them must be reported `NOT VERIFIED`. User story: developers can start the factory from a fresh workspace without a separate bootstrap step.

## How to use it
From the workspace root, start Claude Code and run `/factory <requirement>`. Phase 0 checks the environment, bootstraps absent `yes` repositories from `factory/repos.txt`, then refreshes the doctor profile. To prepare manually first, run `.claude/factory/scripts/bootstrap.sh`.

## What changed
| Repo | Area | Change | Key files |
|---|---|---|---|
| `.claude` | Bootstrap and environment detection | Explicit safe errors on clone/path conflicts; recognize existing Git worktrees consistently in bootstrap and doctor | `factory/scripts/bootstrap.sh`, `factory/scripts/doctor.sh` |
| `.claude` | `/factory` coordination and conventions | Bootstrap before requirements, stop on bootstrap failure, continue with missing tools without installing or prompting, mark dependent checks `NOT VERIFIED` | `skills/factory/SKILL.md`, `factory/CONVENTIONS.md` |
| `.claude` | Setup documentation | Explain automatic required-repo preparation, manual bootstrap option, and partial environments | `README.md`, `factory/SETUP.md` |
| `.claude` | Isolated regression tests | Cover required-only selection, local clone, existing repository/worktree preservation, doctor worktree detection, conflict preservation, and actionable clone failure | `factory/scripts/tests/bootstrap-test.sh` |

### API changes
None. No endpoints, operationIds, OpenAPI specifications, or generated clients changed.

### Documentation
Factory setup docs were updated in `.claude/README.md` and `.claude/factory/SETUP.md`. No `continuum-docs` writer pass applies: this is a factory setup feature, not a platform feature. Docs build: N/A (no continuum-docs changes or docs site build); Node.js/Yarn are absent in this workspace.

### Breaking changes / upgrade notes
None. Existing manual bootstrap remains available; optional repositories are still on-demand.

## Acceptance criteria
| AC | Criterion | Status | Evidence (test name / screenshot / review) |
|---|---|---|---|
| AC-1 | Bootstrap clones missing required repositories only; preserves existing Git repositories/worktrees and excludes optional repos | VERIFIED | `assert_required_selection_and_preservation`, `assert_worktree_is_preserved` in `factory/scripts/tests/bootstrap-test.sh` passed per developer evidence; includes doctor reporting the fixture worktree as present |
| AC-2 | Clone failure or occupied target fails clearly and preserves existing contents | VERIFIED | `assert_conflicting_target_is_preserved` and `assert_failed_clone_is_actionable` passed per developer evidence |
| AC-3 | Phase 0 bootstraps absent required repos before requirements, refreshes doctor, and leaves optional repos on-demand | PARTIALLY VERIFIED | Backend reviewer manually reviewed Phase 0, `repos.txt`, and bootstrap behavior; no fresh-workspace `/factory` end-to-end run was observable |
| AC-4 | Missing system tools do not prompt, block, or trigger installation; dependent checks are `NOT VERIFIED` | PARTIALLY VERIFIED | Backend reviewer approved coordinator/convention review; no live end-to-end coordinator run. Node.js 20+ and Yarn 1.22 are absent, so dependent checks were not run |
| AC-5 | Setup guidance covers automatic preparation, manual bootstrap, and missing-tool behavior | PARTIALLY VERIFIED | Reviewer manually checked README/setup guidance against coordinator; referenced setup paths/commands and `git diff --check` passed per developer evidence; no docs site build |

## Quality
- Unit tests: isolated bootstrap/doctor shell test PASS · System tests: not applicable (no product changes) · Browser tests: not applicable (no UI changes) · Reviews: backend APPROVED (Round 3, no remaining findings), frontend N/A (no frontend tasks)
- Shell syntax checks for bootstrap, doctor, and test script: PASS · `.claude` `git diff --check`: PASS
- Fix rounds used: 2 backend fix rounds

## Open items
- Fresh-workspace `/factory` end-to-end behavior is **NOT VERIFIED**: the current workspace already contains the required repositories, and a fresh Claude Code run was not observable here.
- Node.js 20+ and Yarn 1.22 are absent. Planned shell checks passed, but any Node/Yarn-dependent workbench or system-test checks remain **NOT VERIFIED**; those product checks were outside this change's scope.
- No unresolved review findings. The reviewer’s Round 1 and Round 2 findings were resolved; Round 3 approved.
- SCOPE items deferred: none.

## User actions before merge
- Review the current `.claude` implementation diff and uncommitted workspace state; commit/PR the intended implementation changes when ready. No implementation files were committed or pushed. The factory artifact directory was recorded separately in commit `98dbf01`.
- If merge confidence requires live confirmation, run `/factory` in a genuinely fresh workspace and confirm required-only bootstrap, safe existing-repo handling, and doctor refresh.
- Install Node.js/Yarn only if the relevant dependent checks are required, then run those checks and record their results.
- No product repository changes, generated clients, yarn.lock updates, or OpenAPI lint actions are required.

## Discrepancies
- The developer evidence names the bootstrap test as changed; actual `.claude` status shows it under untracked `factory/scripts/tests/`, so it exists but is not included in `git diff --stat`.
- Actual `.claude` status has six modified tracked implementation files (`README.md`, `factory/CONVENTIONS.md`, `factory/SETUP.md`, `factory/scripts/bootstrap.sh`, `factory/scripts/doctor.sh`, `skills/factory/SKILL.md`) plus the untracked test directory. The tracked implementation diff stat is 61 insertions and 28 deletions. The artifact-only commit `98dbf01` contains the six files in this task's `.factory/factory-auto-bootstrap/` directory; it does not include implementation files.
- `state.md` records a baseline status count of 1; the current implementation status lists 7 paths/groups. The artifacts do not identify the original baseline path, so the current uncommitted implementation state cannot be attributed more precisely to pre-existing versus feature work. No product repository changes were made.
