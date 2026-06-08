param(
  [switch]$SkipIntegration,
  [switch]$RunMouseIntegration
)

$ErrorActionPreference = 'Stop'

$Root = 'D:\ad-ops-workbench'
$WidgetScript = Join-Path $Root 'scripts\desktop\daily_reminder_widget.ps1'
$Launcher = Join-Path $Root 'scripts\desktop\launch_daily_reminder_widget.vbs'
$OpenScript = Join-Path $Root 'scripts\desktop\open_daily_reminder_widget.ps1'
$OpenLauncher = Join-Path $Root 'scripts\desktop\open_daily_reminder_widget.vbs'
$WatchdogScript = Join-Path $Root 'scripts\desktop\watch_daily_reminder_widget.ps1'
$WatchdogLauncher = Join-Path $Root 'scripts\desktop\watch_daily_reminder_widget.vbs'
$Icon = Join-Path $Root 'scripts\desktop\daily_reminder_widget.ico'
$ItemsFile = Join-Path $Root 'data\desktop_reminder\daily_items.txt'
$RemindersFile = Join-Path $Root 'data\desktop_reminder\reminders.json'
$BackupFile = "$RemindersFile.bak"
$StateFile = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder\state.json'
$LogFile = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder\widget.log'
$WatchdogLogFile = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder\watchdog.log'
$MaxLogBytes = 262144
$MaxRefreshSeconds = 5
$ShortcutName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5q+P5pel6L+Q6JCl5o+Q6YaSLmxuaw=='))
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) $ShortcutName
$StartupShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) $ShortcutName
$WidgetWindowName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5Lu75Yqh'))
$AlertLabel = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5o+Q6YaS'))
$DoneLabel = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5a6M5oiQ'))
$CliQuickAddText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5piO5aSpIHAxIFFBIGNsaSBhZGQgI3FhIEDmlLbpm4bnrrE='))
$CliRefreshText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5LuK5aSpIHAxIFFBIGxpdmUgcmVmcmVzaCAjcWEgQOaUtumbhueusQ=='))

$script:Failures = New-Object System.Collections.Generic.List[string]
$script:Checks = 0

function Add-Check([string]$Name, [bool]$Pass, [string]$Detail = '') {
  $script:Checks++
  if ($Pass) {
    Write-Host ("PASS {0}" -f $Name)
    return
  }
  $Message = if ($Detail) { "{0}: {1}" -f $Name, $Detail } else { $Name }
  $script:Failures.Add($Message)
  Write-Host ("FAIL {0}" -f $Message)
}

function Read-TextUtf8($Path) {
  [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Read-Json($Path) {
  Read-TextUtf8 $Path | ConvertFrom-Json
}

function Test-IconLoads($Path) {
  try {
    Add-Type -AssemblyName System.Drawing
    foreach ($Size in @(16, 32, 48, 256)) {
      $LoadedIcon = New-Object System.Drawing.Icon($Path, $Size, $Size)
      $Bitmap = $LoadedIcon.ToBitmap()
      $Bitmap.Dispose()
      $LoadedIcon.Dispose()
    }
    return $true
  } catch {
    return $false
  }
}

function Write-Json($Path, $Object) {
  $Object | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Test-WidgetProcessCommandLine([string]$CommandLine) {
  $CommandLine -like '*-File *daily_reminder_widget.ps1*' -and
    $CommandLine -notlike '*watch_daily_reminder_widget.ps1*' -and
    $CommandLine -notlike '*-SelfTest*' -and
    $CommandLine -notlike '*test_daily_reminder_widget.ps1*'
}

function Test-WatchdogProcessCommandLine([string]$CommandLine) {
  $CommandLine -like '*-File *watch_daily_reminder_widget.ps1*' -and
    $CommandLine -notlike '*-Command*'
}

function Stop-WidgetProcess {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'powershell.exe' -and
      (Test-WidgetProcessCommandLine $_.CommandLine)
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

function Start-WidgetProcess {
  if (@(Get-WatchdogProcess).Count -eq 0) {
    Start-Process -FilePath wscript.exe -ArgumentList ('"{0}"' -f $WatchdogLauncher) | Out-Null
  }
  Start-Process -FilePath wscript.exe -ArgumentList ('"{0}"' -f $Launcher) | Out-Null
}

function Get-WidgetProcess {
  @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'powershell.exe' -and
      (Test-WidgetProcessCommandLine $_.CommandLine)
    })
}

function Get-WatchdogProcess {
  @(Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq 'powershell.exe' -and
      (Test-WatchdogProcessCommandLine $_.CommandLine)
    })
}

function Get-QaLeftoverCount($Data) {
  @($Data.reminders |
    Where-Object { $_.id -like 'qa_*' -or $_.title -like 'QA *' -or $_.notes -eq 'qa-smoke' }).Count
}

function Initialize-UiAutomation {
  if ($script:UiAutomationLoaded) {
    return
  }
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  $script:UiAutomationLoaded = $true
}

function Test-VisibleRect($Rect) {
  try {
    if ([double]::IsInfinity([double]$Rect.X) -or [double]::IsInfinity([double]$Rect.Y)) {
      return $false
    }
    return ([double]$Rect.Width -gt 0 -and [double]$Rect.Height -gt 0)
  } catch {
    return $false
  }
}

function Get-WidgetWindowElement([int]$TimeoutMs = 5000) {
  Initialize-UiAutomation
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $Condition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $WidgetWindowName
    )
    $WindowElement = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst(
      [System.Windows.Automation.TreeScope]::Children,
      $Condition
    )
    if ($WindowElement) {
      return $WindowElement
    }
    Start-Sleep -Milliseconds 150
  } while ((Get-Date) -lt $Deadline)
  return $null
}

function Invoke-VisibleButtonByName([object]$RootElement, [string]$Name) {
  Initialize-UiAutomation
  if (-not $RootElement) {
    return $false
  }
  $Condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $Buttons = $RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $Condition)
  for ($i = 0; $i -lt $Buttons.Count; $i++) {
    $Button = $Buttons.Item($i)
    if ($Button.Current.Name -ne $Name) {
      continue
    }
    if (-not (Test-VisibleRect $Button.Current.BoundingRectangle)) {
      continue
    }
    $Pattern = $Button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $Pattern.Invoke()
    return $true
  }
  return $false
}

function Invoke-VisibleButtonByPrefix([object]$RootElement, [string]$Prefix) {
  Initialize-UiAutomation
  if (-not $RootElement) {
    return $false
  }
  $Condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  $Buttons = $RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $Condition)
  for ($i = 0; $i -lt $Buttons.Count; $i++) {
    $Button = $Buttons.Item($i)
    if (-not $Button.Current.Name.StartsWith($Prefix)) {
      continue
    }
    if (-not (Test-VisibleRect $Button.Current.BoundingRectangle)) {
      continue
    }
    $Pattern = $Button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $Pattern.Invoke()
    return $true
  }
  return $false
}

function Wait-VisibleElementByName([string]$Name, [int]$TimeoutMs = 9000) {
  Initialize-UiAutomation
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $WindowElement = Get-WidgetWindowElement 1000
    if ($WindowElement) {
      $Condition = New-Object System.Windows.Automation.PropertyCondition(
        [System.Windows.Automation.AutomationElement]::NameProperty,
        $Name
      )
      $Elements = $WindowElement.FindAll([System.Windows.Automation.TreeScope]::Descendants, $Condition)
      for ($i = 0; $i -lt $Elements.Count; $i++) {
        if (Test-VisibleRect $Elements.Item($i).Current.BoundingRectangle) {
          return $true
        }
      }
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $Deadline)
  return $false
}

function Wait-WidgetExpanded([int]$TimeoutMs = 6000) {
  Initialize-UiAutomation
  $Deadline = (Get-Date).AddMilliseconds($TimeoutMs)
  do {
    $WindowElement = Get-WidgetWindowElement 1000
    if ($WindowElement) {
      $Bounds = $WindowElement.Current.BoundingRectangle
      if ([double]$Bounds.Width -gt 200 -and [double]$Bounds.Height -gt 200) {
        return $true
      }
    }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $Deadline)
  return $false
}

function Invoke-MouseDrag([int]$StartX, [int]$StartY, [int]$EndX, [int]$EndY) {
  if (-not $RunMouseIntegration) {
    throw 'Mouse integration tests require -RunMouseIntegration.'
  }
  Add-Type -AssemblyName System.Windows.Forms
  if (-not $script:MouseNativeLoaded) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ReminderMouseNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@
    $script:MouseNativeLoaded = $true
  }

  [ReminderMouseNative]::SetCursorPos($StartX, $StartY) | Out-Null
  Start-Sleep -Milliseconds 80
  [ReminderMouseNative]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  for ($i = 1; $i -le 8; $i++) {
    $X = [int]($StartX + (($EndX - $StartX) * $i / 8))
    $Y = [int]($StartY + (($EndY - $StartY) * $i / 8))
    [ReminderMouseNative]::SetCursorPos($X, $Y) | Out-Null
    [ReminderMouseNative]::mouse_event(0x0001, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 35
  }
  [ReminderMouseNative]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 500
}

function Test-CollapsedDragPersists {
  $WindowElement = Get-WidgetWindowElement
  if (-not $WindowElement) {
    return [pscustomobject]@{ pass = $false; detail = 'window missing' }
  }
  $Before = $WindowElement.Current.BoundingRectangle
  $StartX = [int]($Before.X + ($Before.Width / 2))
  $StartY = [int]($Before.Y + ($Before.Height / 2))
  Invoke-MouseDrag $StartX $StartY ($StartX - 48) ($StartY - 32)
  $AfterWindow = Get-WidgetWindowElement
  if (-not $AfterWindow) {
    return [pscustomobject]@{ pass = $false; detail = 'window missing after drag' }
  }
  $After = $AfterWindow.Current.BoundingRectangle
  $State = if (Test-Path -LiteralPath $StateFile) { Read-Json $StateFile } else { $null }
  $Moved = ([Math]::Abs([double]$After.X - [double]$Before.X) -ge 20 -or [Math]::Abs([double]$After.Y - [double]$Before.Y) -ge 20)
  $Saved = $State -and [Math]::Abs([double]$State.collapsedLocation.x - [double]$After.X) -le 2 -and [Math]::Abs([double]$State.collapsedLocation.y - [double]$After.Y) -le 2
  return [pscustomobject]@{
    pass = ($Moved -and $Saved)
    detail = "before=$([int]$Before.X),$([int]$Before.Y); after=$([int]$After.X),$([int]$After.Y); saved=$Saved"
  }
}

function Write-ExpandedWidgetState {
  Add-Type -AssemblyName PresentationFramework
  $StateDir = Split-Path -Parent $StateFile
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $Work = [System.Windows.SystemParameters]::WorkArea
  $ExpandedWidth = 460
  $ExpandedHeight = 610
  $CollapsedWidth = 140
  $CollapsedHeight = 54
  $State = [ordered]@{
    currentView = 'today'
    collapsed = $false
    exitRequested = $false
    location = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $ExpandedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $ExpandedHeight - 18))
    }
    expandedLocation = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $ExpandedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $ExpandedHeight - 18))
    }
    collapsedLocation = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $CollapsedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $CollapsedHeight - 18))
    }
  }
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Write-CollapsedWidgetState {
  Add-Type -AssemblyName PresentationFramework
  $StateDir = Split-Path -Parent $StateFile
  New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
  $Work = [System.Windows.SystemParameters]::WorkArea
  $CollapsedWidth = 140
  $CollapsedHeight = 54
  $ExpandedWidth = 460
  $ExpandedHeight = 610
  $State = [ordered]@{
    currentView = 'today'
    collapsed = $true
    exitRequested = $false
    location = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $CollapsedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $CollapsedHeight - 18))
    }
    expandedLocation = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $ExpandedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $ExpandedHeight - 18))
    }
    collapsedLocation = [ordered]@{
      x = [double]([Math]::Round($Work.Right - $CollapsedWidth - 18))
      y = [double]([Math]::Round($Work.Bottom - $CollapsedHeight - 18))
    }
  }
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Test-CollapsedVisual {
  Initialize-UiAutomation
  Add-Type -AssemblyName System.Drawing
  $WindowElement = Get-WidgetWindowElement
  if (-not $WindowElement) {
    return [pscustomobject]@{ pass = $false; detail = 'window missing' }
  }

  $Bounds = $WindowElement.Current.BoundingRectangle
  $Width = [int]$Bounds.Width
  $Height = [int]$Bounds.Height
  if ($Width -ne 140 -or $Height -ne 54) {
    return [pscustomobject]@{ pass = $false; detail = "bounds=${Width}x${Height}" }
  }

  $Pad = 8
  $CaptureX = [Math]::Max(0, [int]$Bounds.X - $Pad)
  $CaptureY = [Math]::Max(0, [int]$Bounds.Y - $Pad)
  $CaptureWidth = $Width + ($Pad * 2)
  $CaptureHeight = $Height + ($Pad * 2)
  $Bitmap = New-Object System.Drawing.Bitmap($CaptureWidth, $CaptureHeight)
  $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
  try {
    $Graphics.CopyFromScreen($CaptureX, $CaptureY, 0, 0, [System.Drawing.Size]::new($CaptureWidth, $CaptureHeight))
    $BoundaryContrast = 0
    $InsideX = $Pad + $Width - 1
    $OutsideX = $Pad + $Width
    for ($y = ($Pad + 8); $y -lt ($Pad + $Height - 8); $y++) {
      $Inside = $Bitmap.GetPixel($InsideX, $y)
      $Outside = $Bitmap.GetPixel($OutsideX, $y)
      $Delta = [Math]::Abs($Inside.R - $Outside.R) + [Math]::Abs($Inside.G - $Outside.G) + [Math]::Abs($Inside.B - $Outside.B)
      if ($Delta -gt 24) {
        $BoundaryContrast++
      }
    }
    $Pass = $BoundaryContrast -le 2
    return [pscustomobject]@{ pass = $Pass; detail = "bounds=${Width}x${Height}; boundaryContrast=$BoundaryContrast" }
  } finally {
    $Graphics.Dispose()
    $Bitmap.Dispose()
  }
}

try {
  Add-Check 'widget script exists' (Test-Path -LiteralPath $WidgetScript) $WidgetScript
  Add-Check 'launcher exists' (Test-Path -LiteralPath $Launcher) $Launcher
  Add-Check 'open script exists' (Test-Path -LiteralPath $OpenScript) $OpenScript
  Add-Check 'open launcher exists' (Test-Path -LiteralPath $OpenLauncher) $OpenLauncher
  Add-Check 'watchdog script exists' (Test-Path -LiteralPath $WatchdogScript) $WatchdogScript
  Add-Check 'watchdog launcher exists' (Test-Path -LiteralPath $WatchdogLauncher) $WatchdogLauncher
  Add-Check 'icon exists' (Test-Path -LiteralPath $Icon) $Icon
  Add-Check 'icon loads in Windows' (Test-IconLoads $Icon) $Icon
  Add-Check 'reminders json exists' (Test-Path -LiteralPath $RemindersFile) $RemindersFile

  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($WidgetScript, [ref]$tokens, [ref]$errors) | Out-Null
  Add-Check 'script parses' ($errors.Count -eq 0) (($errors | Select-Object -First 1 -ExpandProperty Message) -as [string])
  $openTokens = $null
  $openErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($OpenScript, [ref]$openTokens, [ref]$openErrors) | Out-Null
  Add-Check 'open script parses' ($openErrors.Count -eq 0) (($openErrors | Select-Object -First 1 -ExpandProperty Message) -as [string])
  $watchdogTokens = $null
  $watchdogErrors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($WatchdogScript, [ref]$watchdogTokens, [ref]$watchdogErrors) | Out-Null
  Add-Check 'watchdog script parses' ($watchdogErrors.Count -eq 0) (($watchdogErrors | Select-Object -First 1 -ExpandProperty Message) -as [string])
  $WidgetText = Read-TextUtf8 $WidgetScript
  $OpenText = Read-TextUtf8 $OpenScript
  $WatchdogText = Read-TextUtf8 $WatchdogScript
  $LauncherText = Read-TextUtf8 $Launcher
  $OpenLauncherText = Read-TextUtf8 $OpenLauncher
  $WatchdogLauncherText = Read-TextUtf8 $WatchdogLauncher
  Add-Check 'log rotation configured' ($WidgetText.Contains('$MaxLogBytes') -and $WidgetText.Contains('Move-Item -LiteralPath $LogFile'))
  Add-Check 'shutdown cleanup configured' ($WidgetText.Contains('$Timer.Stop()') -and $WidgetText.Contains('$TrayMenu.Dispose()') -and $WidgetText.Contains('$script:Mutex = $null'))
  Add-Check 'second launch activation configured' ($WidgetText.Contains('EventWaitHandle') -and $WidgetText.Contains('AdOpsDailyReminderWidgetShow') -and $WidgetText.Contains('$ShowEventTimer'))
  Add-Check 'stale launch signal drained' ($WidgetText.Contains('while ($script:ShowEvent.WaitOne(0))'))
  Add-Check 'collapse preserves expanded location' ($WidgetText.Contains('$script:ExpandedLocation = Clamp-ToWorkArea ([double]$Window.Left) ([double]$Window.Top) $ExpandedWidth $ExpandedHeight'))
  Add-Check 'system font stack configured' ($WidgetText.Contains('Segoe UI Variable, Microsoft YaHei UI'))
  Add-Check 'animation completion driven' ($WidgetText.Contains('$OpacityAnimation.Add_Completed') -and -not $WidgetText.Contains('$script:TransitionTimer.Start()'))
  Add-Check 'pomodoro durations configured' ($WidgetText.Contains('$PomodoroFocusSeconds = 25 * 60') -and $WidgetText.Contains('$PomodoroBreakSeconds = 5 * 60'))
  Add-Check 'pomodoro state persists' ($WidgetText.Contains('pomodoro = Get-PomodoroStatePayload') -and $WidgetText.Contains('function Initialize-PomodoroState'))
  Add-Check 'pomodoro stats persist' ($WidgetText.Contains('stats = @($script:PomodoroStats)') -and $WidgetText.Contains('function Add-PomodoroFocusStat') -and $WidgetText.Contains('focusSeconds'))
  Add-Check 'pomodoro controls configured' ($WidgetText.Contains('function Toggle-Pomodoro') -and $WidgetText.Contains('function Reset-Pomodoro') -and $WidgetText.Contains('$script:PomodoroToggleButton'))
  Add-Check 'pomodoro stats visible' ($WidgetText.Contains('$script:PomodoroStat') -and $WidgetText.Contains('Get-PomodoroStatsLabel'))
  Add-Check 'pomodoro pause icon stable' ($WidgetText.Contains("{ 'II' }") -and -not $WidgetText.Contains('0x23F8'))
  Add-Check 'pomodoro ticks every second' ($WidgetText.Contains('$PomodoroTimer.Interval = [TimeSpan]::FromSeconds(1)') -and $WidgetText.Contains('Tick-Pomodoro'))
  Add-Check 'collapsed shows active pomodoro' ($WidgetText.Contains('if ($script:PomodoroRunning)') -and $WidgetText.Contains('Format-PomodoroTime (Get-PomodoroRemainingSeconds)'))
  Add-Check 'external data sync configured' ($WidgetText.Contains('function Sync-ExternalRemindersIfChanged') -and $WidgetText.Contains('Sync-ExternalRemindersIfChanged | Out-Null'))
  Add-Check 'empty reminders reseed configured' ($WidgetText.Contains('if (@($script:Reminders).Count -eq 0)') -and $WidgetText.Contains('Get-SeedTitles | ForEach-Object'))
  Add-Check 'utf8 json reads configured' ($WidgetText.Contains('[System.IO.File]::ReadAllText($RemindersFile, [System.Text.Encoding]::UTF8)') -and $WidgetText.Contains('[System.IO.File]::ReadAllText($StateFile, [System.Text.Encoding]::UTF8)'))
  Add-Check 'unexpected close guarded' ($WidgetText.Contains('$script:AllowExit = $false') -and $WidgetText.Contains('$Window.Add_Closing') -and $WidgetText.Contains('unexpected close blocked'))
  Add-Check 'session ending allowed' ($WidgetText.Contains('[Microsoft.Win32.SystemEvents]::add_SessionEnding') -and $WidgetText.Contains('session ending allow exit') -and $WidgetText.Contains('[Microsoft.Win32.SystemEvents]::remove_SessionEnding'))
  Add-Check 'unexpected close self restart configured' ($WidgetText.Contains('function Start-WidgetDetached') -and $WidgetText.Contains('unexpected close restarted') -and $WidgetText.Contains('Save-RestartCollapsedState'))
  Add-Check 'watchdog respects final exit' ($WidgetText.Contains('exitRequested = [bool]$script:ExitRequested') -and $WatchdogText.Contains('Test-ExitRequested') -and $WatchdogText.Contains('exit requested, watchdog stop'))
  Add-Check 'final exit stops watchdog' ($WidgetText.Contains('function Request-FinalExit') -and $WidgetText.Contains('Stop-WatchdogProcess') -and $WidgetText.Contains('$WatchdogScriptFile'))
  Add-Check 'manual launch clears final exit' ($OpenText.Contains('function Clear-ExitRequest') -and $OpenText.Contains('exitRequested = $false') -and $OpenText.Contains('Test-WatchdogRunning'))
  Add-Check 'manual launch restores watchdog and widget' ($OpenText.Contains('$WatchdogLauncher') -and $OpenText.Contains('$WidgetLauncher') -and $OpenText.Contains('Invoke-CimMethod -ClassName Win32_Process'))
  Add-Check 'launchers preserve pomodoro state' ($OpenText.Contains('pomodoro = if ($State -and $State.pomodoro)') -and $WatchdogText.Contains('pomodoro = if ($State -and $State.pomodoro)'))
  Add-Check 'watchdog does not count itself as widget' ($WatchdogText.Contains("-notlike '*watch_daily_reminder_widget.ps1*'"))
  Add-Check 'watchdog checks widget mutex' ($WatchdogText.Contains('Test-WidgetMutexExists') -and $WatchdogText.Contains("OpenExisting('Local\AdOpsDailyReminderWidget')"))
  Add-Check 'watchdog starts widget detached' ($WatchdogText.Contains('Invoke-CimMethod -ClassName Win32_Process') -and $WatchdogText.Contains('watchdog start'))
  $RefreshMatch = [regex]::Match($WidgetText, '\$RefreshSeconds\s*=\s*(\d+)')
  Add-Check 'foreground refresh interval' ($RefreshMatch.Success -and [int]$RefreshMatch.Groups[1].Value -le $MaxRefreshSeconds) ($RefreshMatch.Value)
  if (Test-Path -LiteralPath $LogFile) {
    $CurrentLog = Get-Item -LiteralPath $LogFile
    Add-Check 'current log bounded' ($CurrentLog.Length -le $MaxLogBytes) ("length={0}" -f $CurrentLog.Length)
  }
  if (Test-Path -LiteralPath $WatchdogLogFile) {
    $CurrentWatchdogLog = Get-Item -LiteralPath $WatchdogLogFile
    Add-Check 'watchdog log bounded' ($CurrentWatchdogLog.Length -le $MaxLogBytes) ("length={0}" -f $CurrentWatchdogLog.Length)
  }

  $SelfTestRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -SelfTest
  $SelfTest = $SelfTestRaw | ConvertFrom-Json
  Add-Check 'quick add self test count' (@($SelfTest).Count -eq 5) ("count={0}" -f @($SelfTest).Count)
  Add-Check 'quick add parses priority' ([int]$SelfTest[0].priority -eq 1) ("priority={0}" -f $SelfTest[0].priority)
  Add-Check 'quick add parses day after tomorrow' ($SelfTest[1].dueDate -eq (Get-Date).Date.AddDays(2).ToString('yyyy-MM-dd')) ("dueDate={0}" -f $SelfTest[1].dueDate)
  Add-Check 'quick add parses next month' ($SelfTest[2].dueDate -eq (Get-Date).Date.AddMonths(1).ToString('yyyy-MM-01')) ("dueDate={0}" -f $SelfTest[2].dueDate)
  Add-Check 'quick add parses time' ($SelfTest[3].dueTime -eq '15:00') ("dueTime={0}" -f $SelfTest[3].dueTime)

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -ListJson | Out-Null
  $Reminders = Read-Json $RemindersFile
  Add-Check 'reminders version' ([int]$Reminders.version -ge 2) ("version={0}" -f $Reminders.version)
  Add-Check 'reminders nonempty' (@($Reminders.reminders).Count -gt 0) 'empty'
  $SeedLines = @()
  if (Test-Path -LiteralPath $ItemsFile) {
    $SeedLines = @([System.IO.File]::ReadAllLines($ItemsFile, [System.Text.Encoding]::UTF8) | Where-Object { $_.Trim() -and -not $_.Trim().StartsWith('#') })
  }
  Add-Check 'daily seed list populated' ($SeedLines.Count -ge 9) ("count={0}" -f $SeedLines.Count)
  $TodayText = (Get-Date).Date.ToString('yyyy-MM-dd')
  $TodayActiveCount = @($Reminders.reminders | Where-Object { -not [bool]$_.completed -and $_.dueDate -eq $TodayText }).Count
  Add-Check 'today reminders available' ($TodayActiveCount -gt 0) ("count={0}" -f $TodayActiveCount)
  Add-Check 'no qa leftovers' ((Get-QaLeftoverCount $Reminders) -eq 0)
  Add-Check 'has timed reminder' (@($Reminders.reminders | Where-Object { $_.dueTime }).Count -gt 0)
  Add-Check 'backup exists' (Test-Path -LiteralPath $BackupFile) $BackupFile
  Add-Check 'no temp json files' (@(Get-ChildItem -LiteralPath (Split-Path -Parent $RemindersFile) -Filter '.*.tmp' -Force).Count -eq 0)

  Add-Check 'launcher points to widget' ($LauncherText -like '*daily_reminder_widget.ps1*')
  Add-Check 'launcher uses sta' ($LauncherText -like '* -STA *')
  Add-Check 'open launcher points to opener' ($OpenLauncherText -like '*open_daily_reminder_widget.ps1*')
  Add-Check 'watchdog launcher points to watchdog' ($WatchdogLauncherText -like '*watch_daily_reminder_widget.ps1*' -and $WatchdogLauncherText -like '*-ClearExitRequest*')
  Add-Check 'desktop shortcut exists' (Test-Path -LiteralPath $DesktopShortcut) $DesktopShortcut
  Add-Check 'startup shortcut exists' (Test-Path -LiteralPath $StartupShortcut) $StartupShortcut

  $Shell = New-Object -ComObject WScript.Shell
  if (Test-Path -LiteralPath $DesktopShortcut) {
    $Shortcut = $Shell.CreateShortcut($DesktopShortcut)
    Add-Check 'shortcut target Desktop' ($Shortcut.TargetPath -like '*wscript.exe') $Shortcut.TargetPath
    Add-Check 'shortcut launcher Desktop' ($Shortcut.Arguments -like "*$OpenLauncher*") $Shortcut.Arguments
    Add-Check 'shortcut icon Desktop' ($Shortcut.IconLocation -like "*$Icon*") $Shortcut.IconLocation
  }
  if (Test-Path -LiteralPath $StartupShortcut) {
    $Shortcut = $Shell.CreateShortcut($StartupShortcut)
    Add-Check 'shortcut target Startup' ($Shortcut.TargetPath -like '*wscript.exe') $Shortcut.TargetPath
    Add-Check 'shortcut launcher Startup' ($Shortcut.Arguments -like "*$WatchdogLauncher*") $Shortcut.Arguments
    Add-Check 'shortcut icon Startup' ($Shortcut.IconLocation -like "*$Icon*") $Shortcut.IconLocation
  }

  $CliOriginalJson = Read-TextUtf8 $RemindersFile
  try {
    $CliAddRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -QuickAdd $CliQuickAddText
    $CliAdd = $CliAddRaw | ConvertFrom-Json
    $CliId = [string]$CliAdd.reminder.id
    $CliData = Read-Json $RemindersFile
    $CliItem = $CliData.reminders | Where-Object { $_.id -eq $CliId } | Select-Object -First 1
    $ExpectedTomorrow = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
    Add-Check 'cli quick add creates reminder' (
      [bool]$CliAdd.ok -and
      $CliItem -and
      $CliItem.title -eq 'QA cli add' -and
      $CliItem.dueDate -eq $ExpectedTomorrow -and
      [int]$CliItem.priority -eq 1 -and
      @($CliItem.tags) -contains 'qa'
    ) (($CliAddRaw | Out-String).Trim())

    $ExpectedUpdateDate = (Get-Date).Date.AddDays(4).ToString('yyyy-MM-dd')
    $CliUpdateRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript `
      -UpdateId $CliId `
      -SetTitle 'QA cli edited' `
      -SetDueDate $ExpectedUpdateDate `
      -SetDueTime '14:30' `
      -SetRepeat 'none' `
      -SetPriority 2 `
      -SetList 'Ops' `
      -SetTags 'qa,edited' `
      -SetNotes 'qa-smoke'
    $CliUpdate = $CliUpdateRaw | ConvertFrom-Json
    Add-Check 'cli update edits reminder' (
      [bool]$CliUpdate.ok -and
      $CliUpdate.changed -and
      $CliUpdate.reminder.title -eq 'QA cli edited' -and
      $CliUpdate.reminder.dueDate -eq $ExpectedUpdateDate -and
      $CliUpdate.reminder.dueTime -eq '14:30' -and
      $CliUpdate.reminder.repeat -eq 'none' -and
      [int]$CliUpdate.reminder.priority -eq 2 -and
      $CliUpdate.reminder.list -eq 'Ops' -and
      @($CliUpdate.reminder.tags) -contains 'edited' -and
      $CliUpdate.reminder.notes -eq 'qa-smoke'
    ) (($CliUpdateRaw | Out-String).Trim())

    $CliCompleteRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -CompleteId $CliId
    $CliComplete = $CliCompleteRaw | ConvertFrom-Json
    Add-Check 'cli complete marks reminder done' (
      [bool]$CliComplete.ok -and
      [bool]$CliComplete.reminder.completed -and
      $CliComplete.reminder.completedAt
    ) (($CliCompleteRaw | Out-String).Trim())

    $CliReopenRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -ReopenId $CliId
    $CliReopen = $CliReopenRaw | ConvertFrom-Json
    Add-Check 'cli reopen marks reminder active' (
      [bool]$CliReopen.ok -and
      -not [bool]$CliReopen.reminder.completed -and
      $CliReopen.reminder.completedAt -eq $null
    ) (($CliReopenRaw | Out-String).Trim())

    $FutureWeeklyDate = (Get-Date).Date.AddDays(4).ToString('yyyy-MM-dd')
    $ExpectedNextWeeklyDate = (Get-Date).Date.AddDays(11).ToString('yyyy-MM-dd')
    $CliWeeklyUpdateRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript `
      -UpdateId $CliId `
      -SetDueDate $FutureWeeklyDate `
      -SetRepeat 'weekly'
    $CliWeeklyUpdate = $CliWeeklyUpdateRaw | ConvertFrom-Json
    $CliWeeklyCompleteRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -CompleteId $CliId
    $CliWeeklyComplete = $CliWeeklyCompleteRaw | ConvertFrom-Json
    Add-Check 'cli recurring future complete rolls next occurrence' (
      [bool]$CliWeeklyUpdate.ok -and
      [bool]$CliWeeklyComplete.ok -and
      -not [bool]$CliWeeklyComplete.reminder.completed -and
      $CliWeeklyComplete.reminder.completedAt -eq $null -and
      $CliWeeklyComplete.reminder.dueDate -eq $ExpectedNextWeeklyDate
    ) (($CliWeeklyCompleteRaw | Out-String).Trim())

    $CliDeleteRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -DeleteId $CliId
    $CliDelete = $CliDeleteRaw | ConvertFrom-Json
    $CliAfterDelete = Read-Json $RemindersFile
    Add-Check 'cli delete removes reminder' (
      [bool]$CliDelete.ok -and
      @($CliAfterDelete.reminders | Where-Object { $_.id -eq $CliId }).Count -eq 0
    ) (($CliDeleteRaw | Out-String).Trim())
  } finally {
    Set-Content -LiteralPath $RemindersFile -Value $CliOriginalJson -Encoding UTF8
    Copy-Item -LiteralPath $RemindersFile -Destination $BackupFile -Force
  }

  if (-not $SkipIntegration) {
    $OriginalJson = Read-TextUtf8 $RemindersFile
    $OriginalState = if (Test-Path -LiteralPath $StateFile) { Read-TextUtf8 $StateFile } else { $null }
    try {
      Stop-WidgetProcess
      $Data = $OriginalJson | ConvertFrom-Json
      $Today = (Get-Date).Date
      $Tomorrow = $Today.AddDays(1)
      $Yesterday = $Today.AddDays(-1)
      $Data.reminders = @($Data.reminders | Where-Object { $_.id -notlike 'qa_health_*' })
      $Data.reminders = @($Data.reminders) + @(
        [pscustomobject]@{
          id = 'qa_health_time'
          title = '08:30 QA health time migration'
          dueDate = $Tomorrow.ToString('yyyy-MM-dd')
          dueTime = $null
          repeat = 'none'
          priority = 4
          tags = @('qa')
          list = 'inbox'
          notes = ''
          notifiedAt = $null
          snoozedUntil = $null
          completed = $false
          completedAt = $null
          clearedAt = $null
          createdAt = (Get-Date).ToString('s')
          updatedAt = (Get-Date).ToString('s')
        },
        [pscustomobject]@{
          id = 'qa_health_weekly'
          title = 'QA health weekly roll'
          dueDate = $Today.AddDays(-7).ToString('yyyy-MM-dd')
          dueTime = $null
          repeat = 'weekly'
          priority = 4
          tags = @('qa')
          list = 'inbox'
          notes = ''
          notifiedAt = $null
          snoozedUntil = $null
          completed = $true
          completedAt = $Yesterday.ToString('s')
          clearedAt = $null
          createdAt = $Today.AddDays(-7).ToString('s')
          updatedAt = $Yesterday.ToString('s')
        },
        [pscustomobject]@{
          id = 'qa_health_complete'
          title = 'QA health complete repeat'
          dueDate = $Today.ToString('yyyy-MM-dd')
          dueTime = '00:01'
          repeat = 'daily'
          priority = 1
          tags = @('qa')
          list = 'inbox'
          notes = ''
          notifiedAt = $null
          snoozedUntil = $null
          completed = $false
          completedAt = $null
          clearedAt = $null
          createdAt = (Get-Date).ToString('s')
          updatedAt = (Get-Date).ToString('s')
        }
      )
      $Data.updatedAt = (Get-Date).ToString('s')
      Write-Json $RemindersFile $Data
      Write-ExpandedWidgetState
      Start-WidgetProcess
      Start-Sleep -Seconds 3

      $After = Read-Json $RemindersFile
      $TimeItem = $After.reminders | Where-Object { $_.id -eq 'qa_health_time' } | Select-Object -First 1
      $WeeklyItem = $After.reminders | Where-Object { $_.id -eq 'qa_health_weekly' } | Select-Object -First 1
      Add-Check 'integration leading time migration' ($TimeItem.dueTime -eq '08:30' -and $TimeItem.title -eq 'QA health time migration') (($TimeItem | ConvertTo-Json -Compress) -as [string])
      Add-Check 'integration repeat weekly roll' (-not [bool]$WeeklyItem.completed -and $WeeklyItem.dueDate -eq $Today.ToString('yyyy-MM-dd')) (($WeeklyItem | ConvertTo-Json -Compress) -as [string])

      $WindowElement = Get-WidgetWindowElement
      $FoundWindow = $null -ne $WindowElement
      Add-Check 'integration window visible' $FoundWindow
      if ($FoundWindow) {
        $WindowBounds = $WindowElement.Current.BoundingRectangle
        if ($WindowBounds.Width -lt 200) {
          $Expanded = Invoke-VisibleButtonByPrefix $WindowElement ("{0} " -f $AlertLabel)
          Add-Check 'integration alert pill opens' $Expanded
          Start-Sleep -Milliseconds 900
          $WindowElement = Get-WidgetWindowElement
        }
        $ClickedDone = Invoke-VisibleButtonByName $WindowElement $DoneLabel
        Add-Check 'integration alert done invokes' $ClickedDone
        Start-Sleep -Milliseconds 900
      }

      $RefreshAddRaw = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $WidgetScript -QuickAdd $CliRefreshText
      $RefreshAdd = $RefreshAddRaw | ConvertFrom-Json
      $RefreshVisible = Wait-VisibleElementByName 'QA live refresh' (($MaxRefreshSeconds + 5) * 1000)
      Add-Check 'integration cli change refreshes foreground' (
        [bool]$RefreshAdd.ok -and
        $RefreshVisible
      ) (($RefreshAddRaw | Out-String).Trim())

      $AfterComplete = Read-Json $RemindersFile
      $CompleteItem = $AfterComplete.reminders | Where-Object { $_.id -eq 'qa_health_complete' } | Select-Object -First 1
      Add-Check 'integration daily complete rolls next day' (
        $CompleteItem -and
        -not [bool]$CompleteItem.completed -and
        $CompleteItem.completedAt -eq $null -and
        $CompleteItem.dueDate -eq $Tomorrow.ToString('yyyy-MM-dd')
      ) (($CompleteItem | ConvertTo-Json -Compress) -as [string])

      Stop-WidgetProcess
      Write-CollapsedWidgetState
      Start-WidgetProcess
      Start-Sleep -Seconds 2
      Start-WidgetProcess
      $SecondLaunchExpanded = Wait-WidgetExpanded 6000
      Add-Check 'integration second launch opens existing widget' $SecondLaunchExpanded

      Stop-WidgetProcess
      Write-CollapsedWidgetState
      Start-WidgetProcess
      Start-Sleep -Seconds 2
      if ($RunMouseIntegration) {
        $DragResult = Test-CollapsedDragPersists
        Add-Check 'integration collapsed drag persists' ([bool]$DragResult.pass) ([string]$DragResult.detail)
      } else {
        Write-Host 'SKIP integration collapsed drag persists (requires -RunMouseIntegration)'
      }

      Stop-WidgetProcess
      Write-CollapsedWidgetState
      Start-WidgetProcess
      Start-Sleep -Seconds 2
      $CollapsedVisual = Test-CollapsedVisual
      Add-Check 'integration collapsed visual clean' ([bool]$CollapsedVisual.pass) ([string]$CollapsedVisual.detail)
    } finally {
      Stop-WidgetProcess
      Set-Content -LiteralPath $RemindersFile -Value $OriginalJson -Encoding UTF8
      Copy-Item -LiteralPath $RemindersFile -Destination $BackupFile -Force
      if ($null -ne $OriginalState) {
        Set-Content -LiteralPath $StateFile -Value $OriginalState -Encoding UTF8
      } elseif (Test-Path -LiteralPath $StateFile) {
        Remove-Item -LiteralPath $StateFile -Force
      }
      Start-WidgetProcess
      Start-Sleep -Seconds 1
    }
  }

  $PostReminders = Read-Json $RemindersFile
  Add-Check 'post integration no qa leftovers' ((Get-QaLeftoverCount $PostReminders) -eq 0)
  if (Test-Path -LiteralPath $BackupFile) {
    $PostBackup = Read-Json $BackupFile
    Add-Check 'post integration backup clean' ((Get-QaLeftoverCount $PostBackup) -eq 0)
  }

  if (-not $SkipIntegration) {
    Add-Check 'widget process running' (@(Get-WidgetProcess).Count -eq 1) ("count={0}" -f @(Get-WidgetProcess).Count)
    Add-Check 'watchdog process running' (@(Get-WatchdogProcess).Count -eq 1) ("count={0}" -f @(Get-WatchdogProcess).Count)
  }
} finally {
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

if ($script:Failures.Count -gt 0) {
  Write-Host ("FAILED {0}/{1}" -f $script:Failures.Count, $script:Checks)
  $script:Failures | ForEach-Object { Write-Host (" - {0}" -f $_) }
  exit 1
}

Write-Host ("OK {0} checks" -f $script:Checks)
