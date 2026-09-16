@echo off
setlocal
cd /d "%~dp0"

set "NODE_VERSION=v22.22.0"
set "NODE_PLATFORM=win-x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "NODE_PLATFORM=win-arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "NODE_PLATFORM=win-arm64"
if /I "%PROCESSOR_ARCHITECTURE%"=="x86" if "%PROCESSOR_ARCHITEW6432%"=="" set "NODE_PLATFORM=win-x86"
set "NODE_ARCHIVE=node-%NODE_VERSION%-%NODE_PLATFORM%"
set "RUNTIME_DIR=%CD%\.runtime"
set "LOCAL_NODE_DIR=%RUNTIME_DIR%\%NODE_ARCHIVE%"
set "TASK_NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ARCHIVE%.zip"
set "TASK_NODE_ZIP=%RUNTIME_DIR%\%NODE_ARCHIVE%.zip"
set "TASK_RUNTIME_DIR=%RUNTIME_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  if not exist "%LOCAL_NODE_DIR%\node.exe" (
    where powershell.exe >nul 2>nul
    if errorlevel 1 (
      echo PowerShell was not found. Cannot download Node.js.
      exit /b 1
    )
    if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
    echo Downloading Node.js %NODE_VERSION% for %NODE_PLATFORM%...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri $env:TASK_NODE_URL -OutFile $env:TASK_NODE_ZIP; Expand-Archive -LiteralPath $env:TASK_NODE_ZIP -DestinationPath $env:TASK_RUNTIME_DIR -Force"
    if errorlevel 1 (
      echo Failed to download or extract Node.js.
      if exist "%TASK_NODE_ZIP%" del /q "%TASK_NODE_ZIP%"
      exit /b 1
    )
    del /q "%TASK_NODE_ZIP%"
  )
  set "PATH=%LOCAL_NODE_DIR%;%PATH%"
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found.
  exit /b 1
)

for /f "delims=" %%V in ('node --version') do echo Using Node.js %%V
if exist package-lock.json (
  call npm.cmd ci
) else (
  call npm.cmd install
)
if errorlevel 1 exit /b 1

call npm.cmd run build
if errorlevel 1 exit /b 1
echo Dependencies restored and application built successfully.
exit /b 0
