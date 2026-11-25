@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-windows.ps1" %*
if %ERRORLEVEL% NEQ 0 (
  echo Installation failed with exit code %ERRORLEVEL%.
  pause
  exit /b %ERRORLEVEL%
)
echo Installation complete.
pause
