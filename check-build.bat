@echo off
setlocal
cd /d "%~dp0"
echo [check-build] Running TypeScript pre-flight check...
call node_modules\.bin\tsc -p tsconfig.server.json --noEmit > tsc-check.log 2>&1
set RC=%ERRORLEVEL%
if %RC% NEQ 0 (
  echo.
  echo ============================================================
  echo  TYPESCRIPT ERRORS FOUND. DO NOT RUN PRODUCE.
  echo  See tsc-check.log for full details. First 20 lines:
  echo ============================================================
  powershell -Command "Get-Content tsc-check.log -Head 20"
  echo.
  exit /b 1
)
echo [check-build] OK. produce.ts is clean.
exit /b 0
