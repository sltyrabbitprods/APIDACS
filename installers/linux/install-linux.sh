#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ ! -f "$PKG_ROOT/dist-cli/apidacs.cjs" ]; then
  PKG_ROOT="$(cd "$SCRIPT_DIR" && pwd)"
fi

if [ "$(id -u)" -eq 0 ]; then
  PREFIX="${APIDACS_PREFIX:-/usr/local}"
  APPS_DIR="/usr/share/applications"
  ICON_DIR="/usr/share/icons/hicolor/512x512/apps"
else
  PREFIX="${APIDACS_PREFIX:-$HOME/.local}"
  APPS_DIR="$HOME/.local/share/applications"
  ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
fi

BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/apidacs"

echo "Installing APIDACS to $PREFIX ..."
mkdir -p "$BIN_DIR" "$LIB_DIR" "$APPS_DIR" "$ICON_DIR"

cp "$PKG_ROOT/dist-cli/apidacs.cjs" "$LIB_DIR/apidacs.cjs"
chmod 755 "$LIB_DIR/apidacs.cjs"

ARCH="$(uname -m)"
[ "$ARCH" = "x86_64" ] && ARCH="x64"
NATIVE_BIN="$PKG_ROOT/dist-executables/apidacs-linux-$ARCH"
if [ -f "$NATIVE_BIN" ]; then
  cp "$NATIVE_BIN" "$BIN_DIR/apidacs"
  cp "$NATIVE_BIN" "$BIN_DIR/integrity"
else
  cat > "$BIN_DIR/apidacs" <<EOF
#!/usr/bin/env sh
exec node --no-warnings "$LIB_DIR/apidacs.cjs" "\$@"
EOF
  cp "$BIN_DIR/apidacs" "$BIN_DIR/integrity"
fi
chmod 755 "$BIN_DIR/apidacs" "$BIN_DIR/integrity"

if [ -f "$PKG_ROOT/installers/linux/apidacs.desktop" ]; then
  cp "$PKG_ROOT/installers/linux/apidacs.desktop" "$APPS_DIR/apidacs.desktop"
fi
if [ -f "$PKG_ROOT/assets/icons/icon.png" ]; then
  cp "$PKG_ROOT/assets/icons/icon.png" "$ICON_DIR/apidacs.png"
fi

echo "APIDACS installed to $BIN_DIR (apidacs, integrity)."
