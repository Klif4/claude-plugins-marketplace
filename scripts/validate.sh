#!/usr/bin/env bash
# Valide le JSON du marketplace et de chaque plugin déclaré.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0

if ! jq empty .claude-plugin/marketplace.json 2>/dev/null; then
  echo "JSON invalide : .claude-plugin/marketplace.json" >&2
  exit 1
fi

mapfile -t sources < <(jq -r '.plugins[] | select(.source | type == "string") | .source' \
  .claude-plugin/marketplace.json)

for src in "${sources[@]}"; do
  manifest="$src/.claude-plugin/plugin.json"
  if [[ ! -f "$manifest" ]]; then
    echo "KO  $src : manifeste manquant ($manifest)" >&2
    fail=1
    continue
  fi
  if ! jq empty "$manifest" 2>/dev/null; then
    echo "KO  $src : plugin.json invalide" >&2
    fail=1
    continue
  fi
  echo "OK  $src"
done

for hooks in plugins/*/hooks/hooks.json; do
  [[ -f "$hooks" ]] || continue
  if ! jq empty "$hooks" 2>/dev/null; then
    echo "KO  $hooks : JSON invalide" >&2
    fail=1
  fi
done

# Validation structurelle complète (manifestes, skills, agents, hooks) quand la CLI est là.
if command -v claude >/dev/null 2>&1; then
  claude plugin validate . || fail=1
  for src in "${sources[@]}"; do
    claude plugin validate "$src" || fail=1
  done
else
  echo "claude introuvable : validation limitée au JSON." >&2
fi

[[ $fail -eq 0 ]] && echo "Marketplace valide."
exit $fail
