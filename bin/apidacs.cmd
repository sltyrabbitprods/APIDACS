@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
node --no-warnings "%SCRIPT_DIR%..\dist-cli\apidacs.cjs" %*
exit /b %ERRORLEVEL%
