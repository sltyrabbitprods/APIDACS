# APIDACS Windows Installer (PowerShell)
# Installs apidacs & integrity CLI, updates User PATH, and registers Start Menu / Uninstaller.
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\APIDACS"),
  [switch]$NoPath
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Test-Path (Join-Path $PackageRoot "dist-cli\apidacs.cjs"))) {
  $PackageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "Installing APIDACS to $InstallDir ..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "bin") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "dist-cli") | Out-Null

Copy-Item -Force (Join-Path $PackageRoot "dist-cli\apidacs.cjs") (Join-Path $InstallDir "dist-cli\apidacs.cjs")

$NativeExe = Join-Path $PackageRoot "dist-executables\apidacs-win-x64.exe"
if (Test-Path $NativeExe) {
  Copy-Item -Force $NativeExe (Join-Path $InstallDir "bin\apidacs.exe")
  Copy-Item -Force $NativeExe (Join-Path $InstallDir "bin\integrity.exe")
}

foreach ($w in @("apidacs.cmd", "apidacs.ps1", "integrity.cmd", "integrity.ps1")) {
  $src = Join-Path $PackageRoot "bin\$w"
  if (Test-Path $src) {
    Copy-Item -Force $src (Join-Path $InstallDir "bin\$w")
  }
}

$IconSrc = Join-Path $PackageRoot "assets\icons\icon.ico"
$IconDest = $null
if (Test-Path $IconSrc) {
  $IconDest = Join-Path $InstallDir "icon.ico"
  Copy-Item -Force $IconSrc $IconDest
}

# Copy uninstaller
$UninstSrc = Join-Path $PackageRoot "installers\windows\uninstall-windows.ps1"
if (Test-Path $UninstSrc) {
  Copy-Item -Force $UninstSrc (Join-Path $InstallDir "uninstall.ps1")
}

# Add to User PATH idempotently
$BinDir = Join-Path $InstallDir "bin"
if (-not $NoPath) {
  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $Parts = if ($UserPath) { $UserPath.Split(";") | Where-Object { $_ } } else { @() }
  if ($Parts -notcontains $BinDir) {
    $NewPath = ($Parts + $BinDir) -join ";"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "Added $BinDir to User PATH."
  }
}

# Create Start Menu Shortcut (with optional icon.ico when added)
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\APIDACS"
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut((Join-Path $StartMenuDir "APIDACS Workbench.lnk"))
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoExit -Command `"& '$BinDir\apidacs.ps1' serve --port 3400`""
$Shortcut.WorkingDirectory = $HOME
if ($IconDest -and (Test-Path $IconDest)) {
  $Shortcut.IconLocation = $IconDest
}
$Shortcut.Save()

Write-Host "APIDACS installed successfully. Open a new terminal and run: apidacs --help" -ForegroundColor Green
