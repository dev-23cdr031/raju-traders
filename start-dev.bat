@echo off
cd /d "%~dp0"
start /B "" npm run dev > dev-run-new.log 2>&1
echo Dev server starting in background. Check dev-run-new.log for output.