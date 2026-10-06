@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title UI Editor - Build and Run
set "EDITOR_DIR=%~dp0Editor"
set "RUNTIME_DIR=%~dp0ToolRuntime\Runtime"
set "npm_config_cache=%RUNTIME_DIR%\npm-cache"
set "electron_config_cache=%RUNTIME_DIR%\ElectronDownloadCache"
if not defined ELECTRON_MIRROR set "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/"
set "ELECTRON_RUN_AS_NODE="
if exist "%RUNTIME_DIR%\nodejs\node.exe" if exist "%RUNTIME_DIR%\nodejs\npm.cmd" set "PATH=%RUNTIME_DIR%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 goto :missing_node
where npm >nul 2>nul
if errorlevel 1 goto :missing_node
cd /d "%EDITOR_DIR%"
if errorlevel 1 goto :error
echo Installing dependencies from package-lock.json...
call npm ci --no-audit
if errorlevel 1 goto :error
echo Preparing Electron runtime...
call node node_modules\electron\install.js
if errorlevel 1 goto :error
echo Building UI Editor...
call npm run package
if errorlevel 1 goto :error
call "%~dp0Run.bat"
exit /b %ERRORLEVEL%
:missing_node
echo Node.js with npm was not found. Install Node.js 24 LTS or newer.
echo Or place node.exe and npm.cmd in ToolRuntime\Runtime\nodejs.
:error
echo Build failed. Check the output above.
pause
exit /b 1
