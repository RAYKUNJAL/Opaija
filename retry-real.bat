@echo off
setlocal
cd /d "%~dp0"

REM Safety net — keep intermediates so we never lose Seedance clips again
set KEEP_INTERMEDIATES=1

echo ============================================================
echo  OPAIJA - Retry Production (with pipeline fixes)
echo  Refs are cached. Voice + 11 clips will regenerate.
echo  Expected cost: ~$3-5 ($0.28 voice + ~$3 clips on Lite)
echo  KEEP_INTERMEDIATES=1 (clips preserved even on failure)
echo ============================================================
echo.

call check-build.bat
if errorlevel 1 (
  echo.
  echo Aborting produce - fix TS errors first.
  pause
  exit /b 1
)

REM Tee output to retry-real.log AND show live in terminal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:KEEP_INTERMEDIATES=1; npm run produce -- EP002 2>&1 | Tee-Object -FilePath retry-real.log"
set RC=%ERRORLEVEL%

echo.
echo Exit code: %RC%
echo.

if exist out\EP002.mp4 (
  for /f %%A in ('powershell -NoProfile -Command "(Get-Item 'out\EP002.mp4').Length"') do echo Output: out\EP002.mp4  (%%A bytes)
  start "" explorer.exe "%~dp0out"
) else (
  echo No output file produced. Check retry-real.log for details.
)

echo.
echo Full log: retry-real.log
echo.
pause
exit /b %RC%
