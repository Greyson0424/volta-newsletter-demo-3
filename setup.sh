#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PLUGIN_DIR="$ROOT_DIR/plugins/volta-newsletter"

command -v node >/dev/null 2>&1 || { echo "Node.js 20 or newer is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }

npm ci --ignore-scripts --prefix "$PLUGIN_DIR"
npm test --prefix "$PLUGIN_DIR"

printf '\nVOLTA Newsletter is ready.\n'
printf 'Codex: open this folder, start a new task, and type: newsletter\n'
printf 'Claude Code or Cursor: open this folder, type newsletter, then run ./studio.sh for the visual editor.\n'
