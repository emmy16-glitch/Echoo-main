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
        $application = Start-Process -FilePath $executablePath -ArgumentList 'echoo://listen/live/smoke-cold' -PassThru -WindowStyle Hidden
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
    if (
        $smoke.passed -ne $true -or
        $smoke.protocol -ne 'echoo-app:' -or
        $smoke.hash -ne '#/listen/live/smoke-cold' -or
        $smoke.identity -ne 'echoo-frontend' -or
        $smoke.desktopBridge -ne $true
    ) {
        throw "Installed Echoo failed its cold-start renderer/deep-link smoke test: $($smoke | ConvertTo-Json -Compress)"
    }

    # Verify that a second Windows launch is delivered to the existing Echoo
    # process instead of creating another app session.
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    $env:ECHOO_DESKTOP_SMOKE_TEST = 'second-instance'
    $env:ELECTRON_RUN_AS_NODE = $null
    try {
        $primaryApplication = Start-Process -FilePath $executablePath -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 5
        $secondaryApplication = Start-Process -FilePath $executablePath -ArgumentList 'echoo://listen/live/smoke-second' -PassThru -WindowStyle Hidden
        try {
            Wait-Process -Id $secondaryApplication.Id -Timeout 15 -ErrorAction SilentlyContinue
        } catch {
            Stop-Process -Id $secondaryApplication.Id -Force -ErrorAction SilentlyContinue
        }
        try {
            Wait-Process -Id $primaryApplication.Id -Timeout 45 -ErrorAction Stop
        } catch {
            Stop-Process -Id $primaryApplication.Id -Force -ErrorAction SilentlyContinue
            throw 'Installed Echoo did not complete the second-instance deep-link smoke test within 45 seconds.'
        }
    } finally {
        $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
        $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
    }

    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw 'Installed Echoo did not create the second-instance smoke marker.'
    }
    $secondSmoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if (
        $secondSmoke.passed -ne $true -or
        $secondSmoke.smokeMode -ne 'second-instance' -or
        $secondSmoke.secondInstanceRoute -ne '/listen/live/smoke-second' -or
        $secondSmoke.hash -ne '#/listen/live/smoke-second'
    ) {
        throw "Installed Echoo failed second-instance deep-link routing: $($secondSmoke | ConvertTo-Json -Compress)"
    }
    Write-Host 'Verified cold-start and second-instance echoo:// deep-link routing.'

    # Prove the packaged shell itself does not depend on the website/API in
    # order to render. This run blocks all remote HTTP(S) from the Electron
    # session and still requires the local React renderer + secure bridge.
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    $env:ECHOO_DESKTOP_SMOKE_TEST = 'offline'
    $env:ELECTRON_RUN_AS_NODE = $null
    try {
        $offlineApplication = Start-Process -FilePath $executablePath -PassThru -WindowStyle Hidden
    } finally {
        $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
        $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
    }
    try {
        Wait-Process -Id $offlineApplication.Id -Timeout 45 -ErrorAction Stop
    } catch {
        Stop-Process -Id $offlineApplication.Id -Force -ErrorAction SilentlyContinue
        throw 'Installed Echoo did not complete the offline packaged-shell smoke test within 45 seconds.'
    }
    if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
        throw 'Installed Echoo did not create the offline smoke marker.'
    }
    $offlineSmoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
    if (
        $offlineSmoke.passed -ne $true -or
        $offlineSmoke.smokeMode -ne 'offline' -or
        $offlineSmoke.offlineNetworkBlocked -ne $true -or
        $offlineSmoke.protocol -ne 'echoo-app:' -or
        $offlineSmoke.identity -ne 'echoo-frontend' -or
        $offlineSmoke.rootChildren -le 0 -or
        $offlineSmoke.desktopBridge -ne $true
    ) {
        throw "Installed Echoo failed offline local-renderer startup: $($offlineSmoke | ConvertTo-Json -Compress)"
    }
    Write-Host 'Verified Echoo local shell starts with remote HTTP(S) blocked.'

    # Exercise the installed renderer under the Windows-equivalent Chromium
    # scale factors used for 100%, 125%, and 150% display scaling. The app must
    # still render locally without creating document-level horizontal overflow.
    foreach ($scale in @('1', '1.25', '1.5')) {
        Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
        $env:ECHOO_DESKTOP_SMOKE_TEST = 'scale'
        $env:ELECTRON_RUN_AS_NODE = $null
        try {
            $scaleApplication = Start-Process -FilePath $executablePath -ArgumentList "--force-device-scale-factor=$scale" -PassThru -WindowStyle Hidden
        } finally {
            $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
            $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
        }
        try {
            Wait-Process -Id $scaleApplication.Id -Timeout 45 -ErrorAction Stop
        } catch {
            Stop-Process -Id $scaleApplication.Id -Force -ErrorAction SilentlyContinue
            throw "Installed Echoo did not complete the $scale display-scale smoke test within 45 seconds."
        }
        if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
            throw "Installed Echoo did not create the $scale display-scale smoke marker."
        }
        $scaleSmoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
        if (
            $scaleSmoke.passed -ne $true -or
            $scaleSmoke.smokeMode -ne 'scale' -or
            $scaleSmoke.protocol -ne 'echoo-app:' -or
            $scaleSmoke.rootChildren -le 0 -or
            $scaleSmoke.documentWidth -gt ($scaleSmoke.viewportWidth + 2)
        ) {
            throw "Installed Echoo failed the $scale display-scale layout smoke: $($scaleSmoke | ConvertTo-Json -Compress)"
        }
        Write-Host "Verified Echoo packaged layout at device scale $scale (reported DPR $($scaleSmoke.devicePixelRatio))."
    }

    # The installed app registers echoo:// during Electron startup. Verify the
    # real installed executable after the packaged-renderer smoke launch rather
    # than assuming NSIS wrote a protocol key before the app ever ran.
    $protocolCandidates = @(
        'Registry::HKEY_CURRENT_USER\Software\Classes\echoo\shell\open\command',
        'Registry::HKEY_CLASSES_ROOT\echoo\shell\open\command'
    )
    $protocolCommand = $null
    foreach ($protocolKey in $protocolCandidates) {
        if (Test-Path -LiteralPath $protocolKey) {
            $protocolCommand = (Get-Item -LiteralPath $protocolKey).GetValue('')
            if ($protocolCommand) { break }
        }
    }
    if (-not $protocolCommand -or $protocolCommand -notmatch 'Echoo\.exe') {
        throw "Installed Echoo did not register the echoo:// protocol correctly after launch. Command: $protocolCommand"
    }
    Write-Host "Verified echoo:// protocol registration."

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
