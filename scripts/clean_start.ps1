param(
    [string]$Mode = "docker" # docker | local
)

function Write-Log($m){ Write-Host "[clean-start] $m" }

# 1) Stop local node servers that look like this project's server
Write-Log "Stopping local Node servers matching 'server.js'..."
$nodes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'node(\\.exe)?' -and $_.CommandLine -match 'server\\.js' }
foreach($n in $nodes){
    try{
        Write-Log "Stopping PID $($n.ProcessId) -- $($n.CommandLine)"
        Stop-Process -Id $n.ProcessId -Force -ErrorAction Stop
    } catch { Write-Log "Could not stop PID $($n.ProcessId): $_" }
}

# 2) Stop docker compose services to ensure a clean start
if (Get-Command docker -ErrorAction SilentlyContinue) {
    Write-Log "Bringing down docker-compose services..."
    docker compose down --remove-orphans
} else {
    Write-Log "Docker not found in PATH, skipping docker compose down."
}

# 3) Optionally start infrastructure and app
if ($Mode -eq 'docker'){
    Write-Log "Starting infrastructure (zookeeper, kafka) in docker..."
    docker compose up -d zookeeper kafka

    # wait for Kafka broker port 9092
    $healthy = $false
    for ($i=0;$i -lt 30; $i++){
        try{
            if (Test-NetConnection -ComputerName 'localhost' -Port 9092 -InformationLevel Quiet) { $healthy = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if ($healthy) { Write-Log "Kafka broker responding on localhost:9092" } else { Write-Log "Kafka did not respond in time." }

    Write-Log "Starting app service in docker (app)"
    docker compose up -d --build app
    Write-Log "Docker services started. Use 'docker compose logs -f app' to follow logs."
} else {
    Write-Log "Starting services locally. Ensure Kafka is reachable at localhost:9092"
    # start Zookeeper/Kafka via docker for infra
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        docker compose up -d zookeeper kafka
    }

    Write-Log "Setting KAFKA_BROKERS environment variable for current session and starting npm start"
    $env:KAFKA_BROKERS = 'localhost:9092'
    npm install --no-audit --no-fund
    Start-Process -NoNewWindow -FilePath npm -ArgumentList 'start'
    Write-Log "npm start launched (check the terminal where this script was run for output)."
}

Write-Log "Clean start completed."
