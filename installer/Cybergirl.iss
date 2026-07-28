#define MyAppName "Cybergirl"
#define MyAppVersion "2.0.0"
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

[Icons]
Name: "{autoprograms}\Cybergirl"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Cybergirl"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Mở Cybergirl"; Flags: nowait postinstall skipifsilent
