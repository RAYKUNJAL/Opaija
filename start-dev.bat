@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  OPAIJA - Start Dev Server
echo ============================================================
echo.

REM Self-heal: if vite or tsx binaries are missing, do a clean install first
if not exist "node_modules\.bin\vite.cmd" goto NEEDS_INSTALL
if not exist "node_modules\.bin\tsx.cmd" goto NEEDS_INSTALL
goto LAUNCH

:NEEDS_INSTALL
echo node_modules looks incomplete (vite or tsx missing).
echo Cleaning and reinstalling. This takes ~2 minutes...
echo.
if exist node_modules rmdir /s /q node_modules
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo npm install FAILED. See errors above.
  pause
  exit /b 1
)
echo.
echo Install complete.
echo.

:LAUNCH
call check-build.bat
if errorlevel 1 (
  echo.
  echo Aborting dev launch - fix TS errors first.
  pause
  exit /b 1
)

echo Launching dev server in a new window...
start "OPAIJA dev server" cmd /k "cd /d %~dp0 && npm run dev"

echo Waiting 12 seconds for the server to boot...
timeout /t 12 /nobreak > nul

echo Opening dashboard at http://localhost:8787/command ...
start "" "http://localhost:8787/command"

echo.
echo ============================================================
echo  Done. The dev server is running in the other window.
echo  Close that window to stop the server.
echo ============================================================
echo.
exit /b 0
