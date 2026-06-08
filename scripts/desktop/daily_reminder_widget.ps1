param(
  [switch]$SelfTest,
  [string]$QuickAdd,
  [switch]$ListJson,
  [string]$DeleteId,
  [string]$UpdateId,
  [string]$SetTitle,
  [string]$SetDueDate,
  [string]$SetDueTime,
  [switch]$ClearDueTime,
  [string]$SetRepeat,
  [int]$SetPriority,
  [string]$SetList,
  [string]$SetTags,
  [string]$SetNotes,
  [string]$CompleteId,
  [string]$ReopenId
)

$ErrorActionPreference = 'Stop'
$script:CliParams = @{} + $PSBoundParameters

$Root = 'D:\ad-ops-workbench'
$StateDir = Join-Path $env:LOCALAPPDATA 'AdOpsDailyReminder'
$StateFile = Join-Path $StateDir 'state.json'
$LogFile = Join-Path $StateDir 'widget.log'
$MaxLogBytes = 262144
$RefreshSeconds = 5
$PomodoroFocusSeconds = 25 * 60
$PomodoroBreakSeconds = 5 * 60
$ItemsFile = Join-Path $Root 'data\desktop_reminder\daily_items.txt'
$RemindersFile = Join-Path $Root 'data\desktop_reminder\reminders.json'
$IconFile = Join-Path $Root 'scripts\desktop\daily_reminder_widget.ico'
$LauncherFile = Join-Path $Root 'scripts\desktop\launch_daily_reminder_widget.vbs'
$WatchdogScriptFile = Join-Path $Root 'scripts\desktop\watch_daily_reminder_widget.ps1'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

$script:TodayDate = (Get-Date).Date
$script:Today = $script:TodayDate.ToString('yyyy-MM-dd')

function Write-WidgetLog([string]$Message) {
  try {
    if (Test-Path -LiteralPath $LogFile) {
      $LogItem = Get-Item -LiteralPath $LogFile
      if ($LogItem.Length -gt $MaxLogBytes) {
        Move-Item -LiteralPath $LogFile -Destination "$LogFile.1" -Force -ErrorAction SilentlyContinue
      }
    }
    $Line = "{0} {1}" -f (Get-Date -Format 's'), $Message
    Add-Content -LiteralPath $LogFile -Value $Line -Encoding UTF8
  } catch {
  }
}
function Invoke-Safe([scriptblock]$Action) {
  try {
    & $Action
  } catch {
    Write-WidgetLog $_.Exception.ToString()
  }
}

trap {
  Write-WidgetLog ("fatal " + $_.Exception.ToString())
  break
}

function T([string]$Value) {
  [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function B([string]$Hex) {
  New-Object System.Windows.Media.SolidColorBrush ([System.Windows.Media.ColorConverter]::ConvertFromString($Hex))
}

function E([string]$Value) {
  [System.Text.RegularExpressions.Regex]::Escape($Value)
}

$Text = @{
  App = '5Lu75Yqh'
  Task = '5Lu75Yqh'
  Inbox = '5pS26ZuG566x'
  Today = '5LuK5aSp'
  Tomorrow = '5piO5aSp'
  Week = '5pyA6L+RN+WkqQ=='
  All = '5YWo6YOo'
  Completed = '5bey5a6M5oiQ'
  Open = '5omT5byA'
  Collapse = '5pS26LW3'
  Exit = '6YCA5Ye6'
  Tags = '5qCH562+'
  Lists = '5riF5Y2V'
  Empty = '5rKh5pyJ5Lu75Yqh'
  NoDate = '5rKh5pyJ5pel5pyf'
  Overdue = '6YC+5pyf'
  Clear = '5riF56m6'
  Alert = '5o+Q6YaS'
  Later = '56iN5ZCO'
  Done = '5a6M5oiQ'
  Save = '5L+d5a2Y'
  Delete = '5Yig6Zmk'
  Cancel = '5Y+W5raI'
  Focus = '5LiT5rOo'
  Break = '5LyR5oGv'
  Detail = '5Lu75Yqh6K+m5oOF'
  Title = '5qCH6aKY'
  Date = '5pel5pyf'
  Time = '5pe26Ze0'
  Priority = '5LyY5YWI57qn'
  Notes = '5aSH5rOo'
  List = '5YiX6KGo'
  Repeat = '6YeN5aSN'
  NoRepeat = '5LiN6YeN5aSN'
  EveryDay = '5q+P5aSp'
  EveryWeek = '5q+P5ZGo'
  EveryMonth = '5q+P5pyI'
  EveryYear = '5q+P5bm0'
  Untitled = '5peg5qCH6aKY'
  Ops = '6L+Q6JCl'
}

$Lex = @{
  Today = T '5LuK5aSp'
  Tomorrow = T '5piO5aSp'
  DayAfter = T '5ZCO5aSp'
  BigDayAfter = T '5aSn5ZCO5aSp'
  Yesterday = T '5pio5aSp'
  NextMonth = T '5LiL5Liq5pyI'
  NextMonthShort = T '5LiL5pyI'
  EndOfMonth = T '5pyI5bqV'
  NextWeek = T '5LiL5ZGo'
  Week = T '5ZGo'
  Weekday = T '5pif5pyf'
  Month = T '5pyI'
  Day = T '5pel'
  DateNumber = T '5Y+3'
  DaysAfter = T '5aSp5ZCO'
  EveryDay = T '5q+P5aSp'
  EachDay = T '5q+P5pel'
  EveryWeek = T '5q+P5ZGo'
  EveryMonth = T '5q+P5pyI'
  EveryYear = T '5q+P5bm0'
  Important = T '6YeN6KaB'
  High = T '6auY'
  Medium = T '5Lit'
  Low = T '5L2O'
  Morning = T '5LiK5Y2I'
  Afternoon = T '5LiL5Y2I'
  Evening = T '5pma5LiK'
  Noon = T '5Lit5Y2I'
  Midnight = T '5YeM5pmo'
  Point = T '54K5'
  Half = T '5Y2K'
  Minute = T '5YiG'
  One = T '5LiA'
  Two = T '5LqM'
  Three = T '5LiJ'
  Four = T '5Zub'
  Five = T '5LqU'
  Six = T '5YWt'
  SunDay = T '5pel'
  SunAlt = T '5aSp'
}

$script:DefaultList = T $Text.Inbox
$script:OpsList = T $Text.Ops

$DefaultItems = @(
  'MDk6MDAg5YWI55yL6Ieq5Yqo5Lqk5o6l77ya5LuK5pelIGhhbmRvZmYgLyBkYXNoYm9hcmQgLyBLUEkgY2hlY2twb2ludCDmmK/lkKblt7Lnu4/nlJ/miJDvvIznvLrmlofku7blhYjooaXmlbDmja7jgII=',
  '5LiJ57O757uf55m75b2V56Gu6K6k77ya5bm/5ZGK5ZCO5Y+w44CBc2VsbGVyaW52ZW50b3J544CB6YCJ5ZOB6YO96KaB5Y+v55So77yb5LiN6KaB5Y+q55yL6aG16Z2i77yM5byC5bi45YWI5oGi5aSN5Y2P5L2c5rWP6KeI5Zmo44CC',
  '5pWw5o2u5rKJ5reA77ya6ZSA5ZSu5qC45b+D44CB5bqT5a2Y44CB5bm/5ZGKIDMwIOWkqeWvvOWHuuOAgW1hbmlmZXN0IC8gc25hcHNob3QgLyBsZWFybmluZyDmmK/lkKblrozmlbTjgII=',
  '6aOO6Zmp5LyY5YWI77ya5YWI5riF5L2O5pWI6K+NL+WFs+mUruivje+8jOWGjeeci+i2hemihOeul++8jOWGjeeci+mrmOmAgOi0p+OAgeS9juWIqea2puOAgeiAgeWTgeS4i+a7keOAgg==',
  '5py65Lya5oGi5aSN77ya5Yiw6LSn5bm/5ZGK5oGi5aSN44CB5paw5ZOB5ZCv5Yqo44CB5a2j6IqCL+iKguawlOeql+WPo+OAgee8uiBTUC9TQi9TQlYg6KaG55uW44CC',
  'U0tVIOWkjeebmO+8muaMiSAzLzcvMzAg5aSp5pa55ZCR5Yik5pat77yM57uZ5q+P5LiqIFNLVSDlvZLliLAgYWN0aW9uIC8gcmV2aWV3IC8gbm8tYWN0aW9u44CC',
  '5omn6KGM6Zet546v77yac2NoZW1hIGRyeS1ydW4g6YCa6L+H5ZCO5YaN5omn6KGM77yb5omn6KGM5ZCO5b+F6aG75Zue5p+l6JC95Zyw44CB6LCD5pW05pel5b+X44CB5bqT5a2Y5aSH5rOo44CC',
  '57uP6JCl57uT5p6c77ya6ZSA5ZSu6aKd44CB6ZSA6YeP44CB5YeA5Yip546H44CB6YCA6LSn546H44CBQUNPU+OAgeW5v+WRiuWNoOavlOimgeS4gOi1t+eci++8jOS4jeeUqOWKqOS9nOaVsOmHj+aKpeWWnOOAgg==',
  '5a+55aSW5LqL6aG577ya5byA5Y+R6K+J5rGC44CB5LyB5b6u5aGr6KGo44CB6KaB6L2s5Y+R55qE6L+Q6JCl5Zue5aSN77yM6L6T5Ye655+t5Y+l5bm25YaZ5YWl6K6w5b2V44CC'
) | ForEach-Object { T $_ }

function New-DateOrNull([int]$Year, [int]$Month, [int]$Day) {
  try {
    return (Get-Date -Year $Year -Month $Month -Day $Day -Hour 0 -Minute 0 -Second 0 -Millisecond 0)
  } catch {
    return $null
  }
}

function Format-DateKey($Date) {
  if (-not $Date) {
    return $null
  }
  ([datetime]$Date).ToString('yyyy-MM-dd')
}

function Remove-MatchText([ref]$TextRef, $Match) {
  if (-not $Match -or -not $Match.Success) {
    return
  }
  $Value = $TextRef.Value
  $TextRef.Value = $Value.Substring(0, $Match.Index) + ' ' + $Value.Substring($Match.Index + $Match.Length)
}

function Remove-Literal([ref]$TextRef, [string]$Token) {
  if (-not $Token) {
    return
  }
  $Pattern = E $Token
  $TextRef.Value = [System.Text.RegularExpressions.Regex]::Replace(
    $TextRef.Value,
    $Pattern,
    ' ',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
}

function Clean-TaskText([string]$Value) {
  $Clean = [System.Text.RegularExpressions.Regex]::Replace($Value.Trim(), '\s+', ' ')
  if ($Clean) {
    return $Clean
  }
  return (T $Text.Untitled)
}

function Get-IsoDay([datetime]$Date) {
  $Raw = [int]$Date.DayOfWeek
  if ($Raw -eq 0) {
    return 7
  }
  return $Raw
}

function Get-WeekdayDate([int]$TargetIsoDay, [bool]$NextCalendarWeek) {
  $Today = (Get-Date).Date
  if ($NextCalendarWeek) {
    $ThisMonday = $Today.AddDays(1 - (Get-IsoDay $Today))
    return $ThisMonday.AddDays(7 + $TargetIsoDay - 1)
  }
  $Delta = $TargetIsoDay - (Get-IsoDay $Today)
  if ($Delta -lt 0) {
    $Delta += 7
  }
  return $Today.AddDays($Delta)
}

function Get-LastDayOfMonth([datetime]$Date) {
  $First = Get-Date -Year $Date.Year -Month $Date.Month -Day 1 -Hour 0 -Minute 0 -Second 0 -Millisecond 0
  return $First.AddMonths(1).AddDays(-1)
}

function Get-NextMonthDate([int]$PreferredDay) {
  $Base = (Get-Date).Date.AddMonths(1)
  $Day = [Math]::Min($PreferredDay, [DateTime]::DaysInMonth($Base.Year, $Base.Month))
  return (Get-Date -Year $Base.Year -Month $Base.Month -Day $Day -Hour 0 -Minute 0 -Second 0 -Millisecond 0)
}

function Parse-TimeToken([ref]$WorkingRef) {
  $TextValue = $WorkingRef.Value
  $FullWidthColon = [string][char]0xFF1A
  $ClockPattern = '(?<!\d)([01]?\d|2[0-3])[:' + (E $FullWidthColon) + ']([0-5]\d)(?!\d)'
  $Clock = [regex]::Match($TextValue, $ClockPattern)
  if ($Clock.Success) {
    $Hour = [int]$Clock.Groups[1].Value
    $Minute = [int]$Clock.Groups[2].Value
    Remove-MatchText $WorkingRef $Clock
    return ('{0:00}:{1:00}' -f $Hour, $Minute)
  }

  $PeriodPattern = (E $Lex.Morning) + '|' + (E $Lex.Afternoon) + '|' + (E $Lex.Evening) + '|' + (E $Lex.Noon) + '|' + (E $Lex.Midnight)
  $Point = E $Lex.Point
  $Half = E $Lex.Half
  $MinuteWord = E $Lex.Minute
  $Pattern = '(?<period>' + $PeriodPattern + ')?\s*(?<hour>\d{1,2})\s*' + $Point + '(?:(?<half>' + $Half + ')|(?<minute>\d{1,2})\s*' + $MinuteWord + '?)?'
  $Match = [regex]::Match($TextValue, $Pattern)
  if (-not $Match.Success) {
    return $null
  }

  $Hour = [int]$Match.Groups['hour'].Value
  $Minute = 0
  if ($Match.Groups['half'].Success) {
    $Minute = 30
  } elseif ($Match.Groups['minute'].Success) {
    $Minute = [int]$Match.Groups['minute'].Value
  }

  $Period = $Match.Groups['period'].Value
  if (($Period -eq $Lex.Afternoon -or $Period -eq $Lex.Evening) -and $Hour -lt 12) {
    $Hour += 12
  }
  if ($Period -eq $Lex.Noon -and $Hour -lt 11) {
    $Hour += 12
  }
  if ($Period -eq $Lex.Midnight -and $Hour -eq 12) {
    $Hour = 0
  }
  if ($Hour -gt 23 -or $Minute -gt 59) {
    return $null
  }

  Remove-MatchText $WorkingRef $Match
  return ('{0:00}:{1:00}' -f $Hour, $Minute)
}

function Extract-LeadingTime([string]$Title) {
  $FullWidthColon = [string][char]0xFF1A
  $Pattern = '^\s*([01]?\d|2[0-3])[:' + (E $FullWidthColon) + ']([0-5]\d)\s+'
  $Match = [regex]::Match($Title, $Pattern)
  if (-not $Match.Success) {
    return $null
  }
  [pscustomobject]@{
    time = ('{0:00}:{1:00}' -f [int]$Match.Groups[1].Value, [int]$Match.Groups[2].Value)
    title = $Title.Substring($Match.Length).Trim()
  }
}

function Parse-DateToken([ref]$WorkingRef) {
  $TextValue = $WorkingRef.Value
  $Today = (Get-Date).Date
  $ThisYear = $Today.Year
  $MonthWord = E $Lex.Month
  $DayWord = E $Lex.Day
  $DateNumberWord = E $Lex.DateNumber
  $DaysAfterWord = E $Lex.DaysAfter

  $Match = [regex]::Match($TextValue, '(?<!\d)(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)')
  if ($Match.Success) {
    $Date = New-DateOrNull ([int]$Match.Groups[1].Value) ([int]$Match.Groups[2].Value) ([int]$Match.Groups[3].Value)
    if ($Date) {
      Remove-MatchText $WorkingRef $Match
      return Format-DateKey $Date
    }
  }

  $NextMonthPattern = '(?:' + (E $Lex.NextMonth) + '|' + (E $Lex.NextMonthShort) + ')\s*(\d{1,2})\s*(?:' + $DayWord + '|' + $DateNumberWord + ')?'
  $Match = [regex]::Match($TextValue, $NextMonthPattern)
  if ($Match.Success -and $Match.Groups[1].Success) {
    $Date = Get-NextMonthDate ([int]$Match.Groups[1].Value)
    Remove-MatchText $WorkingRef $Match
    return Format-DateKey $Date
  }

  $Match = [regex]::Match($TextValue, '(?<!\d)(\d{1,2})[-/](\d{1,2})(?!\d)')
  if ($Match.Success) {
    $Date = New-DateOrNull $ThisYear ([int]$Match.Groups[1].Value) ([int]$Match.Groups[2].Value)
    if ($Date -and $Date -lt $Today) {
      $Date = New-DateOrNull ($ThisYear + 1) ([int]$Match.Groups[1].Value) ([int]$Match.Groups[2].Value)
    }
    if ($Date) {
      Remove-MatchText $WorkingRef $Match
      return Format-DateKey $Date
    }
  }

  $Pattern = '(?<!\d)(\d{1,2})\s*' + $MonthWord + '\s*(\d{1,2})\s*(?:' + $DayWord + '|' + $DateNumberWord + ')?'
  $Match = [regex]::Match($TextValue, $Pattern)
  if ($Match.Success) {
    $Date = New-DateOrNull $ThisYear ([int]$Match.Groups[1].Value) ([int]$Match.Groups[2].Value)
    if ($Date -and $Date -lt $Today) {
      $Date = New-DateOrNull ($ThisYear + 1) ([int]$Match.Groups[1].Value) ([int]$Match.Groups[2].Value)
    }
    if ($Date) {
      Remove-MatchText $WorkingRef $Match
      return Format-DateKey $Date
    }
  }

  $Pattern = '(?<!\d)(\d{1,3})\s*' + $DaysAfterWord
  $Match = [regex]::Match($TextValue, $Pattern)
  if ($Match.Success) {
    $Date = $Today.AddDays([int]$Match.Groups[1].Value)
    Remove-MatchText $WorkingRef $Match
    return Format-DateKey $Date
  }

  $Weekdays = @(
    @{ Label = $Lex.One; Iso = 1 },
    @{ Label = $Lex.Two; Iso = 2 },
    @{ Label = $Lex.Three; Iso = 3 },
    @{ Label = $Lex.Four; Iso = 4 },
    @{ Label = $Lex.Five; Iso = 5 },
    @{ Label = $Lex.Six; Iso = 6 },
    @{ Label = $Lex.SunDay; Iso = 7 },
    @{ Label = $Lex.SunAlt; Iso = 7 }
  )
  foreach ($Weekday in $Weekdays) {
    $Token = $Lex.NextWeek + $Weekday.Label
    if ($TextValue.Contains($Token)) {
      Remove-Literal $WorkingRef $Token
      return Format-DateKey (Get-WeekdayDate $Weekday.Iso $true)
    }
    $Token = $Lex.NextWeek + $Lex.Weekday + $Weekday.Label
    if ($TextValue.Contains($Token)) {
      Remove-Literal $WorkingRef $Token
      return Format-DateKey (Get-WeekdayDate $Weekday.Iso $true)
    }
  }
  foreach ($Weekday in $Weekdays) {
    $Token = $Lex.Week + $Weekday.Label
    if ($TextValue.Contains($Token)) {
      Remove-Literal $WorkingRef $Token
      return Format-DateKey (Get-WeekdayDate $Weekday.Iso $false)
    }
    $Token = $Lex.Weekday + $Weekday.Label
    if ($TextValue.Contains($Token)) {
      Remove-Literal $WorkingRef $Token
      return Format-DateKey (Get-WeekdayDate $Weekday.Iso $false)
    }
  }

  $Relative = @(
    @{ Token = $Lex.BigDayAfter; Days = 3 },
    @{ Token = $Lex.DayAfter; Days = 2 },
    @{ Token = $Lex.Tomorrow; Days = 1 },
    @{ Token = $Lex.Today; Days = 0 },
    @{ Token = $Lex.Yesterday; Days = -1 }
  )
  foreach ($Item in $Relative) {
    if ($TextValue.Contains($Item.Token)) {
      Remove-Literal $WorkingRef $Item.Token
      return Format-DateKey ($Today.AddDays([int]$Item.Days))
    }
  }

  if ($TextValue.Contains($Lex.EndOfMonth)) {
    Remove-Literal $WorkingRef $Lex.EndOfMonth
    return Format-DateKey (Get-LastDayOfMonth $Today)
  }
  if ($TextValue.Contains($Lex.NextMonth)) {
    Remove-Literal $WorkingRef $Lex.NextMonth
    return Format-DateKey (Get-NextMonthDate 1)
  }
  if ($TextValue.Contains($Lex.NextMonthShort)) {
    Remove-Literal $WorkingRef $Lex.NextMonthShort
    return Format-DateKey (Get-NextMonthDate 1)
  }
  if ($TextValue.Contains($Lex.NextWeek)) {
    Remove-Literal $WorkingRef $Lex.NextWeek
    return Format-DateKey ($Today.AddDays(7))
  }

  $Pattern = '(?<!\d)(\d{1,2})\s*(?:' + $DayWord + '|' + $DateNumberWord + ')(?!\d)'
  $Match = [regex]::Match($TextValue, $Pattern)
  if ($Match.Success) {
    $Date = New-DateOrNull $ThisYear $Today.Month ([int]$Match.Groups[1].Value)
    if ($Date -and $Date -lt $Today) {
      $NextMonth = $Today.AddMonths(1)
      $Day = [Math]::Min([int]$Match.Groups[1].Value, [DateTime]::DaysInMonth($NextMonth.Year, $NextMonth.Month))
      $Date = New-DateOrNull $NextMonth.Year $NextMonth.Month $Day
    }
    if ($Date) {
      Remove-MatchText $WorkingRef $Match
      return Format-DateKey $Date
    }
  }

  return $null
}

function Parse-QuickAdd([string]$Raw) {
  $Working = [string]$Raw
  $Priority = 4
  $Tags = @()
  $ListName = $script:DefaultList
  $Repeat = 'none'

  $PriorityMatch = [regex]::Match($Working, '(?i)(^|\s)(p[1-4]|![1-4])(?=\s|$)')
  if ($PriorityMatch.Success) {
    $Token = $PriorityMatch.Groups[2].Value.ToLowerInvariant()
    $Priority = [int]($Token -replace '[^1-4]', '')
    $Working = [System.Text.RegularExpressions.Regex]::Replace($Working, '(?i)(^|\s)(p[1-4]|![1-4])(?=\s|$)', ' ')
  }
  if ($Working.Contains($Lex.Important) -or $Working.Contains($Lex.High)) {
    $Priority = 1
    $Working = $Working.Replace($Lex.Important, ' ').Replace($Lex.High, ' ')
  } elseif ($Working.Contains($Lex.Medium)) {
    $Priority = 2
    $Working = $Working.Replace($Lex.Medium, ' ')
  } elseif ($Working.Contains($Lex.Low)) {
    $Priority = 3
    $Working = $Working.Replace($Lex.Low, ' ')
  }

  $TagMatches = [regex]::Matches($Working, '(?<!\S)#([^\s#@~]+)')
  foreach ($TagMatch in $TagMatches) {
    $Tags += $TagMatch.Groups[1].Value
  }
  $Working = [System.Text.RegularExpressions.Regex]::Replace($Working, '(?<!\S)#[^\s#@~]+', ' ')

  $ListMatch = [regex]::Match($Working, '(?<!\S)@([^\s#@~]+)')
  if ($ListMatch.Success) {
    $ListName = $ListMatch.Groups[1].Value
    $Working = [System.Text.RegularExpressions.Regex]::Replace($Working, '(?<!\S)@[^\s#@~]+', ' ')
  }

  $RepeatMap = @(
    @{ Token = $Lex.EveryDay; Value = 'daily' },
    @{ Token = $Lex.EachDay; Value = 'daily' },
    @{ Token = $Lex.EveryWeek; Value = 'weekly' },
    @{ Token = $Lex.EveryMonth; Value = 'monthly' },
    @{ Token = $Lex.EveryYear; Value = 'yearly' }
  )
  foreach ($Entry in $RepeatMap) {
    if ($Working.Contains($Entry.Token)) {
      $Repeat = $Entry.Value
      $Working = $Working.Replace($Entry.Token, ' ')
      break
    }
  }

  $WorkingRef = [ref]$Working
  $DueTime = Parse-TimeToken $WorkingRef
  $Working = $WorkingRef.Value
  $WorkingRef = [ref]$Working
  $DueDate = Parse-DateToken $WorkingRef
  $Working = $WorkingRef.Value

  if ($DueTime -and -not $DueDate) {
    $DueDate = (Get-Date).Date.ToString('yyyy-MM-dd')
  }

  [pscustomobject]@{
    title = Clean-TaskText $Working
    dueDate = $DueDate
    dueTime = $DueTime
    repeat = $Repeat
    priority = $Priority
    tags = @($Tags | Where-Object { $_ } | Select-Object -Unique)
    list = $ListName
  }
}

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

function Ensure-Property($Object, [string]$Name, $Value) {
  if (-not $Object.PSObject.Properties[$Name]) {
    $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    return $true
  }
  return $false
}

function Get-SeedTitles {
  if (Test-Path -LiteralPath $ItemsFile) {
    $Lines = [System.IO.File]::ReadAllLines($ItemsFile, [System.Text.Encoding]::UTF8)
    $Titles = @(
      $Lines |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }
    )
    if ($Titles.Count -gt 0) {
      return $Titles
    }
  }
  return $DefaultItems
}

function New-Reminder(
  [string]$Title,
  [string]$DueDate,
  [string]$Repeat,
  [int]$Priority,
  [string[]]$Tags,
  [string]$List,
  [string]$DueTime
) {
  [pscustomobject]@{
    id = [guid]::NewGuid().ToString('N')
    title = $Title
    dueDate = $DueDate
    dueTime = $DueTime
    repeat = $Repeat
    priority = $Priority
    tags = @($Tags)
    list = $List
    notes = ''
    notifiedAt = $null
    snoozedUntil = $null
    completed = $false
    completedAt = $null
    clearedAt = $null
    createdAt = (Get-Date).ToString('s')
    updatedAt = (Get-Date).ToString('s')
  }
}

function Write-JsonFileAtomic($Path, $Object, [int]$Depth, [switch]$Backup) {
  $Dir = Split-Path -Parent $Path
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  $TempPath = Join-Path $Dir ('.{0}.{1}.tmp' -f (Split-Path -Leaf $Path), [guid]::NewGuid().ToString('N'))
  try {
    $Object | ConvertTo-Json -Depth $Depth | Set-Content -LiteralPath $TempPath -Encoding UTF8
    if ($Backup -and (Test-Path -LiteralPath $Path)) {
      Copy-Item -LiteralPath $Path -Destination "$Path.bak" -Force -ErrorAction SilentlyContinue
    }
    Move-Item -LiteralPath $TempPath -Destination $Path -Force
  } catch {
    Remove-Item -LiteralPath $TempPath -Force -ErrorAction SilentlyContinue
    throw
  }
}

function Save-Reminders {
  $Payload = [ordered]@{
    version = 2
    updatedAt = (Get-Date).ToString('s')
    reminders = @($script:Reminders)
  }
  Write-JsonFileAtomic $RemindersFile $Payload 8 -Backup
  $script:LastRemindersWriteUtc = (Get-Item -LiteralPath $RemindersFile).LastWriteTimeUtc
}

function Get-NextRepeatDate([datetime]$BaseDate, [string]$Repeat) {
  if ($Repeat -eq 'daily') { return $BaseDate.AddDays(1) }
  if ($Repeat -eq 'weekly') { return $BaseDate.AddDays(7) }
  if ($Repeat -eq 'monthly') { return $BaseDate.AddMonths(1) }
  if ($Repeat -eq 'yearly') { return $BaseDate.AddYears(1) }
  return $null
}

function Get-NextRepeatDueDate($Item, [switch]$AdvanceCurrent) {
  $Repeat = [string]$Item.repeat
  if (@('daily', 'weekly', 'monthly', 'yearly') -notcontains $Repeat) {
    return $null
  }
  try {
    $NextDate = ([datetime]$Item.dueDate).Date
  } catch {
    $NextDate = $script:TodayDate
  }
  try {
    $CompletedDay = ([datetime]$Item.completedAt).Date
  } catch {
    $CompletedDay = $script:TodayDate
  }
  if ($AdvanceCurrent) {
    $NextDate = Get-NextRepeatDate $NextDate $Repeat
    if (-not $NextDate) {
      return $null
    }
  }
  while ($NextDate -le $CompletedDay -or $NextDate -lt $script:TodayDate) {
    $NextDate = Get-NextRepeatDate $NextDate $Repeat
    if (-not $NextDate) {
      return $null
    }
  }
  return $NextDate.ToString('yyyy-MM-dd')
}

function Normalize-Reminder($Item) {
  $Changed = $false
  $Changed = (Ensure-Property $Item 'id' ([guid]::NewGuid().ToString('N'))) -or $Changed
  $Changed = (Ensure-Property $Item 'title' '') -or $Changed
  $Changed = (Ensure-Property $Item 'dueDate' $script:Today) -or $Changed
  $Changed = (Ensure-Property $Item 'dueTime' $null) -or $Changed
  $Changed = (Ensure-Property $Item 'repeat' 'none') -or $Changed
  $Changed = (Ensure-Property $Item 'priority' 4) -or $Changed
  $Changed = (Ensure-Property $Item 'tags' @()) -or $Changed
  if (-not $Item.PSObject.Properties['list']) {
    if ($Item.repeat -eq 'daily') {
      $Item | Add-Member -MemberType NoteProperty -Name 'list' -Value $script:OpsList
    } else {
      $Item | Add-Member -MemberType NoteProperty -Name 'list' -Value $script:DefaultList
    }
    $Changed = $true
  }
  $Changed = (Ensure-Property $Item 'notes' '') -or $Changed
  $Changed = (Ensure-Property $Item 'notifiedAt' $null) -or $Changed
  $Changed = (Ensure-Property $Item 'snoozedUntil' $null) -or $Changed
  $Changed = (Ensure-Property $Item 'completed' $false) -or $Changed
  $Changed = (Ensure-Property $Item 'completedAt' $null) -or $Changed
  $Changed = (Ensure-Property $Item 'clearedAt' $null) -or $Changed
  $Changed = (Ensure-Property $Item 'createdAt' (Get-Date).ToString('s')) -or $Changed
  $Changed = (Ensure-Property $Item 'updatedAt' (Get-Date).ToString('s')) -or $Changed

  if ($null -eq $Item.tags) {
    $Item.tags = @()
    $Changed = $true
  } elseif ($Item.tags -is [string]) {
    $Item.tags = @($Item.tags)
    $Changed = $true
  } else {
    $Item.tags = @($Item.tags)
  }

  if (-not $Item.list) {
    if ($Item.repeat -eq 'daily') {
      $Item.list = $script:OpsList
    } else {
      $Item.list = $script:DefaultList
    }
    $Changed = $true
  }

  $Priority = 4
  if ([int]::TryParse([string]$Item.priority, [ref]$Priority)) {
    if ($Priority -lt 1 -or $Priority -gt 4) {
      $Priority = 4
    }
  } else {
    $Priority = 4
  }
  if ([string]$Item.priority -ne [string]$Priority) {
    $Item.priority = $Priority
    $Changed = $true
  }

  if (-not $Item.dueTime) {
    $LeadingTime = Extract-LeadingTime ([string]$Item.title)
    if ($LeadingTime -and $LeadingTime.time) {
      $Item.dueTime = $LeadingTime.time
      if ($LeadingTime.title) {
        $Item.title = $LeadingTime.title
      }
      $Item.updatedAt = (Get-Date).ToString('s')
      $Changed = $true
    }
  }

  if (@('daily', 'weekly', 'monthly', 'yearly') -contains [string]$Item.repeat -and [bool]$Item.completed -and $Item.completedAt) {
    try {
      $CompletedDay = ([datetime]$Item.completedAt).Date
      if ($CompletedDay -lt $script:TodayDate) {
        $NextDueDate = Get-NextRepeatDueDate $Item
        $Item.completed = $false
        $Item.completedAt = $null
        $Item.clearedAt = $null
        $Item.notifiedAt = $null
        $Item.snoozedUntil = $null
        if ($NextDueDate) {
          $Item.dueDate = $NextDueDate
        }
        $Item.updatedAt = (Get-Date).ToString('s')
        $Changed = $true
      }
    } catch {
    }
  }

  if (@('daily', 'weekly', 'monthly', 'yearly') -contains [string]$Item.repeat -and -not [bool]$Item.completed) {
    try {
      $DueDay = ([datetime]$Item.dueDate).Date
      if ($DueDay -lt $script:TodayDate) {
        while ($DueDay -lt $script:TodayDate) {
          $DueDay = Get-NextRepeatDate $DueDay ([string]$Item.repeat)
          if (-not $DueDay) {
            break
          }
        }
        if ($DueDay) {
          $Item.dueDate = $DueDay.ToString('yyyy-MM-dd')
          $Item.notifiedAt = $null
          $Item.snoozedUntil = $null
          $Item.updatedAt = (Get-Date).ToString('s')
          $Changed = $true
        }
      }
    } catch {
    }
  }

  return $Changed
}

function Load-Reminders {
  $Dir = Split-Path -Parent $RemindersFile
  New-Item -ItemType Directory -Force -Path $Dir | Out-Null

  if (-not (Test-Path -LiteralPath $RemindersFile)) {
    $script:Reminders = @(Get-SeedTitles | ForEach-Object {
      New-Reminder $_ $script:Today 'daily' 2 @($script:OpsList) $script:OpsList $null
    })
    Save-Reminders
    return
  }

  try {
    $Raw = [System.IO.File]::ReadAllText($RemindersFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    $script:Reminders = @($Raw.reminders)
  } catch {
    if ($script:Reminders -and @($script:Reminders).Count -gt 0) {
      return
    }
    $Backup = "$RemindersFile.bad_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
    Copy-Item -LiteralPath $RemindersFile -Destination $Backup -Force -ErrorAction SilentlyContinue
    $script:Reminders = @(Get-SeedTitles | ForEach-Object {
      New-Reminder $_ $script:Today 'daily' 2 @($script:OpsList) $script:OpsList $null
    })
    Save-Reminders
    return
  }

  if (@($script:Reminders).Count -eq 0) {
    $script:Reminders = @(Get-SeedTitles | ForEach-Object {
      New-Reminder $_ $script:Today 'daily' 2 @($script:OpsList) $script:OpsList $null
    })
    Save-Reminders
    return
  }

  $Changed = $false
  foreach ($Item in @($script:Reminders)) {
    $Changed = (Normalize-Reminder $Item) -or $Changed
  }
  if ($Changed) {
    Save-Reminders
  }
  if (Test-Path -LiteralPath $RemindersFile) {
    $script:LastRemindersWriteUtc = (Get-Item -LiteralPath $RemindersFile).LastWriteTimeUtc
  }
}

function Sync-ExternalRemindersIfChanged {
  if (-not (Test-Path -LiteralPath $RemindersFile)) {
    return $false
  }
  try {
    $WriteUtc = (Get-Item -LiteralPath $RemindersFile).LastWriteTimeUtc
    if ($script:LastRemindersWriteUtc -and $WriteUtc -gt $script:LastRemindersWriteUtc.AddMilliseconds(1)) {
      Load-Reminders
      return $true
    }
  } catch {
    Write-WidgetLog $_.Exception.ToString()
  }
  return $false
}

function Write-CliJson($Object) {
  $Object | ConvertTo-Json -Depth 8
}

function Find-CliReminder([string]$Id) {
  @($script:Reminders | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
}

function Test-DateKey([string]$Value) {
  if (-not $Value) {
    return $false
  }
  if ($Value -eq 'none' -or $Value -eq 'null') {
    return $true
  }
  try {
    [datetime]::ParseExact($Value, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Test-TimeKey([string]$Value) {
  if (-not $Value) {
    return $false
  }
  if ($Value -eq 'none' -or $Value -eq 'null') {
    return $true
  }
  try {
    [datetime]::ParseExact($Value, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture) | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Set-CliReminderCompleted($Item) {
  $Now = Get-Date
  $Item.completedAt = $Now.ToString('s')
  if (@('daily', 'weekly', 'monthly', 'yearly') -contains [string]$Item.repeat) {
    $NextDueDate = Get-NextRepeatDueDate $Item -AdvanceCurrent
    $Item.completed = $false
    $Item.completedAt = $null
    $Item.clearedAt = $null
    $Item.notifiedAt = $null
    $Item.snoozedUntil = $null
    if ($NextDueDate) {
      $Item.dueDate = $NextDueDate
    }
  } else {
    $Item.completed = $true
    $Item.clearedAt = $null
    $Item.snoozedUntil = $null
  }
  $Item.updatedAt = (Get-Date).ToString('s')
}

function Invoke-CliCommand {
  if (-not ($QuickAdd -or $ListJson -or $DeleteId -or $UpdateId -or $CompleteId -or $ReopenId)) {
    return
  }

  Load-Reminders

  if ($QuickAdd) {
    $Parsed = Parse-QuickAdd $QuickAdd
    $DueDate = if ($Parsed.dueDate) { [string]$Parsed.dueDate } else { $script:Today }
    $Reminder = New-Reminder ([string]$Parsed.title) $DueDate ([string]$Parsed.repeat) ([int]$Parsed.priority) @($Parsed.tags) ([string]$Parsed.list) ([string]$Parsed.dueTime)
    $script:Reminders = @($script:Reminders) + $Reminder
    Save-Reminders
    Write-CliJson ([pscustomobject]@{
      ok = $true
      action = 'quickAdd'
      reminder = $Reminder
    })
    return
  }

  if ($UpdateId) {
    $Item = Find-CliReminder $UpdateId
    if (-not $Item) {
      Write-CliJson ([pscustomobject]@{ ok = $false; action = 'update'; id = $UpdateId; error = 'not_found' })
      return
    }

    $Changed = $false
    if ($script:CliParams.ContainsKey('SetTitle')) {
      $Item[0].title = Clean-TaskText $SetTitle
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetDueDate')) {
      if (-not (Test-DateKey $SetDueDate)) {
        Write-CliJson ([pscustomobject]@{ ok = $false; action = 'update'; id = $UpdateId; error = 'bad_due_date' })
        return
      }
      if ($SetDueDate -eq 'none' -or $SetDueDate -eq 'null') {
        $Item[0].dueDate = $null
      } else {
        $Item[0].dueDate = $SetDueDate
      }
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetDueTime')) {
      if (-not (Test-TimeKey $SetDueTime)) {
        Write-CliJson ([pscustomobject]@{ ok = $false; action = 'update'; id = $UpdateId; error = 'bad_due_time' })
        return
      }
      if ($SetDueTime -eq 'none' -or $SetDueTime -eq 'null') {
        $Item[0].dueTime = $null
      } else {
        $Item[0].dueTime = $SetDueTime
      }
      $Changed = $true
    }
    if ($ClearDueTime) {
      $Item[0].dueTime = $null
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetRepeat')) {
      if (@('none', 'daily', 'weekly', 'monthly', 'yearly') -notcontains $SetRepeat) {
        Write-CliJson ([pscustomobject]@{ ok = $false; action = 'update'; id = $UpdateId; error = 'bad_repeat' })
        return
      }
      $Item[0].repeat = $SetRepeat
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetPriority')) {
      if ($SetPriority -lt 1 -or $SetPriority -gt 4) {
        Write-CliJson ([pscustomobject]@{ ok = $false; action = 'update'; id = $UpdateId; error = 'bad_priority' })
        return
      }
      $Item[0].priority = $SetPriority
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetList')) {
      $Item[0].list = Clean-TaskText $SetList
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetTags')) {
      $Tags = @(
        $SetTags -split ',' |
          ForEach-Object { $_.Trim() } |
          Where-Object { $_ } |
          Select-Object -Unique
      )
      $Item[0].tags = @($Tags)
      $Changed = $true
    }
    if ($script:CliParams.ContainsKey('SetNotes')) {
      $Item[0].notes = [string]$SetNotes
      $Changed = $true
    }

    if ($Changed) {
      $Item[0].updatedAt = (Get-Date).ToString('s')
      Save-Reminders
    }
    Write-CliJson ([pscustomobject]@{
      ok = $true
      action = 'update'
      changed = $Changed
      reminder = $Item[0]
    })
    return
  }

  if ($CompleteId) {
    $Item = Find-CliReminder $CompleteId
    if (-not $Item) {
      Write-CliJson ([pscustomobject]@{ ok = $false; action = 'complete'; id = $CompleteId; error = 'not_found' })
      return
    }
    Set-CliReminderCompleted $Item[0]
    Save-Reminders
    Write-CliJson ([pscustomobject]@{ ok = $true; action = 'complete'; reminder = $Item[0] })
    return
  }

  if ($ReopenId) {
    $Item = Find-CliReminder $ReopenId
    if (-not $Item) {
      Write-CliJson ([pscustomobject]@{ ok = $false; action = 'reopen'; id = $ReopenId; error = 'not_found' })
      return
    }
    $Item[0].completed = $false
    $Item[0].completedAt = $null
    $Item[0].clearedAt = $null
    $Item[0].updatedAt = (Get-Date).ToString('s')
    Save-Reminders
    Write-CliJson ([pscustomobject]@{ ok = $true; action = 'reopen'; reminder = $Item[0] })
    return
  }

  if ($DeleteId) {
    $Before = @($script:Reminders).Count
    $script:Reminders = @($script:Reminders | Where-Object { $_.id -ne $DeleteId })
    $Deleted = $Before -ne @($script:Reminders).Count
    if ($Deleted) {
      Save-Reminders
    }
    Write-CliJson ([pscustomobject]@{
      ok = $Deleted
      action = 'delete'
      id = $DeleteId
    })
    return
  }

  if ($ListJson) {
    Write-CliJson ([pscustomobject]@{
      ok = $true
      action = 'list'
      count = @($script:Reminders).Count
      reminders = @($script:Reminders)
    })
    return
  }

  return
}

if ($SelfTest) {
  $Tests = @(
    (T '5piO5aSpIHAxICPlub/lkYog5rWL6K+V5LqL6aG5'),
    (T '5ZCO5aSpIOa1i+ivleS6i+mhuQ=='),
    (T '5LiL5Liq5pyIIOa1i+ivleS6i+mhuQ=='),
    (T '5LiL5ZGo5LiAIOS4i+WNiDPngrkgI+WkjeebmCDmtYvor5Xkuovpobk='),
    (T 'Ni8xNSBwMiBA6L+Q6JClIOa1i+ivleS6i+mhuQ==')
  )
  $Tests | ForEach-Object { Parse-QuickAdd $_ } | ConvertTo-Json -Depth 6
  return
}

if ($QuickAdd -or $ListJson -or $DeleteId -or $UpdateId -or $CompleteId -or $ReopenId) {
  Invoke-CliCommand
  return
}

Write-WidgetLog ("ui start pid={0}" -f $PID)

function Save-State {
  if (-not $script:Window) {
    return
  }
  $Payload = [ordered]@{
    currentView = $script:CurrentView
    collapsed = [bool]$script:IsCollapsed
    exitRequested = [bool]$script:ExitRequested
    location = [ordered]@{
      x = [double]$script:Window.Left
      y = [double]$script:Window.Top
    }
    expandedLocation = $script:ExpandedLocation
    collapsedLocation = $script:CollapsedLocation
    pomodoro = Get-PomodoroStatePayload
  }
  Write-JsonFileAtomic $StateFile $Payload 5
}

function Save-RestartCollapsedState {
  $CollapsedLocation = if ($script:CollapsedLocation) {
    Clamp-ToWorkArea ([double]$script:CollapsedLocation.x) ([double]$script:CollapsedLocation.y) 140 54
  } else {
    Get-CornerCollapsedLocation 140 54
  }
  $ExpandedLocation = if ($script:ExpandedLocation) {
    Clamp-ToWorkArea ([double]$script:ExpandedLocation.x) ([double]$script:ExpandedLocation.y) 460 610
  } else {
    Get-CornerExpandedLocation 460 610
  }
  $Payload = [ordered]@{
    currentView = if ($script:CurrentView) { $script:CurrentView } else { 'today' }
    collapsed = $true
    exitRequested = $false
    location = $CollapsedLocation
    expandedLocation = $ExpandedLocation
    collapsedLocation = $CollapsedLocation
    pomodoro = Get-PomodoroStatePayload
  }
  Write-JsonFileAtomic $StateFile $Payload 5
}

function Start-WidgetDetached {
  try {
    $CommandLine = 'wscript.exe "{0}"' -f $LauncherFile
    Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $CommandLine } | Out-Null
    Write-WidgetLog ("unexpected close restarted pid={0}" -f $PID)
  } catch {
    Write-WidgetLog $_.Exception.ToString()
  }
}

function Stop-WatchdogProcess {
  try {
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -eq 'powershell.exe' -and
        $_.CommandLine -like "*$WatchdogScriptFile*" -and
        $_.CommandLine -notlike '*-Command*'
      } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Write-WidgetLog ("watchdog stop requested pid={0}" -f $PID)
  } catch {
    Write-WidgetLog $_.Exception.ToString()
  }
}

function Request-FinalExit {
  $script:AllowExit = $true
  $script:ExitRequested = $true
  Stop-WindowAnimations
  Save-State
  Stop-WatchdogProcess
  $Window.Close()
}

function Get-PomodoroDuration([string]$Mode) {
  if ($Mode -eq 'break') {
    return [int]$PomodoroBreakSeconds
  }
  return [int]$PomodoroFocusSeconds
}

function Format-PomodoroTime([int]$Seconds) {
  $SafeSeconds = [Math]::Max(0, $Seconds)
  "{0:00}:{1:00}" -f [int]($SafeSeconds / 60), [int]($SafeSeconds % 60)
}

function Get-PomodoroRemainingSeconds {
  if ($script:PomodoroRunning -and $script:PomodoroEndAt) {
    return [Math]::Max(0, [int][Math]::Ceiling((([datetime]$script:PomodoroEndAt) - (Get-Date)).TotalSeconds))
  }
  return [Math]::Max(0, [int]$script:PomodoroRemainingSeconds)
}

function Get-PomodoroStatePayload {
  [ordered]@{
    mode = if ($script:PomodoroMode) { [string]$script:PomodoroMode } else { 'focus' }
    running = [bool]$script:PomodoroRunning
    remainingSeconds = [int](Get-PomodoroRemainingSeconds)
    endAt = if ($script:PomodoroRunning -and $script:PomodoroEndAt) { ([datetime]$script:PomodoroEndAt).ToString('o') } else { $null }
    stats = @($script:PomodoroStats)
  }
}

function Initialize-PomodoroState($State) {
  $script:PomodoroMode = 'focus'
  $script:PomodoroRunning = $false
  $script:PomodoroRemainingSeconds = [int]$PomodoroFocusSeconds
  $script:PomodoroEndAt = $null
  $script:PomodoroStats = @()

  if (-not ($State -and $State.pomodoro)) {
    return
  }

  $Pomodoro = $State.pomodoro
  if ($Pomodoro.stats) {
    $script:PomodoroStats = @($Pomodoro.stats | Where-Object { $_.date })
  }
  if ($Pomodoro.mode -and @('focus', 'break') -contains [string]$Pomodoro.mode) {
    $script:PomodoroMode = [string]$Pomodoro.mode
  }
  $Duration = Get-PomodoroDuration $script:PomodoroMode
  if ($Pomodoro.remainingSeconds -and [int]$Pomodoro.remainingSeconds -gt 0) {
    $script:PomodoroRemainingSeconds = [Math]::Min([int]$Pomodoro.remainingSeconds, $Duration)
  } else {
    $script:PomodoroRemainingSeconds = $Duration
  }

  $script:PomodoroRunning = [bool]$Pomodoro.running
  if ($script:PomodoroRunning -and $Pomodoro.endAt) {
    try {
      $script:PomodoroEndAt = [datetime]$Pomodoro.endAt
      $Remaining = Get-PomodoroRemainingSeconds
      if ($Remaining -le 0) {
        $script:PomodoroRunning = $false
        $script:PomodoroEndAt = $null
        $script:PomodoroRemainingSeconds = $Duration
      } else {
        $script:PomodoroRemainingSeconds = $Remaining
      }
    } catch {
      $script:PomodoroRunning = $false
      $script:PomodoroEndAt = $null
    }
  }
}

function Get-TodayPomodoroStats {
  $DateText = (Get-Date).Date.ToString('yyyy-MM-dd')
  $Existing = @($script:PomodoroStats | Where-Object { $_.date -eq $DateText } | Select-Object -First 1)
  if ($Existing.Count -gt 0) {
    return $Existing[0]
  }
  [pscustomobject]@{
    date = $DateText
    focusCount = 0
    focusSeconds = 0
  }
}

function Add-PomodoroFocusStat {
  $DateText = (Get-Date).Date.ToString('yyyy-MM-dd')
  $Existing = @($script:PomodoroStats | Where-Object { $_.date -eq $DateText } | Select-Object -First 1)
  if ($Existing.Count -eq 0) {
    $Entry = [pscustomobject]@{
      date = $DateText
      focusCount = 0
      focusSeconds = 0
    }
    $script:PomodoroStats = @($script:PomodoroStats) + $Entry
  } else {
    $Entry = $Existing[0]
  }
  $Entry.focusCount = [int]$Entry.focusCount + 1
  $Entry.focusSeconds = [int]$Entry.focusSeconds + [int]$PomodoroFocusSeconds
  $Cutoff = (Get-Date).Date.AddDays(-90).ToString('yyyy-MM-dd')
  $script:PomodoroStats = @($script:PomodoroStats | Where-Object { [string]$_.date -ge $Cutoff })
}

function Get-PomodoroStatsLabel {
  $Stats = Get-TodayPomodoroStats
  $Minutes = [int]([Math]::Floor([int]$Stats.focusSeconds / 60))
  "{0}{1} {2}m" -f [int]$Stats.focusCount, (T '5qyh'), $Minutes
}

function Notify-PomodoroPhase {
  if (-not $script:NotifyIcon) {
    return
  }
  try {
    $PhaseText = if ($script:PomodoroMode -eq 'break') { T $Text.Break } else { T $Text.Focus }
    $script:NotifyIcon.ShowBalloonTip(2500, (T $Text.Task), ("{0} {1}" -f $PhaseText, (Format-PomodoroTime (Get-PomodoroDuration $script:PomodoroMode))), [System.Windows.Forms.ToolTipIcon]::None)
  } catch {
    Write-WidgetLog $_.Exception.ToString()
  }
}

function Update-PomodoroUi {
  if ($script:PomodoroTime) {
    $script:PomodoroTime.Text = Format-PomodoroTime (Get-PomodoroRemainingSeconds)
  }
  if ($script:PomodoroDot) {
    $script:PomodoroDot.Background = if ($script:PomodoroMode -eq 'break') { B '#34C759' } else { B '#1677FF' }
  }
  if ($script:PomodoroToggleButton) {
    $script:PomodoroToggleButton.Content = if ($script:PomodoroRunning) { 'II' } else { [string][char]0x25B6 }
  }
  if ($script:PomodoroStat) {
    $script:PomodoroStat.Text = Get-PomodoroStatsLabel
  }
  if ($script:IsCollapsed -and $CollapsedText) {
    $CollapsedText.Text = Get-CollapsedLabel
  }
}

function Complete-PomodoroPhase {
  $CompletedMode = $script:PomodoroMode
  if ($CompletedMode -eq 'focus') {
    Add-PomodoroFocusStat
  }
  $script:PomodoroMode = if ($CompletedMode -eq 'focus') { 'break' } else { 'focus' }
  $script:PomodoroRemainingSeconds = Get-PomodoroDuration $script:PomodoroMode
  $script:PomodoroRunning = $true
  $script:PomodoroEndAt = (Get-Date).AddSeconds($script:PomodoroRemainingSeconds)
  Notify-PomodoroPhase
  Update-PomodoroUi
  Save-State
}

function Tick-Pomodoro {
  if (-not $script:PomodoroRunning) {
    Update-PomodoroUi
    return
  }
  if ((Get-PomodoroRemainingSeconds) -le 0) {
    Complete-PomodoroPhase
    return
  }
  Update-PomodoroUi
}

function Toggle-Pomodoro {
  if ($script:PomodoroRunning) {
    $script:PomodoroRemainingSeconds = Get-PomodoroRemainingSeconds
    $script:PomodoroRunning = $false
    $script:PomodoroEndAt = $null
  } else {
    if ((Get-PomodoroRemainingSeconds) -le 0) {
      $script:PomodoroRemainingSeconds = Get-PomodoroDuration $script:PomodoroMode
    }
    $script:PomodoroRunning = $true
    $script:PomodoroEndAt = (Get-Date).AddSeconds($script:PomodoroRemainingSeconds)
  }
  Update-PomodoroUi
  Save-State
}

function Reset-Pomodoro {
  $script:PomodoroRunning = $false
  $script:PomodoroEndAt = $null
  $script:PomodoroRemainingSeconds = Get-PomodoroDuration $script:PomodoroMode
  Update-PomodoroUi
  Save-State
}

function Get-TaskDate($Item) {
  if (-not $Item.dueDate) {
    return $null
  }
  try {
    return ([datetime]$Item.dueDate).Date
  } catch {
    return $null
  }
}

function Test-ClearedToday($Item) {
  if (-not $Item.clearedAt) {
    return $false
  }
  try {
    return ([datetime]$Item.clearedAt).ToString('yyyy-MM-dd') -eq $script:Today
  } catch {
    return $false
  }
}

function Get-ActiveItems {
  @($script:Reminders | Where-Object { -not [bool]$_.completed })
}

function Get-CompletedItems {
  @($script:Reminders | Where-Object { [bool]$_.completed -and -not (Test-ClearedToday $_) })
}

function Sort-Tasks($Items, [bool]$CompletedMode) {
  if ($CompletedMode) {
    return @($Items | Sort-Object completedAt -Descending)
  }
  return @(
    $Items | Sort-Object `
      @{ Expression = { $D = Get-TaskDate $_; if ($D) { $D } else { [datetime]::MaxValue } } }, `
      @{ Expression = { if ($_.dueTime) { $_.dueTime } else { '99:99' } } }, `
      @{ Expression = { [int]$_.priority } }, `
      createdAt
  )
}

function Get-ViewLabel([string]$View) {
  if ($View -eq 'inbox') { return T $Text.Inbox }
  if ($View -eq 'today') { return T $Text.Today }
  if ($View -eq 'tomorrow') { return T $Text.Tomorrow }
  if ($View -eq 'week') { return T $Text.Week }
  if ($View -eq 'all') { return T $Text.All }
  if ($View -eq 'completed') { return T $Text.Completed }
  if ($View.StartsWith('tag:')) { return '#' + $View.Substring(4) }
  if ($View.StartsWith('list:')) { return $View.Substring(5) }
  return T $Text.Today
}

function Get-ViewItems([string]$View) {
  $Today = $script:TodayDate
  $Tomorrow = $Today.AddDays(1)
  $WeekEnd = $Today.AddDays(6)
  $Active = Get-ActiveItems

  if ($View -eq 'completed') {
    return Sort-Tasks (Get-CompletedItems) $true
  }
  if ($View -eq 'inbox') {
    return Sort-Tasks (@($Active | Where-Object { $_.list -eq $script:DefaultList })) $false
  }
  if ($View -eq 'today') {
    return Sort-Tasks (@($Active | Where-Object { $D = Get-TaskDate $_; $D -and $D -le $Today })) $false
  }
  if ($View -eq 'tomorrow') {
    return Sort-Tasks (@($Active | Where-Object { $D = Get-TaskDate $_; $D -and $D -eq $Tomorrow })) $false
  }
  if ($View -eq 'week') {
    return Sort-Tasks (@($Active | Where-Object { $D = Get-TaskDate $_; $D -and $D -ge $Today -and $D -le $WeekEnd })) $false
  }
  if ($View -eq 'all') {
    return Sort-Tasks $Active $false
  }
  if ($View.StartsWith('tag:')) {
    $Tag = $View.Substring(4)
    return Sort-Tasks (@($Active | Where-Object { @($_.tags) -contains $Tag })) $false
  }
  if ($View.StartsWith('list:')) {
    $ListName = $View.Substring(5)
    return Sort-Tasks (@($Active | Where-Object { $_.list -eq $ListName })) $false
  }
  return Sort-Tasks $Active $false
}

function Get-ViewCount([string]$View) {
  @(Get-ViewItems $View).Count
}

function Get-DueLabel($Item) {
  $D = Get-TaskDate $Item
  if (-not $D) {
    return T $Text.NoDate
  }
  if ($D -lt $script:TodayDate) {
    $Base = "$(T $Text.Overdue) $($D.ToString('M/d'))"
  } elseif ($D -eq $script:TodayDate) {
    $Base = T $Text.Today
  } elseif ($D -eq $script:TodayDate.AddDays(1)) {
    $Base = T $Text.Tomorrow
  } else {
    $Base = $D.ToString('M/d')
  }
  if ($Item.dueTime) {
    return "$Base $($Item.dueTime)"
  }
  return $Base
}

function Get-DueColor($Item) {
  $D = Get-TaskDate $Item
  if (-not $D) { return '#8E8E93' }
  if ($D -lt $script:TodayDate) { return '#D70015' }
  if ($D -eq $script:TodayDate) { return '#1677FF' }
  return '#6E6E73'
}

function Get-PriorityColor([int]$Priority) {
  if ($Priority -eq 1) { return '#FF3B30' }
  if ($Priority -eq 2) { return '#FF9500' }
  if ($Priority -eq 3) { return '#0A84FF' }
  return '#C7C7CC'
}

function Get-PriorityText([int]$Priority) {
  if ($Priority -eq 1) { return 'P1' }
  if ($Priority -eq 2) { return 'P2' }
  if ($Priority -eq 3) { return 'P3' }
  return 'P4'
}

function Get-DefaultDueForView {
  if ($script:CurrentView -eq 'today' -or $script:CurrentView -eq 'week') {
    return $script:Today
  }
  if ($script:CurrentView -eq 'tomorrow') {
    return $script:TodayDate.AddDays(1).ToString('yyyy-MM-dd')
  }
  return $null
}

function Complete-Reminder([string]$Id) {
  Sync-ExternalRemindersIfChanged | Out-Null
  $Item = @($script:Reminders | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
  if (-not $Item) { return }
  $Now = Get-Date
  $Item[0].completedAt = $Now.ToString('s')
  if (@('daily', 'weekly', 'monthly', 'yearly') -contains [string]$Item[0].repeat) {
    $NextDueDate = Get-NextRepeatDueDate $Item[0] -AdvanceCurrent
    $Item[0].completed = $false
    $Item[0].completedAt = $null
    $Item[0].clearedAt = $null
    $Item[0].notifiedAt = $null
    $Item[0].snoozedUntil = $null
    if ($NextDueDate) {
      $Item[0].dueDate = $NextDueDate
    }
  } else {
    $Item[0].completed = $true
    $Item[0].clearedAt = $null
    $Item[0].snoozedUntil = $null
  }
  $Item[0].updatedAt = (Get-Date).ToString('s')
  Save-Reminders
  Render-All
}

function Reopen-Reminder([string]$Id) {
  Sync-ExternalRemindersIfChanged | Out-Null
  $Item = @($script:Reminders | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
  if (-not $Item) { return }
  $Item[0].completed = $false
  $Item[0].completedAt = $null
  $Item[0].clearedAt = $null
  $Item[0].updatedAt = (Get-Date).ToString('s')
  Save-Reminders
  Render-All
}

function Delete-Reminder([string]$Id) {
  Sync-ExternalRemindersIfChanged | Out-Null
  $script:Reminders = @($script:Reminders | Where-Object { $_.id -ne $Id })
  if ($script:EditingId -eq $Id) {
    Close-DetailPanel
  }
  Save-Reminders
  Render-All
}

function Find-Reminder([string]$Id) {
  $Matches = @($script:Reminders | Where-Object { $_.id -eq $Id } | Select-Object -First 1)
  if ($Matches.Count -eq 0) {
    return $null
  }
  return $Matches[0]
}

function Parse-DateInput([string]$Value) {
  $TextValue = $Value.Trim()
  if (-not $TextValue) {
    return $null
  }
  $DateValue = [datetime]::MinValue
  if ([datetime]::TryParse($TextValue, [ref]$DateValue)) {
    return $DateValue.Date.ToString('yyyy-MM-dd')
  }
  return $null
}

function Parse-TimeInput([string]$Value) {
  $TextValue = $Value.Trim()
  if (-not $TextValue) {
    return $null
  }
  if ($TextValue -match '^([01]?\d|2[0-3]):([0-5]\d)$') {
    return ('{0:00}:{1:00}' -f [int]$Matches[1], [int]$Matches[2])
  }
  if ($TextValue -match '^([01]?\d|2[0-3])$') {
    return ('{0:00}:00' -f [int]$Matches[1])
  }
  return $null
}

function Open-DetailPanel([string]$Id) {
  Sync-ExternalRemindersIfChanged | Out-Null
  $Item = Find-Reminder $Id
  if (-not $Item) {
    return
  }
  $script:EditingId = $Id
  $script:DetailTitleBox.Text = [string]$Item.title
  $script:DetailDateBox.Text = if ($Item.dueDate) { [string]$Item.dueDate } else { '' }
  $script:DetailTimeBox.Text = if ($Item.dueTime) { [string]$Item.dueTime } else { '' }
  $script:DetailPriorityBox.SelectedIndex = [Math]::Max(0, [Math]::Min(3, ([int]$Item.priority - 1)))
  $RepeatIndex = 0
  if ($Item.repeat -eq 'daily') { $RepeatIndex = 1 }
  elseif ($Item.repeat -eq 'weekly') { $RepeatIndex = 2 }
  elseif ($Item.repeat -eq 'monthly') { $RepeatIndex = 3 }
  elseif ($Item.repeat -eq 'yearly') { $RepeatIndex = 4 }
  $script:DetailRepeatBox.SelectedIndex = $RepeatIndex
  $script:DetailListBox.Text = if ($Item.list) { [string]$Item.list } else { $script:DefaultList }
  $script:DetailTagsBox.Text = (@($Item.tags) | Where-Object { $_ }) -join ' '
  $script:DetailNotesBox.Text = if ($Item.notes) { [string]$Item.notes } else { '' }
  $script:DetailPanel.Visibility = [System.Windows.Visibility]::Visible
  $script:DetailTitleBox.Focus() | Out-Null
  $script:DetailTitleBox.SelectAll()
}

function Close-DetailPanel {
  $script:EditingId = $null
  if ($script:DetailPanel) {
    $script:DetailPanel.Visibility = [System.Windows.Visibility]::Collapsed
  }
}

function Save-DetailPanel {
  if (-not $script:EditingId) {
    return
  }
  Sync-ExternalRemindersIfChanged | Out-Null
  $Item = Find-Reminder $script:EditingId
  if (-not $Item) {
    Close-DetailPanel
    return
  }

  $TitleValue = $script:DetailTitleBox.Text.Trim()
  if (-not $TitleValue) {
    return
  }
  $DateValue = Parse-DateInput $script:DetailDateBox.Text
  $TimeValue = Parse-TimeInput $script:DetailTimeBox.Text
  $ListValue = $script:DetailListBox.Text.Trim()
  if (-not $ListValue) {
    $ListValue = $script:DefaultList
  }
  $TagsSource = $script:DetailTagsBox.Text.Replace(([string][char]0xFF0C), ' ')
  $TagsValue = @(
    $TagsSource -split '[\s,#]+' |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ } |
      Select-Object -Unique
  )

  $Item.title = $TitleValue
  $Item.dueDate = $DateValue
  $Item.dueTime = $TimeValue
  $Item.priority = [int]($script:DetailPriorityBox.SelectedIndex + 1)
  $RepeatValues = @('none', 'daily', 'weekly', 'monthly', 'yearly')
  $Item.repeat = $RepeatValues[[Math]::Max(0, [Math]::Min(4, $script:DetailRepeatBox.SelectedIndex))]
  $Item.list = $ListValue
  $Item.tags = @($TagsValue)
  $Item.notes = $script:DetailNotesBox.Text.Trim()
  $Item.notifiedAt = $null
  $Item.snoozedUntil = $null
  $Item.updatedAt = (Get-Date).ToString('s')
  Save-Reminders
  Close-DetailPanel
  Render-All
}

function Clear-Completed {
  Sync-ExternalRemindersIfChanged | Out-Null
  $Now = (Get-Date).ToString('s')
  $Kept = @()
  foreach ($Item in @($script:Reminders)) {
    if (-not [bool]$Item.completed) {
      $Kept += $Item
      continue
    }
    if ($Item.repeat -ne 'none') {
      $Item.clearedAt = $Now
      $Item.updatedAt = $Now
      $Kept += $Item
    }
  }
  $script:Reminders = @($Kept)
  Save-Reminders
  Render-All
}

function Add-ReminderFromInput {
  $Raw = $script:InputBox.Text.Trim()
  if (-not $Raw) {
    return
  }
  Sync-ExternalRemindersIfChanged | Out-Null
  $Parsed = Parse-QuickAdd $Raw
  $DueDate = $Parsed.dueDate
  if (-not $DueDate) {
    $DueDate = Get-DefaultDueForView
  }
  $NewItem = New-Reminder $Parsed.title $DueDate $Parsed.repeat ([int]$Parsed.priority) @($Parsed.tags) $Parsed.list $Parsed.dueTime
  $script:Reminders = @($script:Reminders) + @($NewItem)
  $script:InputBox.Text = ''
  Save-Reminders
  Render-All
}

function Get-ReminderAlertAt($Item) {
  if ($Item.snoozedUntil) {
    try {
      return [datetime]$Item.snoozedUntil
    } catch {
    }
  }
  if (-not $Item.dueDate -or -not $Item.dueTime) {
    return $null
  }
  try {
    return [datetime]::ParseExact("$($Item.dueDate) $($Item.dueTime)", 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture)
  } catch {
    return $null
  }
}

function Get-DueAlertItems {
  $Now = Get-Date
  @(
    Get-ActiveItems |
      Where-Object {
        $AlertAt = Get-ReminderAlertAt $_
        $AlertAt -and $AlertAt -le $Now
      } |
      Sort-Object @{ Expression = { Get-ReminderAlertAt $_ } }, @{ Expression = { [int]$_.priority } }, createdAt
  )
}

function Get-FirstDueAlert {
  @(Get-DueAlertItems | Select-Object -First 1)
}

function Snooze-Reminder([string]$Id, [int]$Minutes) {
  Sync-ExternalRemindersIfChanged | Out-Null
  $Item = Find-Reminder $Id
  if (-not $Item) {
    return
  }
  $Item.snoozedUntil = (Get-Date).AddMinutes($Minutes).ToString('s')
  $Item.notifiedAt = $null
  $Item.updatedAt = (Get-Date).ToString('s')
  Save-Reminders
  Render-All
}

function Show-DueNotifications {
  if (-not $script:NotifyIcon) {
    return
  }
  Sync-ExternalRemindersIfChanged | Out-Null
  $Now = Get-Date
  $Changed = $false
  foreach ($Item in @(Get-DueAlertItems)) {
    if ($Item.notifiedAt) {
      try {
        if (([datetime]$Item.notifiedAt) -ge (Get-ReminderAlertAt $Item)) {
          continue
        }
      } catch {
      }
    }
    $script:NotifyIcon.BalloonTipTitle = T $Text.Task
    $script:NotifyIcon.BalloonTipText = [string]$Item.title
    $script:NotifyIcon.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $script:NotifyIcon.ShowBalloonTip(6000)
    $Item.notifiedAt = $Now.ToString('s')
    $Item.updatedAt = $Now.ToString('s')
    $Changed = $true
    break
  }
  if ($Changed) {
    Save-Reminders
    Render-All
  }
}

function Make-FlatButton([string]$Content) {
  $Button = New-Object System.Windows.Controls.Button
  $Button.Content = $Content
  $Button.Padding = New-Object System.Windows.Thickness -ArgumentList 8, 2, 8, 3
  $Button.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 0
  $Button.Background = [System.Windows.Media.Brushes]::Transparent
  $Button.Foreground = B '#3A3A3C'
  $Button.Cursor = [System.Windows.Input.Cursors]::Hand
  return $Button
}

function Make-TextBlock([string]$Value, [int]$Size, [string]$Color) {
  $Block = New-Object System.Windows.Controls.TextBlock
  $Block.Text = $Value
  $Block.FontSize = $Size
  $Block.Foreground = B $Color
  $Block.TextTrimming = [System.Windows.TextTrimming]::CharacterEllipsis
  return $Block
}

function Clamp-ToWorkArea([double]$X, [double]$Y, [double]$Width, [double]$Height) {
  $Work = [System.Windows.SystemParameters]::WorkArea
  $MinX = $Work.Left + 8
  $MinY = $Work.Top + 8
  $MaxX = $Work.Right - $Width - 8
  $MaxY = $Work.Bottom - $Height - 8
  if ($MaxX -lt $MinX) { $MaxX = $MinX }
  if ($MaxY -lt $MinY) { $MaxY = $MinY }
  [ordered]@{
    x = [Math]::Min([Math]::Max($X, $MinX), $MaxX)
    y = [Math]::Min([Math]::Max($Y, $MinY), $MaxY)
  }
}

function Get-EaseOutCubic([double]$Progress) {
  1.0 - [Math]::Pow((1.0 - $Progress), 3.0)
}

function Set-WindowBounds([double]$Left, [double]$Top, [double]$Width, [double]$Height) {
  $Window.Left = [Math]::Round($Left)
  $Window.Top = [Math]::Round($Top)
  $Window.Width = [Math]::Round($Width)
  $Window.Height = [Math]::Round($Height)
}

function Get-CornerExpandedLocation([double]$Width, [double]$Height) {
  $Work = [System.Windows.SystemParameters]::WorkArea
  Clamp-ToWorkArea ($Work.Right - $Width - 18) ($Work.Bottom - $Height - 18) $Width $Height
}

function Get-CornerCollapsedLocation([double]$Width, [double]$Height) {
  $Work = [System.Windows.SystemParameters]::WorkArea
  Clamp-ToWorkArea ($Work.Right - $Width - 18) ($Work.Bottom - $Height - 18) $Width $Height
}

function Get-CollapsedLocation([double]$Width, [double]$Height) {
  if ($script:CollapsedLocation) {
    return Clamp-ToWorkArea ([double]$script:CollapsedLocation.x) ([double]$script:CollapsedLocation.y) $Width $Height
  }
  Get-CornerCollapsedLocation $Width $Height
}

function Remember-CollapsedLocation {
  if ($script:IsCollapsed -and -not $script:IsAnimatingBounds) {
    $script:CollapsedLocation = Clamp-ToWorkArea ([double]$Window.Left) ([double]$Window.Top) ([double]$Window.Width) ([double]$Window.Height)
  }
}

function Set-CardVisualMode([bool]$Collapsed) {
  if ($Collapsed) {
    $Card.Margin = New-Object System.Windows.Thickness -ArgumentList 0
    $Card.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 0
    $Card.BorderBrush = [System.Windows.Media.Brushes]::Transparent
    $Card.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 20
    $Card.Effect = $null
    return
  }
  $Card.Margin = New-Object System.Windows.Thickness -ArgumentList 0
  $Card.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
  $Card.BorderBrush = B '#E6E7EB'
  $Card.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 8
  $Card.Effect = $Shadow
}

function Start-CollapsedPointer($Sender, $EventArgs) {
  if (-not $script:IsCollapsed) {
    return
  }
  $script:CollapsedMouseDownPoint = $EventArgs.GetPosition($Window)
  $Cursor = [System.Windows.Forms.Cursor]::Position
  $script:CollapsedCursorStart = [ordered]@{ x = [double]$Cursor.X; y = [double]$Cursor.Y }
  $script:CollapsedWindowStart = [ordered]@{ x = [double]$Window.Left; y = [double]$Window.Top }
  $script:CollapsedDragging = $false
  try {
    $Sender.CaptureMouse() | Out-Null
  } catch {
  }
  $EventArgs.Handled = $true
}

function Move-CollapsedPointer($Sender, $EventArgs) {
  if (-not $script:IsCollapsed -or -not $script:CollapsedMouseDownPoint) {
    return
  }
  if ($EventArgs.LeftButton -ne [System.Windows.Input.MouseButtonState]::Pressed) {
    return
  }
  $Cursor = [System.Windows.Forms.Cursor]::Position
  $MoveX = [double]$Cursor.X - [double]$script:CollapsedCursorStart.x
  $MoveY = [double]$Cursor.Y - [double]$script:CollapsedCursorStart.y
  if ([Math]::Abs($MoveX) -le 4 -and [Math]::Abs($MoveY) -le 4) {
    return
  }
  $script:CollapsedDragging = $true
  $Next = Clamp-ToWorkArea ([double]$script:CollapsedWindowStart.x + $MoveX) ([double]$script:CollapsedWindowStart.y + $MoveY) ([double]$Window.Width) ([double]$Window.Height)
  $Window.Left = [double]$Next.x
  $Window.Top = [double]$Next.y
  Remember-CollapsedLocation
  Save-State
  $EventArgs.Handled = $true
}

function End-CollapsedPointer($Sender, $EventArgs) {
  if (-not $script:IsCollapsed) {
    return
  }
  try {
    $Sender.ReleaseMouseCapture()
  } catch {
  }
  if ($script:CollapsedDragging) {
    Remember-CollapsedLocation
    Save-State
  } else {
    Set-Collapsed $false
  }
  $script:CollapsedMouseDownPoint = $null
  $script:CollapsedCursorStart = $null
  $script:CollapsedWindowStart = $null
  $script:CollapsedDragging = $false
  $EventArgs.Handled = $true
}

function Stop-WindowAnimations {
  $Window.BeginAnimation([System.Windows.Window]::LeftProperty, $null)
  $Window.BeginAnimation([System.Windows.Window]::TopProperty, $null)
  $Window.BeginAnimation([System.Windows.Window]::WidthProperty, $null)
  $Window.BeginAnimation([System.Windows.Window]::HeightProperty, $null)
  if ($script:TransitionTimer) {
    $script:TransitionTimer.Stop()
    $script:TransitionTimer = $null
  }
  if ($script:SettleTimer) {
    $script:SettleTimer.Stop()
    $script:SettleTimer = $null
  }
  if ($script:CardScale) {
    $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $null)
    $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $null)
  }
  if ($Card) {
    $Card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
  }
  $script:NativeTransition = $null
  $script:NativeTransitionDone = $false
  $script:CardTransitionAfter = $null
  $script:IsAnimatingBounds = $false
}

function New-EasedDoubleAnimation([double]$From, [double]$To, [int]$Milliseconds, [switch]$HoldEnd) {
  $Animation = New-Object System.Windows.Media.Animation.DoubleAnimation
  $Animation.From = $From
  $Animation.To = $To
  $Animation.Duration = New-Object System.Windows.Duration -ArgumentList ([TimeSpan]::FromMilliseconds($Milliseconds))
  $Ease = New-Object System.Windows.Media.Animation.CubicEase
  $Ease.EasingMode = [System.Windows.Media.Animation.EasingMode]::EaseOut
  $Animation.EasingFunction = $Ease
  if ($HoldEnd) {
    $Animation.FillBehavior = [System.Windows.Media.Animation.FillBehavior]::HoldEnd
  } else {
    $Animation.FillBehavior = [System.Windows.Media.Animation.FillBehavior]::Stop
  }
  return $Animation
}

function Start-CardTransition(
  [double]$FromOpacity,
  [double]$ToOpacity,
  [double]$FromScale,
  [double]$ToScale,
  [int]$Milliseconds,
  [scriptblock]$Before,
  [scriptblock]$After
) {
  Stop-WindowAnimations
  $script:IsAnimatingBounds = $true

  $Card.Opacity = $FromOpacity
  $script:CardScale.ScaleX = $FromScale
  $script:CardScale.ScaleY = $FromScale

  if ($Before) {
    & $Before
  }

  $OpacityAnimation = New-EasedDoubleAnimation $FromOpacity $ToOpacity $Milliseconds -HoldEnd
  $ScaleXAnimation = New-EasedDoubleAnimation $FromScale $ToScale $Milliseconds -HoldEnd
  $ScaleYAnimation = New-EasedDoubleAnimation $FromScale $ToScale $Milliseconds -HoldEnd
  $script:CardTransitionAfter = $After
  $script:CardTransitionToOpacity = $ToOpacity
  $script:CardTransitionToScale = $ToScale

  $OpacityAnimation.Add_Completed({
    Invoke-Safe {
      if ($script:TransitionTimer) {
        $script:TransitionTimer.Stop()
        $script:TransitionTimer = $null
      }
      $Card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
      $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $null)
      $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $null)
      $Card.Opacity = [double]$script:CardTransitionToOpacity
      $script:CardScale.ScaleX = [double]$script:CardTransitionToScale
      $script:CardScale.ScaleY = [double]$script:CardTransitionToScale
      $AfterAction = $script:CardTransitionAfter
      $script:CardTransitionAfter = $null
      if ($AfterAction) {
        & $AfterAction
      }
      $script:IsAnimatingBounds = $false
    }
  })

  $Card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $OpacityAnimation)
  $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $ScaleXAnimation)
  $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $ScaleYAnimation)
}

function Start-CardSettleAnimation(
  [double]$FromOpacity,
  [double]$ToOpacity,
  [double]$FromScale,
  [double]$ToScale,
  [int]$Milliseconds
) {
  if ($script:SettleTimer) {
    $script:SettleTimer.Stop()
    $script:SettleTimer = $null
  }

  $Card.Opacity = $FromOpacity
  $script:CardScale.ScaleX = $FromScale
  $script:CardScale.ScaleY = $FromScale

  $OpacityAnimation = New-EasedDoubleAnimation $FromOpacity $ToOpacity $Milliseconds -HoldEnd
  $ScaleXAnimation = New-EasedDoubleAnimation $FromScale $ToScale $Milliseconds -HoldEnd
  $ScaleYAnimation = New-EasedDoubleAnimation $FromScale $ToScale $Milliseconds -HoldEnd
  $script:SettleToOpacity = $ToOpacity
  $script:SettleToScale = $ToScale

  $OpacityAnimation.Add_Completed({
    Invoke-Safe {
      if ($script:SettleTimer) {
        $script:SettleTimer.Stop()
        $script:SettleTimer = $null
      }
      $Card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $null)
      $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $null)
      $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $null)
      $Card.Opacity = [double]$script:SettleToOpacity
      $script:CardScale.ScaleX = [double]$script:SettleToScale
      $script:CardScale.ScaleY = [double]$script:SettleToScale
    }
  })

  $Card.BeginAnimation([System.Windows.UIElement]::OpacityProperty, $OpacityAnimation)
  $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleXProperty, $ScaleXAnimation)
  $script:CardScale.BeginAnimation([System.Windows.Media.ScaleTransform]::ScaleYProperty, $ScaleYAnimation)
}

Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Threading.Dispatcher]::CurrentDispatcher.add_UnhandledException({
  param($Sender, $EventArgs)
  Write-WidgetLog $EventArgs.Exception.ToString()
  $EventArgs.Handled = $true
})

$ShowEventCreated = $false
$script:ShowEvent = New-Object System.Threading.EventWaitHandle(
  $false,
  [System.Threading.EventResetMode]::AutoReset,
  'Local\AdOpsDailyReminderWidgetShow',
  [ref]$ShowEventCreated
)

$CreatedNew = $false
$script:Mutex = New-Object System.Threading.Mutex($true, 'Local\AdOpsDailyReminderWidget', [ref]$CreatedNew)
if (-not $CreatedNew) {
  Write-WidgetLog ("duplicate instance signaled pid={0}" -f $PID)
  if ($script:ShowEvent) {
    $script:ShowEvent.Set() | Out-Null
    $script:ShowEvent.Dispose()
    $script:ShowEvent = $null
  }
  if ($script:Mutex) {
    $script:Mutex.Dispose()
    $script:Mutex = $null
  }
  return
}

if ($script:ShowEvent) {
  while ($script:ShowEvent.WaitOne(0)) {
  }
}

$State = Read-State
$script:CurrentView = 'today'
$script:IsCollapsed = $false
if ($State -and $State.currentView) {
  $script:CurrentView = [string]$State.currentView
}
if ($State -and $null -ne $State.collapsed) {
  $script:IsCollapsed = [bool]$State.collapsed
}
Initialize-PomodoroState $State

Load-Reminders

$script:Window = New-Object System.Windows.Window
$Window = $script:Window
$Window.Title = T $Text.App
$Window.Width = 460
$Window.Height = 610
$Window.WindowStyle = [System.Windows.WindowStyle]::None
$Window.ResizeMode = [System.Windows.ResizeMode]::NoResize
$Window.AllowsTransparency = $true
$Window.Background = [System.Windows.Media.Brushes]::Transparent
$Window.Topmost = $true
$Window.ShowInTaskbar = $false
$Window.FontFamily = New-Object System.Windows.Media.FontFamily -ArgumentList 'Segoe UI Variable, Microsoft YaHei UI'
$Window.FontSize = 12
$Window.WindowStartupLocation = [System.Windows.WindowStartupLocation]::Manual
$Window.UseLayoutRounding = $true
$Window.SnapsToDevicePixels = $true

$script:NotifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path -LiteralPath $IconFile) {
  $script:NotifyIcon.Icon = New-Object System.Drawing.Icon($IconFile)
} else {
  $script:NotifyIcon.Icon = [System.Drawing.SystemIcons]::Information
}
$script:NotifyIcon.Text = T $Text.Task
$script:NotifyIcon.Visible = $true
$script:AllowExit = $false
$script:ExitRequested = $false
$script:SessionEndingHandler = [Microsoft.Win32.SessionEndingEventHandler]{
  param($Sender, $EventArgs)
  $script:AllowExit = $true
  Write-WidgetLog ("session ending allow exit pid={0}" -f $PID)
  Save-State
}
[Microsoft.Win32.SystemEvents]::add_SessionEnding($script:SessionEndingHandler)
$script:NotifyIcon.Add_Click({
  Invoke-Safe {
    if ($script:IsCollapsed) {
      Set-Collapsed $false
    }
    $Window.Activate() | Out-Null
  }
})

$TrayMenu = New-Object System.Windows.Forms.ContextMenuStrip
$TrayOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$TrayOpen.Text = T $Text.Open
$TrayOpen.Add_Click({
  Invoke-Safe {
    Set-Collapsed $false
    $Window.Activate() | Out-Null
  }
})
$TrayMenu.Items.Add($TrayOpen) | Out-Null

$TrayCollapse = New-Object System.Windows.Forms.ToolStripMenuItem
$TrayCollapse.Text = T $Text.Collapse
$TrayCollapse.Add_Click({ Invoke-Safe { Set-Collapsed $true } })
$TrayMenu.Items.Add($TrayCollapse) | Out-Null

$TrayExit = New-Object System.Windows.Forms.ToolStripMenuItem
$TrayExit.Text = T $Text.Exit
$TrayExit.Add_Click({
  Invoke-Safe { Request-FinalExit }
})
$TrayMenu.Items.Add($TrayExit) | Out-Null
$script:NotifyIcon.ContextMenuStrip = $TrayMenu

$WorkArea = [System.Windows.SystemParameters]::WorkArea
$DefaultExpandedLocation = Get-CornerExpandedLocation 460 610
$Window.Left = [double]$DefaultExpandedLocation.x
$Window.Top = [double]$DefaultExpandedLocation.y
if ($State -and $State.location) {
  $Window.Left = [double]$State.location.x
  $Window.Top = [double]$State.location.y
}
$InitialLocation = Clamp-ToWorkArea ([double]$Window.Left) ([double]$Window.Top) 460 610
$Window.Left = [double]$InitialLocation.x
$Window.Top = [double]$InitialLocation.y
$script:ExpandedLocation = $DefaultExpandedLocation
if ($State -and $State.expandedLocation) {
  $script:ExpandedLocation = [ordered]@{
    x = [double]$State.expandedLocation.x
    y = [double]$State.expandedLocation.y
  }
}
$script:ExpandedLocation = Clamp-ToWorkArea ([double]$script:ExpandedLocation.x) ([double]$script:ExpandedLocation.y) 460 610
if ($script:IsCollapsed) {
  $script:ExpandedLocation = $DefaultExpandedLocation
}
$script:CollapsedLocation = Get-CornerCollapsedLocation 140 54
if ($State -and $State.collapsedLocation) {
  $script:CollapsedLocation = Clamp-ToWorkArea ([double]$State.collapsedLocation.x) ([double]$State.collapsedLocation.y) 140 54
} elseif ($script:IsCollapsed -and $State -and $State.location) {
  $script:CollapsedLocation = Clamp-ToWorkArea ([double]$State.location.x) ([double]$State.location.y) 140 54
}

$Card = New-Object System.Windows.Controls.Border
$Card.Background = B '#FFFFFF'
$Card.BorderBrush = B '#E6E7EB'
$Card.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
$Card.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 8
$Card.UseLayoutRounding = $true
$Card.SnapsToDevicePixels = $true
$Shadow = New-Object System.Windows.Media.Effects.DropShadowEffect
$Shadow.BlurRadius = 24
$Shadow.ShadowDepth = 8
$Shadow.Opacity = 0.13
$Card.Effect = $Shadow
$script:CardScale = New-Object System.Windows.Media.ScaleTransform -ArgumentList 1, 1
$Card.RenderTransform = $script:CardScale
$Card.RenderTransformOrigin = New-Object System.Windows.Point -ArgumentList 0.5, 0.5
$Window.Content = $Card
$Card.Add_MouseLeftButtonDown({
  param($Sender, $EventArgs)
  Invoke-Safe { Start-CollapsedPointer $Sender $EventArgs }
})
$Card.Add_MouseMove({
  param($Sender, $EventArgs)
  Invoke-Safe { Move-CollapsedPointer $Sender $EventArgs }
})
$Card.Add_MouseLeftButtonUp({
  param($Sender, $EventArgs)
  Invoke-Safe { End-CollapsedPointer $Sender $EventArgs }
})

$RootGrid = New-Object System.Windows.Controls.Grid
$RootGrid.UseLayoutRounding = $true
$RootGrid.SnapsToDevicePixels = $true
$Card.Child = $RootGrid

$script:ExpandedGrid = New-Object System.Windows.Controls.Grid
$RootGrid.Children.Add($script:ExpandedGrid) | Out-Null

$CollapsedGrid = New-Object System.Windows.Controls.Button
$CollapsedGrid.Visibility = [System.Windows.Visibility]::Collapsed
$CollapsedGrid.Background = [System.Windows.Media.Brushes]::Transparent
$CollapsedGrid.BorderBrush = [System.Windows.Media.Brushes]::Transparent
$CollapsedGrid.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 0
$CollapsedGrid.Padding = New-Object System.Windows.Thickness -ArgumentList 0
$CollapsedGrid.Focusable = $false
$CollapsedGrid.FocusVisualStyle = $null
$CollapsedGrid.HorizontalContentAlignment = [System.Windows.HorizontalAlignment]::Stretch
$CollapsedGrid.VerticalContentAlignment = [System.Windows.VerticalAlignment]::Stretch
$CollapsedGrid.Template = [System.Windows.Markup.XamlReader]::Parse('<ControlTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" TargetType="{x:Type Button}"><ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}" VerticalAlignment="{TemplateBinding VerticalContentAlignment}"/></ControlTemplate>')
$RootGrid.Children.Add($CollapsedGrid) | Out-Null

$CollapsedText = Make-TextBlock '' 14 '#1677FF'
$CollapsedText.FontWeight = [System.Windows.FontWeights]::SemiBold
$CollapsedText.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
$CollapsedText.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$CollapsedGrid.Content = $CollapsedText
$CollapsedGrid.Add_PreviewMouseLeftButtonDown({
  param($Sender, $EventArgs)
  Invoke-Safe { Start-CollapsedPointer $Sender $EventArgs }
})
$CollapsedGrid.Add_PreviewMouseMove({
  param($Sender, $EventArgs)
  Invoke-Safe { Move-CollapsedPointer $Sender $EventArgs }
})
$CollapsedGrid.Add_PreviewMouseLeftButtonUp({
  param($Sender, $EventArgs)
  Invoke-Safe { End-CollapsedPointer $Sender $EventArgs }
})
$CollapsedGrid.Add_Click({
  Invoke-Safe {
    if ($script:IsCollapsed -and -not $script:CollapsedDragging) {
      Set-Collapsed $false
    }
    $script:CollapsedMouseDownPoint = $null
    $script:CollapsedDragging = $false
  }
})

$Col = New-Object System.Windows.Controls.ColumnDefinition
$Col.Width = New-Object System.Windows.GridLength -ArgumentList 122
$script:ExpandedGrid.ColumnDefinitions.Add($Col)
$Col = New-Object System.Windows.Controls.ColumnDefinition
$Col.Width = New-Object System.Windows.GridLength -ArgumentList 1, ([System.Windows.GridUnitType]::Star)
$script:ExpandedGrid.ColumnDefinitions.Add($Col)

$Sidebar = New-Object System.Windows.Controls.Border
$Sidebar.Background = B '#F7F8FA'
$Sidebar.BorderBrush = B '#EAEAEE'
$Sidebar.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 0, 0, 1, 0
$Sidebar.Padding = New-Object System.Windows.Thickness -ArgumentList 10, 12, 9, 10
[System.Windows.Controls.Grid]::SetColumn($Sidebar, 0)
$script:ExpandedGrid.Children.Add($Sidebar) | Out-Null

$SidebarStack = New-Object System.Windows.Controls.StackPanel
$Sidebar.Child = $SidebarStack

$SidebarTitle = Make-TextBlock (T $Text.Task) 16 '#1C1C1E'
$SidebarTitle.FontWeight = [System.Windows.FontWeights]::SemiBold
$SidebarTitle.Margin = New-Object System.Windows.Thickness -ArgumentList 2, 0, 0, 12
$SidebarStack.Children.Add($SidebarTitle) | Out-Null

$script:NavStack = New-Object System.Windows.Controls.StackPanel
$SidebarStack.Children.Add($script:NavStack) | Out-Null

$ContentGrid = New-Object System.Windows.Controls.Grid
[System.Windows.Controls.Grid]::SetColumn($ContentGrid, 1)
$script:ExpandedGrid.Children.Add($ContentGrid) | Out-Null
foreach ($Height in @('Auto', 'Auto', '1*', 'Auto')) {
  $Row = New-Object System.Windows.Controls.RowDefinition
  if ($Height -eq '1*') {
    $Row.Height = New-Object System.Windows.GridLength -ArgumentList 1, ([System.Windows.GridUnitType]::Star)
  } else {
    $Row.Height = [System.Windows.GridLength]::Auto
  }
  $ContentGrid.RowDefinitions.Add($Row)
}

$Header = New-Object System.Windows.Controls.Grid
$Header.Margin = New-Object System.Windows.Thickness -ArgumentList 16, 14, 12, 8
$Header.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$ToolCol = New-Object System.Windows.Controls.ColumnDefinition
$ToolCol.Width = [System.Windows.GridLength]::Auto
$Header.ColumnDefinitions.Add($ToolCol)
[System.Windows.Controls.Grid]::SetRow($Header, 0)
$ContentGrid.Children.Add($Header) | Out-Null

$TitleStack = New-Object System.Windows.Controls.StackPanel
$Header.Children.Add($TitleStack) | Out-Null

$script:ViewTitle = Make-TextBlock '' 21 '#111111'
$script:ViewTitle.FontWeight = [System.Windows.FontWeights]::SemiBold
$TitleStack.Children.Add($script:ViewTitle) | Out-Null

$script:ViewSubTitle = Make-TextBlock '' 11 '#8E8E93'
$script:ViewSubTitle.Margin = New-Object System.Windows.Thickness -ArgumentList 1, 2, 0, 0
$TitleStack.Children.Add($script:ViewSubTitle) | Out-Null

$ToolStack = New-Object System.Windows.Controls.StackPanel
$ToolStack.Orientation = [System.Windows.Controls.Orientation]::Horizontal
$ToolStack.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
[System.Windows.Controls.Grid]::SetColumn($ToolStack, 1)
$Header.Children.Add($ToolStack) | Out-Null

$script:ClearButton = Make-FlatButton (T $Text.Clear)
$script:ClearButton.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 0, 6, 0
$script:ClearButton.Foreground = B '#1677FF'
$script:ClearButton.Add_Click({ Invoke-Safe { Clear-Completed } })
$ToolStack.Children.Add($script:ClearButton) | Out-Null

$DataButton = Make-FlatButton '...'
$DataButton.Width = 30
$DataButton.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 0, 6, 0
$DataButton.Add_Click({
  Invoke-Safe {
    if (-not (Test-Path -LiteralPath $RemindersFile)) {
      Save-Reminders
    }
    Start-Process -FilePath notepad.exe -ArgumentList "`"$RemindersFile`""
  }
})
$ToolStack.Children.Add($DataButton) | Out-Null

$CollapseButton = Make-FlatButton '-'
$CollapseButton.Width = 30
$CollapseButton.Foreground = B '#6E6E73'
$CollapseButton.Add_Click({ Invoke-Safe { Set-Collapsed $true } })
$ToolStack.Children.Add($CollapseButton) | Out-Null

$QuitButton = Make-FlatButton ([string][char]0x00D7)
$QuitButton.Width = 30
$QuitButton.Foreground = B '#6E6E73'
$QuitButton.Add_Click({
  Invoke-Safe { Request-FinalExit }
})
$ToolStack.Children.Add($QuitButton) | Out-Null

$AddGrid = New-Object System.Windows.Controls.Grid
$AddGrid.Margin = New-Object System.Windows.Thickness -ArgumentList 16, 0, 12, 10
$AddGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$PlusCol = New-Object System.Windows.Controls.ColumnDefinition
$PlusCol.Width = [System.Windows.GridLength]::Auto
$AddGrid.ColumnDefinitions.Add($PlusCol)
[System.Windows.Controls.Grid]::SetRow($AddGrid, 1)
$ContentGrid.Children.Add($AddGrid) | Out-Null

$script:InputBox = New-Object System.Windows.Controls.TextBox
$script:InputBox.Height = 34
$script:InputBox.Padding = New-Object System.Windows.Thickness -ArgumentList 10, 7, 10, 6
$script:InputBox.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
$script:InputBox.BorderBrush = B '#E5E7EB'
$script:InputBox.Background = B '#FBFBFD'
$script:InputBox.Foreground = B '#111111'
$script:InputBox.FontSize = 13
$script:InputBox.Add_KeyDown({
  param($Sender, $EventArgs)
  Invoke-Safe {
    if ($EventArgs.Key -eq [System.Windows.Input.Key]::Enter) {
      Add-ReminderFromInput
      $EventArgs.Handled = $true
    }
  }
})
$AddGrid.Children.Add($script:InputBox) | Out-Null

$AddButton = Make-FlatButton '+'
$AddButton.Width = 34
$AddButton.Height = 34
$AddButton.Margin = New-Object System.Windows.Thickness -ArgumentList 8, 0, 0, 0
$AddButton.Background = B '#1677FF'
$AddButton.Foreground = B '#FFFFFF'
$AddButton.FontSize = 18
$AddButton.Add_Click({ Invoke-Safe { Add-ReminderFromInput } })
[System.Windows.Controls.Grid]::SetColumn($AddButton, 1)
$AddGrid.Children.Add($AddButton) | Out-Null

$script:PomodoroBar = New-Object System.Windows.Controls.Border
$script:PomodoroBar.Height = 34
$script:PomodoroBar.Margin = New-Object System.Windows.Thickness -ArgumentList 16, 0, 12, 12
$script:PomodoroBar.Padding = New-Object System.Windows.Thickness -ArgumentList 11, 0, 6, 0
$script:PomodoroBar.Background = B '#F7F8FA'
$script:PomodoroBar.BorderBrush = B '#EAEAEE'
$script:PomodoroBar.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
$script:PomodoroBar.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 8
[System.Windows.Controls.Grid]::SetRow($script:PomodoroBar, 3)
$ContentGrid.Children.Add($script:PomodoroBar) | Out-Null

$PomodoroGrid = New-Object System.Windows.Controls.Grid
$PomodoroGrid.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$PomodoroGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition -Property @{ Width = [System.Windows.GridLength]::Auto }))
$PomodoroGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$PomodoroGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition -Property @{ Width = [System.Windows.GridLength]::Auto }))
$PomodoroGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition -Property @{ Width = [System.Windows.GridLength]::Auto }))
$script:PomodoroBar.Child = $PomodoroGrid

$script:PomodoroDot = New-Object System.Windows.Controls.Border
$script:PomodoroDot.Width = 8
$script:PomodoroDot.Height = 8
$script:PomodoroDot.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 4
$script:PomodoroDot.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$script:PomodoroDot.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 0, 9, 0
[System.Windows.Controls.Grid]::SetColumn($script:PomodoroDot, 0)
$PomodoroGrid.Children.Add($script:PomodoroDot) | Out-Null

$script:PomodoroTime = Make-TextBlock '25:00' 15 '#111111'
$script:PomodoroTime.FontWeight = [System.Windows.FontWeights]::SemiBold
$script:PomodoroTime.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$script:PomodoroTime.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Left
[System.Windows.Controls.Grid]::SetColumn($script:PomodoroTime, 1)
$PomodoroGrid.Children.Add($script:PomodoroTime) | Out-Null

$script:PomodoroStat = Make-TextBlock '0次 0m' 11 '#8E8E93'
$script:PomodoroStat.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
$script:PomodoroStat.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
$script:PomodoroStat.Margin = New-Object System.Windows.Thickness -ArgumentList 54, 1, 8, 0
[System.Windows.Controls.Grid]::SetColumn($script:PomodoroStat, 1)
$PomodoroGrid.Children.Add($script:PomodoroStat) | Out-Null

$script:PomodoroToggleButton = Make-FlatButton ([string][char]0x25B6)
$script:PomodoroToggleButton.Width = 30
$script:PomodoroToggleButton.Height = 28
$script:PomodoroToggleButton.Foreground = B '#1677FF'
$script:PomodoroToggleButton.FontWeight = [System.Windows.FontWeights]::SemiBold
$script:PomodoroToggleButton.Add_Click({ Invoke-Safe { Toggle-Pomodoro } })
[System.Windows.Controls.Grid]::SetColumn($script:PomodoroToggleButton, 2)
$PomodoroGrid.Children.Add($script:PomodoroToggleButton) | Out-Null

$script:PomodoroResetButton = Make-FlatButton ([string][char]0x21BB)
$script:PomodoroResetButton.Width = 30
$script:PomodoroResetButton.Height = 28
$script:PomodoroResetButton.Foreground = B '#6E6E73'
$script:PomodoroResetButton.Add_Click({ Invoke-Safe { Reset-Pomodoro } })
[System.Windows.Controls.Grid]::SetColumn($script:PomodoroResetButton, 3)
$PomodoroGrid.Children.Add($script:PomodoroResetButton) | Out-Null

$script:AlertPanel = New-Object System.Windows.Controls.Border
$script:AlertPanel.Background = B '#F5FAFF'
$script:AlertPanel.BorderBrush = B '#B9D7FF'
$script:AlertPanel.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
$script:AlertPanel.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 8
$script:AlertPanel.Margin = New-Object System.Windows.Thickness -ArgumentList 16, 40, 12, 0
$script:AlertPanel.Padding = New-Object System.Windows.Thickness -ArgumentList 10, 8, 10, 8
$script:AlertPanel.Visibility = [System.Windows.Visibility]::Collapsed
[System.Windows.Controls.Grid]::SetRow($script:AlertPanel, 1)
[System.Windows.Controls.Panel]::SetZIndex($script:AlertPanel, 8)
$ContentGrid.Children.Add($script:AlertPanel) | Out-Null

$AlertGrid = New-Object System.Windows.Controls.Grid
$script:AlertPanel.Child = $AlertGrid
$AlertGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$AlertActionsCol = New-Object System.Windows.Controls.ColumnDefinition
$AlertActionsCol.Width = [System.Windows.GridLength]::Auto
$AlertGrid.ColumnDefinitions.Add($AlertActionsCol)

$AlertTextStack = New-Object System.Windows.Controls.StackPanel
$AlertGrid.Children.Add($AlertTextStack) | Out-Null
$script:AlertTitle = Make-TextBlock '' 12 '#111111'
$script:AlertTitle.FontWeight = [System.Windows.FontWeights]::SemiBold
$AlertTextStack.Children.Add($script:AlertTitle) | Out-Null
$script:AlertMeta = Make-TextBlock '' 10 '#1677FF'
$script:AlertMeta.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 2, 0, 0
$AlertTextStack.Children.Add($script:AlertMeta) | Out-Null

$AlertActions = New-Object System.Windows.Controls.StackPanel
$AlertActions.Orientation = [System.Windows.Controls.Orientation]::Horizontal
$AlertActions.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
[System.Windows.Controls.Grid]::SetColumn($AlertActions, 1)
$AlertGrid.Children.Add($AlertActions) | Out-Null

$script:AlertLaterButton = Make-FlatButton (T $Text.Later)
$script:AlertLaterButton.Foreground = B '#1677FF'
$script:AlertLaterButton.Add_Click({
  param($Sender, $EventArgs)
  Invoke-Safe {
    Snooze-Reminder ([string]$Sender.Tag) 10
    $EventArgs.Handled = $true
  }
})
$AlertActions.Children.Add($script:AlertLaterButton) | Out-Null

$script:AlertDoneButton = Make-FlatButton (T $Text.Done)
$script:AlertDoneButton.Background = B '#1677FF'
$script:AlertDoneButton.Foreground = B '#FFFFFF'
$script:AlertDoneButton.Margin = New-Object System.Windows.Thickness -ArgumentList 6, 0, 0, 0
$script:AlertDoneButton.Add_Click({
  param($Sender, $EventArgs)
  Invoke-Safe {
    Complete-Reminder ([string]$Sender.Tag)
    $EventArgs.Handled = $true
  }
})
$AlertActions.Children.Add($script:AlertDoneButton) | Out-Null

$Scroll = New-Object System.Windows.Controls.ScrollViewer
$Scroll.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Hidden
$Scroll.HorizontalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Disabled
$Scroll.Padding = New-Object System.Windows.Thickness -ArgumentList 12, 0, 8, 0
[System.Windows.Controls.Grid]::SetRow($Scroll, 2)
$ContentGrid.Children.Add($Scroll) | Out-Null

$script:ItemsStack = New-Object System.Windows.Controls.StackPanel
$Scroll.Content = $script:ItemsStack

$script:DetailPanel = New-Object System.Windows.Controls.Border
$script:DetailPanel.Width = 312
$script:DetailPanel.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
$script:DetailPanel.VerticalAlignment = [System.Windows.VerticalAlignment]::Stretch
$script:DetailPanel.Background = B '#FFFFFF'
$script:DetailPanel.BorderBrush = B '#E6E7EB'
$script:DetailPanel.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1, 0, 0, 0
$script:DetailPanel.Padding = New-Object System.Windows.Thickness -ArgumentList 16, 14, 14, 14
$script:DetailPanel.Visibility = [System.Windows.Visibility]::Collapsed
[System.Windows.Controls.Panel]::SetZIndex($script:DetailPanel, 20)
$script:ExpandedGrid.Children.Add($script:DetailPanel) | Out-Null
[System.Windows.Controls.Grid]::SetColumnSpan($script:DetailPanel, 2)
$script:DetailPanel.Add_PreviewKeyDown({
  param($Sender, $EventArgs)
  Invoke-Safe {
    if ($EventArgs.Key -eq [System.Windows.Input.Key]::Escape) {
      Close-DetailPanel
      $EventArgs.Handled = $true
      return
    }
    if ($EventArgs.Key -eq [System.Windows.Input.Key]::Enter -and
      ([System.Windows.Input.Keyboard]::Modifiers -band [System.Windows.Input.ModifierKeys]::Control)) {
      Save-DetailPanel
      $EventArgs.Handled = $true
    }
  }
})

$DetailRoot = New-Object System.Windows.Controls.Grid
$script:DetailPanel.Child = $DetailRoot
foreach ($Height in @('Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', '1*', 'Auto')) {
  $Row = New-Object System.Windows.Controls.RowDefinition
  if ($Height -eq '1*') {
    $Row.Height = New-Object System.Windows.GridLength -ArgumentList 1, ([System.Windows.GridUnitType]::Star)
  } else {
    $Row.Height = [System.Windows.GridLength]::Auto
  }
  $DetailRoot.RowDefinitions.Add($Row)
}

$DetailHeader = New-Object System.Windows.Controls.Grid
$DetailHeader.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$DetailCloseCol = New-Object System.Windows.Controls.ColumnDefinition
$DetailCloseCol.Width = [System.Windows.GridLength]::Auto
$DetailHeader.ColumnDefinitions.Add($DetailCloseCol)
[System.Windows.Controls.Grid]::SetRow($DetailHeader, 0)
$DetailRoot.Children.Add($DetailHeader) | Out-Null

$DetailTitle = Make-TextBlock (T $Text.Detail) 17 '#111111'
$DetailTitle.FontWeight = [System.Windows.FontWeights]::SemiBold
$DetailHeader.Children.Add($DetailTitle) | Out-Null

$DetailClose = Make-FlatButton ([string][char]0x00D7)
$DetailClose.Width = 28
$DetailClose.Height = 26
$DetailClose.Foreground = B '#6E6E73'
$DetailClose.Add_Click({ Invoke-Safe { Close-DetailPanel } })
[System.Windows.Controls.Grid]::SetColumn($DetailClose, 1)
$DetailHeader.Children.Add($DetailClose) | Out-Null

function Add-DetailField([int]$RowIndex, [string]$Label, $Control) {
  $Stack = New-Object System.Windows.Controls.StackPanel
  $Stack.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 12, 0, 0
  [System.Windows.Controls.Grid]::SetRow($Stack, $RowIndex)
  $DetailRoot.Children.Add($Stack) | Out-Null
  $LabelBlock = Make-TextBlock $Label 11 '#8E8E93'
  $LabelBlock.Margin = New-Object System.Windows.Thickness -ArgumentList 1, 0, 0, 5
  $Stack.Children.Add($LabelBlock) | Out-Null
  $Stack.Children.Add($Control) | Out-Null
}

function New-DetailTextBox([int]$Height, [bool]$MultiLine) {
  $Box = New-Object System.Windows.Controls.TextBox
  $Box.Height = $Height
  $Box.Padding = New-Object System.Windows.Thickness -ArgumentList 9, 6, 9, 6
  $Box.BorderBrush = B '#E5E7EB'
  $Box.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 1
  $Box.Background = B '#FBFBFD'
  $Box.Foreground = B '#111111'
  $Box.FontSize = 12
  if ($MultiLine) {
    $Box.AcceptsReturn = $true
    $Box.TextWrapping = [System.Windows.TextWrapping]::Wrap
    $Box.VerticalScrollBarVisibility = [System.Windows.Controls.ScrollBarVisibility]::Auto
  }
  return $Box
}

$script:DetailTitleBox = New-DetailTextBox 58 $true
Add-DetailField 1 (T $Text.Title) $script:DetailTitleBox

$DateTimeGrid = New-Object System.Windows.Controls.Grid
$DateTimeGrid.ColumnDefinitions.Add((New-Object System.Windows.Controls.ColumnDefinition))
$TimeCol = New-Object System.Windows.Controls.ColumnDefinition
$TimeCol.Width = New-Object System.Windows.GridLength -ArgumentList 86
$DateTimeGrid.ColumnDefinitions.Add($TimeCol)
$script:DetailDateBox = New-DetailTextBox 32 $false
$script:DetailTimeBox = New-DetailTextBox 32 $false
$script:DetailTimeBox.Margin = New-Object System.Windows.Thickness -ArgumentList 8, 0, 0, 0
[System.Windows.Controls.Grid]::SetColumn($script:DetailTimeBox, 1)
$DateTimeGrid.Children.Add($script:DetailDateBox) | Out-Null
$DateTimeGrid.Children.Add($script:DetailTimeBox) | Out-Null
Add-DetailField 2 ("{0} / {1}" -f (T $Text.Date), (T $Text.Time)) $DateTimeGrid

$script:DetailPriorityBox = New-Object System.Windows.Controls.ComboBox
$script:DetailPriorityBox.Height = 32
$script:DetailPriorityBox.Items.Add('P1') | Out-Null
$script:DetailPriorityBox.Items.Add('P2') | Out-Null
$script:DetailPriorityBox.Items.Add('P3') | Out-Null
$script:DetailPriorityBox.Items.Add('P4') | Out-Null
$script:DetailPriorityBox.SelectedIndex = 3
Add-DetailField 3 (T $Text.Priority) $script:DetailPriorityBox

$script:DetailRepeatBox = New-Object System.Windows.Controls.ComboBox
$script:DetailRepeatBox.Height = 32
$script:DetailRepeatBox.Items.Add((T $Text.NoRepeat)) | Out-Null
$script:DetailRepeatBox.Items.Add((T $Text.EveryDay)) | Out-Null
$script:DetailRepeatBox.Items.Add((T $Text.EveryWeek)) | Out-Null
$script:DetailRepeatBox.Items.Add((T $Text.EveryMonth)) | Out-Null
$script:DetailRepeatBox.Items.Add((T $Text.EveryYear)) | Out-Null
$script:DetailRepeatBox.SelectedIndex = 0
Add-DetailField 4 (T $Text.Repeat) $script:DetailRepeatBox

$script:DetailListBox = New-DetailTextBox 32 $false
Add-DetailField 5 (T $Text.List) $script:DetailListBox

$script:DetailTagsBox = New-DetailTextBox 32 $false
Add-DetailField 6 (T $Text.Tags) $script:DetailTagsBox

$script:DetailNotesBox = New-DetailTextBox 104 $true
Add-DetailField 7 (T $Text.Notes) $script:DetailNotesBox

$DetailButtons = New-Object System.Windows.Controls.StackPanel
$DetailButtons.Orientation = [System.Windows.Controls.Orientation]::Horizontal
$DetailButtons.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Right
$DetailButtons.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 12, 0, 0
[System.Windows.Controls.Grid]::SetRow($DetailButtons, 8)
$DetailRoot.Children.Add($DetailButtons) | Out-Null

$DetailCancel = Make-FlatButton (T $Text.Cancel)
$DetailCancel.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 0, 8, 0
$DetailCancel.Add_Click({ Invoke-Safe { Close-DetailPanel } })
$DetailButtons.Children.Add($DetailCancel) | Out-Null

$DetailSave = Make-FlatButton (T $Text.Save)
$DetailSave.Background = B '#1677FF'
$DetailSave.Foreground = B '#FFFFFF'
$DetailSave.Add_Click({ Invoke-Safe { Save-DetailPanel } })
$DetailButtons.Children.Add($DetailSave) | Out-Null

function Add-NavButton([string]$View, [string]$Label, [int]$Count) {
  $Button = Make-FlatButton ("{0}  {1}" -f $Label, $Count)
  $Button.Tag = $View
  $Button.HorizontalContentAlignment = [System.Windows.HorizontalAlignment]::Left
  $Button.Width = 100
  $Button.Height = 30
  $Button.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 1, 0, 1
  if ($script:CurrentView -eq $View) {
    $Button.Background = B '#E8F1FF'
    $Button.Foreground = B '#1677FF'
    $Button.FontWeight = [System.Windows.FontWeights]::SemiBold
  } else {
    $Button.Background = [System.Windows.Media.Brushes]::Transparent
    $Button.Foreground = B '#3A3A3C'
  }
  $Button.Add_Click({
    param($Sender, $EventArgs)
    Invoke-Safe {
      $script:CurrentView = [string]$Sender.Tag
      Save-State
      Render-All
    }
  })
  $script:NavStack.Children.Add($Button) | Out-Null
}

function Add-TaskRow($Item, [bool]$CompletedMode) {
  $RowBorder = New-Object System.Windows.Controls.Border
  $RowBorder.Background = B '#FFFFFF'
  $RowBorder.BorderBrush = B '#F0F1F4'
  $RowBorder.BorderThickness = New-Object System.Windows.Thickness -ArgumentList 0, 0, 0, 1
  $RowBorder.Padding = New-Object System.Windows.Thickness -ArgumentList 0, 9, 0, 9
  $RowBorder.Tag = $Item.id
  $RowBorder.Cursor = [System.Windows.Input.Cursors]::Hand
  $RowBorder.Add_MouseLeftButtonUp({
    param($Sender, $EventArgs)
    Invoke-Safe {
      Open-DetailPanel ([string]$Sender.Tag)
      $EventArgs.Handled = $true
    }
  })

  $Grid = New-Object System.Windows.Controls.Grid
  $RowBorder.Child = $Grid
  $BarCol = New-Object System.Windows.Controls.ColumnDefinition
  $BarCol.Width = New-Object System.Windows.GridLength -ArgumentList 5
  $Grid.ColumnDefinitions.Add($BarCol)
  $CircleCol = New-Object System.Windows.Controls.ColumnDefinition
  $CircleCol.Width = New-Object System.Windows.GridLength -ArgumentList 28
  $Grid.ColumnDefinitions.Add($CircleCol)
  $TitleCol = New-Object System.Windows.Controls.ColumnDefinition
  $TitleCol.Width = New-Object System.Windows.GridLength -ArgumentList 1, ([System.Windows.GridUnitType]::Star)
  $Grid.ColumnDefinitions.Add($TitleCol)
  $DeleteCol = New-Object System.Windows.Controls.ColumnDefinition
  $DeleteCol.Width = [System.Windows.GridLength]::Auto
  $Grid.ColumnDefinitions.Add($DeleteCol)

  $PriorityBar = New-Object System.Windows.Controls.Border
  $PriorityBar.Width = 3
  $PriorityBar.Height = 22
  $PriorityBar.CornerRadius = New-Object System.Windows.CornerRadius -ArgumentList 2
  $PriorityBar.Background = B (Get-PriorityColor ([int]$Item.priority))
  $PriorityBar.VerticalAlignment = [System.Windows.VerticalAlignment]::Top
  $PriorityBar.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 1, 0, 0
  [System.Windows.Controls.Grid]::SetColumn($PriorityBar, 0)
  $Grid.Children.Add($PriorityBar) | Out-Null

  $Circle = Make-FlatButton ''
  $Circle.Width = 24
  $Circle.Height = 24
  $Circle.Padding = New-Object System.Windows.Thickness -ArgumentList 0
  $Circle.Tag = $Item.id
  if ($CompletedMode) {
    $Mark = Make-TextBlock ([string][char]0x2713) 15 '#8E8E93'
    $Mark.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $Mark.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
    $Circle.Content = $Mark
    $Circle.Add_Click({ param($Sender, $EventArgs) Invoke-Safe { Reopen-Reminder ([string]$Sender.Tag); $EventArgs.Handled = $true } })
  } else {
    $Ellipse = New-Object System.Windows.Shapes.Ellipse
    $Ellipse.Width = 18
    $Ellipse.Height = 18
    $Ellipse.Stroke = B (Get-PriorityColor ([int]$Item.priority))
    $Ellipse.StrokeThickness = 1.5
    $Ellipse.Fill = [System.Windows.Media.Brushes]::Transparent
    $Circle.Content = $Ellipse
    $Circle.Add_Click({ param($Sender, $EventArgs) Invoke-Safe { Complete-Reminder ([string]$Sender.Tag); $EventArgs.Handled = $true } })
  }
  [System.Windows.Controls.Grid]::SetColumn($Circle, 1)
  $Grid.Children.Add($Circle) | Out-Null

  $TextStack = New-Object System.Windows.Controls.StackPanel
  [System.Windows.Controls.Grid]::SetColumn($TextStack, 2)
  $Grid.Children.Add($TextStack) | Out-Null
  $TextStack.Cursor = [System.Windows.Input.Cursors]::Hand
  $TextStack.Tag = $Item.id
  $TextStack.Add_MouseLeftButtonUp({
    param($Sender, $EventArgs)
    Invoke-Safe {
      Open-DetailPanel ([string]$Sender.Tag)
      $EventArgs.Handled = $true
    }
  })

  $TitleButton = Make-FlatButton ''
  $TitleButton.Tag = $Item.id
  [System.Windows.Automation.AutomationProperties]::SetName($TitleButton, [string]$Item.title)
  $TitleButton.HorizontalContentAlignment = [System.Windows.HorizontalAlignment]::Stretch
  $TitleButton.Padding = New-Object System.Windows.Thickness -ArgumentList 0
  $TitleButton.Cursor = [System.Windows.Input.Cursors]::Hand
  $TitleButton.Add_Click({
    param($Sender, $EventArgs)
    Invoke-Safe {
      Open-DetailPanel ([string]$Sender.Tag)
      $EventArgs.Handled = $true
    }
  })
  $Title = Make-TextBlock ([string]$Item.title) 13 '#111111'
  $Title.TextWrapping = [System.Windows.TextWrapping]::Wrap
  $Title.LineHeight = 18
  if ($CompletedMode) {
    $Title.Foreground = B '#8E8E93'
    $Title.TextDecorations = [System.Windows.TextDecorations]::Strikethrough
  }
  $TitleButton.Content = $Title
  $TextStack.Children.Add($TitleButton) | Out-Null

  $MetaParts = @()
  $MetaParts += Get-DueLabel $Item
  if ([int]$Item.priority -lt 4) {
    $MetaParts += Get-PriorityText ([int]$Item.priority)
  }
  if ($Item.list -and $Item.list -ne $script:DefaultList) {
    $MetaParts += $Item.list
  }
  foreach ($Tag in @($Item.tags)) {
    if ($Tag) { $MetaParts += "#$Tag" }
  }
  $Meta = Make-TextBlock ($MetaParts -join '  ') 10 (Get-DueColor $Item)
  $Meta.Tag = $Item.id
  $Meta.Cursor = [System.Windows.Input.Cursors]::Hand
  $Meta.Add_MouseLeftButtonUp({
    param($Sender, $EventArgs)
    Invoke-Safe {
      Open-DetailPanel ([string]$Sender.Tag)
      $EventArgs.Handled = $true
    }
  })
  $Meta.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 3, 0, 0
  $TextStack.Children.Add($Meta) | Out-Null

  $DeleteButton = Make-FlatButton ([string][char]0x00D7)
  $DeleteButton.Width = 24
  $DeleteButton.Height = 24
  $DeleteButton.Padding = New-Object System.Windows.Thickness -ArgumentList 0
  $DeleteButton.Foreground = B '#C7C7CC'
  $DeleteButton.Tag = $Item.id
  $DeleteButton.Add_Click({ param($Sender, $EventArgs) Invoke-Safe { Delete-Reminder ([string]$Sender.Tag); $EventArgs.Handled = $true } })
  [System.Windows.Controls.Grid]::SetColumn($DeleteButton, 3)
  $Grid.Children.Add($DeleteButton) | Out-Null

  $script:ItemsStack.Children.Add($RowBorder) | Out-Null
}

function Add-Section([string]$Label, $Items, [bool]$CompletedMode) {
  $List = @($Items)
  if ($List.Count -eq 0) {
    return
  }
  if ($Label) {
    $HeaderText = Make-TextBlock ("{0}  {1}" -f $Label, $List.Count) 11 '#8E8E93'
    $HeaderText.FontWeight = [System.Windows.FontWeights]::SemiBold
    $HeaderText.Margin = New-Object System.Windows.Thickness -ArgumentList 3, 12, 0, 5
    $script:ItemsStack.Children.Add($HeaderText) | Out-Null
  }
  foreach ($Item in $List) {
    Add-TaskRow $Item $CompletedMode
  }
}

function Render-Nav {
  $script:NavStack.Children.Clear()
  Add-NavButton 'inbox' (T $Text.Inbox) (Get-ViewCount 'inbox')
  Add-NavButton 'today' (T $Text.Today) (Get-ViewCount 'today')
  Add-NavButton 'tomorrow' (T $Text.Tomorrow) (Get-ViewCount 'tomorrow')
  Add-NavButton 'week' (T $Text.Week) (Get-ViewCount 'week')
  Add-NavButton 'all' (T $Text.All) (Get-ViewCount 'all')
  Add-NavButton 'completed' (T $Text.Completed) (Get-ViewCount 'completed')

  $Lists = @(
    Get-ActiveItems |
      Where-Object { $_.list -and $_.list -ne $script:DefaultList } |
      Select-Object -ExpandProperty list -Unique
  )
  if ($Lists.Count -gt 0) {
    $Label = Make-TextBlock (T $Text.Lists) 11 '#8E8E93'
    $Label.Margin = New-Object System.Windows.Thickness -ArgumentList 2, 12, 0, 4
    $script:NavStack.Children.Add($Label) | Out-Null
    foreach ($ListName in $Lists) {
      Add-NavButton ("list:$ListName") $ListName (Get-ViewCount ("list:$ListName"))
    }
  }

  $Tags = @(
    Get-ActiveItems |
      ForEach-Object { @($_.tags) } |
      Where-Object { $_ } |
      Select-Object -Unique
  )
  if ($Tags.Count -gt 0) {
    $Label = Make-TextBlock (T $Text.Tags) 11 '#8E8E93'
    $Label.Margin = New-Object System.Windows.Thickness -ArgumentList 2, 12, 0, 4
    $script:NavStack.Children.Add($Label) | Out-Null
    foreach ($Tag in $Tags) {
      Add-NavButton ("tag:$Tag") "#$Tag" (Get-ViewCount ("tag:$Tag"))
    }
  }
}

function Render-Items {
  $script:ItemsStack.Children.Clear()
  $Items = @(Get-ViewItems $script:CurrentView)
  $CompletedMode = $script:CurrentView -eq 'completed'

  $script:ViewTitle.Text = Get-ViewLabel $script:CurrentView
  $script:ViewSubTitle.Text = "{0}  {1}" -f $Items.Count, (Get-Date -Format 'M/d')
  $script:ClearButton.Visibility = if ($CompletedMode -and $Items.Count -gt 0) { [System.Windows.Visibility]::Visible } else { [System.Windows.Visibility]::Collapsed }

  if ($Items.Count -eq 0) {
    $Empty = Make-TextBlock (T $Text.Empty) 13 '#8E8E93'
    $Empty.HorizontalAlignment = [System.Windows.HorizontalAlignment]::Center
    $Empty.Margin = New-Object System.Windows.Thickness -ArgumentList 0, 105, 0, 0
    $script:ItemsStack.Children.Add($Empty) | Out-Null
    return
  }

  if ($script:CurrentView -eq 'today') {
    Add-Section (T $Text.Overdue) (@($Items | Where-Object { (Get-TaskDate $_) -lt $script:TodayDate })) $false
    Add-Section '' (@($Items | Where-Object { (Get-TaskDate $_) -eq $script:TodayDate })) $false
    return
  }

  if ($script:CurrentView -eq 'week') {
    for ($i = 0; $i -lt 7; $i++) {
      $Date = $script:TodayDate.AddDays($i)
      $Label = if ($i -eq 0) { T $Text.Today } elseif ($i -eq 1) { T $Text.Tomorrow } else { $Date.ToString('M/d') }
      Add-Section $Label (@($Items | Where-Object { (Get-TaskDate $_) -eq $Date })) $false
    }
    return
  }

  if ($CompletedMode) {
    Add-Section '' $Items $true
    return
  }

  Add-Section '' $Items $false
}

function Get-CollapsedLabel {
  if ($script:PomodoroRunning) {
    return Format-PomodoroTime (Get-PomodoroRemainingSeconds)
  }
  $AlertCount = @(Get-DueAlertItems).Count
  if ($AlertCount -gt 0) {
    return "$(T $Text.Alert) $AlertCount"
  }
  return "$(T $Text.Today) $(Get-ViewCount 'today')"
}

function Render-AlertPanel {
  if (-not $script:AlertPanel) {
    return
  }
  $Item = @(Get-FirstDueAlert | Select-Object -First 1)
  if ($Item.Count -eq 0) {
    $script:AlertPanel.Visibility = [System.Windows.Visibility]::Collapsed
    return
  }
  $Task = $Item[0]
  $script:AlertPanel.Visibility = [System.Windows.Visibility]::Visible
  $script:AlertTitle.Text = [string]$Task.title
  $script:AlertMeta.Text = Get-DueLabel $Task
  $script:AlertLaterButton.Tag = [string]$Task.id
  $script:AlertDoneButton.Tag = [string]$Task.id
}

function Render-All {
  Render-Nav
  Render-Items
  Render-AlertPanel
  Update-PomodoroUi
  if ($script:IsCollapsed) {
    $CollapsedText.Text = Get-CollapsedLabel
  }
}

function Set-Collapsed([bool]$Collapsed, [switch]$Immediate) {
  $WasCollapsed = [bool]$script:IsCollapsed
  $script:IsCollapsed = $Collapsed
  $ExpandedWidth = 460
  $ExpandedHeight = 610
  $CollapsedWidth = 140
  $CollapsedHeight = 54

  if ($Collapsed) {
    Close-DetailPanel
    if (-not $WasCollapsed) {
      $script:ExpandedLocation = Clamp-ToWorkArea ([double]$Window.Left) ([double]$Window.Top) $ExpandedWidth $ExpandedHeight
    }
    $CollapsedText.Text = Get-CollapsedLabel
    $CollapsedTarget = Get-CollapsedLocation $CollapsedWidth $CollapsedHeight
    $TargetLeft = [double]$CollapsedTarget.x
    $TargetTop = [double]$CollapsedTarget.y
    $script:CollapsedLocation = $CollapsedTarget
    $script:CollapsedBounds = [ordered]@{
      left = [double]$TargetLeft
      top = [double]$TargetTop
      width = [double]$CollapsedWidth
      height = [double]$CollapsedHeight
    }

    if ($Immediate) {
      Stop-WindowAnimations
      Set-CardVisualMode $true
      $script:ExpandedGrid.Visibility = [System.Windows.Visibility]::Collapsed
      $CollapsedGrid.Visibility = [System.Windows.Visibility]::Visible
      Set-WindowBounds $TargetLeft $TargetTop $CollapsedWidth $CollapsedHeight
      $Card.Opacity = 1
      $script:CardScale.ScaleX = 1
      $script:CardScale.ScaleY = 1
      Save-State
      return
    }

    Start-CardTransition 1.0 0.0 1.0 0.985 115 {
      $Card.RenderTransformOrigin = New-Object System.Windows.Point -ArgumentList 1, 1
      $CollapsedGrid.Visibility = [System.Windows.Visibility]::Collapsed
      $script:ExpandedGrid.Visibility = [System.Windows.Visibility]::Visible
      Set-CardVisualMode $false
    } {
      $Bounds = $script:CollapsedBounds
      Set-WindowBounds ([double]$Bounds.left) ([double]$Bounds.top) ([double]$Bounds.width) ([double]$Bounds.height)
      Set-CardVisualMode $true
      $script:ExpandedGrid.Visibility = [System.Windows.Visibility]::Collapsed
      $CollapsedGrid.Visibility = [System.Windows.Visibility]::Visible
      Save-State
      Start-CardSettleAnimation 0.0 1.0 0.985 1.0 105
    }
  } else {
    $Clamped = $null
    if ($script:ExpandedLocation) {
      $Clamped = Clamp-ToWorkArea ([double]$script:ExpandedLocation.x) ([double]$script:ExpandedLocation.y) $ExpandedWidth $ExpandedHeight
    } else {
      $Clamped = Get-CornerExpandedLocation $ExpandedWidth $ExpandedHeight
    }
    $script:ExpandedLocation = $Clamped

    if ($Immediate) {
      Stop-WindowAnimations
      Set-CardVisualMode $false
      $script:ExpandedGrid.Visibility = [System.Windows.Visibility]::Visible
      $CollapsedGrid.Visibility = [System.Windows.Visibility]::Collapsed
      Set-WindowBounds ([double]$Clamped.x) ([double]$Clamped.y) $ExpandedWidth $ExpandedHeight
      $Card.Opacity = 1
      $script:CardScale.ScaleX = 1
      $script:CardScale.ScaleY = 1
      Render-All
      Save-State
      return
    }

    Start-CardTransition 0.0 1.0 0.985 1.0 155 {
      $Card.RenderTransformOrigin = New-Object System.Windows.Point -ArgumentList 1, 1
      Set-CardVisualMode $false
      Set-WindowBounds ([double]$Clamped.x) ([double]$Clamped.y) $ExpandedWidth $ExpandedHeight
      Render-All
      $script:ExpandedGrid.Visibility = [System.Windows.Visibility]::Visible
      $CollapsedGrid.Visibility = [System.Windows.Visibility]::Collapsed
    } {
      Save-State
      $script:InputBox.Focus() | Out-Null
    }
  }
}

$Header.Add_MouseLeftButtonDown({
  param($Sender, $EventArgs)
  Invoke-Safe {
    if ($EventArgs.ChangedButton -eq [System.Windows.Input.MouseButton]::Left) {
      $Window.DragMove()
    }
  }
})
$SidebarTitle.Add_MouseLeftButtonDown({
  param($Sender, $EventArgs)
  Invoke-Safe {
    if ($EventArgs.ChangedButton -eq [System.Windows.Input.MouseButton]::Left) {
      $Window.DragMove()
    }
  }
})

$Window.Add_LocationChanged({
  Invoke-Safe {
    if ($script:IsAnimatingBounds) {
      return
    }
    if ($script:IsCollapsed) {
      Remember-CollapsedLocation
    } else {
      $script:ExpandedLocation = Clamp-ToWorkArea ([double]$Window.Left) ([double]$Window.Top) ([double]$Window.Width) ([double]$Window.Height)
    }
    Save-State
  }
})
$Window.Add_Closing({
  param($Sender, $EventArgs)
  Invoke-Safe {
    if (-not $script:AllowExit) {
      $EventArgs.Cancel = $true
      Write-WidgetLog ("unexpected close blocked pid={0}" -f $PID)
      Set-Collapsed $true
    }
  }
})
$Window.Add_Closed({ Invoke-Safe { Save-State } })

$ShowEventTimer = New-Object System.Windows.Threading.DispatcherTimer
$ShowEventTimer.Interval = [TimeSpan]::FromMilliseconds(300)
$ShowEventTimer.Add_Tick({
  Invoke-Safe {
    if ($script:ShowEvent -and $script:ShowEvent.WaitOne(0)) {
      Set-Collapsed $false
      $Window.Activate() | Out-Null
    }
  }
})
$ShowEventTimer.Start()

$Timer = New-Object System.Windows.Threading.DispatcherTimer
$Timer.Interval = [TimeSpan]::FromSeconds($RefreshSeconds)
$Timer.Add_Tick({
  Invoke-Safe {
    $CurrentDate = (Get-Date).Date
    if ($CurrentDate -ne $script:TodayDate) {
      $script:TodayDate = $CurrentDate
      $script:Today = $CurrentDate.ToString('yyyy-MM-dd')
      Load-Reminders
      Render-All
      Save-State
      return
    }
    if (Sync-ExternalRemindersIfChanged) {
      Render-All
    }
    Show-DueNotifications
  }
})
$Timer.Start()

$PomodoroTimer = New-Object System.Windows.Threading.DispatcherTimer
$PomodoroTimer.Interval = [TimeSpan]::FromSeconds(1)
$PomodoroTimer.Add_Tick({ Invoke-Safe { Tick-Pomodoro } })
$PomodoroTimer.Start()

Render-All
if ($script:IsCollapsed) {
  Set-Collapsed $true -Immediate
}
Save-State
Show-DueNotifications

try {
  $Window.ShowDialog() | Out-Null
  $script:RestartAfterUnexpectedExit = -not $script:AllowExit
  if ($script:RestartAfterUnexpectedExit) {
    Write-WidgetLog ("ui closed unexpectedly pid={0}" -f $PID)
  } else {
    Write-WidgetLog ("ui closed pid={0}" -f $PID)
  }
} finally {
  if ($ShowEventTimer) {
    $ShowEventTimer.Stop()
  }
  if ($Timer) {
    $Timer.Stop()
  }
  if ($PomodoroTimer) {
    $PomodoroTimer.Stop()
  }
  Stop-WindowAnimations
  if ($script:NotifyIcon) {
    $script:NotifyIcon.Visible = $false
    $script:NotifyIcon.Dispose()
    $script:NotifyIcon = $null
  }
  if ($TrayMenu) {
    $TrayMenu.Dispose()
  }
  if ($script:SessionEndingHandler) {
    try {
      [Microsoft.Win32.SystemEvents]::remove_SessionEnding($script:SessionEndingHandler)
    } catch {
    }
    $script:SessionEndingHandler = $null
  }
  if ($script:Mutex) {
    try {
      $script:Mutex.ReleaseMutex()
    } catch {
    }
    $script:Mutex.Dispose()
    $script:Mutex = $null
  }
  if ($script:ShowEvent) {
    $script:ShowEvent.Dispose()
    $script:ShowEvent = $null
  }
  if ($script:RestartAfterUnexpectedExit) {
    Save-RestartCollapsedState
    Start-WidgetDetached
  }
}
