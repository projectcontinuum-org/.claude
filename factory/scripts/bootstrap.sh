#!/usr/bin/env bash
# Clones every missing Continuum repo into the workspace root and pulls Git LFS objects.
# Never touches a repo that already exists (no pull, no reset, no branch switch).
#
#   .claude/factory/scripts/bootstrap.sh            # required repos only
#   .claude/factory/scripts/bootstrap.sh --all      # every repo in repos.txt
#   .claude/factory/scripts/bootstrap.sh continuum-feature-ai continuum-docs   # named repos
set -euo pipefail

FACTORY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$FACTORY_DIR/../.." && pwd)"
REPOS_FILE="$FACTORY_DIR/repos.txt"

mode="required"
wanted=()
if [[ "${1:-}" == "--all" ]]; then mode="all"; elif [[ $# -gt 0 ]]; then mode="named"; wanted=("$@"); fi

command -v git >/dev/null || { echo "git is not installed — see .claude/factory/SETUP.md" >&2; exit 1; }
has_lfs=false; git lfs version >/dev/null 2>&1 && has_lfs=true

is_wanted() {
  local name="$1" required="$2"
  case "$mode" in
    all) return 0 ;;
    required) [[ "$required" == "yes" ]] ;;
    named) for w in "${wanted[@]}"; do [[ "$w" == "$name" ]] && return 0; done; return 1 ;;
  esac
}

while read -r name url role required; do
  [[ -z "${name:-}" || "$name" == \#* ]] && continue
  is_wanted "$name" "$required" || continue
  target="$WORKSPACE_ROOT/$name"
  if git -C "$target" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "= $name already present"
  elif [[ -e "$target" || -L "$target" ]]; then
    echo "ERROR: Cannot clone repository '$name': target '$target' already exists but is not a Git repository." >&2
    echo "Existing contents were left unchanged. Inspect or back up that path, move it yourself if appropriate, then rerun bootstrap." >&2
    exit 1
  else
    echo "+ cloning $name ($role)"
    if ! git clone "$url" "$target"; then
      echo "ERROR: Failed to clone repository '$name' from '$url' into '$target'." >&2
      echo "Any files left by Git were not removed. Check the URL, network, and permissions; inspect or back up the target before resolving any partial clone and rerunning bootstrap." >&2
      exit 1
    fi
  fi
  if $has_lfs && grep -qs "filter=lfs" "$target/.gitattributes"; then
    echo "  git lfs pull in $name"
    (cd "$target" && git lfs install --local >/dev/null && git lfs pull)
  elif grep -qs "filter=lfs" "$target/.gitattributes"; then
    echo "  WARNING: $name uses Git LFS but git-lfs is not installed — install it and run 'git lfs pull' there" >&2
  fi
done < "$REPOS_FILE"

# Workspace-root .mcp.json (the continuum node-registry MCP server used by the workflow-builder agent).
if [[ ! -f "$WORKSPACE_ROOT/.mcp.json" ]]; then
  cp "$FACTORY_DIR/mcp.json.template" "$WORKSPACE_ROOT/.mcp.json"
  echo "+ wrote $WORKSPACE_ROOT/.mcp.json from factory/mcp.json.template"
fi
[[ -f "$FACTORY_DIR/local-policy.md" ]] || \
  echo "  note: no factory/local-policy.md — copy factory/local-policy.example.md if this machine has restrictions"

echo
echo "Done. Next: .claude/factory/scripts/doctor.sh"
