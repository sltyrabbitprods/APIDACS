# Application Icons (Drop-In Slot)

Place your custom application icons in this folder when ready, then re-run `npm run build:pkg` (or the OS-specific installer script) to embed them automatically:

- **Windows**: `assets/icons/icon.ico` (multi-resolution `.ico`, 16x16 to 256x256)
  - Automatically picked up by `install-windows.ps1` (Start Menu / Desktop shortcuts), `apidacs.iss` (Inno Setup `.exe` installer), and `apidacs.wxs` (WiX `.msi` installer).
- **macOS**: `assets/icons/icon.icns` (Apple Icon Image)
  - Automatically copied into `APIDACS.app/Contents/Resources/icon.icns` and referenced via `CFBundleIconFile` by `installers/macos/build-pkg.sh` and `install-macos.command`.
- **Linux**: `assets/icons/icon.png` (512x512 PNG)
  - Automatically installed into `/usr/share/icons/hicolor/512x512/apps/apidacs.png` by `installers/linux/build-deb.sh` and `install-linux.sh` for the desktop entry.

All installer builders succeed cleanly without icons present and automatically embed them once files exist here.
