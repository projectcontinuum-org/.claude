# Project Continuum knowledge graph

Read this first in a fresh chat. It is a curated, hand-maintained map of the Continuum workspace so you do not have to
re-discover the repos, the data flow and the pitfalls. Facts here were verified against the code; when code and this
graph disagree, the code wins — fix the graph.

| File | What it holds |
|------|---------------|
| [graph.json](graph.json) | Machine-readable graph: `nodes` (repos, modules, concepts, files) and typed `edges`. Query it with `jq` or read it whole (small). |
| [architecture.md](architecture.md) | Repos, backend modules, runtime data flow, message/update shapes. |
| [workflows-and-loops.md](workflows-and-loops.md) | Workflow model, DAG executor, loops, flow variables, Temporal history limits. |
| [workbench.md](workbench.md) | Theia workbench layout, workflow editor/viewer, loop UI, conventions. |
| [dev-environment.md](dev-environment.md) | How to build/test/run here: JDK, nvm, Gradle, jib, docker, browser verification, gotchas. |
| [change-log.md](change-log.md) | Feature history (CONTNM-180 etc.) so you know what already exists. |

## How to use and maintain it

1. Start from this page, then open only the file for the area you touch.
2. Still read the target repo's `AGENTS.md` chain (house rule 1 in `../factory/CONVENTIONS.md`); this graph does not replace it.
3. After a change that adds/renames a module, concept, flow or pitfall, update the matching file **and** `graph.json`
   (add nodes/edges; keep ids stable, kebab-case). Append to `change-log.md`. Do this in the same session — it is part
   of "done".
4. Never record unverified claims; mark them `NOT VERIFIED`.
5. Commit only this `.claude` repo, and only when the user asks.
