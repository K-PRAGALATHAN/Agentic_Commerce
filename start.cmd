@echo off
REM ============================================================
REM  Agentic Commerce - one-command start (Windows)
REM  Builds and runs everything: postgres, redis, backend,
REM  agent-service, frontend. Backend auto-runs migrations.
REM ============================================================
setlocal
cd /d "%~dp0"

echo(
echo ===== Agentic Commerce =====
echo(

REM --- Is Docker running? ---
docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker does not appear to be running.
  echo         Start Docker Desktop, then run start.cmd again.
  echo(
  pause
  exit /b 1
)

REM --- Ensure a .env exists (copy the template on first run) ---
if not exist ".env" (
  echo [setup] No .env found - creating one from .env.example
  copy ".env.example" ".env" >nul
  echo [setup] Edit .env to add your rzp_test_ keys for real payments.
  echo(
)

echo [start] Building and starting all services...
echo         Frontend : http://localhost:5173
echo         Backend  : http://localhost:4000/health
echo         Agent    : http://localhost:8010/health
echo(
echo         Press Ctrl+C to stop. (Run stop.cmd to remove containers.)
echo(

docker compose up --build

endlocal
