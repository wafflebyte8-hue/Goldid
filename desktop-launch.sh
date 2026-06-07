#!/usr/bin/env bash
# Launches the GolDid desktop app on Linux.
# The desktop app is supported on Windows and Linux only; on macOS, use the CLI.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(uname -s)" = "Darwin" ]; then
  echo "The GolDid desktop app is not available on macOS. Use the CLI instead: gd" >&2
  exit 1
fi

electron="$root/node_modules/electron/dist/electron"
main="$root/desktop/main.js"

if [ ! -x "$electron" ]; then
  echo "GolDid desktop runtime is missing. Run setup.sh or 'npm install'." >&2
  exit 1
fi

unset ELECTRON_RUN_AS_NODE
args=()
if [ "${GOLDID_ELECTRON_SANDBOX:-0}" != "1" ]; then
  # Electron's Chromium sandbox often cannot initialize from a per-user install
  # because chrome-sandbox is not root-owned with the setuid bit.
  args+=(--no-sandbox)
fi
exec "$electron" "${args[@]}" "$main"
