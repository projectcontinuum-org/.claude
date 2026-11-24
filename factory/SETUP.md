# Continuum Software Factory — environment setup from scratch

Everything the factory agents need on a fresh machine. The agents follow this file themselves when the environment
profile reports something missing, except where a step is marked **user** (installing system software, anything
needing sudo, credentials or a GUI).

The factory is portable: `.claude/` at the workspace root is its own git repo (`.claude/agents/`, `.claude/skills/`,
`.claude/factory/`). Machine-specific files are gitignored: `settings.local.json` (Claude Code permissions) and
`factory/local-policy.md` (this machine's restrictions; start from `factory/local-policy.example.md`).

## 0. Quick path

```bash
mkdir continuum && cd continuum             # the workspace root (holds .claude/ and all repos side by side)
git clone https://github.com/projectcontinuum-org/.claude.git .claude        # must be named .claude, directly in the workspace root
.claude/factory/scripts/bootstrap.sh        # clone the required repos (+ git lfs pull), write .mcp.json
.claude/factory/scripts/doctor.sh           # check tools, write .factory/environment.md
```

Only on a restricted machine (VPN, blocked registries): `cp .claude/factory/local-policy.example.md
.claude/factory/local-policy.md` and keep the rules that apply.

Fix everything the doctor lists under "Missing for a full pipeline", re-run it, then use `/factory <requirement>`.

## 1. System tools (user)

| Tool | Why | macOS (Homebrew) | Debian/Ubuntu |
|------|-----|------------------|---------------|
| git + git-lfs | repos; api-server DuckDB extensions are LFS objects | `brew install git git-lfs` | `sudo apt install git git-lfs` |
| JDK 21 (Temurin) | all Kotlin/Gradle repos | `brew install --cask temurin@21` | `sudo apt install temurin-21-jdk` (Adoptium repo) |
| Node.js 20+ | workbench, system tests, browser tests | `brew install node@20` | nodesource / `nvm install 20` |
| Yarn 1.22 | workbench (`packageManager: yarn@1.22.21`) | `corepack enable` | `corepack enable` |
| Docker + Compose v2 | infra + platform stack | Docker Desktop / `brew install --cask docker` | `sudo apt install docker.io docker-compose-plugin` |
| k6 | backend system tests | `brew install k6` | grafana apt repo, `sudo apt install k6` |
| openapi-generator (optional) | regenerate workbench API clients | `brew install openapi-generator` | `npm i -g @openapitools/openapi-generator-cli` |
| Chrome/Chromium (optional) | headed browser tests / CDP | any Chromium-family browser | `sudo apt install chromium` |

Then `git lfs install` once per user. Gradle itself needs no install (every repo has `./gradlew`).

## 2. Repositories

`.claude/factory/repos.txt` lists every repo, its URL and whether the pipeline needs it.

```bash
.claude/factory/scripts/bootstrap.sh          # required repos
.claude/factory/scripts/bootstrap.sh --all    # everything
.claude/factory/scripts/bootstrap.sh continuum-feature-ai   # one more, on demand
```

The script never touches a repo that already exists. Agents clone an optional repo on demand when the plan needs it.

## 3. Build caches (agent may run, needs network once)

Run these once with network access; afterwards the agents work offline (`--offline`).

```bash
# Backend platform: fills the Gradle cache, runs the tests, and publishes the libraries + gradle plugin to
# ~/.m2 so feature repos can build against the local (unreleased) platform version.
cd continuum-platform-core && ./gradlew build publishToMavenLocal && cd ..

# Feature repos: they resolve org.projectcontinuum.* from mavenLocal() first, then Maven Central.
# Their continuumPlatformVersion (gradle.properties) must match a published or locally-published platform version.
cd continuum-feature-base && ./gradlew build && cd ..

# System tests: no dependencies beyond node + k6.
cd continuum-system-tests && npm test && npm run check && cd ..

# Workbench (skip if local-policy.md forbids it): installs node_modules, builds and starts on :3002.
cd continuum-workbench && yarn install --frozen-lockfile && yarn build && cd ..
```

## 4. Browser tools for the frontend tester (agent may run, needs network once)

The doctor looks for Puppeteer/Playwright in `.factory/tools/`, the global npm root, then the npx cache. Install into
the factory's own tools directory so nothing leaks into the repos:

```bash
npm install --prefix .factory/tools puppeteer          # downloads a matching Chrome for Testing
# or: npm install --prefix .factory/tools playwright && .factory/tools/node_modules/.bin/playwright install chromium
```

Scripts load it with `createRequire(import.meta.url)('<path from environment.md>')`.

## 5. Running the stack

| Need | Command | Notes |
|------|---------|-------|
| Released platform (smoke, regression) | `cd continuum-system-tests && make up` | images `CONTINUUM_PLATFORM_VERSION` (default in its compose file) + feature-base worker; `make down` removes it |
| Changed backend code | `cd continuum-platform-core/docker && docker compose up -d` (infra only), then `./gradlew :continuum-api-server:bootRun` etc. | ports and run commands in `continuum-platform-core/AGENTS.md`; run in the background, stop by PID |
| Changed feature worker | `./gradlew :worker:bootRun` in the feature repo, against the infra above | needs the platform libraries in `~/.m2` (step 3) when unreleased |
| Whole product incl. workbench (released) | `cd continuum-local-setup/docker && docker compose up -d` | workbench on http://127.0.0.1:3002 |
| Changed workbench | `cd continuum-workbench && yarn build && yarn start:workbench` | http://127.0.0.1:3002 |

Only one stack at a time: they share ports. Check with `docker ps` before starting one, and never stop a stack you did
not start.

## 6. Claude Code permissions (user)

The agents need Bash for `./gradlew`, `git diff/status`, `node`, `npm test`, `k6`, `docker compose`, `make`. If
permission prompts get in the way, add allow rules to `.claude/settings.local.json` (or run `/fewer-permission-prompts`).
Never allow `git commit`/`push` for the agents: commits stay with the user.

## 7. Verify

```bash
.claude/factory/scripts/doctor.sh
```

The pipeline is ready when "Missing for a full pipeline" says `nothing`. Partial setups still work: the agents read
the profile and report every check they could not run as `NOT VERIFIED` with the reason.
