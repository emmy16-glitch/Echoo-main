param(
    [switch]$InstallSmokeTest
)

$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$distDirectory = Join-Path $desktopRoot 'dist'
$installerPath = Join-Path $distDirectory 'Echoo-Setup-2.0.0-x64.exe'
$updateMetadataPath = Join-Path $distDirectory 'latest.yml'
$blockmapPath = "$installerPath.blockmap"

foreach ($requiredPath in @($installerPath, $updateMetadataPath, $blockmapPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required Windows release artifact is missing: $requiredPath"
    }
    if ((Get-Item -LiteralPath $requiredPath).Length -le 0) {
        throw "Windows release artifact is empty: $requiredPath"
    }
}

$installer = Get-Item -LiteralPath $installerPath
if ($installer.Length -lt 50MB) {
    throw "Installer is unexpectedly small ($($installer.Length) bytes)."
}

$metadata = Get-Content -Raw -LiteralPath $updateMetadataPath
if ($metadata -notmatch [regex]::Escape($installer.Name)) {
    throw 'latest.yml does not reference the verified installer.'
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $installerPath
Write-Host "Verified $($installer.Name) ($([math]::Round($installer.Length / 1MB, 1)) MB)"
Write-Host "SHA256 $($hash.Hash)"

if (-not $InstallSmokeTest) {
    exit 0
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$installDirectory = [IO.Path]::GetFullPath((Join-Path $tempRoot 'echoo-installer-smoke'))
if (-not $installDirectory.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing unsafe smoke-test install path: $installDirectory"
}

$markerPath = Join-Path $tempRoot 'echoo-desktop-smoke.json'
if (Test-Path -LiteralPath $markerPath) {
    Remove-Item -LiteralPath $markerPath -Force
}
if (Test-Path -LiteralPath $installDirectory) {
    Remove-Item -LiteralPath $installDirectory -Recurse -Force
}

try {
    $install = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
    if ($install.ExitCode -ne 0) {
        throw "Silent installer exited with code $($install.ExitCode)."
    }

    $executablePath = Join-Path $installDirectory 'Echoo.exe'
    if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
        throw "Installed Echoo executable is missing: $executablePath"
    }

    $previousSmokeValue = $env:ECHOO_DESKTOP_SMOKE_TEST
    $previousRunAsNodeValue = $env:ELECTRON_RUN_AS_NODE
    $env:ECHOO_DESKTOP_SMOKE_TEST = '1'
    $env:ELECTRON_RUN_AS_NODE = $null
    try {
        $application = Start-Process -FilePath $executablePath -PassThru -WindowStyle Hidden
    } finally {
        $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
        $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
    }
    try {
        Wait-Process -Id $application.Id -Timeout 45 -ErrorAction Stop
    } catch {
        Stop-Process -Id $application.Id -Force -ErrorAction SilentlyContinue
        throw 'Installed Echoo did not complete its packaged-renderer smoke test within 45 seconds.'
    }
    $application.Refresh()
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw "Installed Echoo did not create its packaged-renderer smoke marker (exit code $($application.ExitCode))."
    }

    $smoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if ($application.ExitCode -ne 0) {
        throw "Installed Echoo smoke test exited with code $($application.ExitCode): $($smoke | ConvertTo-Json -Compress)"
    }
    if ($smoke.passed -ne $true -or $smoke.protocol -ne 'file:' -or $smoke.identity -ne 'echoo-frontend' -or $smoke.desktopBridge -ne $true) {
        throw "Installed Echoo loaded an invalid renderer: $($smoke | ConvertTo-Json -Compress)"
    }

    Write-Host 'Installed Echoo launched the local renderer with the secure desktop bridge.'
} finally {
    $uninstallerPath = Join-Path $installDirectory 'Uninstall Echoo.exe'
    if (Test-Path -LiteralPath $uninstallerPath -PathType Leaf) {
        Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Wait -WindowStyle Hidden
    }
    if (Test-Path -LiteralPath $installDirectory) {
        if (-not $installDirectory.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Refusing unsafe smoke-test cleanup path: $installDirectory"
        }
        Remove-Item -LiteralPath $installDirectory -Recurse -Force
    }
    if (Test-Path -LiteralPath $markerPath) {
        Remove-Item -LiteralPath $markerPath -Force
    }
}
