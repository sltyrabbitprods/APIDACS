#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$ROOT_DIR/dist-installers"
mkdir -p "$OUT_DIR"

ARCH_RAW="$(uname -m)"
if [ "$ARCH_RAW" = "x86_64" ]; then
  DEB_ARCH="amd64"
  NODE_ARCH="x64"
elif [ "$ARCH_RAW" = "aarch64" ] || [ "$ARCH_RAW" = "arm64" ]; then
  DEB_ARCH="arm64"
  NODE_ARCH="arm64"
else
  DEB_ARCH="$ARCH_RAW"
  NODE_ARCH="$ARCH_RAW"
fi

STAGE_DIR="$(mktemp -d)"
chmod 755 "$STAGE_DIR"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$STAGE_DIR/DEBIAN" \
         "$STAGE_DIR/usr/local/bin" \
         "$STAGE_DIR/usr/local/lib/apidacs" \
         "$STAGE_DIR/usr/share/applications"

cp "$ROOT_DIR/dist-cli/apidacs.cjs" "$STAGE_DIR/usr/local/lib/apidacs/apidacs.cjs"
chmod 755 "$STAGE_DIR/usr/local/lib/apidacs/apidacs.cjs"

NATIVE_BIN="$ROOT_DIR/dist-executables/apidacs-linux-$NODE_ARCH"
if [ -f "$NATIVE_BIN" ]; then
  cp "$NATIVE_BIN" "$STAGE_DIR/usr/local/bin/apidacs"
  ln -sf apidacs "$STAGE_DIR/usr/local/bin/integrity"
else
  cat > "$STAGE_DIR/usr/local/bin/apidacs" <<'EOF'
#!/usr/bin/env sh
exec node --no-warnings /usr/local/lib/apidacs/apidacs.cjs "$@"
EOF
  ln -sf apidacs "$STAGE_DIR/usr/local/bin/integrity"
fi
chmod 755 "$STAGE_DIR/usr/local/bin/apidacs"

cp "$ROOT_DIR/installers/linux/apidacs.desktop" "$STAGE_DIR/usr/share/applications/apidacs.desktop"

if [ -f "$ROOT_DIR/assets/icons/icon.png" ]; then
  mkdir -p "$STAGE_DIR/usr/share/icons/hicolor/512x512/apps"
  cp "$ROOT_DIR/assets/icons/icon.png" "$STAGE_DIR/usr/share/icons/hicolor/512x512/apps/apidacs.png"
fi

INSTALLED_KB="$(du -sk "$STAGE_DIR/usr" | awk '{print $1}')"
cat > "$STAGE_DIR/DEBIAN/control" <<EOF
Package: apidacs
Version: 1.0.0
Section: devel
Priority: optional
Architecture: $DEB_ARCH
Installed-Size: $INSTALLED_KB
Maintainer: APIDACS <maintainers@apidacs.local>
Description: Automated Project Integrity, Dependency Tracking & Finding Lifecycle System
 Cross-platform project integrity scanner, SQLite finding registry,
 AST data-flow analyzer, and compliance enforcement CLI (apidacs / integrity).
EOF

DEB_OUT="$OUT_DIR/apidacs_1.0.0_${DEB_ARCH}.deb"
dpkg-deb -Zgzip --build --root-owner-group "$STAGE_DIR" "$DEB_OUT.tmp"
mv -f "$DEB_OUT.tmp" "$DEB_OUT"
echo "Built Debian/Ubuntu install package: $DEB_OUT"
