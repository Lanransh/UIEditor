@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title UI Editor
set "ELECTRON_RUN_AS_NODE="
set "APP_EXE=%~dp0ToolRuntime\UIEditor-win32-x64\UIEditor.exe"
if not exist "%APP_EXE%" (
  echo Packaged editor was not found. Run BuildAndRun.bat first.
  goto :error
)
start "" /wait "%APP_EXE%"
if errorlevel 1 goto :error
exit /b 0
:error
echo Launch failed. Check the output above.
pause
exit /b 1
