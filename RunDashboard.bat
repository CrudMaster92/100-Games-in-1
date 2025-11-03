@echo off
REM Launch the 100 Games in 1 dashboard UI in the default browser.
set SCRIPT_DIR=%~dp0
start "100 Games in 1" "%SCRIPT_DIR%dashboard\ui\index.html"
