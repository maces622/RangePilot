[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $repo '.env'

if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -le 0) { continue }
        $name = $trimmed.Substring(0, $eq).Trim()
        $value = $trimmed.Substring($eq + 1).Trim().Trim('"').Trim("'")
        if ($name -and -not (Test-Path "Env:$name")) {
            Set-Item -Path "Env:$name" -Value $value
        }
    }
}

if (-not $env:DEEPSEEK_API_KEY) {
    Write-Warning 'DEEPSEEK_API_KEY is not set. Real-model chat will fail. Add it to the ignored .env file.'
}

$nodePath = if ($env:RANGEPILOT_NODE) { $env:RANGEPILOT_NODE } else { (Get-Command node -ErrorAction Stop).Source }
$dshRoot = Join-Path $repo 'engines\dsh'
$dshEntry = Join-Path $dshRoot 'apps\cli\src\bin.ts'
$pluginPath = Join-Path $repo 'plugins\dsh-gto-solver'
$dshHome = Join-Path $repo '.demo\dsh-home'
$env:DSH_HOME = $dshHome

$profileDir = Join-Path $dshHome 'profiles\acp'
$profilePackage = Join-Path $profileDir 'package.json'
if (-not (Test-Path $profilePackage) -or -not (Select-String -Path $profilePackage -Pattern '@rangepilot/dsh-gto-solver' -SimpleMatch -Quiet)) {
    Write-Host 'Installing RangePilot GTO plugin into the demo acp profile...'
    Push-Location $dshRoot
    try {
        & $nodePath --import tsx/esm $dshEntry plugin --profile acp add "link:$pluginPath"
        if ($LASTEXITCODE -ne 0) { throw "DSH plugin installation failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$patch = @(
    '# RangePilot GTO tools',
    '- insert:',
    '    - id: rangepilot-gto-solver',
    "      name: '@rangepilot/dsh-gto-solver'"
)
Set-Content -Path $patchPath -Value $patch -Encoding UTF8

$exe = Join-Path $repo '.demo\app\release\TexasSolverGui.exe'
if (-not (Test-Path $exe)) {
    throw "Demo executable not found: $exe`nRun scripts\build-mvp-demo.ps1 first."
}

$condaBin = 'D:\conda\Library\bin'
if (Test-Path $condaBin) {
    $env:PATH = "$condaBin;$env:PATH"
}
if ($env:RANGEPILOT_QT_PLATFORM) {
    $env:QT_QPA_PLATFORM = $env:RANGEPILOT_QT_PLATFORM
} else {
    Remove-Item Env:QT_QPA_PLATFORM -ErrorAction SilentlyContinue
}
$env:RANGEPILOT_DSH_COMMAND = $nodePath
$env:RANGEPILOT_DSH_ARGS = '--import tsx/esm apps/cli/src/bin.ts --profile acp'
$env:RANGEPILOT_DSH_CWD = $dshRoot

Write-Host 'Launching RangePilot MVP demo...'
Start-Process -FilePath $exe -ArgumentList @('--api-enabled', '--api-port', '0') -WorkingDirectory (Split-Path $exe) | Out-Null
