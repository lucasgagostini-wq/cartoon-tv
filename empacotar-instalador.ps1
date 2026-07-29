# Gera dist\CartoonTV-Instalador.exe — um arquivo só, dois cliques, sem UAC.
# Monta a pasta staging (app + node.exe embutido) e compila com o Inno Setup.
# Uso: powershell -ExecutionPolicy Bypass -File empacotar-instalador.ps1
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$staging = Join-Path $raiz 'instalador\staging'
$dist = Join-Path $raiz 'dist'

Write-Output '== Cartoon TV: montando o instalador =='

# --- 1. o catalogo da extensao e os icones precisam estar frescos ---
if (-not (Test-Path (Join-Path $raiz 'icones\cartoon-tv.ico'))) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $raiz 'gerar-icones.ps1') -Variante B | Out-Null
}

# --- 2. staging limpo ---
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force -Path $staging, $dist | Out-Null

# O que a instalação precisa. Fora: docs, extensao, testes, .git, e tudo que é
# de runtime (perfil do navegador, log, preferências) — nasce na máquina da pessoa.
$copiar = @(
  @{ de = 'emissora';     excluir = @('grade') },
  @{ de = 'televisor';    excluir = @('.chrome-profile', '.chrome-controle') },
  @{ de = 'node_modules'; excluir = @() },
  @{ de = 'icones';       excluir = @() }
)
foreach ($item in $copiar) {
  $origem = Join-Path $raiz $item.de
  if (-not (Test-Path $origem)) { throw "faltou a pasta $($item.de)" }
  $destino = Join-Path $staging $item.de
  robocopy $origem $destino /E /NFL /NDL /NJH /NJS /NP /XD $item.excluir | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falhou em $($item.de)" }
}
# arquivos soltos da raiz
foreach ($f in 'ligar-tv.vbs', 'abrir-controle.vbs', 'package.json', 'LEIA-ME-INSTALACAO.txt') {
  $p = Join-Path $raiz $f
  if (Test-Path $p) { Copy-Item $p $staging }
}
# runtime e testes não vão junto
Get-ChildItem (Join-Path $staging 'televisor') -Filter '*.test.js' | Remove-Item -Force
foreach ($lixo in 'tv-log.txt', 'preferencias.json', 'configuracao.json') {
  $p = Join-Path $staging "televisor\$lixo"
  if (Test-Path $p) { Remove-Item $p -Force }
}
Get-ChildItem (Join-Path $staging 'televisor') -Filter '*.png' -EA SilentlyContinue | Remove-Item -Force

# --- 3. Node embutido: é isso que dispensa a pessoa de instalar qualquer coisa ---
$node = (Get-Command node -EA SilentlyContinue).Source
if (-not $node) { throw 'node.exe não encontrado no PATH — instale o Node pra empacotar' }
Copy-Item $node (Join-Path $staging 'node.exe')
Write-Output ("   node embutido: " + [math]::Round((Get-Item $node).Length / 1MB, 1) + ' MB')

$mb = [math]::Round(((Get-ChildItem $staging -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Output "   staging: $mb MB"

# --- 4. compila ---
$iscc = @(
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup não encontrado. Instale com: winget install JRSoftware.InnoSetup' }

& $iscc (Join-Path $raiz 'instalador\CartoonTV.iss') /Q
if ($LASTEXITCODE -ne 0) { throw "ISCC falhou (codigo $LASTEXITCODE)" }

$exe = Join-Path $dist 'CartoonTV-Instalador.exe'
Write-Output ('== pronto: ' + $exe + ' (' + [math]::Round((Get-Item $exe).Length / 1MB, 1) + ' MB) ==')
