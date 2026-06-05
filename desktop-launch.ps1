[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$main = Join-Path $root 'desktop\main.js'

if (-not (Test-Path -LiteralPath $electron)) {
  throw 'GolDid desktop runtime is missing. Run setup.ps1 or npm install.'
}

Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& $electron $main
