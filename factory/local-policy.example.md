# Local policy (this machine only)

Copy this file to `local-policy.md` (gitignored) and keep only the rules that apply to this machine. Rules here
override what the doctor detects; the doctor copies them into `.claude/.factory/environment.md`, so every agent sees them.
Delete the file entirely on an unrestricted machine.

Example rules for a machine on a corporate VPN that blocks the npm/yarn registries:

- **Workbench builds: FORBIDDEN.** Never run `yarn install`, `yarn build` or `./gradlew` in `continuum-workbench`:
  the VPN blocks the npm/yarn registries (403). Regenerating API clients with `bash scripts/generate-api-clients.sh`
  is allowed when `openapi-generator` is installed (it needs no network). Dependency changes (`package.json` +
  `yarn.lock`) are user actions. The user builds and runs the workbench themselves; retry a network install only when
  the user explicitly asks.
- **Gradle: always `--offline`.** Use the local cache and report a missing dependency instead of downloading it.
- **`npx` may be refused by auto mode** (e.g. `npx @redocly/cli`). Leave the OpenAPI Redocly lint to the user or CI
  when it is refused, and say so.
- **`rm -rf` is denied.** Use `mktemp -d` for scratch space instead of cleaning old directories.
- **credentials-server sources** (`continuum-platform-core/continuum-credentials-server/**`): open them with the Read
  tool, one file per call; Bash `cat` there is refused.
- **Subagent launches may need approval** in auto mode; the orchestrator asks the user once per feature.
