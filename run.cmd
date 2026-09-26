@echo off
setlocal
cd /d "%~dp0"

set "NODE_VERSION=v22.22.0"
set "NODE_PLATFORM=win-x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_PLATFORM=win-arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NODE_PLATFORM=win-arm64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if "%PROCESSOR_ARCHITEW6432%"=="" set "NODE_PLATFORM=win-x86"
set "LOCAL_NODE_DIR=%CD%\.runtime\node-%NODE_VERSION%-%NODE_PLATFORM%"

where node >nul 2>nul
if errorlevel 1 (
  if not exist "%LOCAL_NODE_DIR%\node.exe" (
    echo Preparing the local runtime for first use...
    call "%~dp0create_dependence.cmd"
    if errorlevel 1 exit /b 1
  )
  set "PATH=%LOCAL_NODE_DIR%;%PATH%"
)

if not exist node_modules (
  call "%~dp0create_dependence.cmd"
  if errorlevel 1 exit /b 1
) else (
  call npm.cmd run build
  if errorlevel 1 exit /b 1
)

echo TaskManager will be available at http://127.0.0.1:4310
call npm.cmd start
exit /b %errorlevel%
