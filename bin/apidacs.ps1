#!/usr/bin/env pwsh
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node --no-warnings (Join-Path $ScriptDir "..\dist-cli\apidacs.cjs") @args
exit $LASTEXITCODE
