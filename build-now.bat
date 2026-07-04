@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  OPAIJA - Build production bundle (dist/)
echo  Express on port 8787 needs this to serve the dashboard.
echo ============================================================
echo.

call npm run build
if errorlevel 1 (
  echo.
  echo BUILD FAILED. See errors above.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Build complete. dist/ produced.
echo  Refresh your browser at http://localhost:8787/command
echo ============================================================
echo.
timeout /t 4 /nobreak > nul
exit /b 0
