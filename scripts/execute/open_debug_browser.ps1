$debugUrl = "http://127.0.0.1:9222"
$requiredUrls = @(
  "https://adv.yswg.com.cn/",
  "https://sellerinventory.yswg.com.cn/",
  "https://selection.yswg.com.cn/dashboard/analysis",
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

$existingTabs = Get-DebugTabs
if ($existingTabs) {
  Write-Host "Reusing existing Chrome debug session on $debugUrl"
  Ensure-RequiredTabs
  Invoke-BackendLoginReady
  exit 0
}

$chromeArgs = @(
  "--remote-debugging-port=9222",
  "--user-data-dir=C:\Users\Administrator\AppData\Local\Google\Chrome\User Data",
  "--variations-override-country=us",
  "--lang=en-US"
)

foreach ($url in $requiredUrls) {
  $chromeArgs += $url
}

Start-Process -FilePath "chrome.exe" -ArgumentList $chromeArgs
Start-Sleep -Seconds 3

Write-Host "Started Chrome with remote debugging on $debugUrl"
Invoke-BackendLoginReady
