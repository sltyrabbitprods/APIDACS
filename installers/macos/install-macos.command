#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ ! -f "$PKG_ROOT/dist-cli/apidacs.cjs" ]; then
  PKG_ROOT="$(cd "$SCRIPT_DIR" && pwd)"
fi

PREFIX="${APIDACS_PREFIX:-/usr/local}"
if [ ! -w "$PREFIX/bin" ] 2>/dev/null; then
  PREFIX="$HOME/.local"
fi

BIN_DIR="$PREFIX/bin"
LIB_DIR="$PREFIX/lib/apidacs"
APP_DIR="/Applications/APIDACS.app"
if [ ! -w "/Applications" ]; then
  APP_DIR="$HOME/Applications/APIDACS.app"
fi

echo "Installing APIDACS CLI to $BIN_DIR ..."
mkdir -p "$BIN_DIR" "$LIB_DIR"

cp "$PKG_ROOT/dist-cli/apidacs.cjs" "$LIB_DIR/apidacs.cjs"
chmod 755 "$LIB_DIR/apidacs.cjs"

NATIVE_BIN="$PKG_ROOT/dist-executables/apidacs-macos-$(uname -m)"
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

# Create APIDACS.app wrapper in Applications (embeds assets/icons/icon.icns when present)
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cat > "$APP_DIR/Contents/MacOS/APIDACS" <<EOF
#!/usr/bin/env sh
exec "$BIN_DIR/apidacs" serve --port 3400
EOF
chmod 755 "$APP_DIR/Contents/MacOS/APIDACS"

ICON_LINE=""
if [ -f "$PKG_ROOT/assets/icons/icon.icns" ]; then
  cp "$PKG_ROOT/assets/icons/icon.icns" "$APP_DIR/Contents/Resources/icon.icns"
  ICON_LINE="<key>CFBundleIconFile</key><string>icon.icns</string>"
fi

cat > "$APP_DIR/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>APIDACS</string>
  <key>CFBundleIdentifier</key><string>com.apidacs.integrity</string>
  <key>CFBundleName</key><string>APIDACS</string>
  <key>CFBundleVersion</key><string>1.0.0</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  $ICON_LINE
</dict>
</plist>
EOF

echo "Installed apidacs & integrity to $BIN_DIR and app bundle to $APP_DIR"
echo "Ensure $BIN_DIR is in your PATH, then run: apidacs --help"
