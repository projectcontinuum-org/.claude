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
  if [[ -d "$target/.git" ]]; then
    echo "= $name already present"
  else
    echo "+ cloning $name ($role)"
    git clone "$url" "$target"
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
