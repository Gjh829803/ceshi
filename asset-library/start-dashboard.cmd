@echo off
cd /d "%~dp0.."
call pnpm assets:publish
if errorlevel 1 exit /b %errorlevel%
start "" http://127.0.0.1:3188/
call pnpm dev:assets
pause
