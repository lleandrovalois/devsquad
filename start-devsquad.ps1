# ==============================================================================
# DevSquad PRO - Launcher PowerShell
# Inicia o Servidor HTTP + SQLite e abre o navegador automaticamente
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "DevSquad PRO - Plataforma ALM (SQLite Server)"

Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host "       DevSquad PRO - Plataforma ALM & Gestão de Demandas e Testes            " -ForegroundColor White
Write-Host "                Iniciando Servidor Local com SQLite                           " -ForegroundColor Green
Write-Host "==============================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$nodeBin = $null
$localNode = Join-Path $scriptDir ".tools\node\node.exe"

if (Test-Path $localNode) {
    $nodeBin = $localNode
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeBin = "node"
}

if (-not $nodeBin) {
    Write-Host "[ERRO] Node.js não foi encontrado em .tools\node nem no PATH do sistema." -ForegroundColor Red
    Write-Host "Certifique-se de que a pasta portátil .tools/node está presente." -ForegroundColor Yellow
    Read-Host "Pressione ENTER para fechar..."
    exit 1
}

Write-Host "[1/3] Runtime Node.js detectado: $nodeBin" -ForegroundColor Gray
Write-Host "[2/3] Abrindo http://localhost:3001 no navegador padrão..." -ForegroundColor Gray
Start-Process "http://localhost:3001"

Write-Host "[3/3] Iniciando servidor e banco relacional devsquad.db na porta 3001..." -ForegroundColor Green
Write-Host "      Acesso Local: http://localhost:3001" -ForegroundColor Cyan
Write-Host "      Acesso na Rede (LAN): consulte o IP exibido pelo servidor abaixo." -ForegroundColor Cyan
Write-Host "      Pressione Ctrl + C para encerrar o servidor a qualquer momento." -ForegroundColor Yellow
Write-Host ""

& $nodeBin --no-warnings --experimental-sqlite server.js
