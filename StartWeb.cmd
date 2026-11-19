@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0" || exit /b 1
where node >nul 2>&1 || (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
echo Keep this window open. The game URL will appear below.
node server.js
pause
