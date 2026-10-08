# Test the real Windows NSIS upgrade path before publishing Echoo v2.0.6.
# This does not replace a full end-to-end updater-feed test.
$ErrorActionPreference = 'Stop'

$desktopRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $desktopRoot 'package.json') | ConvertFrom-Json
$targetVersion = [string]$package.version
if ($targetVersion -ne '2.0.7') {
  Write-Host "Skipping the v2.0.6 -> v2.0.7 upgrade gate for $targetVersion."
  exit 0
}

$releaseUrl = 'https://github.com/emmy16-glitch/Echoo-main/releases/download/v2.0.6/Echoo-Setup-2.0.6-x64.exe'
$baseline = Join-Path $env:RUNNER_TEMP 'Echoo-Setup-2.0.6-x64.exe'
$candidate = Join-Path $desktopRoot "dist/Echoo-Setup-$targetVersion-x64.exe"
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs/echoo-desktop'
$appExe = Join-Path $installRoot 'Echoo.exe'
$userData = Join-Path $env:APPDATA 'echoo-desktop'
$preservationPath = Join-Path $userData 'echoo-upgrade-ci-preservation.txt'
$preservationToken = [guid]::NewGuid().ToString('N')

if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
  throw "Missing packaged v$targetVersion installer."
}

New-Item -ItemType Directory -Path $userData -Force | Out-Null
Set-Content -LiteralPath $preservationPath -Value $preservationToken -Encoding utf8

try {
  Write-Host 'Downloading the real previously published v2.0.6 baseline installer.'
  Invoke-WebRequest -Uri $releaseUrl -OutFile $baseline -MaximumRedirection 10
  if ((Get-Item -LiteralPath $baseline).Length -lt 50MB) {
    throw 'The v2.0.6 baseline installer was incomplete.'
  }

  $installOld = Start-Process -FilePath $baseline -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  if ($installOld.ExitCode -ne 0) { throw "v2.0.6 NSIS installer exited $($installOld.ExitCode)." }
  if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) {
    throw "Old Echoo executable missing at $appExe."
  }
  $oldVersion = [string](Get-Item -LiteralPath $appExe).VersionInfo.ProductVersion
  if (-not $oldVersion.StartsWith('2.0.6')) { throw "Baseline version mismatch: $oldVersion." }
  Write-Host "Installed the original v$oldVersion Echoo application."

  $installNew = Start-Process -FilePath $candidate -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  if ($installNew.ExitCode -ne 0) { throw "v$targetVersion NSIS upgrade exited $($installNew.ExitCode)." }
  if (-not (Test-Path -LiteralPath $appExe -PathType Leaf)) {
    throw 'The Echoo executable disappeared during the upgrade.'
  }
  $newVersion = [string](Get-Item -LiteralPath $appExe).VersionInfo.ProductVersion
  if (-not $newVersion.StartsWith($targetVersion)) {
    throw "The installed executable is still $newVersion, expected $targetVersion."
  }
  if (-not (Test-Path -LiteralPath $preservationPath -PathType Leaf)) {
    throw 'The NSIS upgrade removed existing user data.'
  }
  if ((Get-Content -Raw -LiteralPath $preservationPath).Trim() -ne $preservationToken) {
    throw 'The NSIS upgrade modified existing user data.'
  }
  Write-Host "PASS: v$oldVersion -> v$newVersion installed upgrade and persistent user-data preservation."
} finally {
  Remove-Item -LiteralPath $preservationPath -Force -ErrorAction SilentlyContinue
  $uninstaller = Join-Path $installRoot 'Uninstall Echoo.exe'
  if (Test-Path -LiteralPath $uninstaller -PathType Leaf) {
    $cleanup = Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
    if ($cleanup.ExitCode -ne 0) {
      Write-Warning "Test-only Echoo uninstaller returned $($cleanup.ExitCode)."
    }
  }
}
