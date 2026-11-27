# Plan: Automatically prepare workspaces for `/factory`

## Acceptance criteria

| ID | Criterion | Verified by |
|---|---|---|
| AC-1 | Running the default bootstrap against an isolated fixture clones only missing repositories marked `yes` in `repos.txt`; it leaves an existing Git repository unchanged and does not clone an optional repository. | [unit] |
| AC-2 | If a required clone fails or its target path is occupied, bootstrap exits non-zero, identifies the repository and a recovery action, and preserves the pre-existing target contents. | [unit] |
| AC-3 | Phase 0 bootstraps absent required repositories before requirements work, reruns the doctor after bootstrap, uses `repos.txt` as the required-set source of truth, and does not clone optional repositories by default. | [review] |
| AC-4 | After repository bootstrap, missing system tools do not prompt the user, stop the workflow, or trigger tool installation; the workflow proceeds and dependent checks are reported `NOT VERIFIED` with the missing tool identified. | [review] |
| AC-5 | Setup guidance describes automatic repository preparation, retains the manual bootstrap path, and explains that missing tools do not block the workflow and dependent checks remain `NOT VERIFIED`. | [review] |

## Backend tasks

These are `.claude` factory-coordinator and setup tasks, assigned to the backend developer because the scope has no separate factory-configuration role. They do not change product backend services.

### BE-1 Make bootstrap failures explicit and test safe repository selection
- Repo/module: `.claude` repository / `factory/scripts`
- Files: `.claude/factory/scripts/bootstrap.sh`; create `.claude/factory/scripts/tests/bootstrap-test.sh`
- Change: Keep `repos.txt` authoritative and preserve the current default of cloning only absent required repositories. On clone failure, emit a clear error naming the repository and target, include an actionable recovery instruction, and exit non-zero without removing or overwriting the target. Do not change existing-repository handling or make optional repositories part of the default clone.
- Unit tests: Add an isolated shell test using temporary workspace fixtures and local Git repositories. Verify required-only selection, absent-repository clone, existing-repository preservation, optional-repository exclusion, and non-zero/actionable failure on a conflicting target with its contents intact. Avoid network access and edits to product repositories.
- Docs: No separate docs changes in this task; setup instructions are updated in BE-3.
- Depends on: None
- Covers: AC-1, AC-2

### BE-2 Update Phase 0 to continue with a partial tool environment
- Repo/module: `.claude` repository / `/factory` coordinator and shared factory conventions
- Files: `.claude/skills/factory/SKILL.md`; `.claude/factory/CONVENTIONS.md`
- Change: Keep the sequence of checking the environment, bootstrapping absent required repositories, then rerunning the doctor before requirements work. Surface bootstrap failures and do not proceed as if preparation succeeded. Replace the missing-tools choice with automatic continuation: do not install system tools or ask the user whether to continue; record missing tools and require every dependent check to be `NOT VERIFIED` with its reason. Preserve the convention that optional repositories are fetched only on demand.
- Unit tests: No automated unit test for coordinator prose. Verify the updated Phase 0 and shared environment rules against AC-3/AC-4; run `git diff --check`.
- Docs: Shared policy text is part of this task; README and setup guide follow in BE-3.
- Depends on: BE-1 DONE
- Covers: AC-3, AC-4

### BE-3 Align quick-start and setup documentation with automatic continuation
- Repo/module: `.claude` repository / install and setup documentation
- Files: `.claude/README.md`; `.claude/factory/SETUP.md`
- Change: Explain that `/factory` preparation automatically bootstraps missing required repositories from `repos.txt`, while manual bootstrap remains available for users who want to prepare first. Remove instructions that require all missing tools to be fixed before starting the workflow. State that missing system tools are not installed by the factory and checks that depend on them remain `NOT VERIFIED`. Do not suggest cloning optional repositories by default.
- Unit tests: No automated unit test for prose. Check referenced commands and section links, confirm guidance agrees with the coordinator/conventions, and run `git diff --check`.
- Docs: These are the setup-document changes; no product release notes or README updates are in scope.
- Depends on: BE-2 DONE
- Covers: AC-5

## Frontend tasks

None — no workbench, UI, API, or generated-client changes are in scope.

## Dependency graph

`BE-1 → BE-2 → BE-3`

No frontend tasks.

## Test plan

| AC | Verifier | Test location / command |
|---|---|---|
| AC-1 | backend-developer | `.claude/factory/scripts/tests/bootstrap-test.sh` — isolated local-Git fixture; also run `bash -n .claude/factory/scripts/bootstrap.sh` |
| AC-2 | backend-developer | Failure/conflicting-target case in `.claude/factory/scripts/tests/bootstrap-test.sh`; assert non-zero status, repository/recovery details, and unchanged target contents |
| AC-3 | backend-expert | Review `.claude/skills/factory/SKILL.md` Phase 0 and compare bootstrap invocation/source-of-truth behavior with `.claude/factory/repos.txt` and `bootstrap.sh` |
| AC-4 | backend-expert | Review missing-tool branch in `.claude/skills/factory/SKILL.md` and corresponding rule in `.claude/factory/CONVENTIONS.md`; confirm no choice/install instruction remains and `NOT VERIFIED` is explicit |
| AC-5 | backend-expert | Review `.claude/README.md` and `.claude/factory/SETUP.md` quick-start/manual commands against the final coordinator behavior; check links and run `git diff --check` |

No `[system-api]` or `[browser]` checks apply: the plan changes factory coordination and setup material only, with no product endpoint or UI.

## Not verifiable locally

- End-to-end `/factory` behavior in a genuinely fresh workspace cannot be observed in this already-populated workspace without launching a separate Claude Code run. The bootstrap test uses isolated local fixtures and does not claim to verify the live coordinator.
- Node.js 20+ and Yarn 1.22 are missing in the current environment. No planned implementation check depends on them; if subsequent workflow checks do, they must be reported `NOT VERIFIED` with the missing tool. Do not install them as part of this scope.
- No `.claude/AGENTS.md` or workspace-root `AGENTS.md` was found. The relevant paths are `.claude/skills/factory/SKILL.md`, `.claude/factory/scripts/bootstrap.sh`, `.claude/factory/CONVENTIONS.md`, `.claude/factory/SETUP.md`, `.claude/README.md`, and `.claude/factory/repos.txt`.

## Changelog

- Round 1: Initial plan for coordinator, bootstrap failure handling, and setup guidance.
