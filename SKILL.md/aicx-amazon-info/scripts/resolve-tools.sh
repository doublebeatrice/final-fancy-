#!/usr/bin/env bash
# Resolve bb-browser / chrome / python3 paths even when PATH is incomplete.
# Source this BEFORE invoking any bb-browser command:
#   source ~/.claude/skills/AICX-amazon-info/scripts/resolve-tools.sh
#
# Exports:
#   BB_BROWSER   - absolute path to bb-browser binary, or empty if not found
#   PY3          - absolute path to python3, or empty if not found
#   CHROME_APP   - path to Chrome.app, or empty if not found
#
# Why this exists:
#   Claude Code skill subshells often inherit a minimal PATH that excludes
#   ~/.nvm/.../bin (where nvm-installed npm globals live). A naive
#   `command -v bb-browser` returns false even when the tool IS installed.
#   This script searches well-known install locations as a fallback.

# Candidate directories, ordered by likelihood
_AICX_CANDIDATE_DIRS=(
  "$HOME/.nvm/versions/node"
  "/opt/homebrew/bin"
  "/usr/local/bin"
  "$HOME/.local/bin"
  "$HOME/.bun/bin"
)

_aicx_find_bin() {
  local name="$1"
  # 1. PATH first
  local p
  p="$(command -v "$name" 2>/dev/null)"
  if [ -n "$p" ]; then echo "$p"; return 0; fi
  # 2. Direct hits in well-known dirs
  for d in "${_AICX_CANDIDATE_DIRS[@]}"; do
    if [ -x "$d/$name" ]; then echo "$d/$name"; return 0; fi
  done
  # 3. nvm: any node version's bin dir
  for v in "$HOME"/.nvm/versions/node/*/bin/"$name"; do
    [ -x "$v" ] && { echo "$v"; return 0; }
  done
  return 1
}

BB_BROWSER="$(_aicx_find_bin bb-browser)"
PY3="$(_aicx_find_bin python3)"

if [ -d "/Applications/Google Chrome.app" ]; then
  CHROME_APP="/Applications/Google Chrome.app"
else
  CHROME_APP=""
fi

export BB_BROWSER PY3 CHROME_APP

unset _AICX_CANDIDATE_DIRS
unset -f _aicx_find_bin
