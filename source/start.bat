@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0..\SoloTRPG.exe" (
  start "" "%~dp0..\SoloTRPG.exe"
  exit /b
)
echo   外层 SoloTRPG.exe 尚未发布，改用 Node 直接启动（先执行 npm run build:release 可生成并发布 exe）
start "" http://127.0.0.1:4620
node server.mjs
pause
