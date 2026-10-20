@echo off
chcp 65001 >nul
cd /d "%~dp0"
where pnpm >nul 2>&1
if errorlevel 1 (
  echo 请先安装课程使用的 Node.js 和 pnpm。
  pause
  exit /b 1
)
if not exist dist\home\index.html (
  echo 请在本目录完成一次 pnpm install --frozen-lockfile。
  pause
  exit /b 1
)
call pnpm start
if errorlevel 1 pause
