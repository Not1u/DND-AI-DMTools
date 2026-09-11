@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "SoloTRPG.exe" (
  start "" "SoloTRPG.exe"
  exit /b
)
echo   SoloTRPG.exe 尚未构建，改用 Node 直接启动（先执行 npm run build:exe 可生成 exe）
start "" http://127.0.0.1:4620
node server.mjs
pause
