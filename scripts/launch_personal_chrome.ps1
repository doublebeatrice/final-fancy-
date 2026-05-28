param(
  [string]$ChromePath = ""
)

$ErrorActionPreference = "Stop"

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

Start-Process -FilePath (Resolve-ChromePath)
Write-Host "Opened personal Chrome. Do not use this window for ad backend or sellerinventory during ad-ops runs."
