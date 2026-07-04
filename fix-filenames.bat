@echo off
setlocal
cd /d "%~dp0\public\assets\characters"

echo ============================================================
echo  Fixing double-extension filenames (.png.png -^> .png)
echo  Folder: %CD%
echo ============================================================
echo.

set FIXED=0

for %%F in (kairo-kai-baptiste nia-toussaint malik-st-hill asha-singh-baptiste jabari-jabs-henry tariq-davidson mother-lall papa-etienne-roach marius-vale selah-vale) do (
  if exist "%%F.png.png" (
    if exist "%%F.png" (
      echo Removing stale %%F.png before rename
      del "%%F.png"
    )
    ren "%%F.png.png" "%%F.png"
    if errorlevel 1 (
      echo FAILED to rename %%F.png.png
    ) else (
      echo Renamed: %%F.png.png  -^>  %%F.png
      set /a FIXED+=1
    )
  ) else (
    echo Skipped: %%F.png.png  ^(not found^)
  )
)

echo.
echo ============================================================
echo  Done. Renamed %FIXED% file^(s^).
echo  Current state of characters folder:
echo ============================================================
dir /b *.png
echo.
pause
exit /b 0
