# Cria os atalhos "Cartoon TV" e "Controle Cartoon TV" no Desktop e no Menu Iniciar,
# apontando pra ESTA pasta (onde quer que ela tenha sido extraida).
# Chamado pelo INSTALAR.bat; roda sozinho tambem.
$base = $PSScriptRoot
$sh = New-Object -ComObject WScript.Shell

# gera os icones se ainda nao existirem (nao vem prontos no repo)
if (-not (Test-Path (Join-Path $base 'icones\cartoon-tv.ico'))) {
  try { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $base 'gerar-icones.ps1') -Variante B | Out-Null } catch {}
}

$alvos = @(
  @{ nome = 'Cartoon TV';          vbs = 'ligar-tv.vbs';       ico = 'cartoon-tv.ico'; desc = 'Liga a Cartoon TV' },
  @{ nome = 'Controle Cartoon TV'; vbs = 'abrir-controle.vbs'; ico = 'controle.ico';   desc = 'Controle remoto da Cartoon TV' }
)
$destinos = @(
  [Environment]::GetFolderPath('Desktop'),
  (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
)

foreach ($a in $alvos) {
  foreach ($dir in $destinos) {
    if (-not (Test-Path $dir)) { continue }
    try {
      $lnk = $sh.CreateShortcut((Join-Path $dir ($a.nome + '.lnk')))
      $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
      $lnk.Arguments = '//nologo "' + (Join-Path $base $a.vbs) + '"'
      $lnk.WorkingDirectory = $base
      $ico = Join-Path $base ('icones\' + $a.ico)
      if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
      $lnk.Description = $a.desc
      $lnk.Save()
      Write-Output ("   [ok] " + $a.nome + " -> " + $dir)
    } catch {
      Write-Output ("   [!] falhou em " + $dir + ": " + $_.Exception.Message)
    }
  }
}
