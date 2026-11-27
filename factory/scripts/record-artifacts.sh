#!/usr/bin/env bash
# Commit one task's factory artifacts in the parent .claude repository.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "usage: $0 <task-id> <commit message>" >&2
  exit 2
fi

CLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FACTORY_DIR="$CLAUDE_DIR/.factory"
TASK_ID="$1"
shift

if [[ ! -d "$CLAUDE_DIR/.git" ]]; then
  "$CLAUDE_DIR/factory/scripts/init-artifacts.sh"
fi

if [[ ! -d "$FACTORY_DIR/$TASK_ID" ]]; then
  echo "artifact directory does not exist: .claude/.factory/$TASK_ID" >&2
  exit 1
fi

git -C "$CLAUDE_DIR" add -- ".factory/$TASK_ID"
if git -C "$CLAUDE_DIR" diff --cached --quiet -- ".factory/$TASK_ID"; then
  echo "No artifact changes to record for $TASK_ID."
  exit 0
fi

git -C "$CLAUDE_DIR" commit -m "$*" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"

