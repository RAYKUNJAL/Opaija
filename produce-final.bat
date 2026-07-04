@echo off
setlocal
cd /d "%~dp0"

set KEEP_INTERMEDIATES=1

echo ============================================================
echo  OPAIJA - FINAL PRODUCE EP002
echo  All 10 canon character sheets wired (image-to-video mode)
echo  KEEP_INTERMEDIATES=1 (clips preserved on any failure)
echo ============================================================
echo.

call check-build.bat
if errorlevel 1 (
  echo.
  echo Aborting produce - fix TS errors first.
  pause
  exit /b 1
)

echo Cleaning stale intermediates from previous runs (text-to-video era)...
if exist public\episodes\EP002\clips rmdir /s /q public\episodes\EP002\clips 2>nul
if exist public\episodes\EP002\prompts.json del public\episodes\EP002\prompts.json 2>nul
if exist public\episodes\EP002\clips-meta.json del public\episodes\EP002\clips-meta.json 2>nul
if exist public\episodes\EP002\manifest.json del public\episodes\EP002\manifest.json 2>nul
if exist public\episodes\EP002\concat.txt del public\episodes\EP002\concat.txt 2>nul
echo Cleaned. Voice and parsed.json kept (cached real ElevenLabs from earlier run).
echo.

echo Cost expected: ~$3-5 (11 Seedance clips + render). ElevenLabs voice already cached.
echo Watch live progress below:
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$env:KEEP_INTERMEDIATES=1; npm run produce -- EP002 2>&1 | Tee-Object -FilePath final-produce.log"
set RC=%ERRORLEVEL%

echo.
echo ============================================================
echo Exit code: %RC%
if exist out\EP002.mp4 (
  for /f %%A in ('powershell -NoProfile -Command "(Get-Item 'out\EP002.mp4').Length"') do echo Output: out\EP002.mp4  (%%A bytes)
  for /f %%A in ('powershell -NoProfile -Command "(Get-Item 'out\EP002.mp4').LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')"') do echo Modified: %%A
  echo Opening output folder...
  start "" explorer.exe "%~dp0out"
) else (
  echo No output file produced. See final-produce.log
)
echo Full log: final-produce.log
echo ============================================================
echo.
pause
exit /b %RC%
