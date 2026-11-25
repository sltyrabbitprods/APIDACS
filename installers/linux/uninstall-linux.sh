#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  PREFIX="${APIDACS_PREFIX:-/usr/local}"
  APPS_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
else
  PREFIX="${APIDACS_PREFIX:-$HOME/.local}"
  APPS_DIR="$HOME/.local/share/applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
fi

rm -f "$PREFIX/bin/apidacs" "$PREFIX/bin/integrity" "$APPS_DIR/apidacs.desktop" "$ICON_DIR/apidacs.png"
rm -rf "$PREFIX/lib/apidacs"
echo "APIDACS uninstalled cleanly."
