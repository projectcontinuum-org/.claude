# Continuum Claude Code workspace config

Claude Code agents, skills and the **software factory** for Project Continuum. You describe a feature in plain
language, and a team of ten agents takes it from requirement to tested, reviewed code across the `continuum-*`
repos. You approve the scope and the plan. Nothing is committed for you.

- [Install](#install)
- [How the factory works](#how-the-factory-works)
- [Using it](#using-it)
- [Writing a good requirement](#writing-a-good-requirement)
- [Real-world examples](#real-world-examples)
- [Ideas vs. requirements](#ideas-vs-requirements)
- [After the run](#after-the-run)
- [Knowledge graph](#knowledge-graph)
- [Troubleshooting](#troubleshooting)
- [Contents of this repo](#contents-of-this-repo)

---

## Install

Clone this repo as `.claude/` in the **workspace root**, the folder that holds all `continuum-*` repos side by side:

```bash
mkdir continuum && cd continuum
git clone https://github.com/projectcontinuum-org/.claude.git .claude
claude                                   # start Claude Code in the workspace root
```

Start with `/factory <requirement>`. During preparation, `/factory` checks the environment and automatically
bootstraps absent required repositories listed as `yes` in `factory/repos.txt`, then refreshes the environment
profile. Optional repositories are not cloned by default. You can run
`.claude/factory/scripts/bootstrap.sh` yourself first if you prefer to prepare the repositories manually.

Missing system tools are not installed by the factory; once repository preparation succeeds, they do not block
requirements work. Any checks that depend on a missing tool are reported as `NOT VERIFIED` with the reason.

- **Full from-scratch guide:** [factory/SETUP.md](factory/SETUP.md) covers system tools for macOS and Linux, build caches, the browser driver and how to run the stack.
- **Restricted machine** (VPN, blocked npm registry): `cp .claude/factory/local-policy.example.md .claude/factory/local-policy.md` and keep the rules that apply. Every agent obeys that file.
- **Already have the repos?** Clone this repo into the existing workspace root. `bootstrap.sh` skips every repo that is already there.

---

## How the factory works

```
 you ──► /factory "<requirement>"
          │
          ▼
  1  Product Manager ───── feasibility study, scope, risks ──► questions to you
          │                                                    (you answer, it loops)
          ▼  GATE 1: you approve the requirements
  2  Planner ───────────── BE-n / FE-n tasks, dependencies, acceptance criteria AC-n
          │
          ▼  GATE 2: you approve the plan
  3  Backend Developer ─┐  in parallel. Frontend tasks that need a backend change
     Frontend Developer ┘  wait until that backend task is done
          │
          ▼
  4  Backend System Tester (k6) ┐
     Frontend Tester (browser)  │ in parallel. Failures and serious findings go back
     Backend Expert (review)    │ to the developers, up to 3 fix rounds, then you decide
     Frontend Expert (review)   ┘
          │
          ▼
  5  Technical Writer ──── continuum-docs pages for the platform version being prepared
                           (after verification is clean)
          │
          ▼
  6  Reporter ──────────── REPORT.md: overview, what changed, AC results, open items
```

### The ten roles

| # | Role | Agent | What it does | Writes | Edits code? |
|---|------|-------|--------------|--------|-------------|
| 1 | Product Manager | `factory-product-manager` | Turns your requirement into scope, a feasibility study and risks; asks you the open questions with a recommended option | `01-requirements.md` | No |
| 2 | Planner | `factory-planner` | Splits the approved scope into small `BE-n` / `FE-n` tasks, names the focused classes/components each one adds, orders them by dependency, writes testable acceptance criteria `AC-n` | `02-plan.md` | No |
| 3 | Backend Developer | `factory-backend-developer` | Implements `BE-n` in Kotlin/Spring Boot/Temporal with unit tests, OpenAPI spec, release notes, README and `AGENTS.md` updates; also does the backend fix rounds | code, `03-backend-dev.md` | Yes |
| 3 | Frontend Developer | `factory-frontend-developer` | Implements `FE-n` in the Theia/React workbench (and other Continuum UIs) with specs and `data-testid`s; regenerates API clients from the committed spec | code, `04-frontend-dev.md` | Yes |
| 4 | Backend System Tester | `factory-backend-system-tester` | Runs the changed services on a live stack and proves the `[system-api]` ACs with black-box k6 tests, incl. tenant isolation | k6 suites in `continuum-system-tests`, `05-backend-system-tests.md` | Tests only |
| 4 | Frontend Tester | `factory-frontend-tester` | Drives the real workbench in Chromium (Puppeteer / Playwright over CDP) for the `[browser]` ACs, with screenshots | scenarios, `06-frontend-browser-tests.md`, screenshots in git-ignored `.screenshots/` | Tests only |
| 4 | Backend Expert | `factory-backend-expert` | Senior review: correctness, tenancy, API contract, Temporal determinism, dependencies, house rules; reproduces findings with probes | `07-backend-review.md` | No |
| 4 | Frontend Expert | `factory-frontend-expert` | Senior review: workbench contracts, React/Theia patterns, accessibility, security, house rules | `08-frontend-review.md` | No |
| 5 | Technical Writer | `factory-technical-writer` | Documents the verified feature on the `continuum-docs` site for the platform version it ships in (`docs/` = next; never snapshots a version) | pages in `continuum-docs`, `09-docs.md` | Docs only |
| 6 | Reporter | `factory-reporter` | Writes the one-page report from the artifacts, checked against the real `git diff` | `REPORT.md` | No |

The coordinator is the `/factory` skill in your main conversation. It runs the gates, asks you every question,
launches the agents (developers in parallel; testers and experts in parallel) and keeps `state.md`. Agents never
talk to you directly and never start other agents.

Two helper agents live here too and are not part of the pipeline: `jsonforms-expert` (JSONForms dialogs for
`@ContinuumNode`s; the developers follow its conventions) and `workflow-builder` (builds `.cwf` workflows through the
api-server MCP server).

### Artifacts

Everything for one feature lives in `.claude/.factory/<task-id>/`, committed alongside the factory skills. A
workspace-root `.factory` symlink keeps the short paths used in reports and commands working.

| File | Written by | Content |
|------|------------|---------|
| `state.md` | coordinator | phase, task status, fix-round counters, your decisions, branch baselines, pause/resume point |
| `01-requirements.md` | Product Manager | problem, scope, feasibility, risks, decisions `D-n` (new rounds appended, never rewritten) |
| `02-plan.md` | Planner | tasks, dependency graph, acceptance criteria, test plan, what can't be verified locally |
| `03-` / `04-…-dev.md` | developers | per round: tasks, files, tests, commands and results, API contract changes |
| `05-` / `06-…-tests.md` | testers | AC → test → PASS / FAIL / NOT VERIFIED, how the stack ran |
| `07-` / `08-…-review.md` | experts | findings by severity (BLOCKER / MAJOR / MINOR / NIT) and a verdict, per round |
| `09-docs.md` | Technical Writer | target docs version, pages created/updated, docs build result |
| `REPORT.md` | Reporter | the final report |

### Rules every agent follows

From the house rules in [factory/CONVENTIONS.md](factory/CONVENTIONS.md):
- Agents read each repo's `AGENTS.md` before editing it.
- Release notes, README and the OpenAPI spec are updated in the same change as the code.
- Kotlin requires named arguments for every supplied argument wherever the declaration and call syntax permit them,
  including single-argument calls and tests; positional calls are limited to unavoidable Java/language constraints.
- Code is modular and follows SOLID: small single-purpose classes and components, new behaviour in new collaborators
  instead of growing big classes. Reviewers treat a monolithic class or component as a MAJOR finding.
- Code comments and docs explain the actual requirement; factory task IDs (`BE-3`, `AC-7`, ...) stay in `.factory/`.
- Questions to you never use factory IDs (`BR-2`, `Q-4`, `D-12`, ...): each one explains the problem, where it shows
  up and what each option does, so you can answer without opening the artifacts.
- Agents never commit, push or switch branches.
- A check that could not run is reported as `NOT VERIFIED`, never as passed.
- Network-dependent steps (Gradle online resolves, `yarn install`, `npm install`) follow the machine's environment
  profile and local policy; an exception, such as one online fetch of a new dependency, happens only with your OK.

### Running parts of a run on another machine

When this machine can't build or run something (for example the workbench behind a VPN that blocks npm), the
coordinator can hand a phase to Claude Code on another machine, such as a GitHub Codespace reached with
`gh codespace ssh`. That machine gets its own copy of `.claude/`, its own `factory/local-policy.md`, and the
`.factory/<slug>/` artifacts the phase needs. You decide when, and how the code moves between machines (you push a
branch, or the coordinator copies the files).

---

## Using it

| Command | What it does |
|---------|--------------|
| `/factory <requirement>` | Full run, from requirement to report. |
| `/factory setup` | Checks and prepares this machine. Use it on a new machine or after installing tools. |
| `/factory status <slug>` | Shows where a run stands: phase, task table, fix rounds. |
| `/factory resume <slug>` | Continues a run after a break, a closed session or a question you left open. |

The slug is the short name the factory gives your feature, e.g. `schedule-run-history`. It shows at the start of
the run and is the folder name under `.factory/`.

What you do during a run:
1. **Answer the Product Manager's questions.** Each comes with options and a recommended choice; picking the
   recommendation is always fine.
2. **Gate 1: approve the requirements.** Check the In scope / Out of scope list. This is the cheapest moment to cut
   or add something.
3. **Gate 2: approve the plan.** Check the acceptance criteria: they are exactly what gets tested. You are also asked
   which branch to create in each touched repo (suggested `factory/<slug>`; a ticket name such as `CONTNM-180`
   works too, and you can exclude repos).
4. **Start the workbench when asked**, if the feature has UI changes and this machine can't build the workbench
   itself. The browser tester needs it running with the new code.
5. **Decide on leftovers** if serious findings are still open after 3 fix rounds: fix more, accept as an open item,
   or drop from scope. Reviewers' and testers' findings that need a product decision come to you during the rounds
   too.
6. **Check the docs pages** the Technical Writer changed in `continuum-docs` (they are part of the same change).
7. **Read `REPORT.md`, then commit and open PRs yourself.**

You can talk to the coordinator at any time, e.g. "skip browser tests for this one", "add an AC for empty
lists", "stop after the plan", "pause the work", "hold the frontend until I say so". It updates
`.factory/<slug>/state.md` and carries on. A scope change mid-run goes back through the Product Manager and the
Planner, and you approve the revised requirements and plan before the developers continue.

---

## Writing a good requirement

The Product Manager asks about anything that is unclear, so a short requirement works. A requirement that answers
these five questions up front saves a round of questions and gives sharper acceptance criteria:

| Question | Example answer |
|----------|----------------|
| **Who** is it for? | "a workflow author", "an admin running the platform", "a node developer" |
| **What** can they do afterwards that they can't do today? | "see why a scheduled run failed without opening Temporal UI" |
| **Where** does it show up? | "in the Node Outputs dialog", "a new endpoint", "a new node in feature-base" |
| **Rules and edge cases** | "only the owner can see it", "max 100 rows", "empty list shows a hint" |
| **Done when…** | "I can open a failed run and see the error message of the failing node" |

Template:

```text
/factory As a <who>, I want <capability> so that <value>.
Where: <screen / endpoint / node / repo, if you know it>.
Rules: <limits, permissions, edge cases>.
Out of scope: <what you explicitly don't want now>.
Done when: <one or two observable outcomes>.
```

Tips:
- **Describe the outcome, not the implementation.** "Users can retry a failed node" beats "add a retry boolean to
  `NodeData`". The factory reads the code and proposes the how; you approve it at Gate 2.
- **Name the place if you know it**, e.g. "Manage Schedules tab", "REST node", "credentials server". It speeds up
  the feasibility study.
- **Say what is out of scope.** It stops the plan from growing.
- **One feature per run.** Two unrelated changes become two runs. They can run one after another in the same
  session.
- **Paste the evidence for bugs**: steps to reproduce, the error text, the run id, a screenshot path. The PM turns
  it into a test that fails before the fix.

---

## Real-world examples

The features below don't exist yet; each one fits the current Continuum code. They show the range of work the
factory covers.

### 1. Full-stack feature: run history per schedule

```text
/factory As a workflow author, I want to see the last 20 runs of a schedule in the Manage Schedules tab,
with status, start time and duration, so that I can tell whether a nightly job has been failing.
Clicking a run opens it like in the Workflow Runs tree.
Rules: only my own runs; newest first; a schedule that never ran shows "No runs yet".
Out of scope: charts, email alerts.
Done when: I open Manage Schedules, expand a schedule and see its recent runs; clicking one opens the run.
```

What to expect:
- **Product Manager:** finds that runs already store `{workflowName}/{scheduleName}.schedule` as their
  `workflowUri`, so filtering by schedule is feasible. It may ask whether paging is needed beyond 20 runs.
- **Planner:**
  - `BE-1`: a filter on `GET /api/v1/workflow-runs`, with the OpenAPI spec and endpoint inventory updated.
  - `FE-1`: regenerate the API clients (depends on `BE-1`).
  - `FE-2`: the run list in the Manage Schedules tab.
- **Testers and reviewers:**
  - The k6 tester checks that another tenant gets an empty list.
  - The browser tester expands a schedule and screenshots the list.
  - The reviewers check tenant scoping and the React effect cleanup.

### 2. Backend-only: a new node

```text
/factory Add a "Deduplicate Rows" node to continuum-feature-base (analytics feature).
It takes one table, lets the user pick key columns (none = all columns) and keep "first" or "last" occurrence,
and outputs the deduplicated table plus a flow variable with the number of removed rows.
Done when: the node appears in the node explorer under Analytics, and a workflow
CreateTable -> Deduplicate Rows removes the duplicates.
```

What to expect:
- **Product Manager:** finds the existing node pattern (`ProcessNodeModel`, `@ContinuumNode`, `.doc.md`) and nodes
  like `DynamicRowFilterNodeModel` to copy from.
- **Planner:** one or two `BE` tasks, including the JSONForms properties dialog, the node doc, the README node list
  and the release notes. No frontend tasks, because the workbench renders any node's dialog from its schema.
- **System tester:** runs a real workflow through the worker, and skips the test if the feature-base worker isn't
  running.

### 3. Frontend-only: UX improvement

```text
/factory In the Node Outputs dialog, add a "Copy as CSV" button to the table output view that copies the rows
currently loaded to the clipboard, with a header row. Show a short "Copied 50 rows" confirmation.
Out of scope: downloading the full output file.
```

What to expect:
- **Planner:** frontend tasks only, with CSV escaping kept in a pure helper so it gets a unit spec (commas, quotes,
  newlines, nulls).
- **Testers and reviewers:**
  - The browser tester opens a finished run, double-clicks a node, clicks the button and checks the clipboard.
  - The frontend expert checks the "Output not available" (404) state still works.

### 4. Bug fix

```text
/factory Bug: when a workflow is cancelled while a node is running, the Workflow Runs tree keeps showing
that node as BUSY after the run is CANCELLED. Expected: the node shows CANCELLED (dimmed, dashed border).
Steps: run a workflow with a slow REST node, cancel it from the runs tree, wait 10 s, refresh.
Run id where I saw it: <paste>.
```

What to expect:
- **Product Manager:** traces where node statuses come from (the orchestrator's run snapshot) and decides whether
  the bug is in the backend, the frontend or both.
- **Planner:** puts a test that reproduces the bug before the fix: a unit test or a k6 check that cancels a running
  workflow and asserts the node status.

### 5. API and contract change

```text
/factory The credentials server should let me rename a credential: PUT /api/v1/credentials/{name}
accepts a new "name" field. Nodes and workflows that reference the old name are out of scope,
but the response must warn that references are not updated.
Rules: renaming to an existing name is a 409; another tenant's credential is a 404.
```

What to expect:
- **Product Manager:** flags the compatibility risk and asks whether this counts as a breaking change for the
  release notes.
- **Backend Developer:** updates the endpoint inventory, the OpenAPI annotations, the committed spec and
  `OpenApiSpecTest`, as `continuum-platform-core/AGENTS.md` requires.
- **System tester:** checks the 409, the 404 for another tenant, and that the owner can still read the renamed
  credential.

### 6. Rough idea: let the Product Manager shape it

```text
/factory Idea: workflow authors keep asking "why is my workflow slow?". I want something that helps.
Not sure what yet.
```

The Product Manager doesn't build anything from this directly. It looks at what exists (per-node `durationMs`
flow variables, run snapshots, the runs tree) and comes back with options, for example:
- a duration badge per node in the run view;
- a "slowest nodes" table per run;
- a comparison with the previous run.

It gives a size for each option and a recommendation. You pick one, and the run continues as a normal
requirement.

### 7. Not feasible, and that's useful too

```text
/factory Run KNIME workflows directly in the browser without any worker.
```

The Product Manager answers `NOT FEASIBLE AS STATED`, explains why with evidence from the code (KNIME nodes run in
the `continuum-feature-knime` worker on the JVM), and suggests what would be feasible instead. You lose a few
minutes instead of a day.

---

## Ideas vs. requirements

| You have… | Start with | What happens |
|-----------|------------|--------------|
| A clear feature | `/factory <requirement>` using the template | A few questions, then the plan. |
| A rough idea or a problem | `/factory Idea: <problem>` | The PM proposes 2–4 options with sizes and a recommendation; you pick one. |
| A bug | `/factory Bug: <expected vs actual, steps, evidence>` | The plan includes a test that reproduces the bug before the fix. |
| A spec or ticket somewhere | Paste its text after `/factory` | The PM treats it as the requirement and asks about gaps. |
| Several features | One `/factory` per feature | Separate slugs, reports and branches. |

---

## After the run

`.factory/<slug>/REPORT.md` tells you:
- **Status:** `READY TO MERGE`, `READY WITH OPEN ITEMS` or `NOT READY`.
- **Acceptance criteria:** each one is `VERIFIED`, `PARTIALLY VERIFIED` or `NOT VERIFIED`, with evidence such as a
  test name or a screenshot path.
- **What changed:** per repo, checked against the real `git diff`.
- **Documentation:** the `continuum-docs` version and pages the Technical Writer updated.
- **User actions before merge:** things like a `yarn.lock` regeneration, an OpenAPI lint the agents couldn't run,
  or a commit and PR per repo.

Then:

```bash
cd continuum-platform-core && git status && git diff      # review what changed, repo by repo
git add -A && git commit -m "<feature>" && git push        # you commit; the agents never do
```

The detailed outputs of each step stay in `.factory/<slug>/`, so you can paste the relevant parts into your PR
descriptions.

---

## Knowledge graph

`knowledge/` is a curated map of the Continuum workspace (repos, modules, data flow, loops and flow variables, workbench,
dev-environment gotchas, feature history, plus a machine-readable `graph.json`). `CLAUDE.md` points every new chat
at it, `factory/CONVENTIONS.md` makes every agent read it, and the factory updates it after each change. Start at
[knowledge/README.md](knowledge/README.md).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `/factory` is not recognised | Start Claude Code from the workspace root (the folder containing `.claude/`), or reload the window. |
| Many checks are `NOT VERIFIED` | Read `.claude/.factory/environment.md` and "Missing for a full pipeline"; install any needed tools yourself using [factory/SETUP.md](factory/SETUP.md). The factory does not install system tools, and dependent checks remain `NOT VERIFIED`. |
| Browser tests are `BLOCKED` | Start the workbench with the changes (`yarn build && yarn start:workbench` in `continuum-workbench`) and say "workbench is running". |
| System tests don't cover the new code | `make up` runs released images. Let the tester run the changed service with `bootRun` (SETUP.md §5). |
| Asked to approve every agent launch | Approve once per run, or allow it in your Claude Code permission settings. |
| A run was interrupted | `/factory resume <slug>`. |
| A new agent isn't found right after adding it | Reload the Claude Code window; agent files are picked up at session start. |

---

## Contents of this repo

| Path | What |
|------|------|
| `skills/factory/SKILL.md` | the `/factory` coordinator |
| `agents/factory-*.md` | the 10 factory roles (see [The ten roles](#the-ten-roles)) |
| `agents/jsonforms-expert.md` | JSONForms schema/uischema specialist for `@ContinuumNode` dialogs |
| `agents/workflow-builder.md` | builds `.cwf` workflows via the api-server MCP server |
| `knowledge/` | curated Continuum knowledge graph (pages + `graph.json`), loaded via `CLAUDE.md` |
| `CLAUDE.md` | session memory: points every new chat at `knowledge/` |
| `factory/CONVENTIONS.md` | contract every factory agent reads first: artifacts, repo map, house rules |
| `factory/SETUP.md` | environment setup from scratch |
| `factory/repos.txt` | every Continuum repo, its URL and whether the factory needs it |
| `factory/scripts/bootstrap.sh` | clones missing repos (never touches existing ones), writes `.mcp.json` |
| `factory/scripts/doctor.sh` | read-only machine check → `.factory/environment.md` |
| `factory/mcp.json.template` | workspace-root `.mcp.json` (continuum MCP server on `localhost:3002`) |
| `factory/local-policy.example.md` | template for machine-specific restrictions |

Not in the repo (gitignored):
- **`settings.local.json`:** your Claude Code permissions on this machine.
- **`factory/local-policy.md`:** this machine's restrictions.
