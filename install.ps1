# BuddyUsage installer for Windows (x64 and ARM64).
#   irm https://raw.githubusercontent.com/SmtTheSE/BuddyUsage/main/install.ps1 | iex
# Downloads the one-click installer for this machine's CPU and runs it
# (installs per-user, no admin prompt, launches when done).
$ErrorActionPreference = 'Stop'

$Repo = 'SmtTheSE/BuddyUsage'
$App = 'BuddyUsage'
$Version = if ($env:BUDDYUSAGE_VERSION) { $env:BUDDYUSAGE_VERSION } else { 'latest' }

$Arch = if ([System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq 'Arm64') { 'arm64' } else { 'x64' }
$Asset = "$App-$Arch.exe"
$Url = if ($Version -eq 'latest') {
  "https://github.com/$Repo/releases/latest/download/$Asset"
} else {
  "https://github.com/$Repo/releases/download/$Version/$Asset"
}

$Installer = Join-Path $env:TEMP $Asset
Write-Host "Downloading $App ($Arch, $Version)..."
Invoke-WebRequest -Uri $Url -OutFile $Installer -UseBasicParsing

Write-Host 'Running installer...'
# The build is not code-signed, so SmartScreen may show "Windows protected
# your PC" — choose "More info" > "Run anyway".
Start-Process -FilePath $Installer -ArgumentList '/S' -Wait
Remove-Item $Installer -Force

Write-Host "Done. $App is installed and running from the system tray."
