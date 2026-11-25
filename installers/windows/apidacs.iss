; APIDACS Inno Setup Windows Installer Script
; Compile on Windows with Inno Setup (iscc installers\windows\apidacs.iss)
; Drop assets\icons\icon.ico in place and uncomment SetupIconFile below when icon is ready.

#define MyAppName "APIDACS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "APIDACS Project Integrity"
#define MyAppExeName "apidacs.cmd"

[Setup]
AppId={{8F64B4A2-7D32-4C1B-9A41-2C6A1D35E910}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\APIDACS
DefaultGroupName={#MyAppName}
ChangesEnvironment=yes
OutputDir=..\..\dist-installers
OutputBaseFilename=APIDACS-Setup-{#MyAppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
PrivilegesRequired=lowest
#if FileExists("..\..\assets\icons\icon.ico")
SetupIconFile=..\..\assets\icons\icon.ico
UninstallDisplayIcon={app}\icon.ico
#endif

[Files]
Source: "..\..\dist-cli\apidacs.cjs"; DestDir: "{app}\dist-cli"; Flags: ignoreversion
Source: "..\..\bin\apidacs.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\..\bin\apidacs.ps1"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\..\bin\integrity.cmd"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "..\..\bin\integrity.ps1"; DestDir: "{app}\bin"; Flags: ignoreversion
#if FileExists("..\..\dist-executables\apidacs-win-x64.exe")
Source: "..\..\dist-executables\apidacs-win-x64.exe"; DestDir: "{app}\bin"; DestName: "apidacs.exe"; Flags: ignoreversion
#endif
#if FileExists("..\..\assets\icons\icon.ico")
Source: "..\..\assets\icons\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
#endif

[Icons]
Name: "{group}\APIDACS Local Console"; Filename: "{app}\bin\{#MyAppExeName}"; Parameters: "serve --port 3400"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\bin"; Check: NeedsAddPath('{app}\bin')

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;
