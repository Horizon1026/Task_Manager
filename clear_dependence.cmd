@echo off
setlocal
cd /d "%~dp0"

set "CLEAR_FAILED=0"
for %%D in (node_modules dist .runtime test-results playwright-report) do (
  if exist "%%D" (
    echo Removing %%D
    rmdir /s /q "%%D"
    if exist "%%D" set "CLEAR_FAILED=1"
  )
)

where powershell.exe >nul 2>nul
if not errorlevel 1 (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=(Get-Location).Path; Get-ChildItem -LiteralPath $root -Recurse -Force -File -Filter '*.tmp' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike ($root + '\.git\*') } | ForEach-Object { Write-Host ('Removing ' + $_.FullName); Remove-Item -LiteralPath $_.FullName -Force }"
  if errorlevel 1 set "CLEAR_FAILED=1"
)

if "%CLEAR_FAILED%"=="1" (
  echo Some generated files could not be removed. Stop running processes and try again.
  exit /b 1
)
echo Dependencies and build output removed. Source code, YAML files, and backups were preserved.
exit /b 0
