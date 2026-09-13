@echo off
cd /d "%~dp0"
node start.mjs --host 0.0.0.0 --port 3007
pause
