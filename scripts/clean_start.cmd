@echo off
REM Wrapper to run the PowerShell clean start script
SETLOCAL
set SCRIPT_DIR=%~dp0
set PS1=%SCRIPT_DIR%clean_start.ps1
if "%1"=="local" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Mode local
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Mode docker
)
ENDLOCAL
