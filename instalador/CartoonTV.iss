; Instalador da Cartoon TV — gerado pelo empacotar-instalador.ps1 (não compile este arquivo
; direto: ele espera a pasta staging já montada ao lado).
;
; Decisões que valem explicar:
; - PrivilegesRequired=lowest e instalação em {localappdata}: sem UAC. Pedir senha de admin
;   pra instalar uma TV de desenho afasta mais gente do que protege.
; - O Node vai embutido (node.exe na raiz): a pessoa não instala nada além disto.
; - O catálogo já vem pronto, então depois de instalar só falta o login.

#define MeuApp "Cartoon TV"
#define MinhaVersao "1.1.0"
#define MeuAutor "Lucas Agostini"
#define MeuSite "https://github.com/lucasgagostini-wq/cartoon-tv"

[Setup]
AppId={{8F3A6C21-9D4E-4B77-A1C5-CT2026TVLUCAS}
AppName={#MeuApp}
AppVersion={#MinhaVersao}
AppPublisher={#MeuAutor}
AppPublisherURL={#MeuSite}
AppSupportURL={#MeuSite}
DefaultDirName={localappdata}\CartoonTV
DefaultGroupName={#MeuApp}
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=CartoonTV-Instalador
SetupIconFile=..\icones\cartoon-tv.ico
UninstallDisplayIcon={app}\icones\cartoon-tv.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
ShowLanguageDialog=no
AppMutex=CartoonTVInstalacao

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
brazilianportuguese.WelcomeLabel2=Isto vai instalar a {#MeuApp} no seu computador.%n%nEla transforma a SUA assinatura do HBO Max num canal de TV: os desenhos passam sozinhos, com horário, e você não precisa escolher episódio.%n%nVocê vai precisar de uma conta do HBO Max e do Google Chrome instalado.
brazilianportuguese.FinishedLabel=A {#MeuApp} foi instalada.%n%nFalta só entrar na sua conta do HBO Max — deixe a opção abaixo marcada e a janela de login abre agora.

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na Área de Trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MeuApp}"; Filename: "{sys}\wscript.exe"; \
  Parameters: "//nologo ""{app}\ligar-tv.vbs"""; WorkingDir: "{app}"; \
  IconFilename: "{app}\icones\cartoon-tv.ico"; Comment: "Liga a Cartoon TV"
Name: "{group}\Controle da {#MeuApp}"; Filename: "{sys}\wscript.exe"; \
  Parameters: "//nologo ""{app}\abrir-controle.vbs"""; WorkingDir: "{app}"; \
  IconFilename: "{app}\icones\controle.ico"; Comment: "Controle remoto"
Name: "{group}\Desinstalar a {#MeuApp}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MeuApp}"; Filename: "{sys}\wscript.exe"; \
  Parameters: "//nologo ""{app}\ligar-tv.vbs"""; WorkingDir: "{app}"; \
  IconFilename: "{app}\icones\cartoon-tv.ico"; Tasks: desktopicon

[Run]
; O login é interativo e precisa de terminal visível — a pessoa lê as instruções ali.
Filename: "{app}\node.exe"; Parameters: """{app}\televisor\configurar.js"""; \
  WorkingDir: "{app}"; Description: "Entrar na minha conta do HBO Max agora"; \
  Flags: postinstall

[UninstallDelete]
; sessão do navegador, log e preferências nascem depois da instalação
Type: filesandordirs; Name: "{app}\televisor\.chrome-profile"
Type: filesandordirs; Name: "{app}\televisor\.chrome-controle"
Type: files; Name: "{app}\televisor\tv-log.txt"
Type: files; Name: "{app}\televisor\preferencias.json"
Type: files; Name: "{app}\televisor\configuracao.json"
Type: filesandordirs; Name: "{app}\emissora\grade"

[Code]
// Sem o Chrome de verdade a tela fica preta: o Chromium do Playwright não toca vídeo
// protegido. Melhor barrar aqui do que a pessoa instalar e achar que está quebrado.
//
// 🪤 A checagem por {pf} DAVA FALSO NEGATIVO (29/07): o instalador roda em 32-bit, então
// {pf} vira "Program Files (x86)" e o Chrome de 64-bit em "Program Files" passava batido.
// O registro App Paths é o jeito canônico e não depende de arquitetura — mas precisa ser
// lido com HKLM64, senão cai na visão redirecionada do WOW64 e erra de novo.
function AchouChrome(): Boolean;
var caminho: String;
begin
  Result := False;
  if RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe', '', caminho) then
    if FileExists(RemoveQuotes(caminho)) then Result := True;
  if (not Result) and RegQueryStringValue(HKCU64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe', '', caminho) then
    if FileExists(RemoveQuotes(caminho)) then Result := True;
  if not Result then
    Result := FileExists(ExpandConstant('{commonpf64}\Google\Chrome\Application\chrome.exe'))
           or FileExists(ExpandConstant('{commonpf32}\Google\Chrome\Application\chrome.exe'))
           or FileExists(ExpandConstant('{localappdata}\Google\Chrome\Application\chrome.exe'));
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  // em instalação silenciosa não há ninguém pra responder: segue e avisa depois
  if WizardSilent then Exit;
  if not AchouChrome() then
  begin
    if MsgBox('A Cartoon TV precisa do Google Chrome instalado — é ele que reproduz o vídeo.' + #13#10 + #13#10 +
              'Não encontrei o Chrome neste computador. Quer continuar mesmo assim?' + #13#10 +
              '(instale o Chrome em google.com/chrome antes de usar)',
              mbConfirmation, MB_YESNO) = IDNO then
      Result := False;
  end;
end;
