[CmdletBinding()]
param(
  [string]$InstallDir = 'C:\goldid',
  [switch]$RunSetup
)

$ErrorActionPreference = 'Stop'
$repoArchive = 'https://github.com/wafflebyte8-hue/Goldid/archive/refs/heads/main.zip'
$startMarker = '# >>> GolDid installer >>>'
$endMarker = '# <<< GolDid installer <<<'

function Write-Step([string]$Message) {
  Write-Host "[GolDid] $Message" -ForegroundColor Yellow
}

function Quote-PowerShellLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

function Set-GolDidProfile([string]$ProfilePath, [string]$NodePath, [string]$ScriptPath) {
  $parent = Split-Path -Parent $ProfilePath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null

  $content = if (Test-Path -LiteralPath $ProfilePath) {
    Get-Content -LiteralPath $ProfilePath -Raw
  } else {
    ''
  }

  $pattern = '(?ms)^' + [regex]::Escape($startMarker) + '.*?^' +
    [regex]::Escape($endMarker) + '\r?\n?'
  $content = [regex]::Replace($content, $pattern, '').TrimEnd()
  $nodeLiteral = Quote-PowerShellLiteral $NodePath
  $scriptLiteral = Quote-PowerShellLiteral $ScriptPath
  $block = @"
$startMarker
function global:gd {
  & $nodeLiteral $scriptLiteral @args
}
Set-Alias -Name goldid -Value gd -Scope Global
$endMarker
"@

  $next = if ($content) { $content + [Environment]::NewLine * 2 + $block } else { $block }
  Set-Content -LiteralPath $ProfilePath -Value $next -Encoding UTF8
}

function Set-GolDidShortcut([string]$ShortcutPath, [string]$LauncherPath, [string]$WorkingDirectory, [string]$IconPath) {
  $parent = Split-Path -Parent $ShortcutPath
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = 'powershell.exe'
  $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $LauncherPath + '"'
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Description = 'GolDid desktop AI assistant'
  if (Test-Path -LiteralPath $IconPath) {
    $shortcut.IconLocation = $IconPath
  }
  $shortcut.Save()
}

Write-Step 'Checking Node.js...'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js was not found. Install Node.js 18 or newer from https://nodejs.org and run this script again.'
}

$versionText = (& $node.Source --version).Trim().TrimStart('v')
$major = 0
if (-not [int]::TryParse(($versionText -split '\.')[0], [ref]$major) -or $major -lt 18) {
  throw "Node.js 18 or newer is required. Found: $versionText"
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('goldid-' + [guid]::NewGuid())
$zipPath = Join-Path $tempRoot 'goldid.zip'
$extractPath = Join-Path $tempRoot 'source'

try {
  Write-Step 'Downloading the latest GolDid release from GitHub...'
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  Invoke-WebRequest -Uri $repoArchive -OutFile $zipPath -UseBasicParsing
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force

  $source = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
  if (-not $source) {
    throw 'The downloaded repository archive was empty.'
  }

  Write-Step "Installing to $InstallDir..."
  try {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
  } catch {
    throw "Could not create $InstallDir. Open PowerShell as Administrator or use -InstallDir with a writable path."
  }
  foreach ($name in @('goldid.js', 'package.json', 'README.md', 'documentation.md', 'setup.ps1', 'setup.sh', 'uninstall.ps1', 'desktop-launch.ps1', 'desktop-launch.sh', 'desktop', 'lib')) {
    $from = Join-Path $source.FullName $name
    if (-not (Test-Path -LiteralPath $from)) {
      throw "Required repository item is missing: $name"
    }
    $to = Join-Path $InstallDir $name
    if (Test-Path -LiteralPath $to) {
      Remove-Item -LiteralPath $to -Recurse -Force
    }
    Copy-Item -LiteralPath $from -Destination $to -Recurse -Force
  }

  Write-Step 'Installing desktop runtime...'
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    throw 'npm was not found even though Node.js is installed. Repair your Node.js installation and rerun setup.'
  }
  & $npm.Source install --omit=dev --no-audit --no-fund --prefix $InstallDir
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not install the Electron desktop runtime.'
  }

  $entryPoint = Join-Path $InstallDir 'goldid.js'
  $documents = [Environment]::GetFolderPath('MyDocuments')
  $profiles = @(
    (Join-Path $documents 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
    (Join-Path $documents 'PowerShell\Microsoft.PowerShell_profile.ps1')
  ) | Select-Object -Unique

  Write-Step 'Registering the gd command...'
  foreach ($profilePath in $profiles) {
    Set-GolDidProfile -ProfilePath $profilePath -NodePath $node.Source -ScriptPath $entryPoint
  }
  [Environment]::SetEnvironmentVariable('GOLDID_HOME', $InstallDir, 'User')
  $env:GOLDID_HOME = $InstallDir

  $electronPath = Join-Path $InstallDir 'node_modules\electron\dist\electron.exe'
  $desktopLauncher = Join-Path $InstallDir 'desktop-launch.ps1'
  $desktopIcon = Join-Path $InstallDir 'desktop\assets\goldid-logo.ico'
  if (Test-Path -LiteralPath $electronPath) {
    Write-Step 'Creating desktop shortcuts...'
    $desktopDir = [Environment]::GetFolderPath('Desktop')
    $startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) 'GolDid'
    Set-GolDidShortcut -ShortcutPath (Join-Path $desktopDir 'GolDid.lnk') `
      -LauncherPath $desktopLauncher -WorkingDirectory $InstallDir -IconPath $desktopIcon
    Set-GolDidShortcut -ShortcutPath (Join-Path $startMenuDir 'GolDid.lnk') `
      -LauncherPath $desktopLauncher -WorkingDirectory $InstallDir -IconPath $desktopIcon
  }

  Write-Host ''
  Write-Host 'GolDid installed successfully.' -ForegroundColor Green
  Write-Host "Install: $InstallDir"
  Write-Host 'Personal configuration remains in ~/.goldid and is not overwritten.'
  Write-Host ''

  if ($RunSetup) {
    & $node.Source $entryPoint setup
  } else {
    Write-Host 'Open a new PowerShell window, then run: gd'
  }
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
