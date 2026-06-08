param(
  [switch]$ClearExitRequest,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'

$Root = 'D:\ad-ops-workbench'
$StateDir = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder'
$StateFile = Join-Path $StateDir 'state.json'
$LogFile = Join-Path $StateDir 'watchdog.log'
$LauncherFile = Join-Path $Root 'scripts\desktop\launch_daily_reminder_widget.vbs'
$IntervalSeconds = 20
$MaxLogBytes = 262144
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Write-WatchdogLog([string]$Message) {
  try {
    if (Test-Path -LiteralPath $LogFile) {
      $LogItem = Get-Item -LiteralPath $LogFile
      if ($LogItem.Length -gt $MaxLogBytes) {
        Move-Item -LiteralPath $LogFile -Destination "$LogFile.1" -Force -ErrorAction SilentlyContinue
      }
    }
    Add-Content -LiteralPath $LogFile -Value ("{0} {1}" -f (Get-Date -Format 's'), $Message) -Encoding UTF8
  } catch {
  }
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StateFile)) {
    return $null
  }
  try {
    return [System.IO.File]::ReadAllText($StateFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  } catch {
    Write-WatchdogLog $_.Exception.ToString()
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

function Set-ExitRequested([bool]$Value) {
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
    exitRequested = $Value
    location = if ($State -and $State.location) { [ordered]@{ x = [double]$State.location.x; y = [double]$State.location.y } } else { $Collapsed }
    expandedLocation = $Expanded
    collapsedLocation = $Collapsed
    pomodoro = if ($State -and $State.pomodoro) { $State.pomodoro } else { [ordered]@{ mode = 'focus'; running = $false; remainingSeconds = 1500; endAt = $null } }
  }
  $Payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Test-ExitRequested {
  $State = Read-State
  $State -and $State.PSObject.Properties['exitRequested'] -and [bool]$State.exitRequested
}

function Get-WidgetProcess {
  @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'powershell.exe' -and
      $_.CommandLine -like '*daily_reminder_widget.ps1*' -and
      $_.CommandLine -notlike '*watch_daily_reminder_widget.ps1*' -and
      $_.CommandLine -notlike '*-SelfTest*' -and
      $_.CommandLine -notlike '*test_daily_reminder_widget.ps1*'
    })
}

function Test-WidgetMutexExists {
  try {
    $Existing = [System.Threading.Mutex]::OpenExisting('Local\AdOpsDailyReminderWidget')
    $Existing.Dispose()
    return $true
  } catch [System.Threading.WaitHandleCannotBeOpenedException] {
    return $false
  } catch {
    Write-WatchdogLog $_.Exception.ToString()
    return $false
  }
}

function Start-Widget {
  if (-not (Test-Path -LiteralPath $LauncherFile)) {
    Write-WatchdogLog "launcher missing: $LauncherFile"
    return
  }
  $CommandLine = 'wscript.exe "{0}"' -f $LauncherFile
  Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $CommandLine } | Out-Null
  Write-WatchdogLog 'widget start requested'
}

$CreatedNew = $false
$Mutex = New-Object System.Threading.Mutex($true, 'Local\AdOpsDailyReminderWatchdog', [ref]$CreatedNew)
if (-not $CreatedNew) {
  return
}

try {
  if ($ClearExitRequest) {
    Set-ExitRequested $false
  }
  Write-WatchdogLog ("watchdog start pid={0}" -f $PID)
  do {
    if (Test-ExitRequested) {
      Write-WatchdogLog ("exit requested, watchdog stop pid={0}" -f $PID)
      break
    }
    if (@(Get-WidgetProcess).Count -eq 0 -and -not (Test-WidgetMutexExists)) {
      Start-Widget
    }
    if ($Once) {
      break
    }
    Start-Sleep -Seconds $IntervalSeconds
  } while ($true)
} finally {
  if ($Mutex) {
    try {
      $Mutex.ReleaseMutex()
    } catch {
    }
    $Mutex.Dispose()
  }
}
