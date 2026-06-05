#!/usr/bin/env bash
# GolDid installer and updater for Linux and macOS.
#
# CLI: installed on both Linux and macOS.
# Desktop app: installed on Linux only (not supported on macOS).
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/wafflebyte8-hue/Goldid/main/setup.sh | bash
#   ./setup.sh [--install-dir DIR] [--run-setup]
set -euo pipefail

REPO_ARCHIVE="https://github.com/wafflebyte8-hue/Goldid/archive/refs/heads/main.tar.gz"
INSTALL_DIR="${HOME}/.local/share/goldid"
BIN_DIR="${HOME}/.local/bin"
RUN_SETUP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --run-setup) RUN_SETUP=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\033[33m[GolDid]\033[0m %s\n' "$1"; }
die() { printf '\033[31m[GolDid] %s\033[0m\n' "$1" >&2; exit 1; }

os="$(uname -s)"
case "$os" in
  Linux) is_mac=0 ;;
  Darwin) is_mac=1 ;;
  *) die "Unsupported OS: $os. Use setup.ps1 on Windows." ;;
esac

step 'Checking Node.js...'
command -v node >/dev/null 2>&1 || die 'Node.js was not found. Install Node.js 18 or newer from https://nodejs.org and run this script again.'
command -v npm  >/dev/null 2>&1 || die 'npm was not found. Repair your Node.js installation and rerun setup.'
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 18 ] || die "Node.js 18 or newer is required. Found: $(node --version)"

tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

step 'Downloading the latest GolDid release from GitHub...'
curl -fsSL "$REPO_ARCHIVE" -o "$tmp_root/goldid.tar.gz" || die 'Could not download the GolDid archive.'
mkdir -p "$tmp_root/source"
tar -xzf "$tmp_root/goldid.tar.gz" -C "$tmp_root/source"
source_dir="$(find "$tmp_root/source" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
[ -n "$source_dir" ] || die 'The downloaded repository archive was empty.'

step "Installing to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR" || die "Could not create $INSTALL_DIR. Choose a writable path with --install-dir."
for name in goldid.js package.json README.md desktop-launch.sh desktop lib; do
  [ -e "$source_dir/$name" ] || die "Required repository item is missing: $name"
  rm -rf "${INSTALL_DIR:?}/$name"
  cp -R "$source_dir/$name" "$INSTALL_DIR/$name"
done
chmod +x "$INSTALL_DIR/goldid.js" "$INSTALL_DIR/desktop-launch.sh" 2>/dev/null || true

if [ "$is_mac" -eq 1 ]; then
  step 'Installing CLI dependencies (skipping desktop runtime on macOS)...'
  # The desktop app is not supported on macOS; GolDid has no runtime deps for the CLI.
  ( cd "$INSTALL_DIR" && npm install --omit=dev --omit=optional --no-audit --no-fund --ignore-scripts >/dev/null 2>&1 ) || true
else
  step 'Installing desktop runtime...'
  ( cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund ) || die 'Could not install the Electron desktop runtime.'
fi

step 'Registering the gd command...'
mkdir -p "$BIN_DIR"
node_bin="$(command -v node)"
for cmd in gd goldid; do
  cat > "$BIN_DIR/$cmd" <<EOF
#!/usr/bin/env bash
exec "$node_bin" "$INSTALL_DIR/goldid.js" "\$@"
EOF
  chmod +x "$BIN_DIR/$cmd"
done

# Persist GOLDID_HOME and ensure BIN_DIR is on PATH for future shells.
goldid_block_start='# >>> GolDid installer >>>'
goldid_block_end='# <<< GolDid installer <<<'
for profile in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -e "$profile" ] || { [ "$profile" = "$HOME/.bashrc" ] || continue; touch "$profile"; }
  [ -e "$profile" ] || continue
  # Remove any previous GolDid block, then append a fresh one.
  tmp="$(mktemp)"
  awk -v s="$goldid_block_start" -v e="$goldid_block_end" '
    $0==s {skip=1} skip && $0==e {skip=0; next} !skip {print}
  ' "$profile" > "$tmp" && mv "$tmp" "$profile"
  {
    printf '%s\n' "$goldid_block_start"
    printf 'export GOLDID_HOME=%q\n' "$INSTALL_DIR"
    printf 'case ":$PATH:" in *":%s:"*) ;; *) export PATH="%s:$PATH" ;; esac\n' "$BIN_DIR" "$BIN_DIR"
    printf '%s\n' "$goldid_block_end"
  } >> "$profile"
done

if [ "$is_mac" -eq 0 ]; then
  step 'Creating the desktop launcher...'
  apps_dir="$HOME/.local/share/applications"
  mkdir -p "$apps_dir"
  cat > "$apps_dir/goldid.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=GolDid
Comment=GolDid desktop AI assistant
Exec=$INSTALL_DIR/desktop-launch.sh
Icon=$INSTALL_DIR/desktop/assets/goldid-logo.png
Terminal=false
Categories=Utility;Development;
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps_dir" >/dev/null 2>&1 || true
fi

echo
printf '\033[32mGolDid installed successfully.\033[0m\n'
echo "Install: $INSTALL_DIR"
echo 'Personal configuration remains in ~/.goldid and is not overwritten.'
echo

if [ "$RUN_SETUP" -eq 1 ]; then
  "$node_bin" "$INSTALL_DIR/goldid.js" setup
else
  echo "Open a new terminal (or run: export PATH=\"$BIN_DIR:\$PATH\"), then run: gd"
fi
