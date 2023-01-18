@echo off

cd /D "%~dp0"

for /f %%i in ('cd') do set folder=%%~nxi
title %folder%

:loop

echo Starting %folder% server...
timeout /t 2
node .\discordui.js

goto :loop
