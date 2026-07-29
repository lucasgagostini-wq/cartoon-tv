# Gera os icones da Cartoon TV: motivo xadrez (referencia ao tabuleiro da Cartoon)
# na paleta verde de tubo da janelinha de controle.
#   -Preview  : exporta PNGs de comparacao em docs/icones-preview/
#   (sem flag): grava os .ico definitivos em icones/
# Uso: powershell -ExecutionPolicy Bypass -File gerar-icones.ps1 [-Preview] [-Variante A]
param([switch]$Preview, [string]$Variante = 'A')

Add-Type -AssemblyName System.Drawing

$VERDE     = [System.Drawing.Color]::FromArgb(255, 53, 224, 112)   # #35E070
$VERDE_MED = [System.Drawing.Color]::FromArgb(255, 34, 150, 78)
$VERDE_ESC = [System.Drawing.Color]::FromArgb(255, 22, 80, 45)
$GRAFITE   = [System.Drawing.Color]::FromArgb(255, 12, 17, 14)     # #0C110E
$CORPO     = [System.Drawing.Color]::FromArgb(255, 30, 43, 34)     # #1E2B22

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Min($r * 2, [Math]::Min($w, $h))
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# xadrez dentro de um retangulo, recortado pelo path
function Draw-Xadrez([System.Drawing.Graphics]$g, $path, [single]$x, [single]$y,
                     [single]$w, [single]$h, [int]$cols, [int]$linhas, $corA, $corB) {
  $old = $g.Clip
  $g.SetClip($path, [System.Drawing.Drawing2D.CombineMode]::Intersect)
  $cw = $w / $cols; $ch = $h / $linhas
  $bA = New-Object System.Drawing.SolidBrush($corA)
  $bB = New-Object System.Drawing.SolidBrush($corB)
  for ($i = 0; $i -lt $cols; $i++) {
    for ($j = 0; $j -lt $linhas; $j++) {
      $b = if ((($i + $j) % 2) -eq 0) { $bA } else { $bB }
      $g.FillRectangle($b, [single]($x + $i * $cw - 0.5), [single]($y + $j * $ch - 0.5),
                       [single]($cw + 1), [single]($ch + 1))
    }
  }
  $g.Clip = $old
}

# ============ A — TELEVISOR COM XADREZ NA TELA ============
function Draw-A([System.Drawing.Graphics]$g, [int]$s) {
  $u = $s / 100.0
  $pAnt = New-Object System.Drawing.Pen($VERDE, [single](6 * $u)); $pAnt.StartCap='Round'; $pAnt.EndCap='Round'
  $g.DrawLine($pAnt, [single](41*$u), [single](33*$u), [single](26*$u), [single](9*$u))
  $g.DrawLine($pAnt, [single](59*$u), [single](33*$u), [single](74*$u), [single](9*$u))
  $bV = New-Object System.Drawing.SolidBrush($VERDE)
  $g.FillEllipse($bV, [single](21*$u), [single](4*$u), [single](10*$u), [single](10*$u))
  $g.FillEllipse($bV, [single](69*$u), [single](4*$u), [single](10*$u), [single](10*$u))
  $corpo = New-RoundRect ([single](7*$u)) ([single](31*$u)) ([single](86*$u)) ([single](60*$u)) ([single](10*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($CORPO)), $corpo)
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE_MED, [single](3.5*$u))), $corpo)
  $tela = New-RoundRect ([single](14*$u)) ([single](38*$u)) ([single](72*$u)) ([single](46*$u)) ([single](7*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($GRAFITE)), $tela)
  Draw-Xadrez $g $tela ([single](14*$u)) ([single](38*$u)) ([single](72*$u)) ([single](46*$u)) 4 3 $VERDE $GRAFITE
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE_ESC, [single](2*$u))), $tela)
}

# ============ B — BLOCO XADREZ (mais proximo do tabuleiro) ============
function Draw-B([System.Drawing.Graphics]$g, [int]$s) {
  $u = $s / 100.0
  $bloco = New-RoundRect ([single](8*$u)) ([single](8*$u)) ([single](84*$u)) ([single](84*$u)) ([single](16*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($GRAFITE)), $bloco)
  Draw-Xadrez $g $bloco ([single](8*$u)) ([single](8*$u)) ([single](84*$u)) ([single](84*$u)) 4 4 $VERDE $GRAFITE
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE, [single](4*$u))), $bloco)
}

# ============ C — TUBO CRT: so a tela, bem curva, com xadrez e brilho ============
function Draw-C([System.Drawing.Graphics]$g, [int]$s) {
  $u = $s / 100.0
  $tubo = New-RoundRect ([single](6*$u)) ([single](14*$u)) ([single](88*$u)) ([single](72*$u)) ([single](26*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($GRAFITE)), $tubo)
  Draw-Xadrez $g $tubo ([single](6*$u)) ([single](14*$u)) ([single](88*$u)) ([single](72*$u)) 4 3 $VERDE $GRAFITE
  # brilho de vidro no topo
  $old = $g.Clip
  $g.SetClip($tubo, [System.Drawing.Drawing2D.CombineMode]::Intersect)
  $brilho = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, [int](14*$u))), (New-Object System.Drawing.Point(0, [int](50*$u))),
    ([System.Drawing.Color]::FromArgb(70, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)))
  $g.FillRectangle($brilho, [single](6*$u), [single](14*$u), [single](88*$u), [single](36*$u))
  $g.Clip = $old
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE, [single](5*$u))), $tubo)
}

# ============ D — XADREZ COM SCANLINES (CRT explicito) ============
function Draw-D([System.Drawing.Graphics]$g, [int]$s) {
  $u = $s / 100.0
  $bloco = New-RoundRect ([single](8*$u)) ([single](12*$u)) ([single](84*$u)) ([single](76*$u)) ([single](14*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($GRAFITE)), $bloco)
  Draw-Xadrez $g $bloco ([single](8*$u)) ([single](12*$u)) ([single](84*$u)) ([single](76*$u)) 4 3 $VERDE $GRAFITE
  if ($s -ge 32) {
    $old = $g.Clip
    $g.SetClip($bloco, [System.Drawing.Drawing2D.CombineMode]::Intersect)
    $pScan = New-Object System.Drawing.Pen(([System.Drawing.Color]::FromArgb(90, 12, 17, 14)), [single](2*$u))
    for ($y = 14; $y -lt 88; $y += 6) { $g.DrawLine($pScan, [single](8*$u), [single]($y*$u), [single](92*$u), [single]($y*$u)) }
    $g.Clip = $old
  }
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE, [single](4.5*$u))), $bloco)
}

# ---------- controle remoto, na mesma linguagem ----------
function Draw-Controle([System.Drawing.Graphics]$g, [int]$s) {
  $u = $s / 100.0
  $corpo = New-RoundRect ([single](27*$u)) ([single](5*$u)) ([single](46*$u)) ([single](90*$u)) ([single](13*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($CORPO)), $corpo)
  $g.DrawPath((New-Object System.Drawing.Pen($VERDE, [single](4*$u))), $corpo)
  $visor = New-RoundRect ([single](34*$u)) ([single](13*$u)) ([single](32*$u)) ([single](24*$u)) ([single](4*$u))
  $g.FillPath((New-Object System.Drawing.SolidBrush($GRAFITE)), $visor)
  Draw-Xadrez $g $visor ([single](34*$u)) ([single](13*$u)) ([single](32*$u)) ([single](24*$u)) 2 2 $VERDE $GRAFITE
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($VERDE)), [single](40*$u), [single](45*$u), [single](20*$u), [single](20*$u))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($CORPO)), [single](46*$u), [single](51*$u), [single](8*$u), [single](8*$u))
  $bB = New-Object System.Drawing.SolidBrush($VERDE_MED)
  for ($l = 0; $l -lt 2; $l++) { for ($c = 0; $c -lt 2; $c++) {
    $g.FillEllipse($bB, [single]((37 + $c*17)*$u), [single]((71 + $l*10)*$u), [single](10*$u), [single](7*$u)) } }
}

function Render([scriptblock]$desenho, [int]$s) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'
  $g.Clear([System.Drawing.Color]::Transparent)
  & $desenho $g $s
  $g.Dispose()
  return $bmp
}

function Save-Ico([string]$saida, [scriptblock]$desenho) {
  $tamanhos = @(16, 24, 32, 48, 64, 128, 256)
  $pngs = @()
  foreach ($s in $tamanhos) {
    $bmp = Render $desenho $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , $ms.ToArray(); $bmp.Dispose(); $ms.Dispose()
  }
  $fs = [System.IO.File]::Create($saida); $bw = New-Object System.IO.BinaryWriter($fs)
  $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$pngs.Count)
  $offset = 6 + 16 * $pngs.Count
  for ($i = 0; $i -lt $pngs.Count; $i++) {
    $s = $tamanhos[$i]
    $b = [Byte]$(if ($s -ge 256) { 0 } else { $s })
    $bw.Write($b); $bw.Write($b); $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32)
    $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
  }
  foreach ($p in $pngs) { $bw.Write($p) }
  $bw.Flush(); $bw.Close(); $fs.Close()
  Write-Output ("  $saida -> " + [math]::Round((Get-Item $saida).Length / 1KB, 1) + " KB")
}

$VARIANTES = @{ 'A' = ${function:Draw-A}; 'B' = ${function:Draw-B}; 'C' = ${function:Draw-C}; 'D' = ${function:Draw-D} }

if ($Preview) {
  $dir = Join-Path $PSScriptRoot 'docs\icones-preview'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  foreach ($k in 'A', 'B', 'C', 'D') {
    foreach ($s in 256, 48, 16) {
      $bmp = Render $VARIANTES[$k] $s
      $bmp.Save((Join-Path $dir "$k-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    }
  }
  foreach ($s in 256, 48, 16) {
    $bmp = Render ${function:Draw-Controle} $s
    $bmp.Save((Join-Path $dir "controle-$s.png"), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  }
  Write-Output "previews em $dir"
} else {
  $dir = Join-Path $PSScriptRoot 'icones'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  Write-Output "gerando com a variante $Variante"
  Save-Ico (Join-Path $dir 'cartoon-tv.ico') $VARIANTES[$Variante]
  Save-Ico (Join-Path $dir 'controle.ico')   ${function:Draw-Controle}
}
