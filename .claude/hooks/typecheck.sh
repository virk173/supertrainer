#!/bin/bash
# PostToolUse hook: after any Edit/Write to a .ts/.tsx file, typecheck the
# monorepo and (for apps/web sources) lint the edited file. Exit 2 feeds the
# failure output back to Claude so it fixes it immediately — this is what keeps
# the Phase 7 design harness honest (hardcoded hex / arbitrary values fail here,
# not in CI).

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

case "$file_path" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# No-op until the monorepo is scaffolded with a typecheck script
[ -f "$CLAUDE_PROJECT_DIR/package.json" ] || exit 0
grep -q '"typecheck"' "$CLAUDE_PROJECT_DIR/package.json" || exit 0

cd "$CLAUDE_PROJECT_DIR" || exit 0
output=$(npm run typecheck 2>&1)
if [ $? -ne 0 ]; then
  echo "typecheck failed after editing $file_path:" >&2
  echo "$output" | tail -30 >&2
  exit 2
fi

# Lint the single edited file when it lives in apps/web (fast, targeted — the
# no-hardcoded-hex + arbitrary-value guards live in apps/web/eslint.config.mjs).
case "$file_path" in
  */apps/web/*)
    lint_output=$(cd "$CLAUDE_PROJECT_DIR/apps/web" && npx eslint "$file_path" 2>&1)
    if [ $? -ne 0 ]; then
      echo "eslint failed after editing $file_path:" >&2
      echo "$lint_output" | tail -30 >&2
      exit 2
    fi
    ;;
esac

exit 0
