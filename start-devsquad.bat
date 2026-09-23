@echo off
chcp 65001 >nul
title DevSquad PRO - Plataforma ALM (SQLite Server)
echo ==============================================================================
echo        DevSquad PRO - Plataforma ALM ^& Gestao de Demandas e Testes
echo                 Iniciando Servidor Local com SQLite
echo ==============================================================================
echo.

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set NODE_BIN=
if exist "%SCRIPT_DIR%.tools\node\node.exe" (
    set "NODE_BIN=%SCRIPT_DIR%.tools\node\node.exe"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        set "NODE_BIN=node"
    )
)

if "%NODE_BIN%"=="" (
    echo [ERRO] Node.js nao encontrado em .tools\node nem no PATH do sistema.
    echo Por favor, certifique-se de manter a pasta .tools/node ou instalar o Node.js.
    pause
    exit /b 1
)

echo [1/3] Verificando runtime Node.js...
echo       Usando: %NODE_BIN%
echo [2/3] Abrindo DevSquad PRO no navegador padrao...
start http://localhost:3001

echo [3/3] Iniciando servidor HTTP e banco relacional devsquad.db na porta 3001...
echo       Acesso Local: http://localhost:3001
echo       Acesso na Rede: consulte o IP exibido abaixo pelo servidor.
echo       Pressione Ctrl + C para encerrar o servidor a qualquer momento.
echo.

"%NODE_BIN%" --no-warnings --experimental-sqlite server.js

pause
