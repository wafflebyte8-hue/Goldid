[CmdletBinding()]
param(
  [switch]$RemoveData,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$startMarker = '# >>> GolDid installer >>>'
$endMarker = '# <<< GolDid installer <<<'
$documents = [Environment]::GetFolderPath('MyDocuments')
$profiles = @(
  (Join-Path $documents 'WindowsPowerShell\Microsoft.PowerShell_profile.ps1'),
  (Join-Path $documents 'PowerShell\Microsoft.PowerShell_profile.ps1')
) | Select-Object -Unique
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'GolDid.lnk'),
  (Join-Path (Join-Path ([Environment]::GetFolderPath('Programs')) 'GolDid') 'GolDid.lnk')
)

function Write-Step([string]$Message) {
  Write-Host "[GolDid] $Message" -ForegroundColor Yellow
}

function InstallerBlock([string]$Content) {
  $pattern = '(?ms)^' + [regex]::Escape($startMarker) + '.*?^' +
    [regex]::Escape($endMarker) + '\r?\n?'
  return [regex]::Match($Content, $pattern).Value
}

function Find-InstallDirectory {
  $candidates = [System.Collections.Generic.List[string]]::new()

  if ($env:GOLDID_HOME) {
    $candidates.Add($env:GOLDID_HOME)
  }

  foreach ($profilePath in $profiles) {
    if (-not (Test-Path -LiteralPath $profilePath)) { continue }
    $block = InstallerBlock (Get-Content -LiteralPath $profilePath -Raw)
    $match = [regex]::Match($block, "(?im)&\s+'[^']+'\s+'([^']*[\\/]goldid\.js)'")
    if ($match.Success) {
      $candidates.Add((Split-Path -Parent $match.Groups[1].Value))
    }
  }

  $command = Get-Command gd -CommandType Function -ErrorAction SilentlyContinue
  if ($command) {
    $match = [regex]::Match($command.Definition, "(?im)&\s+'[^']+'\s+'([^']*[\\/]goldid\.js)'")
    if ($match.Success) {
      $candidates.Add((Split-Path -Parent $match.Groups[1].Value))
    }
  }

  $candidates.Add('C:\goldid')
  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not $candidate) { continue }
    $full = [System.IO.Path]::GetFullPath($candidate)
    $entryPoint = Join-Path $full 'goldid.js'
    $packagePath = Join-Path $full 'package.json'
    if (-not (Test-Path -LiteralPath $entryPoint) -or -not (Test-Path -LiteralPath $packagePath)) {
      continue
    }
    try {
      $package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
      if ($package.name -eq 'goldid') { return $full }
    } catch {
      continue
    }
  }
  return $null
}

function Remove-ProfileRegistration([string]$ProfilePath) {
  if (-not (Test-Path -LiteralPath $ProfilePath)) { return $false }
  $content = Get-Content -LiteralPath $ProfilePath -Raw
  $block = InstallerBlock $content
  if (-not $block) { return $false }
  $next = $content.Replace($block, '').TrimEnd()
  if ($next) {
    Set-Content -LiteralPath $ProfilePath -Value ($next + [Environment]::NewLine) -Encoding UTF8
  } else {
    Set-Content -LiteralPath $ProfilePath -Value '' -Encoding UTF8
  }
  return $true
}

$installDir = Find-InstallDirectory
$dataDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.goldid'

Write-Host ''
Write-Host 'GolDid uninstall preview' -ForegroundColor Yellow
Write-Host "Application: $(if ($installDir) { $installDir } else { '(not found)' })"
Write-Host "Profile registration: $($profiles -join ', ')"
Write-Host "Personal data: $(if ($RemoveData) { "$dataDir (will be removed)" } else { "$dataDir (kept)" })"
Write-Host ''

if (-not $Yes) {
  if (-not $Host.UI.RawUI) {
    throw 'Use -Yes when running non-interactively.'
  }
  $answer = Read-Host 'Continue? (y/N)'
  if (-not $answer.Trim().ToLowerInvariant().StartsWith('y')) {
    Write-Host 'Uninstall cancelled.'
    return
  }
}

Write-Step 'Removing PowerShell command registration...'
$profileCount = 0
foreach ($profilePath in $profiles) {
  if (Remove-ProfileRegistration $profilePath) { $profileCount++ }
}

foreach ($shortcut in $shortcuts) {
  if (Test-Path -LiteralPath $shortcut) {
    Remove-Item -LiteralPath $shortcut -Force
  }
}
$startMenuFolder = Split-Path -Parent $shortcuts[1]
if (Test-Path -LiteralPath $startMenuFolder) {
  $remaining = Get-ChildItem -LiteralPath $startMenuFolder -Force
  if (-not $remaining) { Remove-Item -LiteralPath $startMenuFolder -Force }
}

if ($installDir) {
  Write-Step "Removing application files from $installDir..."
  $resolved = (Resolve-Path -LiteralPath $installDir).Path
  if ([System.IO.Path]::GetPathRoot($resolved) -eq $resolved) {
    throw "Refusing to remove filesystem root: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
} else {
  Write-Host 'GolDid application directory was not found; profile cleanup still completed.' -ForegroundColor DarkYellow
}

if ($installDir) {
  $registeredHome = [Environment]::GetEnvironmentVariable('GOLDID_HOME', 'User')
  if ($registeredHome -and
      [System.IO.Path]::GetFullPath($registeredHome) -eq [System.IO.Path]::GetFullPath($installDir)) {
    [Environment]::SetEnvironmentVariable('GOLDID_HOME', $null, 'User')
    Remove-Item Env:\GOLDID_HOME -ErrorAction SilentlyContinue
  }
}

if ($RemoveData -and (Test-Path -LiteralPath $dataDir)) {
  Write-Step "Removing personal data from $dataDir..."
  $resolvedData = (Resolve-Path -LiteralPath $dataDir).Path
  $expectedData = [System.IO.Path]::GetFullPath($dataDir)
  if ($resolvedData -ne $expectedData) {
    throw "Refusing to remove unexpected personal-data path: $resolvedData"
  }
  Remove-Item -LiteralPath $resolvedData -Recurse -Force
}

Remove-Item Function:\gd -ErrorAction SilentlyContinue
Remove-Item Alias:\goldid -ErrorAction SilentlyContinue

Write-Host ''
Write-Host "GolDid uninstalled. Removed registration from $profileCount profile(s)." -ForegroundColor Green
if (-not $RemoveData) {
  Write-Host "Personal configuration was kept at $dataDir."
}
Write-Host 'Open a new PowerShell window to finish refreshing commands.'
