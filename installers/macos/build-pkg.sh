#!/usr/bin/env bash
set -euo pipefail

# Native macOS .pkg Builder (Run on macOS with Xcode Command Line Tools)
# Automatically embeds assets/icons/icon.icns into APIDACS.app if present.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGE_DIR="$(mktemp -d)"
OUT_DIR="$ROOT_DIR/dist-installers"
mkdir -p "$OUT_DIR"

trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$STAGE_DIR/usr/local/bin" "$STAGE_DIR/usr/local/lib/apidacs" \
         "$STAGE_DIR/Applications/APIDACS.app/Contents/MacOS" \
         "$STAGE_DIR/Applications/APIDACS.app/Contents/Resources"

cp "$ROOT_DIR/dist-cli/apidacs.cjs" "$STAGE_DIR/usr/local/lib/apidacs/apidacs.cjs"
chmod 755 "$STAGE_DIR/usr/local/lib/apidacs/apidacs.cjs"

ARCH="$(uname -m)"
NATIVE_BIN="$ROOT_DIR/dist-executables/apidacs-macos-$ARCH"
if [ -f "$NATIVE_BIN" ]; then
  cp "$NATIVE_BIN" "$STAGE_DIR/usr/local/bin/apidacs"
  cp "$NATIVE_BIN" "$STAGE_DIR/usr/local/bin/integrity"
else
  cat > "$STAGE_DIR/usr/local/bin/apidacs" <<'EOF'
#!/usr/bin/env sh
exec node --no-warnings /usr/local/lib/apidacs/apidacs.cjs "$@"
EOF
  cp "$STAGE_DIR/usr/local/bin/apidacs" "$STAGE_DIR/usr/local/bin/integrity"
fi
chmod 755 "$STAGE_DIR/usr/local/bin/apidacs" "$STAGE_DIR/usr/local/bin/integrity"

cat > "$STAGE_DIR/Applications/APIDACS.app/Contents/MacOS/APIDACS" <<'EOF'
#!/usr/bin/env sh
exec /usr/local/bin/apidacs serve --port 3400
EOF
chmod 755 "$STAGE_DIR/Applications/APIDACS.app/Contents/MacOS/APIDACS"

ICON_KEY=""
if [ -f "$ROOT_DIR/assets/icons/icon.icns" ]; then
  cp "$ROOT_DIR/assets/icons/icon.icns" "$STAGE_DIR/Applications/APIDACS.app/Contents/Resources/icon.icns"
  ICON_KEY="<key>CFBundleIconFile</key><string>icon.icns</string>"
fi

PKG_VERSION="${APIDACS_VERSION:-1.0.0}"
PKG_BUNDLE_ID="${APIDACS_BUNDLE_ID:-com.apidacs.integrity}"

cat > "$STAGE_DIR/Applications/APIDACS.app/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>APIDACS</string>
  <key>CFBundleIdentifier</key><string>$PKG_BUNDLE_ID</string>
  <key>CFBundleName</key><string>APIDACS</string>
  <key>CFBundleVersion</key><string>$PKG_VERSION</string>
  <key>CFBundleShortVersionString</key><string>$PKG_VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  $ICON_KEY
</dict>
</plist>
EOF

COMPONENT_PKG="$STAGE_DIR/apidacs-component.pkg"
FINAL_PKG="$OUT_DIR/APIDACS-${PKG_VERSION}-macos-$ARCH.pkg"

pkgbuild \
  --root "$STAGE_DIR" \
  --identifier "$PKG_BUNDLE_ID" \
  --version "$PKG_VERSION" \
  --install-location "/" \
  "$COMPONENT_PKG"

productbuild \
  --package "$COMPONENT_PKG" \
  "$FINAL_PKG"

echo "Built macOS installer package: $FINAL_PKG"
