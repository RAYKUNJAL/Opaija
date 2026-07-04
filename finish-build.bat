@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  OPAIJA - Finish Build
echo  Folder: %CD%
echo ============================================================
echo.

if exist node_modules (
  echo [1/3] Removing partial node_modules from previous attempt...
  rmdir /s /q node_modules
  if errorlevel 1 (
    echo.
    echo Could not delete node_modules. Close any editor/terminal that has files open in it, then re-run this script.
    pause
    exit /b 1
  )
) else (
  echo [1/3] No existing node_modules - skipping clean.
)
echo.

echo [2/3] Running npm install (this takes 1-3 minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo npm install FAILED. See errors above.
  pause
  exit /b 1
)
echo.

echo [3/3] Running npm run build...
call npm run build
if errorlevel 1 (
  echo.
  echo npm run build FAILED. Install succeeded, but the build step had errors above.
  pause
  exit /b 1
)
echo.

echo ============================================================
echo  Build complete.
echo.
echo  To start the dashboard:
echo    npm run dev
echo  Then open: http://localhost:8787/command
echo ============================================================
echo.
pause
