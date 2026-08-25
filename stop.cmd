@echo off
REM Stop all Agentic Commerce services and remove the containers.
setlocal
cd /d "%~dp0"
echo Stopping Agentic Commerce services...
docker compose down
echo Done.
endlocal
