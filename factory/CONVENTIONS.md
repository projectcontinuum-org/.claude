# Continuum Software Factory — shared contract

Every factory agent reads this file first. It is the single source for the artifact layout, the repo map, the
environment rules and the house rules; agent files only add their role-specific instructions.

**Workspace root** = the directory that contains `.claude/` (two levels above this file). All repos sit side by side
in it; it is not itself a git repo. Every path below is relative to it — never assume an absolute path, user name or
OS. The factory must run unchanged on any machine.

## Environment first (every agent, every run)

1. Read `.factory/environment.md` (written by `.claude/factory/scripts/doctor.sh`). If it is missing or older than
   this session's work, run `.claude/factory/scripts/doctor.sh --quiet` and read it.
2. Its **Local policy** section is binding and overrides the defaults below (e.g. "workbench builds forbidden").
3. If something you need is missing, follow `.claude/factory/SETUP.md`:
   - a repo is ABSENT → `.claude/factory/scripts/bootstrap.sh <repo>`;
   - a build cache / browser driver is missing and the network allows it (see the profile's Network section, and the
     local policy does not forbid it) → run the matching SETUP.md step, then re-run the doctor;
   - a **system tool** is missing (JDK, Node, Docker, k6, git-lfs) or a step needs sudo/credentials/GUI → do not
     install it; report `ENV: <what> missing — SETUP.md §<n>` so the orchestrator asks the user.
4. Never let a missing tool turn into a false PASS: the affected checks are `NOT VERIFIED: <reason>`.

## Pipeline

```
/factory <requirement>
  1. product-manager      → 01-requirements.md   (feasibility + open questions; user answers loop back)
     ── GATE: user signs off the requirements
  2. planner              → 02-plan.md           (BE/FE tasks, dependencies, acceptance criteria)
     ── GATE: user approves the plan
  3. backend-developer    → 03-backend-dev.md    ┐ parallel; FE tasks that depend on a BE task
     frontend-developer   → 04-frontend-dev.md   ┘ start only after that BE task is DONE
  4. backend-system-tester→ 05-backend-system-tests.md   ┐
     frontend-tester      → 06-frontend-browser-tests.md │ parallel; failures and blocking
     backend-expert       → 07-backend-review.md         │ findings go back to the developers
     frontend-expert      → 08-frontend-review.md        ┘ (max 3 fix rounds, then the user decides)
  5. technical-writer     → 09-docs.md           (continuum-docs for the platform version being prepared)
  6. reporter             → REPORT.md
```

The orchestrator is the `/factory` skill running in the main conversation. Subagents cannot ask the user questions or
start other agents: anything that needs the user goes back to the orchestrator in your final message.

## Artifact layout

`.factory/` is stored at `.claude/.factory/` and is committed by the `.claude` Git repository. A workspace-root
`.factory` symlink is created for compatibility. All hand-off documents for one feature live in
`.claude/.factory/<task-id>/`; `environment.md` and `tools/` remain at its root. The preferred task ID is the ticket key from
the primary touched repository's branch, for example `CONTNM-180`. A short kebab-case feature slug is used only when
no ticket key is present. Branch names may include a prefix such as `factory/CONTNM-180`; the directory uses the
ticket key without the prefix.

When multiple repositories are touched, use the primary feature branch as the directory key and record every
repository branch in `state.md`. Existing slug directories are legacy evidence and must not be silently renamed.

The orchestrator initializes the artifact directory with `.claude/factory/scripts/init-artifacts.sh` and records
artifact changes in the `.claude` repository with `.claude/factory/scripts/record-artifacts.sh <task-id> "<message>"`.
Those commits are scoped to `.claude/.factory/<task-id>/`; product repositories are never staged or committed by
these scripts.

(`.factory/` also holds `environment.md` and `tools/`.)

| File | Owner | Content |
|------|-------|---------|
| `state.md` | orchestrator | phase, task status table, fix-round counters, repo baselines |
| `01-requirements.md` | product-manager | problem, scope, feasibility, risks, decisions, open questions |
| `02-plan.md` | planner | tasks `BE-n` / `FE-n`, dependencies, acceptance criteria `AC-n` |
| `03-backend-dev.md` | backend-developer | per round: tasks done, files changed, unit tests, commands + results |
| `04-frontend-dev.md` | frontend-developer | same, for frontend |
| `05-backend-system-tests.md` | backend-system-tester | AC → test mapping, how the stack ran, results |
| `06-frontend-browser-tests.md` | frontend-tester | AC → scenario mapping, results, `screenshots/` |
| `07-backend-review.md` | backend-expert | findings by severity, verdict |
| `08-frontend-review.md` | frontend-expert | findings by severity, verdict |
| `09-docs.md` | technical-writer | target docs version, pages created/updated, docs build result |
| `REPORT.md` | reporter | feature overview and what changed |

Rules for artifacts:
- Only write your own file(s). Append a new `## Round <n>` section on re-runs instead of rewriting history.
- Refer to tasks and criteria by ID (`BE-2`, `FE-1`, `AC-4`). Refer to code as `repo/path/File.kt:line`.
- Write facts you verified. Mark anything you could not verify as `NOT VERIFIED: <reason>` — never imply it passed.
- The first `state.md` section records the task ID, source branch for every touched repository, and the baseline
  `git status --short` count. Each later phase appends progress; do not rewrite prior evidence.

## Repo map

The workspace holds several independent git repos (no root repo). URLs and which ones are required are in
`.claude/factory/repos.txt`; clone missing ones with `.claude/factory/scripts/bootstrap.sh`.

| Area | Repo(s) | Stack | Verify with |
|------|---------|-------|-------------|
| Backend platform | `continuum-platform-core` | Kotlin 2.2, Spring Boot 4, Temporal, Kafka, Gradle, JDK 21 | `./gradlew :<module>:test` |
| Backend nodes | `continuum-feature-{base,ai,cheminformatics,knime,template}` | Kotlin `@ContinuumNode` workers | `./gradlew :<module>:test` (needs platform libs in `~/.m2` when on an unreleased version) |
| Frontend | `continuum-workbench` | Theia, React 18, TS 5, React Flow, JSONForms, Yarn 1.22 | `yarn workspace @continuum/workflow-editor-extension test`, `tsc --noEmit` (both need `node_modules`) |
| Frontend (small) | credentials-server embedded UI in `continuum-platform-core`, `continuum-jsonforms-playground`, `continuum-website` | React/Vite | as available |
| System tests | `continuum-system-tests` | k6 (API), browser suites under `suites/ui/` | `npm test`, `npm run check`, k6 against a live stack |
| Docs | `continuum-docs` | Docusaurus (versioned by platform version: `docs/` = next, `versioned_docs/` = released) | `npm run build` (needs `node_modules`) |
| Deploy | `continuum-charts`, `continuum-local-setup` | Helm, docker-compose | — |

Frontend ↔ backend contract: the workbench calls the platform only through typescript-axios clients in
`continuum-workbench/workflow-editor-extension/src/generated/`, generated from the OpenAPI specs committed in
`continuum-platform-core/docs/api/`. A frontend task that needs a new or changed endpoint therefore depends on the
backend task that updates the committed spec.

## House rules (binding for every agent)

1. **DOX first.** Before editing any repo, read its root `AGENTS.md` and every `AGENTS.md` on the path to the files you
   touch. They override anything here for local details. After editing, do the DOX pass those files describe.
2. **Release notes with every change**: `release_notes/RELEASE_NOTES_v<version being prepared>.md` in that repo
   (`platformVersion` in `gradle.properties` for core, root `package.json` `version` for the workbench). Never edit a
   released version's file (a `release/<version>` tag exists) — ask via the orchestrator instead.
3. **README with every module change**: the module's own README, otherwise the repo root README.
4. **OpenAPI with every API change** in `continuum-platform-core`: inventory, `docs/api/CONVENTIONS.md`, annotations,
   regenerated committed spec, `OpenApiSpecTest` — per "API Documentation Contract" in its `AGENTS.md`.
5. **Kotlin named arguments are mandatory**: name every supplied argument at every call to a Kotlin-declared
   function or constructor whenever the declaration and call syntax permit it. This includes single-argument calls,
   constructors, data classes, lambda arguments and tests. A supported positional Kotlin call violates this rule;
   use a named-capable call form where available. Positional arguments are permitted only when calling a Java-declared
   API or when Kotlin syntax/declarations do not support named arguments. Do not add wrappers solely to enable names.
   Also use descriptive names and explanatory locals instead of dense one-liners.
6. **Network-dependent builds follow the environment profile.** Run `yarn install`/`yarn build` in
   `continuum-workbench` only when `node_modules` is absent, the npm/yarn registry is reachable and the local policy
   does not forbid it. A `package.json` dependency change needs a matching `yarn.lock` (CI runs `--frozen-lockfile`):
   if you cannot regenerate it, do not change the dependency — report it as a user action.
7. **Gradle**: when the profile shows a populated Gradle cache, prefer `./gradlew --offline ...`; drop `--offline`
   only when Maven Central is reachable and a dependency is genuinely missing (and the local policy allows it).
8. **No git writes**: never commit, push, reset, stash, rebase or switch branches. The orchestrator handles branches only
   with the user's consent. Use `git diff` / `git status` freely. `bootstrap.sh` cloning a missing repo is allowed.
9. **No destructive shell**: no `rm -rf`, no `docker compose down -v` / `make down` on a stack you did not start; use
   fresh temp dirs (`mktemp -d`) instead of cleaning old ones. Stop processes you started by PID.
10. **Tool refusals**: if the harness refuses a command (permission or auto-mode block), do not retry variants of it —
    report the step as not run, with the command, so the user can run it.
11. **Scope discipline**: implement exactly the approved plan. A needed change outside the plan goes in your report as
    `SCOPE: <what and why>` for the orchestrator to raise, unless it is a trivial, obviously required adjustment
    (then do it and list it).
12. **Modular, maintainable code (SOLID)**: code written by the factory must be easy to read, test and change.
    - **Single responsibility**: each class, component, hook or module has one reason to change. If you can only
      describe it with "and" ("parses the condition *and* schedules iterations *and* merges variables"), split it.
    - **Open/closed**: add behaviour by adding a collaborator (a new implementation, strategy, renderer, handler), not by
      growing `when`/`switch` chains or boolean flags inside an existing class.
    - **Liskov**: an implementation of an interface honours its whole contract; no "not supported" overrides.
    - **Interface segregation**: small, role-specific interfaces and props; no catch-all service or a component taking
      a dozen unrelated props.
    - **Dependency inversion**: depend on interfaces at seams that need swapping or faking in tests (engine, clock,
      I/O, external clients); inject them (Spring constructor injection, Theia `inversify`, constructor parameters in
      Temporal workflow code, props/hooks in React).
    - **No monoliths.** Size signals that call for a split: a class or component over ~300 lines, a function over
      ~40 lines, more than ~5 constructor dependencies, deeply nested branches, a React component that holds both
      substantial logic and rendering. These are review triggers, not hard limits; a justified exception is stated in
      the report.
    - **Existing large classes** (e.g. a big executor or dialog): put the new behaviour in new, focused collaborators
      and keep the edit to the existing class a thin delegation. Do not refactor existing code beyond what the task
      needs — a wider clean-up is `SCOPE:`.
    - Prefer pure functions for logic (easy to unit-test), keep framework glue thin, and name things for what they do.
13. **No factory IDs in the product.** Task, criterion and decision IDs (`BE-n`, `FE-n`, `AC-n`, `D-n`, `PR-n`, `P-n`,
    `Q-n`, `SCOPE-n`) exist only in `.factory/` artifacts. They mean nothing to a future reader of the code, so they
    must never appear in code comments, KDoc/TSDoc, test names or messages, `AGENTS.md`, READMEs, release notes,
    OpenAPI descriptions or commit-ready docs. Write the actual requirement or reason instead: what the behaviour is,
    why it exists and the rule it enforces (e.g. not "progress never goes down (BE-10, AC-25)" but "progress never goes
    down: a loop resets its members between iterations, so the completed-node count can drop"). Trace code back to
    tasks only in your own `0x-*.md` report (task → files, test → AC).
14. **Questions to the user are self-contained.** The user answers without the artifacts in front of them, so no
    factory ID (task, AC, decision, `Q-n`, review finding `BR-n`/`FR-n`, tester finding `F-n`, `SCOPE-n`) appears in
    a question, its header or its options. Each one says in plain words what the problem or choice is, where it shows
    up, why it matters and what each option does. Agents write open questions and decision items that way; the
    orchestrator never forwards an ID-only question.
