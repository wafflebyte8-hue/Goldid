#!/usr/bin/env bash
# Launches the GolDid desktop app on Linux.
# The desktop app is supported on Windows and Linux only; on macOS, use the CLI.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
log_dir="${GOLDID_HOME:-$HOME/.goldid}"
log_file="$log_dir/desktop.log"
mkdir -p "$log_dir" 2>/dev/null || true

log() {
  printf '[%s] %s\n' "$(date -Is 2>/dev/null || date)" "$*" >> "$log_file" 2>/dev/null || true
}

if [ "$(uname -s)" = "Darwin" ]; then
  msg="The GolDid desktop app is not available on macOS. Use the CLI instead: gd"
  echo "$msg" >&2
  log "$msg"
  exit 1
fi

electron="$root/node_modules/electron/dist/electron"
main="$root/desktop/main.js"

# Electron 42+ downloads its binary on first use rather than at npm install
# time. If it is missing (e.g. right after gd update), fetch it now.
if [ ! -x "$electron" ] && [ -f "$root/node_modules/electron/install.js" ]; then
  msg="Downloading the Electron desktop binary (first launch after an update)..."
  echo "[GolDid] $msg"
  log "$msg"
  ( cd "$root" && node node_modules/electron/install.js ) >> "$log_file" 2>&1 || true
fi

if [ ! -x "$electron" ]; then
  msg="GolDid desktop runtime is missing. Run setup.sh or 'npm install'."
  echo "$msg" >&2
  log "$msg"
  exit 1
fi

unset ELECTRON_RUN_AS_NODE
cd "$root"
args=()
if [ "${GOLDID_ELECTRON_SANDBOX:-0}" != "1" ]; then
  # Electron's Chromium sandbox often cannot initialize from a per-user install
  # because chrome-sandbox is not root-owned with the setuid bit.
  args+=(--no-sandbox)
fi
if [ "${GOLDID_ELECTRON_GPU:-0}" != "1" ]; then
  args+=(--disable-gpu --disable-software-rasterizer)
fi
args+=(--disable-dev-shm-usage --gtk-version=3)

log "Launching GolDid desktop from $root"
log "Electron: $electron"
log "Args: ${args[*]} $main"

"$electron" "${args[@]}" "$main" >> "$log_file" 2>&1
status=$?
log "GolDid desktop exited with status $status"
exit "$status"
