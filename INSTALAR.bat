@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Cartoon TV - instalacao

echo.
echo   ============================================
echo      CARTOON TV - instalacao
echo   ============================================
echo.

rem ---------- 1. Chrome ----------
set "CHROME="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do (
  if exist %%P set "CHROME=%%P"
)
if not defined CHROME (
  echo   [X] Google Chrome nao encontrado.
  echo       A TV precisa do Chrome de verdade: o navegador do Playwright nao
  echo       reproduz video protegido (DRM) e a tela ficaria preta.
  echo.
  echo       Instale em https://google.com/chrome e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
echo   [ok] Google Chrome encontrado

rem ---------- 2. Node ----------
where node >nul 2>&1
if errorlevel 1 (
  echo   [!] Node.js nao encontrado. Tentando instalar pelo winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo   [X] Nao consegui instalar o Node.js automaticamente.
    echo       Baixe em https://nodejs.org ^(versao LTS^), instale e rode este arquivo de novo.
    echo.
    pause
    exit /b 1
  )
  echo   [!] Node instalado. FECHE esta janela e rode o INSTALAR.bat de novo,
  echo       pra que o Windows reconheca o comando node.
  echo.
  pause
  exit /b 0
)
for /f "tokens=*" %%v in ('node -v') do echo   [ok] Node.js %%v

rem ---------- 3. dependencias ----------
echo   [..] Baixando dependencias ^(so na primeira vez^)...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo   [X] npm install falhou. Verifique sua conexao e tente de novo.
  pause
  exit /b 1
)
echo   [ok] Dependencias prontas

rem ---------- 4. atalhos ----------
echo   [..] Criando atalhos...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0criar-atalhos.ps1"
if errorlevel 1 echo   [!] Nao consegui criar os atalhos ^(da pra abrir pelo ligar-tv.vbs mesmo assim^)

rem ---------- 5. login ----------
echo.
echo   ============================================
echo      Falta so entrar na SUA conta
echo   ============================================
echo.
echo   Vou abrir o Chrome no HBO Max. Faca login e escolha seu perfil.
echo   ^(a sessao fica salva so no seu PC, em televisor\.chrome-profile^)
echo.
pause
node televisor\configurar.js

rem ---------- 6. catalogo ----------
echo.
echo   [..] Conferindo o catalogo de desenhos.
echo        O que ja vem pronto e reaproveitado; o que faltar e lido da sua
echo        conta agora ^(abre e fecha paginas sozinho^). Nao mexa na janela.
echo.
pause
node televisor\capturar-series.js

echo.
echo   ============================================
echo      Pronto! Procure "Cartoon TV" no menu Iniciar.
echo   ============================================
echo.
pause
