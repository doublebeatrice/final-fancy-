param(
  [string]$SourceUserDataDir = "",
  [string]$TargetUserDataDir = "C:\chrome-debug-profile",
  [switch]$Replace,
  [switch]$AllowLiveCopy,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath {
  param([string]$Path)
  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  return [System.IO.Path]::GetFullPath($expanded)
}

function Normalize-PathForCompare {
  param([string]$Path)
  return (Resolve-FullPath -Path $Path).TrimEnd([char[]]@("\", "/"))
}

function Test-SamePath {
  param([string]$Left, [string]$Right)
  return [StringComparer]::OrdinalIgnoreCase.Equals(
    (Normalize-PathForCompare -Path $Left),
    (Normalize-PathForCompare -Path $Right)
  )
}

function Test-PathInside {
  param([string]$Child, [string]$Parent)
  $childPath = Normalize-PathForCompare -Path $Child
  $parentPath = Normalize-PathForCompare -Path $Parent
  return $childPath.StartsWith($parentPath + "\", [StringComparison]::OrdinalIgnoreCase)
}

function Assert-SafeClonePaths {
  param(
    [string]$Source,
    [string]$Target,
    [string]$DefaultUserDataDir
  )

  if (-not (Test-Path $Source)) {
    throw "Source Chrome user data dir not found: $Source"
  }

  if (Test-SamePath -Left $Source -Right $Target) {
    throw "Refusing to clone: source and target are the same path."
  }

  if (Test-PathInside -Child $Target -Parent $Source) {
    throw "Refusing to clone: target is inside source and would recurse into itself."
  }

  if (Test-SamePath -Left $Target -Right $DefaultUserDataDir -or (Test-PathInside -Child $Target -Parent $DefaultUserDataDir)) {
    throw "Refusing to write clone output inside the default personal Chrome user data dir: $DefaultUserDataDir"
  }
}

function Get-ChromeProcesses {
  return Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" -ErrorAction SilentlyContinue
}

function Format-ProcessSummary {
  param($Processes)
  $items = @()
  if ($Processes) {
    $items = @($Processes)
  }
  $rows = foreach ($process in $items) {
    $command = [string]$process.CommandLine
    if ($command.Length -gt 180) {
      $command = $command.Substring(0, 180) + "..."
    }
    [pscustomobject]@{
      ProcessId = $process.ProcessId
      CommandLine = $command
    }
  }
  return ($rows | Format-Table -AutoSize | Out-String).Trim()
}

function New-BackupPath {
  param([string]$Target)
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  return "$Target.backup-$stamp"
}

$defaultUserDataDir = Resolve-FullPath -Path (Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data")
if ([string]::IsNullOrWhiteSpace($SourceUserDataDir)) {
  $source = Resolve-FullPath -Path $defaultUserDataDir
} else {
  $source = Resolve-FullPath -Path $SourceUserDataDir
}
$target = Resolve-FullPath -Path $TargetUserDataDir

Assert-SafeClonePaths -Source $source -Target $target -DefaultUserDataDir $defaultUserDataDir

$backup = ""
if (Test-Path $target) {
  if (-not $Replace) {
    throw "Target already exists: $target. Pass -Replace to move it aside before cloning."
  }
  $backup = New-BackupPath -Target $target
}

Write-Host "Chrome profile clone plan"
Write-Host "Source: $source"
Write-Host "Target: $target"
if ($backup) {
  Write-Host "Existing target backup: $backup"
}
Write-Host "Dry run: $($DryRun.IsPresent)"

$chromeProcesses = @(Get-ChromeProcesses)
if ($chromeProcesses.Count -gt 0 -and -not $AllowLiveCopy) {
  Write-Host ""
  Write-Host "Chrome is currently running. Close all Chrome windows before cloning so cookies, extension state, and Preferences are copied consistently."
  Write-Host ""
  Write-Host (Format-ProcessSummary -Processes $chromeProcesses)
  if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run only: no files were copied."
    exit 0
  }
  Write-Host ""
  Write-Host "No files were copied. Rerun after closing Chrome:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\execute\clone_chrome_profile_for_debug.ps1 -Replace"
  exit 2
}

if ($DryRun) {
  exit 0
}

if ($backup) {
  Move-Item -LiteralPath $target -Destination $backup
}

New-Item -ItemType Directory -Path $target -Force | Out-Null

$excludeDirs = @(
  "BrowserMetrics",
  "Crashpad",
  "DeferredBrowserMetrics",
  "GrShaderCache",
  "GraphiteDawnCache",
  "ShaderCache",
  "component_crx_cache",
  "extensions_crx_cache"
)

$excludeFiles = @(
  "DevToolsActivePort",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  "lockfile"
)

$args = @(
  $source,
  $target,
  "/E",
  "/COPY:DAT",
  "/DCOPY:DAT",
  "/XJ",
  "/R:2",
  "/W:1",
  "/XD"
) + $excludeDirs + @("/XF") + $excludeFiles

& robocopy @args | Out-Host
$code = $LASTEXITCODE
if ($code -gt 7) {
  throw "robocopy failed with exit code $code"
}

Write-Host "Chrome profile clone finished. robocopy exit code: $code"
if ($backup) {
  Write-Host "Previous debug profile preserved at: $backup"
}
Write-Host "Next step: npm run chrome:debug"
