@echo off
REM start-app.bat — launches the Docker Compose `app` service in a new terminal and opens the browser










exit /b 0
popdpowershell -NoProfile -ExecutionPolicy Bypass -Command "
$uri = 'http://localhost:3000';
$timeout = 120; $start = Get-Date;
while((New-TimeSpan -Start $start).TotalSeconds -lt $timeout) {
  try {
    $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop;
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { Write-Host 'Service is up'; Start-Process $uri; exit 0 }
  } catch { }
  Write-Host -NoNewline '.'; Start-Sleep -Seconds 2;
}
Write-Host 'Timed out waiting for service to start.'; exit 1
"echo Waiting for http://localhost:3000 to become available...
:: Poll localhost:3000 (timeout 120s) and open browser when availablestart "App - docker-compose" cmd /k "docker-compose up --build app"
:: Launch docker-compose in a new cmd window so logs stay visiblepushd "%~dp0":: Ensure script runs from repository root (where docker-compose.yml lives)