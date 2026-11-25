param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\APIDACS")
)

$BinDir = Join-Path $InstallDir "bin"
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath) {
  $Filtered = ($UserPath.Split(";") | Where-Object { $_ -and ($_ -ne $BinDir) }) -join ";"
  [Environment]::SetEnvironmentVariable("Path", $Filtered, "User")
}

$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\APIDACS"
if (Test-Path $StartMenuDir) {
  Remove-Item -Recurse -Force $StartMenuDir
}
if (Test-Path $InstallDir) {
  Remove-Item -Recurse -Force $InstallDir
}
Write-Host "APIDACS uninstalled cleanly." -ForegroundColor Green
