@echo off
echo Opening Anthropic Console...
start "" "https://console.anthropic.com/settings/keys"
timeout /t 2 /nobreak > nul

echo Opening ElevenLabs...
start "" "https://elevenlabs.io/app/sign-in"
timeout /t 2 /nobreak > nul

echo Opening fal.ai dashboard...
start "" "https://fal.ai/dashboard/keys"
timeout /t 2 /nobreak > nul

echo.
echo ============================================================
echo  Three tabs should now be open in your default browser:
echo    1) Anthropic Console - API Keys
echo    2) ElevenLabs - Sign In
echo    3) fal.ai - Dashboard Keys
echo.
echo  Come back to Claude when you have all 4 strings:
echo    - Anthropic API key (starts with sk-ant-)
echo    - ElevenLabs API key
echo    - ElevenLabs voice ID
echo    - fal.ai API key
echo ============================================================
timeout /t 6 /nobreak > nul
exit /b 0
