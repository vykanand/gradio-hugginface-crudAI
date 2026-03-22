@echo off
REM Orchestration Server Startup Script
REM Starts the orchestration server with Kafka/Zookeeper using existing docker-compose.yml

setlocal enabledelayedexpansion

echo.
echo ========================================
echo Orchestration Server Startup
echo ========================================
echo.

REM Check Docker
echo Checking Docker...
docker ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Start Docker Desktop.
    pause
    exit /b 1
)
echo [OK] Docker is running

REM Check docker-compose
echo Checking docker-compose...
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: docker-compose not found
    pause
    exit /b 1
)
echo [OK] docker-compose is available

REM Start services
echo.
echo ========================================
echo Starting Services (Kafka, Zookeeper, App)
echo ========================================
echo.
docker-compose up app

echo.
echo ========================================
echo Services Stopped
echo ========================================
echo.
pause
