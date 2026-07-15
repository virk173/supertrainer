#!/bin/bash
# PostToolUse hook: run typecheck after any Edit/Write to a .ts/.tsx file.
# Exit 2 feeds the failure output back to Claude so it fixes it immediately.

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
exit 0
