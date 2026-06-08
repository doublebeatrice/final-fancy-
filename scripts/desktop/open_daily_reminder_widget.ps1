$ErrorActionPreference = 'Stop'

$Root = 'D:\ad-ops-workbench'
$StateDir = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder'
$StateFile = Join-Path $StateDir 'state.json'
$WatchdogLauncher = Join-Path $Root 'scripts\desktop\watch_daily_reminder_widget.vbs'
$WidgetLauncher = Join-Path $Root 'scripts\desktop\launch_daily_reminder_widget.vbs'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Read-State {
  if (-not (Test-Path -LiteralPath $StateFile)) {
    return $null
  }
  try {
    return [System.IO.File]::ReadAllText($StateFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-DefaultLocations {
  Add-Type -AssemblyName System.Windows.Forms
  $Work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  [pscustomobject]@{
    expanded = [ordered]@{
      x = [double]([Math]::Round($Work.Right - 460 - 18))
      y = [double]([Math]::Round($Work.Bottom - 610 - 18))
    }
    collapsed = [ordered]@{
      x = [double]([Math]::Round($Work.Right - 140 - 18))
      y = [double]([Math]::Round($Work.Bottom - 54 - 18))
    }
  }
}

function Clear-ExitRequest {
  $State = Read-State
  $Defaults = Get-DefaultLocations
  $Collapsed = if ($State -and $State.collapsedLocation) {
    [ordered]@{ x = [double]$State.collapsedLocation.x; y = [double]$State.collapsedLocation.y }
  } else {
    $Defaults.collapsed
  }
  $Expanded = if ($State -and $State.expandedLocation) {
    [ordered]@{ x = [double]$State.expandedLocation.x; y = [double]$State.expandedLocation.y }
  } else {
    $Defaults.expanded
  }
  $Payload = [ordered]@{
    currentView = if ($State -and $State.currentView) { [string]$State.currentView } else { 'today' }
    collapsed = if ($State -and $null -ne $State.collapsed) { [bool]$State.collapsed } else { $true }
    exitRequested = $false
    location = if ($State -and $State.location) { [ordered]@{ x = [double]$State.location.x; y = [double]$State.location.y } } else { $Collapsed }
    expandedLocation = $Expanded
    collapsedLocation = $Collapsed
    pomodoro = if ($State -and $State.pomodoro) { $State.pomodoro } else { [ordered]@{ mode = 'focus'; running = $false; remainingSeconds = 1500; endAt = $null } }
  }
  $Payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Test-WatchdogRunning {
  @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'powershell.exe' -and
      $_.CommandLine -like '*watch_daily_reminder_widget.ps1*' -and
      $_.CommandLine -notlike '*-Command*'
    }).Count -gt 0
}

Clear-ExitRequest
if (-not (Test-WatchdogRunning)) {
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ('wscript.exe "{0}"' -f $WatchdogLauncher) } | Out-Null
}
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ('wscript.exe "{0}"' -f $WidgetLauncher) } | Out-Null
