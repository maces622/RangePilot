[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$buildDir = Join-Path $repo 'build\mvp'
$demoApp = Join-Path $repo '.demo\app'

$qmake = if ($env:RANGEPILOT_QMAKE) { $env:RANGEPILOT_QMAKE } else { 'D:\conda\Library\bin\qmake.exe' }
$vcvars = 'C:\Program Files (x86)\Microsoft Visual Studio\2017\Professional\VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $qmake)) { throw "qmake not found: $qmake" }
if (-not (Test-Path $vcvars)) { throw "Visual Studio environment not found: $vcvars" }

New-Item -ItemType Directory -Force $buildDir | Out-Null
Push-Location $buildDir
try {
    $project = Join-Path $repo 'apps\gto-gui\TexasSolverGui.pro'
    $command = 'call "' + $vcvars + '" >nul && "' + $qmake + '" "' + $project + '" && nmake'
    cmd /c $command
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}

$releaseDir = Join-Path $demoApp 'release'
New-Item -ItemType Directory -Force $releaseDir | Out-Null
Copy-Item -Path (Join-Path $buildDir 'release\TexasSolverGui.exe') -Destination (Join-Path $releaseDir 'TexasSolverGui.exe') -Force
Write-Host "Demo executable ready: $(Join-Path $releaseDir 'TexasSolverGui.exe')"
