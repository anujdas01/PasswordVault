@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo.
echo  PasswordVault launcher
echo  ------------------------

:: ---------- Check whether a client rebuild is needed ----------
set "REBUILD=0"
if not exist "client\dist\index.html" (
  echo  [info] No previous build found. Building client...
  set "REBUILD=1"
) else (
  :: Newest source file under client\src vs newest built file in client\dist
  set "NEWEST_SRC="
  for /f "delims=" %%f in ('powershell -NoProfile -Command "(Get-ChildItem -Path 'client\src' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName"') do set "NEWEST_SRC=%%f"
  set "NEWEST_DIST="
  for /f "delims=" %%f in ('powershell -NoProfile -Command "(Get-ChildItem -Path 'client\dist' -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName"') do set "NEWEST_DIST=%%f"

  if defined NEWEST_SRC if defined NEWEST_DIST (
    for /f %%n in ('powershell -NoProfile -Command "if ((Get-Item -LiteralPath '!NEWEST_SRC!').LastWriteTimeUtc.Ticks -gt (Get-Item -LiteralPath '!NEWEST_DIST!').LastWriteTimeUtc.Ticks) { Write-Output 1 } else { Write-Output 0 }"') do set "SRC_NEWER=%%n"
    if "!SRC_NEWER!"=="1" (
      echo  [info] Sources are newer than the current build. Rebuilding client...
      set "REBUILD=1"
    ) else (
      echo  [ok]   Build is up to date.
    )
  ) else (
    echo  [info] Could not compare timestamps; rebuilding client...
    set "REBUILD=1"
  )
)

if "!REBUILD!"=="1" (
  pushd "client"
  call npm run build
  if errorlevel 1 (
    popd
    echo.
    echo  [error] Client build failed. Server was not started.
    pause
    exit /b 1
  )
  popd
)

:: ---------- Launch browser and start the server ----------
echo.
echo  Starting PasswordVault server...
start "" http://127.0.0.1:8080
cd /d "%~dp0server"
node src\index.js
