# System-test screenshots and automatic bootstrap
Status: NEEDS ANSWERS

## User story
As a Continuum workspace maintainer, I want to decide whether “continuum-system-test also contains pictures. can it be ignored ?” refers to screenshot files or the whole system-test repository, so that workspace setup avoids unwanted material without silently losing system-test coverage.

**User-visible outcome:** depending on the choice, either generated browser screenshots are excluded from version control, or `continuum-system-tests` is no longer cloned by default. These have different effects and should not be conflated.

## Context — what exists today
- `.claude/factory/repos.txt` marks `continuum-system-tests` as required (`yes`), so the default bootstrap clones it when absent.
- `.claude/factory/scripts/bootstrap.sh` selects required repositories by default; `--all` includes optional repositories and a repository name can be fetched on demand. `.claude/skills/factory/SKILL.md` describes this automatic bootstrap behavior.
- `continuum-system-tests/AGENTS.md` documents API/system coverage and browser suites under `suites/ui/`; the system-test phase is part of the factory pipeline in `.claude/factory/CONVENTIONS.md`.
- The browser suites write PNG evidence to `SHOT_DIR`, defaulting to `screenshots/` (`continuum-system-tests/suites/ui/lib.mjs`, `README.md`). The current repository has no tracked screenshot files; its working tree has untracked screenshot output among 13 changed paths. The current screenshot directory is about 4.1 MB and the repository about 5.5 MB.
- The repository's current uncommitted changes are pre-existing and outside this requirements artifact; they must not be overwritten or treated as part of this request.

## Feasibility

| part | verdict | evidence | notes |
|---|---|---|---|
| Exclude generated screenshot images from version control while keeping system tests available | FEASIBLE WITH CHANGES | `continuum-system-tests/.gitignore`; `continuum-system-tests/suites/ui/lib.mjs`; `continuum-system-tests/AGENTS.md` | A narrow ignore rule could hide generated screenshot output, but would also hide browser evidence from normal Git status. No screenshots are currently tracked. |
| Make the whole system-test repository optional in automatic bootstrap | FEASIBLE WITH CHANGES | `.claude/factory/repos.txt`; `.claude/factory/scripts/bootstrap.sh`; `.claude/skills/factory/SKILL.md`; `.claude/factory/CONVENTIONS.md`; `.claude/factory/SETUP.md` | Changing the repo marker to `no` prevents the default clone and means doctor no longer treats its absence as blocking. System-testers or tasks needing system coverage would need explicit on-demand fetch instructions; otherwise verification could be skipped on fresh workspaces. |
| Preserve system verification if the repository becomes optional | FEASIBLE WITH CHANGES | `.claude/skills/factory/SKILL.md`; `.claude/factory/CONVENTIONS.md`; `continuum-system-tests/AGENTS.md` | Would require clarifying when the orchestrator/tester fetches the optional repo. No API, model, tenancy, or security-contract changes are implied. |

**API impact:** none; no endpoint or OpenAPI/client changes.

**Data/model impact:** none; no Postgres, Avro, Parquet, or mirrored Kotlin/TypeScript enum changes.

**Multi-tenancy and security:** no effect on tenant isolation, `x-continuum-user-id`, credentials, or input validation. The principal concern is verification coverage, not runtime security behavior.

**Compatibility and upgrade impact:** no product compatibility impact. Making the repo optional changes default setup for new workspaces and requires corresponding factory documentation; it does not remove a repository already present. Ignoring screenshots changes local visibility/version-control behavior, not test execution.

**Environment limits:** `.factory/environment.md` reports Node.js 20+ and Yarn missing. System-test `npm test` and `npm run check` therefore are **NOT VERIFIED: Node.js is unavailable**. The repository is present; k6 and Docker are available. No software or code changes were made for this assessment.

## Scope
**In**
- Decide whether “ignore” means screenshot handling or changing the repository's default bootstrap status.
- If the repository is made optional, preserve system verification through an explicit on-demand fetch policy.

**Out**
- Deleting screenshots or any repository content.
- Changing system-test suites, browser behavior, API contracts, or product code.
- Ignoring all files in `continuum-system-tests` or removing system testing from the factory pipeline.

**Assumptions**
- “Pictures” refers to generated PNG browser-test screenshots, rather than a different binary asset type.
- The question concerns factory workspace setup/version-control behavior, not whether the images affect test execution.

## Risks

| risk | impact | mitigation |
|---|---|---|
| Excluding the entire repository from automatic bootstrap is mistaken for excluding only pictures | System/API/browser verification may not run in a fresh workspace | Keep the repository required unless the user confirms the optional-bootstrap behavior; if changed, fetch it on demand for system-test work |
| Ignoring screenshot outputs hides useful browser-test evidence | Reviewers may not notice generated evidence or may fail to retain requested captures | Prefer keeping screenshots visible unless the user explicitly wants generated image files ignored |
| Optional repository handling is undocumented | A tester may reach the system-test phase without its required scripts | Update factory guidance to fetch the repository before any applicable system-test phase |

## Size
S if limited to a screenshot ignore rule or repository bootstrap metadata and matching documentation. The main risk is accidentally weakening verification when making the repository optional.

## Draft acceptance outcomes
- **Given** a fresh workspace and `continuum-system-tests` is required, **when** default bootstrap runs, **then** the system-test repository is fetched and remains available for system verification.
- **Given** generated browser screenshots are configured to be ignored, **when** a browser suite writes PNG files into its screenshot output directory, **then** those generated files do not appear as untracked changes, while suite execution still works.
- **Given** the repository is made optional, **when** a factory task reaches a system-test phase that needs it, **then** the repository is fetched on demand before the tests are attempted, and the absence does not silently count as successful verification.
- **Given** Node.js is unavailable, **when** local system-test checks are reported, **then** `npm test` and `npm run check` are marked **NOT VERIFIED** rather than passed.

## Decisions
None.

## Open questions
### Q-1
When you ask whether `continuum-system-tests` can be ignored because it contains pictures, do you mean ignoring generated screenshot files or excluding the entire repository from automatic workspace bootstrap? The repository contains system and browser verification suites, so excluding the repository by default could delay or weaken verification in fresh workspaces.

- **Keep the repository required in automatic bootstrap and leave screenshot handling unchanged (Recommended):** all workspaces have system-test coverage available; no default download is avoided.
- Make the repository optional in automatic bootstrap, but fetch it on demand before system-test work: smaller default workspace preparation; requires explicit fetching and may delay verification.
- Keep the repository required, but ignore generated `screenshots/*.png` files in Git: tests remain available and generated images stop showing as untracked changes; browser evidence will no longer be visible through normal Git status.
