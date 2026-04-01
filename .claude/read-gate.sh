#!/bin/bash
# afd Read Gate — redirect large file reads to afd_read MCP tool
# PreToolUse hook: blocks native Read for files >=10KB, suggests afd_read

set -euo pipefail

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only intercept Read tool calls
if [[ "$TOOL_NAME" != "Read" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path or file doesn't exist
if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Skip non-code files (images, PDFs, etc.)
case "$FILE_PATH" in
  *.png|*.jpg|*.jpeg|*.gif|*.svg|*.ico|*.pdf|*.ipynb) exit 0 ;;
esac

# Check file size (10KB threshold)
FILE_SIZE=$(wc -c < "$FILE_PATH" 2>/dev/null || echo 0)
THRESHOLD=10240

if [[ "$FILE_SIZE" -ge "$THRESHOLD" ]]; then
  SIZE_KB=$(( FILE_SIZE / 1024 ))
  # Output structured JSON to block and redirect
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "This file is ${SIZE_KB}KB (>= 10KB). Use mcp__afd__afd_read tool instead for token-efficient reading. It returns a hologram (type skeleton) for large files, saving 80%+ tokens. For specific sections, pass startLine/endLine parameters."
  }
}
EOF
  exit 0
fi

# Small file — allow native Read
exit 0
