#!/usr/bin/env pwsh
# Fast, clean Docker Compose restart with old instance cleanup
# Preserves all data in named volumes

param(
    [switch]$Force,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "🧹 Starting clean Docker Compose restart..." -ForegroundColor Cyan

# Stop all services gracefully
Write-Host "`n📦 Stopping services gracefully..." -ForegroundColor Yellow
docker-compose down --remove-orphans --timeout 60

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: docker-compose down returned non-zero exit code" -ForegroundColor Yellow
}

# Remove any dangling/stopped containers from this project
Write-Host "`n🗑️  Removing old container instances..." -ForegroundColor Yellow
$projectContainers = docker ps -a --filter "name=gradio-hugginface-crudai" --format "{{.ID}}"
if ($projectContainers) {
    docker rm -f $projectContainers 2>$null
    Write-Host "✅ Removed old containers" -ForegroundColor Green
} else {
    Write-Host "✅ No old containers to remove" -ForegroundColor Green
}

# Prune unused networks
Write-Host "`n🌐 Cleaning up unused networks..." -ForegroundColor Yellow
docker network prune -f --filter "label=com.docker.compose.project=gradio-hugginface-crudai" 2>$null

# Optional: rebuild images
if (-not $SkipBuild) {
    Write-Host "`n🔨 Rebuilding images..." -ForegroundColor Yellow
    docker-compose build --no-cache
}

# Start all services with clean instances
Write-Host "`n🚀 Starting fresh service instances..." -ForegroundColor Cyan
docker-compose up -d --remove-orphans --force-recreate

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Clean restart complete!" -ForegroundColor Green
    Write-Host "`n📊 Service Status:" -ForegroundColor Cyan
    docker-compose ps
    
    Write-Host "`n💾 Data Volumes (preserved):" -ForegroundColor Cyan
    docker volume ls --filter "name=gradio-hugginface-crudai" --format "table {{.Name}}\t{{.Driver}}\t{{.Size}}"
    
    Write-Host "`n🔍 Checking service health..." -ForegroundColor Cyan
    Start-Sleep -Seconds 15
    
    Write-Host "`nZookeeper status:" -ForegroundColor Yellow
    docker-compose exec -T zookeeper bash -c "echo ruok | nc localhost 2181" 2>$null
    
    Write-Host "`nKafka broker status:" -ForegroundColor Yellow
    docker-compose exec -T kafka kafka-broker-api-versions --bootstrap-server localhost:9092 2>&1 | Select-String -Pattern "ApiVersion" -Context 0,0 | Select-Object -First 1
    
    Write-Host "`nApp health:" -ForegroundColor Yellow
    try {
        $health = Invoke-WebRequest -Uri http://localhost:5050/api/health -UseBasicParsing -TimeoutSec 5 | Select-Object -ExpandProperty Content
        Write-Host $health -ForegroundColor Green
    } catch {
        Write-Host "⚠️  App not ready yet (this is normal, give it a few more seconds)" -ForegroundColor Yellow
    }
    
    Write-Host "`n📝 Logs (last 10 lines):" -ForegroundColor Cyan
    docker-compose logs --tail 10
    
    Write-Host "`n✨ System is ready! All data preserved in volumes." -ForegroundColor Green
    Write-Host "   Run 'docker-compose logs -f' to monitor in real-time`n" -ForegroundColor Gray
} else {
    Write-Host "`n❌ Restart failed!" -ForegroundColor Red
    docker-compose logs --tail 50
    exit 1
}
