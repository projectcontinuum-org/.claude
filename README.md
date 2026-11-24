# Continuum Claude Code workspace config

Claude Code agents, skills and the **software factory** for Project Continuum. Clone it as `.claude/` in the
workspace root, the directory that holds all `continuum-*` repos side by side.

```bash
mkdir continuum && cd continuum
git clone https://github.com/projectcontinuum-org/.claude.git .claude
.claude/factory/scripts/bootstrap.sh     # clone the required continuum-* repos, git lfs pull, write .mcp.json
.claude/factory/scripts/doctor.sh        # check the machine, write .factory/environment.md
claude                                   # then: /factory setup   or   /factory <requirement>
```

Full from-scratch guide (system tools for macOS and Linux, build caches, browser driver, running the stack):
[factory/SETUP.md](factory/SETUP.md).

## Contents

| Path | What |
|------|------|
| `skills/factory/SKILL.md` | `/factory` orchestrator: PM → Planner → BE/FE developers → system/browser testers + expert reviews → reporter, with user gates and fix loops |
| `agents/factory-*.md` | the 9 factory roles |
| `agents/jsonforms-expert.md` | JSONForms schema/uischema specialist for `@ContinuumNode` dialogs |
| `agents/workflow-builder.md` | builds `.cwf` workflows via the api-server MCP server |
| `factory/CONVENTIONS.md` | contract every factory agent reads first: artifacts, repo map, house rules |
| `factory/SETUP.md` | environment setup from scratch |
| `factory/repos.txt` | every Continuum repo, its URL and whether the factory needs it |
| `factory/scripts/bootstrap.sh` | clones missing repos (never touches existing ones), writes `.mcp.json` |
| `factory/scripts/doctor.sh` | read-only machine check → `.factory/environment.md` |
| `factory/mcp.json.template` | workspace-root `.mcp.json` (continuum MCP server on `localhost:3002`) |
| `factory/local-policy.example.md` | template for machine-specific restrictions |

## Not in the repo (gitignored)

- `settings.local.json`: your Claude Code permission allowlist on this machine.
- `factory/local-policy.md`: this machine's restrictions (VPN, blocked registries). Copy it from
  `local-policy.example.md` only where it applies.

Feature work goes to `.factory/<feature>/` in the workspace root, outside this repo.
