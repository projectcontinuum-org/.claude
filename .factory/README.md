# Factory artifact repository

This directory is an independent Git repository for Continuum software-factory evidence.

## Layout

- `<task-id>/` contains one feature's requirements, plan, progress, test, review, documentation and final report.
- The preferred directory name is the ticket key from the branch being worked on, such as `CONTNM-180`.
- If no ticket key is present in a branch name, the factory uses the short kebab-case feature slug.
- `environment.md` is the latest machine capability snapshot produced by the factory doctor.
- `tools/` contains local browser-driver dependencies and is not feature evidence.

Task IDs are resolved from the primary touched repository's branch. Branch names such as
`factory/CONTNM-180` and `CONTNM-180` both resolve to `CONTNM-180`. When repositories use different branches,
the task state records every branch and the primary task ID remains the artifact directory name.

## History

The orchestrator records artifact changes in this repository after meaningful factory phases. Product repositories are
never committed by this process. Artifact commits include the standard Copilot co-author trailer.

