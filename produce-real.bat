@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  OPAIJA - First Real Production Run
echo  Step 1: Character ref images (~$1.40, ~30 sec)
echo  Step 2: Produce EP002 (~$5, lean mode, ~2-4 min)
echo  Logs -> produce-real.log
echo ============================================================
echo.

call check-build.bat
if errorlevel 1 (
  echo.
  echo Aborting produce - fix TS errors first.
  pause
  exit /b 1
)

echo === [1/2] Generating character ref images... ===
call npm run refs > produce-real.log 2>&1
if errorlevel 1 (
  echo.
  echo CHARACTER REFS FAILED. Check produce-real.log for details.
  powershell -Command "Get-Content produce-real.log -Tail 30"
  pause
  exit /b 1
)
echo Done.
echo.

echo === [2/2] Producing EP002 ... ===
echo (this takes 2-4 minutes; you can watch progress in the dashboard)
call npm run produce -- EP002 >> produce-real.log 2>&1
set RC=%ERRORLEVEL%

echo.
echo === Last 30 lines of produce-real.log ===
powershell -Command "Get-Content produce-real.log -Tail 30"
echo.
echo Exit code: %RC%
echo Full log: produce-real.log
echo.

if %RC% EQU 0 (
  if exist out\EP002.mp4 (
    echo SUCCESS. Output: out\EP002.mp4
    echo Opening folder...
    start "" explorer.exe "%~dp0out"
  ) else (
    echo Script reported success but out\EP002.mp4 not found.
  )
)

echo.
timeout /t 8 /nobreak > nul
exit /b %RC%
