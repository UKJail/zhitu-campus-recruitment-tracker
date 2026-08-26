@echo off
setlocal
cd /d "%~dp0"
start "职途脱敏验收服务器" /min cmd /k "pnpm fixtures"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173/"
endlocal
