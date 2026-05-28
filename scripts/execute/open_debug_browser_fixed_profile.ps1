param(
  [string]$ProfileMode = "",
  [string]$ProfileDir = "",
  [string]$ProfileDirectory = "",
  [string]$ChromePath = "",
  [int]$DebugPort = 9222,
  [ValidateSet("Normal", "Minimized", "Maximized")]
  [string]$WindowStyle = "Minimized",
  [switch]$AllowDefaultChromeProfile,
  [switch]$NoProjectExtension,
  [switch]$ShowWindow,
  [switch]$OpenStartupUrls,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if (-not $PSBoundParameters.ContainsKey("DebugPort") -and -not [string]::IsNullOrWhiteSpace($env:AD_OPS_CHROME_DEBUG_PORT)) {
  $DebugPort = [int]$env:AD_OPS_CHROME_DEBUG_PORT
}

$debugUrl = "http://127.0.0.1:$DebugPort"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$projectExtensionDir = Join-Path $repoRoot "extension"
$defaultOpsProfileDir = "C:\chrome-debug-profile"
$requiredUrls = @(
  "https://adv.yswg.com.cn/",
  "https://sellerinventory.yswg.com.cn/",
  "https://selection.yswg.com.cn/dashboard/analysis",
  "chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html"
)

function Coalesce-Text {
  param([string[]]$Values)

  foreach ($value in $Values) {
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
  return ""
}

function Resolve-FullPath {
  param([string]$Path)

  if ([string]::IsNullOrWhiteSpace($Path)) {
    return ""
  }

  $expanded = [Environment]::ExpandEnvironmentVariables($Path)
  return [System.IO.Path]::GetFullPath($expanded)
}

function Normalize-PathForCompare {
  param([string]$Path)

  $fullPath = Resolve-FullPath -Path $Path
  if ([string]::IsNullOrWhiteSpace($fullPath)) {
    return ""
  }
  return $fullPath.TrimEnd([char[]]@("\", "/"))
}

function Test-SamePath {
  param(
    [string]$Left,
    [string]$Right
  )

  $leftPath = Normalize-PathForCompare -Path $Left
  $rightPath = Normalize-PathForCompare -Path $Right
  return [StringComparer]::OrdinalIgnoreCase.Equals($leftPath, $rightPath)
}

function Get-DefaultChromeUserDataDir {
  return Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data"
}

function Resolve-ProfileMode {
  $mode = (Coalesce-Text -Values @($ProfileMode, $env:AD_OPS_CHROME_PROFILE_MODE, "ops")).ToLowerInvariant()
  $validModes = @("ops", "custom", "personal")
  if ($validModes -notcontains $mode) {
    throw "Invalid Chrome profile mode '$mode'. Use one of: ops, custom, personal."
  }
  return $mode
}

function Resolve-ProfileDir {
  param([string]$Mode)

  $configuredDir = Coalesce-Text -Values @(
    $ProfileDir,
    $env:AD_OPS_CHROME_USER_DATA_DIR,
    $env:AD_OPS_CHROME_PROFILE_DIR
  )

  if ($Mode -eq "custom") {
    if ([string]::IsNullOrWhiteSpace($configuredDir)) {
      throw "ProfileMode custom requires -ProfileDir or AD_OPS_CHROME_USER_DATA_DIR."
    }
    return Resolve-FullPath -Path $configuredDir
  }

  if ($Mode -eq "personal") {
    if (-not [string]::IsNullOrWhiteSpace($configuredDir)) {
      return Resolve-FullPath -Path $configuredDir
    }
    return Resolve-FullPath -Path (Get-DefaultChromeUserDataDir)
  }

  if (-not [string]::IsNullOrWhiteSpace($configuredDir)) {
    return Resolve-FullPath -Path $configuredDir
  }
  return Resolve-FullPath -Path $defaultOpsProfileDir
}

function Resolve-ProfileDirectory {
  return Coalesce-Text -Values @($ProfileDirectory, $env:AD_OPS_CHROME_PROFILE_DIRECTORY)
}

function Resolve-ChromePath {
  $configuredPath = Coalesce-Text -Values @($ChromePath, $env:AD_OPS_CHROME_PATH)
  if (-not [string]::IsNullOrWhiteSpace($configuredPath)) {
    $resolvedPath = Resolve-FullPath -Path $configuredPath
    if (Test-Path $resolvedPath) {
      return $resolvedPath
    }
    throw "Configured Chrome executable not found: $resolvedPath"
  }

  $candidatePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  $path = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($path) {
    return $path
  }

  try {
    $registryPath = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction Stop).'(default)'
    if ($registryPath -and (Test-Path $registryPath)) {
      return $registryPath
    }
  } catch {}

  throw "Chrome executable not found. Checked common install paths and App Paths registry."
}

function Get-DebugTabs {
  try {
    return Invoke-RestMethod -Uri "$debugUrl/json/list" -TimeoutSec 2
  } catch {
    return $null
  }
}

function Get-ActiveDebugProfileDir {
  try {
    $debugProcess = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
      Where-Object { $_.CommandLine -like "*--remote-debugging-port=$DebugPort*" } |
      Select-Object -First 1
    if (-not $debugProcess -or [string]::IsNullOrWhiteSpace($debugProcess.CommandLine)) {
      return ""
    }

    $match = [regex]::Match($debugProcess.CommandLine, '--user-data-dir=(?:"([^"]+)"|([^\s]+))')
    if (-not $match.Success) {
      return ""
    }

    $value = $match.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($value)) {
      $value = $match.Groups[2].Value
    }
    return Resolve-FullPath -Path $value
  } catch {
    return ""
  }
}

function Show-DebugChromeWindow {
  try {
    $signature = @"
using System;
using System.Runtime.InteropServices;
public static class Win32Window {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
    if (-not ("Win32Window" -as [type])) {
      Add-Type -TypeDefinition $signature | Out-Null
    }

    $debugProcess = Get-CimInstance Win32_Process -Filter "name = 'chrome.exe'" |
      Where-Object {
        $_.CommandLine -like "*--remote-debugging-port=$DebugPort*" -and
        $_.CommandLine -notlike "*--type=*"
      } |
      Select-Object -First 1
    if (-not $debugProcess) {
      return
    }

    $process = Get-Process -Id $debugProcess.ProcessId -ErrorAction SilentlyContinue
    if (-not $process -or $process.MainWindowHandle -eq 0) {
      return
    }

    [Win32Window]::ShowWindowAsync($process.MainWindowHandle, 9) | Out-Null
    [Win32Window]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
  } catch {
    Write-Warning "Unable to bring Chrome debug window to front: $($_.Exception.Message)"
  }
}

function Invoke-BackendLoginReady {
  $scriptPath = Join-Path $PSScriptRoot "ensure_backend_login.js"
  if (-not (Test-Path $scriptPath)) {
    Write-Host "Backend login readiness script not found: $scriptPath"
    return 1
  }

  Write-Host "Checking backend login readiness through WeCom browser access..."
  & node $scriptPath
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

function Quote-Arg {
  param([string]$Arg)

  if ($Arg -match '[\s"]') {
    return '"' + ($Arg -replace '"', '\"') + '"'
  }
  return $Arg
}

function Write-ResolvedConfig {
  param(
    [string]$Mode,
    [string]$ResolvedProfileDir,
    [string]$ResolvedProfileDirectory,
    [string]$ResolvedChromePath,
    [string[]]$ChromeArgs
  )

  Write-Host "Chrome debug URL: $debugUrl"
  Write-Host "Profile mode: $Mode"
  Write-Host "User data dir: $ResolvedProfileDir"
  if (-not [string]::IsNullOrWhiteSpace($ResolvedProfileDirectory)) {
    Write-Host "Profile directory: $ResolvedProfileDirectory"
  }
  Write-Host "Chrome binary: $ResolvedChromePath"
  if (-not $NoProjectExtension -and (Test-Path $projectExtensionDir)) {
    Write-Host "Project extension: $projectExtensionDir"
  }
  Write-Host "Open startup URLs: $($OpenStartupUrls.IsPresent)"
  Write-Host "Arguments: $(($ChromeArgs | ForEach-Object { Quote-Arg -Arg $_ }) -join ' ')"
}

$resolvedProfileMode = Resolve-ProfileMode
$resolvedProfileDir = Resolve-ProfileDir -Mode $resolvedProfileMode
$resolvedProfileDirectory = Resolve-ProfileDirectory
$defaultChromeUserDataDir = Resolve-FullPath -Path (Get-DefaultChromeUserDataDir)

if ((Test-SamePath -Left $resolvedProfileDir -Right $defaultChromeUserDataDir) -and -not $AllowDefaultChromeProfile) {
  Write-Host @"
ERROR: Refusing to start Chrome remote debugging against the default personal Chrome profile:
  $resolvedProfileDir

Chrome 136+ no longer honors remote debugging against the default data directory, and exposing a personal browser profile over CDP is too broad for daily operations.

Use the default ops collaboration profile, or set AD_OPS_CHROME_USER_DATA_DIR to a non-default shared profile directory. For a one-off manual attempt, close normal Chrome first and rerun with -AllowDefaultChromeProfile.
"@
  exit 1
}

$chromeArgs = @(
  "--remote-debugging-port=$DebugPort",
  "--user-data-dir=$resolvedProfileDir",
  "--variations-override-country=us",
  "--lang=en-US",
  "--no-first-run"
)

if (-not [string]::IsNullOrWhiteSpace($resolvedProfileDirectory)) {
  $chromeArgs += "--profile-directory=$resolvedProfileDirectory"
}

$extensionLoadDirs = New-Object System.Collections.Generic.List[string]
if (-not $NoProjectExtension -and (Test-Path $projectExtensionDir)) {
  $extensionLoadDirs.Add($projectExtensionDir)
}
if ($extensionLoadDirs.Count -gt 0) {
  $extensionList = ($extensionLoadDirs | Select-Object -Unique) -join ','
  $chromeArgs += "--load-extension=$extensionList"
}

if ($OpenStartupUrls) {
  foreach ($url in $requiredUrls) {
    $chromeArgs += $url
  }
} else {
  $chromeArgs += "about:blank"
}

$resolvedChromePath = Resolve-ChromePath
$existingTabs = Get-DebugTabs
if ($existingTabs) {
  $activeProfileDir = Get-ActiveDebugProfileDir
  Write-Host "Reusing existing Chrome debug session on $debugUrl"
  if (-not [string]::IsNullOrWhiteSpace($activeProfileDir)) {
    Write-Host "Active debug user data dir: $activeProfileDir"
    if (-not (Test-SamePath -Left $activeProfileDir -Right $resolvedProfileDir)) {
      Write-Warning "Requested user data dir is different. Close the current debug Chrome before switching profiles."
    }
  }
  if ($DryRun) {
    Write-ResolvedConfig -Mode $resolvedProfileMode -ResolvedProfileDir $resolvedProfileDir -ResolvedProfileDirectory $resolvedProfileDirectory -ResolvedChromePath $resolvedChromePath -ChromeArgs $chromeArgs
    exit 0
  }
  if ($ShowWindow) {
    Show-DebugChromeWindow
  }
  Invoke-BackendLoginReady
  exit 0
}

if ($DryRun) {
  Write-Host "Dry run: Chrome is not running on $debugUrl; no browser will be started."
  Write-ResolvedConfig -Mode $resolvedProfileMode -ResolvedProfileDir $resolvedProfileDir -ResolvedProfileDirectory $resolvedProfileDirectory -ResolvedChromePath $resolvedChromePath -ChromeArgs $chromeArgs
  exit 0
}

if (-not (Test-Path $resolvedProfileDir)) {
  New-Item -ItemType Directory -Path $resolvedProfileDir -Force | Out-Null
}

$argumentLine = ($chromeArgs | ForEach-Object { Quote-Arg -Arg $_ }) -join " "
Start-Process -FilePath $resolvedChromePath -ArgumentList $argumentLine -WindowStyle $WindowStyle
Start-Sleep -Seconds 3
if ($ShowWindow) {
  Show-DebugChromeWindow
}

Write-Host "Started Chrome with remote debugging on $debugUrl"
Write-Host "Chrome binary: $resolvedChromePath"
Write-Host "User data dir: $resolvedProfileDir"
if (-not [string]::IsNullOrWhiteSpace($resolvedProfileDirectory)) {
  Write-Host "Profile directory: $resolvedProfileDirectory"
}
Invoke-BackendLoginReady
