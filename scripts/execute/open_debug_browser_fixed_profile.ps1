$profileDir = "C:\chrome-debug-profile"
$debugUrl = "http://127.0.0.1:9222"
$requiredUrls = @(
  "https://adv.yswg.com.cn/",
  "https://sellerinventory.yswg.com.cn/",
  "chrome-extension://ipidenfkcdlhadnieamoocalimlnhagj/panel.html"
)

function Get-DebugTabs {
  try {
    return Invoke-RestMethod -Uri "$debugUrl/json/list" -TimeoutSec 2
  } catch {
    return $null
  }
}

function Open-DebugTab {
  param([string]$Url)

  $escapedUrl = [uri]::EscapeDataString($Url)
  try {
    Invoke-RestMethod -Method Put -Uri "$debugUrl/json/new?$escapedUrl" -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    try {
      Invoke-RestMethod -Uri "$debugUrl/json/new?$escapedUrl" -TimeoutSec 5 | Out-Null
      return $true
    } catch {
      return $false
    }
  }
}

function Ensure-RequiredTabs {
  $tabs = Get-DebugTabs
  if (-not $tabs) {
    return
  }

  foreach ($url in $requiredUrls) {
    $exists = $false
    foreach ($tab in $tabs) {
      if ([string]$tab.url -eq $url -or [string]$tab.url -like "$url*") {
        $exists = $true
        break
      }
    }
    if (-not $exists) {
      if (Open-DebugTab -Url $url) {
        Write-Host "Opened missing tab: $url"
      } else {
        Write-Host "Debug Chrome is running, but failed to open tab: $url"
      }
    }
  }
}

$existingTabs = Get-DebugTabs
if ($existingTabs) {
  Write-Host "Reusing existing Chrome debug session on $debugUrl"
  Ensure-RequiredTabs
  Write-Host "This does not log in automatically. Use the opened tabs to manually confirm login."
  exit 0
}

if (-not (Test-Path $profileDir)) {
  New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

$candidatePaths = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $candidatePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromePath) {
  try {
    $registryPath = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" -ErrorAction Stop).'(default)'
    if ($registryPath -and (Test-Path $registryPath)) {
      $chromePath = $registryPath
    }
  } catch {}
}

if (-not $chromePath) {
  throw "Chrome executable not found. Checked common install paths and App Paths registry."
}

$chromeArgs = @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$profileDir",
  "--variations-override-country=us",
  "--lang=en-US"
)

foreach ($url in $requiredUrls) {
  $chromeArgs += $url
}

Start-Process -FilePath $chromePath -ArgumentList $chromeArgs

Write-Host "Started Chrome with remote debugging on $debugUrl"
Write-Host "Chrome binary: $chromePath"
Write-Host "User data dir: $profileDir"
Write-Host "This does not log in automatically. Use the opened tabs to manually confirm login."
