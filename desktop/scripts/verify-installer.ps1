param(
    [switch]$InstallSmokeTest
)

$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$distDirectory = Join-Path $desktopRoot 'dist'
$package = Get-Content -Raw -LiteralPath (Join-Path $desktopRoot 'package.json') | ConvertFrom-Json
$installerPath = Join-Path $distDirectory "Echoo-Setup-$($package.version)-x64.exe"
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
$startupTimingReportPath = Join-Path $distDirectory 'installed-startup-timings.json'
$userDataSentinelPath = $null
$recordingSentinelPath = $null
$startupSamples = @()
$previousUpdateValue = $env:ECHOO_DISABLE_UPDATES

function Get-StartupEventElapsedMs {
    param(
        [Parameter(Mandatory = $true)]$Smoke,
        [Parameter(Mandatory = $true)][string]$EventName
    )

    $matchingEvents = @($Smoke.startupEvents | Where-Object { $_.event -eq $EventName })
    if ($matchingEvents.Count -eq 0) {
        throw "Installed Echoo smoke result did not include startup event '$EventName'."
    }
    return [int]$matchingEvents[-1].elapsedMs
}

function New-StartupTimingSample {
    param(
        [Parameter(Mandatory = $true)]$Smoke,
        [Parameter(Mandatory = $true)][int]$Run
    )

    $sample = [pscustomobject]@{
        run = $Run
        appReadyMs = Get-StartupEventElapsedMs -Smoke $Smoke -EventName 'renderer-app-ready'
        splashIntroCompleteMs = Get-StartupEventElapsedMs -Smoke $Smoke -EventName 'splash-intro-complete'
        mainVisibleMs = Get-StartupEventElapsedMs -Smoke $Smoke -EventName 'main-visible'
        splashDestroyedMs = Get-StartupEventElapsedMs -Smoke $Smoke -EventName 'splash-destroyed'
    }
    if ($sample.mainVisibleMs -lt $sample.appReadyMs) {
        throw "Installed Echoo revealed its main window before APP_READY on run $Run."
    }
    if ($sample.mainVisibleMs -lt $sample.splashIntroCompleteMs) {
        throw "Installed Echoo revealed its main window before the splash intro settled on run $Run."
    }
    return $sample
}

function Get-TimingSummary {
    param([Parameter(Mandatory = $true)][double[]]$Values)

    $sorted = @($Values | Sort-Object)
    $middle = [int][math]::Floor($sorted.Count / 2)
    $median = if (($sorted.Count % 2) -eq 0) {
        ($sorted[$middle - 1] + $sorted[$middle]) / 2
    } else {
        $sorted[$middle]
    }
    return [pscustomobject]@{
        minMs = [double]$sorted[0]
        maxMs = [double]$sorted[-1]
        averageMs = [math]::Round(($sorted | Measure-Object -Average).Average, 1)
        medianMs = [math]::Round($median, 1)
    }
}
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

    $desktopShortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Echoo.lnk'
    $startMenuShortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Echoo.lnk'
    foreach ($shortcutPath in @($desktopShortcutPath, $startMenuShortcutPath)) {
        if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
            throw "Echoo installer did not create the expected Windows shortcut: $shortcutPath"
        }
        $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcutPath)
        if ([IO.Path]::GetFullPath($shortcut.TargetPath) -ne [IO.Path]::GetFullPath($executablePath)) {
            throw "Echoo shortcut points to the wrong executable: $shortcutPath -> $($shortcut.TargetPath)"
        }
    }

    # Protocol registration is an installer responsibility, not something the
    # first app launch is allowed to repair silently. Verify it before starting
    # Echoo so a broken NSIS association cannot hide behind app startup.
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
        throw "Echoo installer did not register the echoo:// protocol before first launch. Command: $protocolCommand"
    }
    Write-Host 'Verified echoo:// protocol registration immediately after install.'

    $previousSmokeValue = $env:ECHOO_DESKTOP_SMOKE_TEST
    $previousRunAsNodeValue = $env:ELECTRON_RUN_AS_NODE
    $env:ECHOO_DESKTOP_SMOKE_TEST = '1'
    $env:ELECTRON_RUN_AS_NODE = $null
    $env:ECHOO_DISABLE_UPDATES = '1'
    try {
        $application = Start-Process -FilePath $executablePath -ArgumentList 'echoo://listen/live/smoke-cold' -PassThru -WindowStyle Hidden
    } finally {
        $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
        $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
        $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
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
        $smoke.desktopBridge -ne $true -or
        $smoke.browserWindowCount -ne 1 -or
        $smoke.visibleWindowCount -ne 1 -or
        $smoke.splashWindowCount -ne 0
    ) {
        throw "Installed Echoo failed its cold-start renderer/deep-link smoke test: $($smoke | ConvertTo-Json -Compress)"
    }
    $startupSamples += New-StartupTimingSample -Smoke $smoke -Run 1

    # One successful launch is not enough for the installed application. Run
    # four more sequential cold starts and require exactly one visible main
    # window with no surviving splash after APP_READY on every run.
    for ($run = 2; $run -le 5; $run++) {
        Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
        $env:ECHOO_DESKTOP_SMOKE_TEST = '1'
        $env:ELECTRON_RUN_AS_NODE = $null
        $env:ECHOO_DISABLE_UPDATES = '1'
        try {
            $coldApplication = Start-Process -FilePath $executablePath -PassThru -WindowStyle Hidden
        } finally {
            $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
            $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
            $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
        }
        try {
            Wait-Process -Id $coldApplication.Id -Timeout 45 -ErrorAction Stop
        } catch {
            Stop-Process -Id $coldApplication.Id -Force -ErrorAction SilentlyContinue
            throw "Installed Echoo cold-start run $run did not complete within 45 seconds."
        }
        $coldApplication.Refresh()
        if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
            throw "Installed Echoo cold-start run $run did not create its smoke marker."
        }
        $coldSmoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
        if (
            $coldApplication.ExitCode -ne 0 -or
            $coldSmoke.passed -ne $true -or
            $coldSmoke.protocol -ne 'echoo-app:' -or
            $coldSmoke.identity -ne 'echoo-frontend' -or
            $coldSmoke.desktopBridge -ne $true -or
            $coldSmoke.browserWindowCount -ne 1 -or
            $coldSmoke.visibleWindowCount -ne 1 -or
            $coldSmoke.splashWindowCount -ne 0
        ) {
            throw "Installed Echoo cold-start run $run failed: $($coldSmoke | ConvertTo-Json -Compress)"
        }
        $startupSamples += New-StartupTimingSample -Smoke $coldSmoke -Run $run
    }

    $startupTimingReport = [pscustomobject]@{
        executable = $executablePath
        runCount = $startupSamples.Count
        appReady = Get-TimingSummary -Values @($startupSamples | ForEach-Object { $_.appReadyMs })
        splashIntroComplete = Get-TimingSummary -Values @($startupSamples | ForEach-Object { $_.splashIntroCompleteMs })
        mainVisible = Get-TimingSummary -Values @($startupSamples | ForEach-Object { $_.mainVisibleMs })
        splashDestroyed = Get-TimingSummary -Values @($startupSamples | ForEach-Object { $_.splashDestroyedMs })
        runs = $startupSamples
    }
    $startupTimingReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $startupTimingReportPath
    Write-Host "Verified 5 installed Echoo cold starts with zero surviving splash windows."
    Write-Host "Installed startup timings: $($startupTimingReport | ConvertTo-Json -Compress -Depth 5)"

    # Launch the actual links users click from Windows rather than assuming
    # electron-builder created usable shortcuts because package.json asked for
    # them. Each shortcut must reach the same local renderer and exit cleanly.
    foreach ($shortcutPath in @($desktopShortcutPath, $startMenuShortcutPath)) {
        Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
        $env:ECHOO_DESKTOP_SMOKE_TEST = '1'
        $env:ELECTRON_RUN_AS_NODE = $null
        $env:ECHOO_DISABLE_UPDATES = '1'
        try {
            $shortcutApplication = Start-Process -FilePath $shortcutPath -PassThru -WindowStyle Hidden
        } finally {
            $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
            $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
            $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
        }
        try {
            Wait-Process -Id $shortcutApplication.Id -Timeout 45 -ErrorAction Stop
        } catch {
            Stop-Process -Id $shortcutApplication.Id -Force -ErrorAction SilentlyContinue
            throw "Installed Echoo shortcut launch did not complete within 45 seconds: $shortcutPath"
        }
        if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
            throw "Installed Echoo shortcut did not create its smoke marker: $shortcutPath"
        }
        $shortcutSmoke = Get-Content -Raw -LiteralPath $markerPath | ConvertFrom-Json
        if (
            $shortcutSmoke.passed -ne $true -or
            $shortcutSmoke.protocol -ne 'echoo-app:' -or
            $shortcutSmoke.identity -ne 'echoo-frontend' -or
            $shortcutSmoke.browserWindowCount -ne 1 -or
            $shortcutSmoke.splashWindowCount -ne 0
        ) {
            throw "Installed Echoo shortcut failed its local-renderer smoke test: $($shortcutSmoke | ConvertTo-Json -Compress)"
        }
    }
    Write-Host 'Verified installed Echoo launches from Desktop and Start-menu shortcuts.'

    # An upgrade or uninstall must not erase account state or the user's only
    # local recording copy. Place canaries in the actual paths reported by the
    # packaged app and verify them after the NSIS uninstaller runs.
    if (-not $smoke.userDataPath -or -not $smoke.recordingsLibraryPath) {
        throw 'Installed Echoo did not report its persistent user-data and recording-library paths.'
    }
    New-Item -ItemType Directory -Force -Path $smoke.userDataPath | Out-Null
    New-Item -ItemType Directory -Force -Path $smoke.recordingsLibraryPath | Out-Null
    $userDataSentinelPath = Join-Path $smoke.userDataPath 'echoo-uninstall-preserve-smoke.txt'
    $recordingSentinelPath = Join-Path $smoke.recordingsLibraryPath 'echoo-uninstall-preserve-smoke.mp3'
    Set-Content -LiteralPath $userDataSentinelPath -Value 'preserve-user-data' -NoNewline
    Set-Content -LiteralPath $recordingSentinelPath -Value 'preserve-recording' -NoNewline

    # Verify that a second Windows launch is delivered to the existing Echoo
    # process instead of creating another app session.
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
    $env:ECHOO_DESKTOP_SMOKE_TEST = 'second-instance'
    $env:ELECTRON_RUN_AS_NODE = $null
    $env:ECHOO_DISABLE_UPDATES = '1'
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
        $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
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
    $env:ECHOO_DISABLE_UPDATES = '1'
    try {
        $offlineApplication = Start-Process -FilePath $executablePath -PassThru -WindowStyle Hidden
    } finally {
        $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
        $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
        $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
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
        $env:ECHOO_DISABLE_UPDATES = '1'
        try {
            $scaleApplication = Start-Process -FilePath $executablePath -ArgumentList "--force-device-scale-factor=$scale" -PassThru -WindowStyle Hidden
        } finally {
            $env:ECHOO_DESKTOP_SMOKE_TEST = $previousSmokeValue
            $env:ELECTRON_RUN_AS_NODE = $previousRunAsNodeValue
            $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
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
    $env:ECHOO_DISABLE_UPDATES = $previousUpdateValue
    $preservationFailures = @()
    $uninstallerPath = Join-Path $installDirectory 'Uninstall Echoo.exe'
    if (Test-Path -LiteralPath $uninstallerPath -PathType Leaf) {
        Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Wait -WindowStyle Hidden
    }
    if ($userDataSentinelPath -and -not (Test-Path -LiteralPath $userDataSentinelPath -PathType Leaf)) {
        $preservationFailures += 'Echoo uninstall removed persistent user data.'
    }
    if ($recordingSentinelPath -and -not (Test-Path -LiteralPath $recordingSentinelPath -PathType Leaf)) {
        $preservationFailures += 'Echoo uninstall removed the local recording library.'
    }
    if (
        $userDataSentinelPath -and
        $recordingSentinelPath -and
        $preservationFailures.Count -eq 0
    ) {
        $reinstall = Start-Process -FilePath $installerPath -ArgumentList @('/S', "/D=$installDirectory") -Wait -PassThru -WindowStyle Hidden
        if ($reinstall.ExitCode -ne 0) {
            $preservationFailures += "Echoo reinstall exited with code $($reinstall.ExitCode)."
        } elseif (-not (Test-Path -LiteralPath (Join-Path $installDirectory 'Echoo.exe') -PathType Leaf)) {
            $preservationFailures += 'Echoo reinstall did not restore the installed application.'
        } elseif (
            -not (Test-Path -LiteralPath $userDataSentinelPath -PathType Leaf) -or
            -not (Test-Path -LiteralPath $recordingSentinelPath -PathType Leaf)
        ) {
            $preservationFailures += 'Echoo reinstall did not preserve user data and local recordings.'
        } else {
            Write-Host 'Verified uninstall and reinstall preserve Echoo user data and local recordings.'
        }

        $reinstalledUninstallerPath = Join-Path $installDirectory 'Uninstall Echoo.exe'
        if (Test-Path -LiteralPath $reinstalledUninstallerPath -PathType Leaf) {
            Start-Process -FilePath $reinstalledUninstallerPath -ArgumentList '/S' -Wait -WindowStyle Hidden
        }
    }
    if ($userDataSentinelPath) {
        Remove-Item -LiteralPath $userDataSentinelPath -Force -ErrorAction SilentlyContinue
    }
    if ($recordingSentinelPath) {
        Remove-Item -LiteralPath $recordingSentinelPath -Force -ErrorAction SilentlyContinue
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
    if ($preservationFailures.Count -gt 0) {
        throw ($preservationFailures -join ' ')
    }
}
