@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  OPAIJA - Pipeline Dry-Run (mock mode, no API spend)
echo  Will execute: npm run produce -- EP002
echo  Output -> dry-run.log
echo ============================================================
echo.

call npm run produce -- EP002 > dry-run.log 2>&1
set RC=%ERRORLEVEL%

echo.
echo === Last 40 lines of dry-run.log ===
powershell -Command "Get-Content dry-run.log -Tail 40"
echo.
echo Exit code: %RC%
echo Full log: dry-run.log
echo.
timeout /t 5 /nobreak > nul
exit /b %RC%
