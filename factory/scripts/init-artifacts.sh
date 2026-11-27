#!/usr/bin/env bash
# Initialize the workspace-local artifact directory owned by the .claude repository.
set -euo pipefail

CLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKSPACE_ROOT="$(cd "$CLAUDE_DIR/.." && pwd)"
FACTORY_DIR="$CLAUDE_DIR/.factory"
mkdir -p "$FACTORY_DIR"

if [[ ! -d "$CLAUDE_DIR/.git" ]]; then
  echo "expected .claude to be a Git repository: $CLAUDE_DIR" >&2
  exit 1
fi

if [[ ! -e "$WORKSPACE_ROOT/.factory" ]]; then
  ln -s .claude/.factory "$WORKSPACE_ROOT/.factory"
fi

printf 'Factory artifacts (owned by .claude): %s\n' "$FACTORY_DIR"
git -C "$CLAUDE_DIR" status --short -- .factory

