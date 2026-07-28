#define MyAppName "Cybergirl"
#define MyAppVersion "3.0.0"
#define MyAppPublisher "Long Ngo"
#define MyAppExeName "Cybergirl-Windows-x64.exe"

[Setup]
AppId={{9D832874-8B50-4A3F-AC6E-63E781D82BC1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Cybergirl
DefaultGroupName=Cybergirl
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=Cybergirl-Setup-v{#MyAppVersion}-Windows-x64
SetupIconFile=..\icons\cybergirl.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
CloseApplications=yes

[Languages]
Name: "vietnamese"; MessagesFile: "compiler:Default.isl, Vietnamese.isl"

[Tasks]
Name: "desktopicon"; Description: "Tạo biểu tượng ngoài màn hình"; GroupDescription: "Biểu tượng bổ sung:"

[Files]
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\Cybergirl-Companion.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\native-host\*.json"; DestDir: "{app}\native-host"; Flags: ignoreversion
Source: "..\native-host\*.ps1"; DestDir: "{app}\native-host"; Flags: ignoreversion
Source: "..\models\README.md"; DestDir: "{app}\models"; Flags: ignoreversion
Source: "..\models\*.ps1"; DestDir: "{app}\models"; Flags: ignoreversion
Source: "..\manifest.json"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\index.html"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\styles.css"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\app.js"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\background.js"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\characters.json"; DestDir: "{app}\Extension"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\Extension\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\icons\*"; DestDir: "{app}\Extension\icons"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\vendor\*"; DestDir: "{app}\Extension\vendor"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Cybergirl"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Cybergirl"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\native-host\register-native-host.ps1"" -InstallDir ""{app}"""; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "Mở Cybergirl"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\native-host\unregister-native-host.ps1"""; Flags: runhidden waituntilterminated
