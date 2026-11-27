#!/usr/bin/env bash
set -euo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bootstrap.sh"
DOCTOR_SCRIPT="$(dirname "$SCRIPT_UNDER_TEST")/doctor.sh"
TEMP_ROOT="$(mktemp -d)"
trap 'rm -r -- "$TEMP_ROOT"' EXIT

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail "expected '$expected' in $file"
}

make_local_repository() {
  local repository_path="$1"
  local marker="$2"
  mkdir -p "$repository_path"
  git -C "$repository_path" init -q
  git -C "$repository_path" config user.email "bootstrap-test@example.invalid"
  git -C "$repository_path" config user.name "Bootstrap test"
  printf '%s\n' "$marker" > "$repository_path/content.txt"
  git -C "$repository_path" add content.txt
  git -C "$repository_path" commit -q -m "Add fixture content"
}

make_workspace_fixture() {
  local workspace_path="$1"
  local repositories="$2"
  local factory_path="$workspace_path/.claude/factory"
  mkdir -p "$factory_path/scripts"
  cp "$SCRIPT_UNDER_TEST" "$factory_path/scripts/bootstrap.sh"
  cp "$DOCTOR_SCRIPT" "$factory_path/scripts/doctor.sh"
  cp "$(dirname "$SCRIPT_UNDER_TEST")/../mcp.json.template" "$factory_path/mcp.json.template"
  printf '%s\n' "$repositories" > "$factory_path/repos.txt"
}

assert_required_selection_and_preservation() {
  local workspace="$TEMP_ROOT/selection-workspace"
  local existing_source="$TEMP_ROOT/existing-source"
  local missing_source="$TEMP_ROOT/missing-source"
  local optional_source="$TEMP_ROOT/optional-source"
  local existing_target="$workspace/required-existing"
  local missing_target="$workspace/required-missing"
  local optional_target="$workspace/optional-repo"
  local fixture_repos

  make_local_repository "$existing_source" "source-existing"
  make_local_repository "$missing_source" "required-cloned"
  make_local_repository "$optional_source" "optional-not-cloned"

  mkdir -p "$existing_target"
  git -C "$existing_target" init -q
  printf '%s\n' "keep this local file" > "$existing_target/local-only.txt"
  fixture_repos="required-existing $existing_source backend yes
required-missing $missing_source backend yes
optional-repo $optional_source optional no"
  make_workspace_fixture "$workspace" "$fixture_repos"

  bash "$workspace/.claude/factory/scripts/bootstrap.sh" \
    > "$TEMP_ROOT/selection.stdout" 2> "$TEMP_ROOT/selection.stderr" ||
    fail "required-only bootstrap should succeed"

  [[ -f "$existing_target/local-only.txt" ]] ||
    fail "existing Git repository content was not preserved"
  [[ "$(<"$existing_target/local-only.txt")" == "keep this local file" ]] ||
    fail "existing Git repository content changed"
  [[ -d "$missing_target/.git" ]] ||
    fail "missing required repository was not cloned"
  [[ "$( < "$missing_target/content.txt")" == "required-cloned" ]] ||
    fail "cloned required repository content did not match its local source"
  [[ ! -e "$optional_target" ]] ||
    fail "optional repository was cloned by default"
  assert_contains "$TEMP_ROOT/selection.stdout" "= required-existing already present"
  assert_contains "$TEMP_ROOT/selection.stdout" "+ cloning required-missing"
}

assert_worktree_is_preserved() {
  local workspace="$TEMP_ROOT/worktree-workspace"
  local source_repository="$TEMP_ROOT/worktree-source"
  local worktree_target="$workspace/required-worktree"
  local fixture_repos

  make_local_repository "$source_repository" "committed fixture content"
  git -C "$source_repository" worktree add --quiet --detach "$worktree_target" HEAD
  printf '%s\n' "keep this worktree edit" > "$worktree_target/content.txt"
  printf '%s\n' "keep this untracked file" > "$worktree_target/local-only.txt"
  fixture_repos="required-worktree $source_repository backend yes"
  make_workspace_fixture "$workspace" "$fixture_repos"

  bash "$workspace/.claude/factory/scripts/bootstrap.sh" \
    > "$TEMP_ROOT/worktree.stdout" 2> "$TEMP_ROOT/worktree.stderr" ||
    fail "bootstrap should accept and preserve an existing Git worktree"

  [[ "$(git -C "$worktree_target" rev-parse --is-inside-work-tree)" == "true" ]] ||
    fail "existing worktree is no longer recognized as a Git worktree"
  [[ "$(<"$worktree_target/content.txt")" == "keep this worktree edit" ]] ||
    fail "existing worktree's tracked local edit was changed"
  [[ "$(<"$worktree_target/local-only.txt")" == "keep this untracked file" ]] ||
    fail "existing worktree's untracked file was changed"
  assert_contains "$TEMP_ROOT/worktree.stdout" "= required-worktree already present"

  bash "$workspace/.claude/factory/scripts/doctor.sh" --quiet \
    > "$TEMP_ROOT/worktree-doctor.stdout" 2> "$TEMP_ROOT/worktree-doctor.stderr" ||
    fail "doctor should complete against an isolated workspace fixture"
  assert_contains "$workspace/.claude/.factory/environment.md" \
    "| required-worktree | backend | present |"
}

assert_conflicting_target_is_preserved() {
  local workspace="$TEMP_ROOT/conflict-workspace"
  local conflict_target="$workspace/conflicting-repo"
  local fixture_repos

  mkdir -p "$conflict_target"
  printf '%s\n' "do not overwrite" > "$conflict_target/important.txt"
  fixture_repos="conflicting-repo $TEMP_ROOT/unused-source backend yes"
  make_workspace_fixture "$workspace" "$fixture_repos"

  if bash "$workspace/.claude/factory/scripts/bootstrap.sh" \
    > "$TEMP_ROOT/conflict.stdout" 2> "$TEMP_ROOT/conflict.stderr"; then
    fail "bootstrap should fail when a non-Git target already exists"
  fi

  assert_contains "$TEMP_ROOT/conflict.stderr" "conflicting-repo"
  assert_contains "$TEMP_ROOT/conflict.stderr" "$conflict_target"
  assert_contains "$TEMP_ROOT/conflict.stderr" "Existing contents were left unchanged"
  assert_contains "$TEMP_ROOT/conflict.stderr" "Inspect or back up"
  [[ "$( < "$conflict_target/important.txt")" == "do not overwrite" ]] ||
    fail "conflicting target contents were modified"
}

assert_failed_clone_is_actionable() {
  local workspace="$TEMP_ROOT/failure-workspace"
  local unavailable_source="$TEMP_ROOT/no-such-local-repository"
  local failed_target="$workspace/failing-repo"
  local fixture_repos

  fixture_repos="failing-repo $unavailable_source backend yes"
  make_workspace_fixture "$workspace" "$fixture_repos"

  if bash "$workspace/.claude/factory/scripts/bootstrap.sh" \
    > "$TEMP_ROOT/failure.stdout" 2> "$TEMP_ROOT/failure.stderr"; then
    fail "bootstrap should fail when a required local repository cannot be cloned"
  fi

  assert_contains "$TEMP_ROOT/failure.stderr" "failing-repo"
  assert_contains "$TEMP_ROOT/failure.stderr" "$failed_target"
  assert_contains "$TEMP_ROOT/failure.stderr" "Check the URL, network, and permissions"
  assert_contains "$TEMP_ROOT/failure.stderr" "Any files left by Git were not removed"
}

assert_required_selection_and_preservation
assert_worktree_is_preserved
assert_conflicting_target_is_preserved
assert_failed_clone_is_actionable

echo "PASS: bootstrap and doctor recognize preserved worktrees; selection and failure handling are safe"
