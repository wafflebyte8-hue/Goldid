[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$main = Join-Path $root 'desktop\main.js'

# Electron 42+ downloads its binary on first use rather than at npm install
# time. If it is missing (e.g. right after gd update), fetch it now.
if (-not (Test-Path -LiteralPath $electron)) {
  $installer = Join-Path $root 'node_modules\electron\install.js'
  if (Test-Path -LiteralPath $installer) {
    Write-Host '[GolDid] Downloading the Electron desktop binary (first launch after an update)...'
    & node $installer
  }
}

if (-not (Test-Path -LiteralPath $electron)) {
  throw 'GolDid desktop runtime is missing. Run setup.ps1 or npm install.'
}

Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& $electron $main
