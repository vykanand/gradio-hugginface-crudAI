# Orchestration Server Startup Script (PowerShell)
# Starts the orchestration server with Kafka/Zookeeper using existing docker-compose.yml

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Orchestration Server Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
$dockerCheck = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker is not running" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Docker is running" -ForegroundColor Green

# Check docker-compose
Write-Host "Checking docker-compose..." -ForegroundColor Yellow
$composeCheck = docker-compose --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: docker-compose not found" -ForegroundColor Red
    Write-Host "Please install Docker Desktop with docker-compose"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] docker-compose is available" -ForegroundColor Green

# Start services
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting Services (Kafka, Zookeeper, App)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

docker-compose up app

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Services Stopped" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to exit"
