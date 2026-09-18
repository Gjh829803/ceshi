@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:3188/
node tools\serve.mjs --publish
pause
