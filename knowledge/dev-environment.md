# Dev environment and gotchas (verified on the maintainer's Linux box)

Shell: bash; source `~/.bashrc`/`~/.bash_profile` per the factory shell rules.

| Need | Command |
|------|---------|
| Node/Yarn | `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24` |
| Gradle | JDK 21 required (default JDK 25 breaks it): `export JAVA_HOME=$HOME/.sdkman/candidates/java/21.0.11-tem PATH=$JAVA_HOME/bin:$PATH`; add `--offline` |
| Platform tests | `./gradlew :continuum-orchestration-service:test :continuum-message-bridge:test :continuum-commons:test --offline` |
| Workbench specs/types | in `workflow-editor-extension`: `npx tsc --noEmit`; `yarn -s test` |
| Docs build | in `continuum-docs`: `npm run build` |
| Rebuild orchestrator image | `./gradlew :continuum-orchestration-service:jibDockerBuild`, then in `continuum-system-tests/docker`: `docker compose up -d --no-deps --force-recreate continuum-orchestration-service` |
| Run workbench for screenshots | in `continuum-workbench/continuum-workbench`: `./node_modules/.bin/theia start --plugins=local-dir:./plugins --port 3005`; then in `continuum-system-tests`: `WORKBENCH_UPSTREAM=http://127.0.0.1:3005 PROXY_PORT=3013 node suites/ui/proxy.mjs`; drive with `suites/ui/lib.mjs` |

## Gotchas

- **Screenshots/images are never versioned.** Agents write them to `.claude/.screenshots/<task-id>/round-<n>/`
  (ignored by `.claude/.gitignore`; use `SHOT_DIR=<abs path>` for `continuum-system-tests/suites/ui`). Reports cite the path only.

- "Feature not working" after a backend change → the running docker container is probably the old published image
  (this happened with `iteration` in CEL). Rebuild + recreate, then confirm inside the container.
- Worker image `continuum-feature-base:0.0.10` lacks newer node changes (e.g. Kotlin `flow`) until rebuilt.
- `pkill`/`killall` are blocked: use `pgrep` then `kill <pid>`.
- Workbench `tsconfig.test.json` only compiles `src/common`; specs elsewhere are not run.
- After editing `continuum-core/src/types`, run `npx tsc` in `continuum-core` so `dist/` types update.
- Do not commit product repos unless asked. Co-authored-by trailer rule applies when committing.
- Be honest in reports: state what was not rebuilt/run in a browser.
