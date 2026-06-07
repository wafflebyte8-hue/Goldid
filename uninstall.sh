#!/usr/bin/env bash
# GolDid uninstaller for Linux and macOS.
#
# Usage:
#   ./uninstall.sh [--install-dir DIR] [--remove-data] [--yes]
set -euo pipefail

INSTALL_DIR="${GOLDID_HOME:-$HOME/.local/share/goldid}"
BIN_DIR="${HOME}/.local/bin"
REMOVE_DATA=0
YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --install-dir) INSTALL_DIR="$2"; shift 2 ;;
    --remove-data) REMOVE_DATA=1; shift ;;
    --yes|-y) YES=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

step() { printf '\033[33m[GolDid]\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[GolDid] %s\033[0m\n' "$1" >&2; }
die() { printf '\033[31m[GolDid] %s\033[0m\n' "$1" >&2; exit 1; }

realpath_safe() {
  if command -v realpath >/dev/null 2>&1; then
    realpath -m "$1"
  else
    local dir base
    dir="$(dirname "$1")"
    base="$(basename "$1")"
    if [ -d "$1" ]; then
      (cd "$1" && pwd -P)
    else
      printf '%s/%s\n' "$(cd "$dir" && pwd -P)" "$base"
    fi
  fi
}

find_install_dir() {
  local candidate
  for candidate in "$INSTALL_DIR" "$HOME/.local/share/goldid"; do
    [ -n "$candidate" ] || continue
    if [ -f "$candidate/goldid.js" ] && [ -f "$candidate/package.json" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

remove_profile_block() {
  local profile="$1"
  [ -f "$profile" ] || return 1
  if ! grep -q '^# >>> GolDid installer >>>$' "$profile"; then
    return 1
  fi
  local tmp
  tmp="$(mktemp)"
  awk '
    $0=="# >>> GolDid installer >>>" {skip=1}
    skip && $0=="# <<< GolDid installer <<<" {skip=0; next}
    !skip {print}
  ' "$profile" > "$tmp"
  mv "$tmp" "$profile"
  return 0
}

install_dir="$(find_install_dir || true)"
data_dir="$HOME/.goldid"

echo
echo "GolDid uninstall preview"
echo "Application: ${install_dir:-'(not found)'}"
echo "Command shims: $BIN_DIR/gd, $BIN_DIR/goldid"
echo "Profiles: $HOME/.bashrc, $HOME/.zshrc"
echo "Desktop entry: $HOME/.local/share/applications/goldid.desktop"
if [ "$REMOVE_DATA" -eq 1 ]; then
  echo "Personal data: $data_dir (will be removed)"
else
  echo "Personal data: $data_dir (kept)"
fi
echo

if [ "$YES" -ne 1 ]; then
  if [ ! -t 0 ]; then
    die "Use --yes when running non-interactively."
  fi
  printf 'Continue? (y/N) '
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) echo "Uninstall cancelled."; exit 0 ;;
  esac
fi

step "Removing command shims..."
for cmd in gd goldid; do
  target="$BIN_DIR/$cmd"
  if [ -e "$target" ]; then
    rm -f "$target"
  fi
done

step "Removing shell profile registration..."
profile_count=0
for profile in "$HOME/.bashrc" "$HOME/.zshrc"; do
  if remove_profile_block "$profile"; then
    profile_count=$((profile_count + 1))
  fi
done

case "$(uname -s)" in
  Linux)
    step "Removing desktop launcher..."
    rm -f "$HOME/.local/share/applications/goldid.desktop"
    if command -v update-desktop-database >/dev/null 2>&1; then
      update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
    fi
    ;;
esac

if [ -n "$install_dir" ]; then
  resolved="$(realpath_safe "$install_dir")"
  [ "$resolved" != "/" ] || die "Refusing to remove filesystem root."
  case "$resolved" in
    "$HOME"|"${HOME}/") die "Refusing to remove home directory." ;;
  esac
  if [ -f "$resolved/package.json" ] && grep -q '"name": "goldid"' "$resolved/package.json"; then
    step "Removing application files from $resolved..."
    rm -rf "$resolved"
  else
    warn "Refusing to remove $resolved because it does not look like a GolDid install."
  fi
else
  warn "GolDid application directory was not found; registration cleanup still completed."
fi

if [ "$REMOVE_DATA" -eq 1 ] && [ -e "$data_dir" ]; then
  resolved_data="$(realpath_safe "$data_dir")"
  expected_data="$(realpath_safe "$HOME/.goldid")"
  [ "$resolved_data" = "$expected_data" ] || die "Refusing to remove unexpected data path: $resolved_data"
  step "Removing personal data from $resolved_data..."
  rm -rf "$resolved_data"
fi

echo
printf '\033[32mGolDid uninstalled.\033[0m\n'
echo "Removed registration from $profile_count profile(s)."
if [ "$REMOVE_DATA" -ne 1 ]; then
  echo "Personal configuration was kept at $data_dir."
fi
echo "Open a new terminal to finish refreshing commands."
