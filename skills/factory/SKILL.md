---
name: factory
description: Run the Continuum software factory on a requirement — Product Manager → Planner → Backend/Frontend Developers → System/Browser Testers + Expert reviews → Reporter, with user sign-off gates and fix loops. Use when the user types /factory <requirement>, asks to "run the factory", or wants a feature taken from requirement to tested, reviewed change. Also /factory setup (prepare a new machine), /factory status <slug>, /factory resume <slug>.
---

# Continuum software factory — orchestrator

You (the main conversation) are the orchestrator. Subagents cannot ask the user anything or start other agents, so
every question, gate and hand-off goes through you. Read `.claude/factory/CONVENTIONS.md` before starting; it defines
the artifacts in `.factory/<slug>/` that the agents exchange.

Agents (in `.claude/agents/`, launched with the Agent tool by `subagent_type`):
`factory-product-manager`, `factory-planner`, `factory-backend-developer`, `factory-frontend-developer`,
`factory-backend-system-tester`, `factory-frontend-tester`, `factory-backend-expert`, `factory-frontend-expert`,
`factory-reporter`.

Every agent prompt you write contains: the feature slug, the artifact dir, the round number, the exact task IDs or
findings to work on, and anything the user said that the artifacts don't capture yet. Keep prompts short — the
artifacts carry the detail. Relay agent results to the user in a few lines; the user does not see agent output.

## Sub-commands

- `/factory setup` → only Phase 0, then report what is ready.
- `/factory status <slug>` → read `.factory/<slug>/state.md`, summarise.
- `/factory resume <slug>` → read `state.md`, continue from the recorded phase.
- `/factory <requirement>` → full run below.

## Phase 0 — Environment (always first)

1. Run `.claude/factory/scripts/doctor.sh --quiet` and read `.factory/environment.md`.
2. Required repos ABSENT → run `.claude/factory/scripts/bootstrap.sh` (cloning is safe), re-run the doctor.
3. Anything else under "Missing for a full pipeline" → show the list to the user with the SETUP.md section for each,
   and ask (AskUserQuestion) whether to: (a) let you run the agent-runnable setup steps now (build caches, browser
   driver — SETUP.md §3–4, only where the network section shows the registry reachable and the local policy allows),
   (b) continue with a partial environment (affected checks become NOT VERIFIED), or (c) stop so they install system
   tools (SETUP.md §1). Never install system software or use sudo yourself.
4. If subagent launches need approval in this session, ask once for the whole run.

## Phase 1 — Requirements (Product Manager)

1. Derive a short kebab-case slug; create `.factory/<slug>/state.md` (phase, task table, fix-round counters, and for
   every repo you expect to touch: branch + `git status --short` count as the baseline).
2. Launch `factory-product-manager` with the raw requirement.
3. If it returns open questions: ask the user with AskUserQuestion (≤4 questions per call, the PM's recommended option
   first and marked "(Recommended)"), then re-launch the PM with the answers. Repeat until status is
   `READY FOR PLANNING`, or stop if `NOT FEASIBLE` (tell the user why and what would make it feasible).
4. **Gate 1:** summarise scope + feasibility + size, and get the user's go-ahead.

## Phase 2 — Plan (Planner)

1. Launch `factory-planner`.
2. **Gate 2:** show the task list, dependency graph, AC count and "not verifiable locally" items. Ask for approval
   or changes; re-launch the planner with the requested changes until approved.
3. Ask whether to work on a new branch in each touched repo (suggest `factory/<slug>`); create branches only if the
   user agrees. Never commit unless the user asks.

## Phase 3 — Build (Developers)

Scheduling, driven by the plan's dependency graph and recorded in `state.md`:
- Launch `factory-backend-developer` with every BE task whose dependencies are DONE, and — in the same message, so they
  run in parallel — `factory-frontend-developer` with every FE task marked "Can start now".
- When a backend round returns, mark its tasks DONE/BLOCKED, then launch the frontend developer with the FE tasks that
  just became unblocked (pass along the "API contract changes" section of `03-backend-dev.md`).
- Repeat until every task is DONE or BLOCKED. A BLOCKED task or a `SCOPE:`/`ENV:` item goes to the user before you
  continue. If a side has "None" in the plan, skip that developer.
- If the frontend tester will need a rebuilt workbench and building is not allowed here, tell the user now, so it is
  ready by Phase 4.

## Phase 4 — Verify (Testers + Experts, in parallel)

Launch in one message: `factory-backend-system-tester` and `factory-backend-expert` (if there were BE tasks),
`factory-frontend-tester` and `factory-frontend-expert` (if there were FE tasks). Before the frontend tester, confirm
with the user that the workbench is running with the changes (or that you started it).

Fix loop:
- Collect failures and BLOCKER/MAJOR findings, group them by owner (BE-n → backend developer, FE-n → frontend
  developer), increment the fix-round counter in `state.md`, and re-launch the developers with exactly those findings.
- Then re-run only the testers/experts whose area changed.
- After 3 fix rounds with open BLOCKER/MAJOR items, or when a finding needs a product decision, stop and ask the user
  (fix more / accept as open item / descope).
- MINOR/NIT findings are not looped; they go to the report as open items unless the user asks to fix them.

## Phase 5 — Report

Launch `factory-reporter`. Show the user: status, overview, AC results, open items and the "User actions before merge"
list, with a link to `.factory/<slug>/REPORT.md`. Update `state.md` to `DONE`.

## Rules

- Never fabricate an agent's result; if one is still running, say so.
- Never tell the user something passed unless an agent's report shows it passed against the changed code.
- If an agent fails or returns nothing usable, re-launch it once with a clearer prompt, then ask the user.
