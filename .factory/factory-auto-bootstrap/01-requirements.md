# Automatically bootstrap repositories for `/factory`
Status: READY FOR PLANNING

## User story
As a developer starting from a fresh workspace, I want `/factory <requirement>` to clone the required Continuum product repositories beside `.claude/` automatically, so that I can begin the factory workflow without running a separate bootstrap command.

The user-visible outcome is that a fresh workspace is populated with the required repositories before the factory processes the feature requirement. The factory continues to respect its environment checks and reports any missing tools.

## Context — what exists today
- The factory workspace contract says `.claude/` and product repositories live side by side, and `.claude/factory/repos.txt` identifies required repositories.
- `/factory` already initializes artifacts and runs the doctor before requirements work. Its Phase 0 says to run `.claude/factory/scripts/bootstrap.sh` when required repositories are absent, then rerun the doctor: `.claude/skills/factory/SKILL.md` (Phase 0).
- `bootstrap.sh` clones only missing repositories listed as required by default, into the workspace root; it does not pull, reset, or switch existing repositories. It also pulls LFS objects when available and creates `.mcp.json` if absent: `.claude/factory/scripts/bootstrap.sh`.
- The current required-repository list is `continuum-platform-core`, `continuum-workbench`, `continuum-system-tests`, and `continuum-feature-base`; optional repositories are not cloned by the default command: `.claude/factory/repos.txt`.
- Setup documentation currently describes running bootstrap manually before `/factory`: `.claude/factory/SETUP.md` and `.claude/README.md`.
- The current workspace has `.claude` and side-by-side product repositories. The latest doctor report says all required repositories are present, but Node.js 20+ and Yarn 1.22 are missing: `.factory/environment.md`. Therefore, a default bootstrap run here would not clone product repositories, and this workspace cannot demonstrate the fresh-workspace case.
- The `.claude` repository source branch is `CONTNM-180`. This artifact uses the requested slug `factory-auto-bootstrap` to avoid colliding with existing feature artifacts for that branch.
- No `.claude/AGENTS.md` is present. The requested behavior lives in the `.claude` factory coordinator and setup guidance; it does not require changing product repositories.

## Feasibility

| part | verdict | evidence | notes |
|---|---|---|---|
| Clone required repositories automatically before processing a feature | FEASIBLE — already present | `.claude/skills/factory/SKILL.md` Phase 0; `.claude/factory/scripts/bootstrap.sh`; `.claude/factory/repos.txt` | The coordinator already bootstraps absent required repositories and reruns the doctor. No implementation change appears necessary for the core behavior. |
| Clone into the same workspace and preserve existing repositories | FEASIBLE — already present | `.claude/factory/CONVENTIONS.md` (workspace root); `.claude/factory/scripts/bootstrap.sh` | The script resolves the workspace root from `.claude/` and skips repositories that already exist as Git repositories. Existing local changes are not overwritten. A non-Git directory occupying a target path may make cloning fail; failure should be surfaced rather than cleaned up. |
| Decide whether missing Node.js/Yarn should block entry into requirements | FEASIBLE WITH CHANGES | `.claude/skills/factory/SKILL.md` Phase 0 step 3; `.claude/factory/SETUP.md` §1 | The coordinator currently pauses for a user choice when tools are missing. Continuing with a partial environment is already an offered choice, and impacted checks must be reported `NOT VERIFIED`. Whether to remove that pause is unresolved below. |
| Affected repository/modules and API impact | FEASIBLE | `.claude/skills/factory/SKILL.md`; `.claude/README.md`; `.claude/factory/SETUP.md`; `.claude/factory/scripts/bootstrap.sh` | Any needed changes are orchestration/setup guidance in `.claude`; no product backend or frontend change and no endpoint/OpenAPI/client-generation impact are indicated. |
| Data/model, multi-tenancy, and security impact | FEASIBLE | `.claude/factory/scripts/bootstrap.sh`; `.claude/factory/repos.txt`; `.claude/factory/CONVENTIONS.md` | No application data, schemas, Avro/Parquet, or mirrored core enums are involved. There is no tenant/user-data behavior. Bootstrap uses repository URLs configured in `repos.txt` and does not request credentials or modify existing Git repositories; clone/network/path failures need to be reported clearly. |
| Compatibility and upgrade impact | FEASIBLE | `.claude/skills/factory/SKILL.md`; `.claude/factory/SETUP.md`; `.claude/README.md` | No product release-note or database upgrade impact. If setup guidance changes, keep the manual setup path accurate for users who want to bootstrap before launching Claude Code. |
| Local verification | FEASIBLE WITH CHANGES | `.factory/environment.md`; `.claude/factory/scripts/doctor.sh`; `.claude/factory/scripts/bootstrap.sh` | Git and Git LFS are available and GitHub returned HTTP 200 in the doctor profile. Node.js and Yarn are missing, so Node/Yarn-dependent workflow checks cannot be verified locally. Required repositories already exist here, so the clean-workspace clone path cannot be observed without a separate empty test workspace. No clone test has been run. |

## Scope
**In**
- Ensure `/factory <requirement>` handles absent required repositories by cloning them beside `.claude/` before requirements work.
- Retain the repository list as the source of truth for which repositories are required.
- Preserve existing repositories and report bootstrap/environment failures without destructive cleanup.
- Resolve whether missing system tools should pause the workflow or allow immediate partial continuation.

**Out**
- Cloning optional repositories unless a feature needs them.
- Installing Node.js, Yarn, or other system tools.
- Pulling, resetting, or switching branches in repositories already present.
- Changing product APIs, data models, or application behavior.

**Assumptions**
- “Required product repositories” means repositories marked `yes` in `.claude/factory/repos.txt`; optional repositories remain on-demand.
- Git clone failures, unavailable network, and an occupied non-Git target directory must stop or pause the run with an actionable explanation; the factory must not delete or overwrite user files.
- The requested slug is the artifact key for this work, despite the `.claude` source branch being `CONTNM-180`.

## Risks

| risk | impact | mitigation |
|---|---|---|
| Clone fails due to unavailable network, permissions, or a target-path conflict | Requirements work cannot begin from a clean workspace | Surface the failing repository and cause, preserve existing contents, and give the user the documented manual recovery path. |
| Required repositories are cloned but tools remain absent | Some pipeline checks cannot run | Keep doctor results visible; mark affected checks `NOT VERIFIED`; ask the user whether to continue partially or install tools. |
| Documentation implies `/factory` can run without launching from the workspace root | The skill may not be discoverable or may resolve the wrong workspace | Keep the workspace-root requirement explicit in setup and usage guidance. |

## Size
**S** if limited to confirmation/documentation of the current behavior. If the missing-tools pause is changed, it remains a small coordinator-flow change; main risk is unintentionally bypassing the user’s existing environment choice.

## Draft acceptance outcomes
- **Given** a workspace containing `.claude/` and none of the required product repositories, **when** the developer invokes `/factory` with a feature requirement, **then** the required repositories are cloned beside `.claude/` before the factory begins requirements work.
- **Given** a workspace where some required repositories already exist and others are absent, **when** `/factory` prepares the workspace, **then** only absent required repositories are cloned and existing repository contents and branches are left unchanged.
- **Given** a required repository cannot be cloned, **when** `/factory` prepares the workspace, **then** the failure is reported with the repository and an actionable next step, and no existing path is destructively replaced.
- **Given** required repositories are present but Node.js 20+ or Yarn is missing, **when** `/factory` completes environment preparation, **then** the behavior follows the user’s decision below and any affected checks are identified as not verifiable.

## Decisions
- Use `factory-auto-bootstrap` as the task artifact slug to avoid colliding with existing `CONTNM-180` feature artifacts.
- Treat repositories marked `yes` in `repos.txt` as the required set; do not clone all optional repositories by default.

## Open questions

### Q-1 — Should missing Node.js or Yarn pause `/factory` before requirements work?
The factory can clone the required repositories without Node.js or Yarn, but those missing tools limit later workbench and system-test verification. The current coordinator pauses and asks whether to set up what it can, continue with a partial environment, or stop. Should `/factory` keep that pause or start requirements work automatically?

- **Recommended — Continue with a partial environment:** After repository bootstrap, start requirements work without another environment-choice prompt. Do not install system tools; record the missing tools and mark affected checks `NOT VERIFIED`.
- **Keep the current environment choice:** After bootstrap, ask whether to continue partially, stop for the user to install system tools, or run only the permitted setup steps before starting requirements.
- **Automatically stop for missing tools:** After bootstrap, stop before requirements work and tell the user to install Node.js and Yarn, then rerun `/factory`.

## Round 2

Status: READY FOR PLANNING

### Decisions
- **Missing system tools:** After repository bootstrap, proceed automatically with the environment available. Do not pause to ask the user whether to continue, and do not install missing system tools. Record missing tools and mark every affected later check `NOT VERIFIED` with the reason. This resolves Q-1; no further user decision is needed.
- This Round 2 decision supersedes Round 1 references to asking the user whether to continue partially or install tools.

### Scope clarification
- Missing Node.js, Yarn, or any other system tool does not block requirements or planning after repository bootstrap.
- Missing tools remain visible in environment reporting. Checks that depend on an unavailable tool must not be reported as passed; specifically, Node/Yarn-dependent workbench and system-test checks are `NOT VERIFIED` while those tools are absent.
- This decision does not change repository bootstrap failure handling: if a required repository cannot be cloned, report the failure and actionable recovery without deleting or overwriting existing paths.

### Updated draft acceptance outcomes
- **Given** repository bootstrap has completed and one or more system tools are missing, **when** `/factory` prepares the environment, **then** it proceeds without asking the user to choose whether to continue and does not install tools.
- **Given** later verification requires a missing tool, **when** the check is reported, **then** it is marked `NOT VERIFIED` with the missing tool and affected check identified.
- **Given** a required repository cannot be bootstrapped, **when** `/factory` prepares the workspace, **then** the failure is reported with an actionable next step and no existing path is destructively replaced.

### Open questions
None.
