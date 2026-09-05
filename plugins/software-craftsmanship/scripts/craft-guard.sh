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

case "$file" in
  /*) absolute="$file" ;;
  *)  absolute="$cwd/$file" ;;
esac
if command -v realpath >/dev/null 2>&1; then
  absolute=$(realpath -m -- "$absolute" 2>/dev/null || printf '%s' "$absolute")
fi
relative="${absolute#"$cwd"/}"
[[ "$relative" == "$absolute" ]] && refuse "$tool on '$file' is outside the project."

for prefix in "${deny[@]}"; do
  [[ "$relative" == "$prefix"* ]] && refuse "$tool on '$relative' is outside this agent's scope (${allow[*]}, never $prefix)."
done
for prefix in "${allow[@]}"; do
  [[ "$relative" == "$prefix"* ]] && exit 0
done
refuse "$tool on '$relative' is outside this agent's scope (${allow[*]})."
