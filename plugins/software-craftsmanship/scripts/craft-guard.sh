#!/usr/bin/env bash
# PreToolUse guard for the three craft agents, registered by hooks/hooks.json.
#
# Claude Code ignores `hooks` in a plugin agent's frontmatter, but every hook
# input carries `agent_type` when it fires inside a subagent. So this one hook is
# registered for the whole session and dispatches on that field: for anything that
# is not a craft agent it exits 0 at once.
#
#   Write/Edit/MultiEdit/NotebookEdit — refused outside the agent's allow-list:
#     bdd-writer    features/            (never features/steps/)
#     test-writer   tests/ features/steps/
#     implementer   src/
#   Bash — for the test-writer and the implementer, any `git` command and any
#     dependency install is refused: the git index is the orchestrator's snapshot
#     and package.json is the user's.
#
# Exit 2 refuses the call and puts the message in the agent's context. This is the
# first line of defence; an agent holding Bash can still write a file from the
# shell, which no Write hook sees, so the loop's git boundary check stays.
set -euo pipefail

input=$(cat)
agent=$(jq -r '.agent_type // empty' <<<"$input")
[[ -z "$agent" ]] && exit 0

case "$agent" in
  *bdd-writer)  allow=(features/); deny=(features/steps/); guard_bash=0 ;;
  *test-writer) allow=(tests/ features/steps/); deny=(); guard_bash=1 ;;
  *implementer) allow=(src/); deny=(); guard_bash=1 ;;
  *) exit 0 ;;
esac

tool=$(jq -r '.tool_name // empty' <<<"$input")
refuse() {
  echo "Refused for $agent: $1" >&2
  echo "Do not work around it. Report the need in your final report instead." >&2
  exit 2
}

if [[ "$tool" == "Bash" ]]; then
  [[ $guard_bash -eq 1 ]] || exit 0
  command=$(jq -r '.tool_input.command // empty' <<<"$input")
  if grep -qE '(^|[;&|(`[:space:]])git([[:space:]]|$)' <<<"$command"; then
    refuse "git is off-limits inside this agent — the orchestrator owns the index and the commits."
  fi
  if grep -qE '(^|[;&|(`[:space:]])(yarn|npm|pnpm|bun|npx)[[:space:]]+(add|install|i|remove|rm|uninstall|up|upgrade|update|link)([[:space:]]|$)' <<<"$command"; then
    refuse "dependencies are not installed from inside this agent. Report the missing package instead."
  fi
  exit 0
fi

file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input")
[[ -z "$file" ]] && exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input")

resolve() {
  if command -v realpath >/dev/null 2>&1; then
    realpath -m -- "$1" 2>/dev/null || printf '%s' "$1"
  else
    printf '%s' "$1"
  fi
}

# First existing ancestor: a new file's directory may not exist yet, and git
# needs a directory it can run in.
existing_dir() {
  local dir=$1
  while [[ -n "$dir" && "$dir" != "/" && ! -d "$dir" ]]; do dir=$(dirname -- "$dir"); done
  printf '%s' "$dir"
}

# Root of the checkout holding this path. In a worktree that is the worktree's
# own root, which is exactly what the allow-list is relative to.
git_root() { git -C "$(existing_dir "$1")" rev-parse --show-toplevel 2>/dev/null || true; }
# Shared .git directory: identical for the main checkout and all its worktrees.
git_common() {
  local dir out
  dir=$(existing_dir "$1")
  out=$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null || true)
  [[ -z "$out" ]] && return 0
  case "$out" in /*) ;; *) out="$dir/$out" ;; esac
  resolve "$out"
}

case "$file" in
  /*) absolute="$file" ;;
  *)  absolute="$cwd/$file" ;;
esac
absolute=$(resolve "$absolute")

# Anchor the allow-list on the repository root rather than on the hook's cwd:
# the two differ whenever the session or the agent runs from a worktree, and
# subtracting the wrong prefix turns every path into a scope violation.
root=$(git_root "$(dirname -- "$absolute")")
if [[ -n "$root" ]]; then
  root=$(resolve "$root")
  cwd_root=$(resolve "$(git_root "$cwd")")
  if [[ "$root" != "$cwd_root" ]]; then
    session_repo=$(git_common "$cwd")
    file_repo=$(git_common "$(dirname -- "$absolute")")
    if [[ -z "$session_repo" || "$file_repo" != "$session_repo" ]]; then
      refuse "$tool on '$file' is outside the project."
    fi
  fi
  base="$root"
else
  base=$(resolve "$cwd")
fi

relative="${absolute#"$base"/}"
[[ "$relative" == "$absolute" ]] && refuse "$tool on '$file' is outside the project."

for prefix in "${deny[@]}"; do
  [[ "$relative" == "$prefix"* ]] && refuse "$tool on '$relative' is outside this agent's scope (${allow[*]}, never $prefix)."
done
for prefix in "${allow[@]}"; do
  [[ "$relative" == "$prefix"* ]] && exit 0
done
refuse "$tool on '$relative' is outside this agent's scope (${allow[*]})."
