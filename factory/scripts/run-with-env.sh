#!/usr/bin/env bash
# Helper script for factory agents to run commands with proper bash environment sourcing
# Usage: run-with-env.sh [-s shell] [--] command [args...]
# 
# Examples:
#   run-with-env.sh npm run build
#   run-with-env.sh -s zsh yarn install
#   run-with-env.sh -- ./gradlew build --no-daemon

set -uo pipefail

# Default shell
SHELL_CMD="bash"
SHELL_MODE="interactive"  # -i for interactive (sources ~/.bashrc)

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--shell)
      SHELL_CMD="$2"
      shift 2
      ;;
    -l|--login)
      SHELL_MODE="login"  # -l for login (sources ~/.bash_profile)
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

# Build the command to execute
if [[ $# -eq 0 ]]; then
  echo "Error: No command specified" >&2
  exit 1
fi

# Escape command properly for shell execution
FULL_CMD="$@"

# Execute with appropriate shell and environment sourcing
case "$SHELL_CMD" in
  bash)
    if [[ "$SHELL_MODE" == "login" ]]; then
      bash -lc "$FULL_CMD"
    else
      bash -ic "$FULL_CMD"
    fi
    ;;
  zsh)
    if [[ "$SHELL_MODE" == "login" ]]; then
      zsh -lc "$FULL_CMD"
    else
      zsh -ic "$FULL_CMD"
    fi
    ;;
  fish)
    # Fish doesn't use -i and -l the same way; use login-shell mode
    fish -lc "$FULL_CMD"
    ;;
  ksh)
    # ksh doesn't have an interactive flag; login mode enables initialization
    if [[ "$SHELL_MODE" == "login" ]]; then
      ksh -lc "$FULL_CMD"
    else
      ksh -c "$FULL_CMD"
    fi
    ;;
  *)
    # Fallback: try with -ic flags (works for most POSIX shells)
    "$SHELL_CMD" -ic "$FULL_CMD" 2>/dev/null || "$SHELL_CMD" -c "$FULL_CMD"
    ;;
esac
