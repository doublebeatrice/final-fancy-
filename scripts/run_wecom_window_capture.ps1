param(
  [string]$OutDir = "data\agent",
  [string]$OutFile = "",
  [string]$ProcessName = "WXWork"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WeComCaptureNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, System.Text.StringBuilder lpClassName, int nMaxCount);
}
"@

function Get-DateOnly {
  return (Get-Date).ToString("yyyy-MM-dd")
}

function Measure-Bitmap {
  param([System.Drawing.Bitmap]$Bitmap)

  $sampled = 0
  $dark = 0
  $nonWhite = 0
  $stepX = [Math]::Max(1, [Math]::Floor($Bitmap.Width / 80))
  $stepY = [Math]::Max(1, [Math]::Floor($Bitmap.Height / 60))

  for ($x = 0; $x -lt $Bitmap.Width; $x += $stepX) {
    for ($y = 0; $y -lt $Bitmap.Height; $y += $stepY) {
      $pixel = $Bitmap.GetPixel($x, $y)
      $brightness = ($pixel.R + $pixel.G + $pixel.B) / 3
      if ($brightness -lt 20) { $dark++ }
      if ($brightness -lt 245) { $nonWhite++ }
      $sampled++
    }
  }

  return [pscustomobject]@{
    sampled = $sampled
    darkRatio = if ($sampled) { [Math]::Round($dark / $sampled, 4) } else { 0 }
    nonWhiteRatio = if ($sampled) { [Math]::Round($nonWhite / $sampled, 4) } else { 0 }
  }
}

$candidateProcesses = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue

if (-not $candidateProcesses) {
  [pscustomobject]@{
    ok = $false
    error = "process_window_not_found"
    processName = $ProcessName
  } | ConvertTo-Json -Depth 4
  exit 1
}

$candidates = New-Object System.Collections.Generic.List[object]
foreach ($candidate in $candidateProcesses) {
  $pidForCandidate = [uint32]$candidate.Id
  $cb = [WeComCaptureNative+EnumWindowsProc]{
    param($hwnd, $lparam)
    $windowPid = [uint32]0
    [void][WeComCaptureNative]::GetWindowThreadProcessId($hwnd, [ref]$windowPid)
    if ($windowPid -ne $pidForCandidate) { return $true }
    $candidateRect = New-Object WeComCaptureNative+RECT
    if (-not [WeComCaptureNative]::GetWindowRect($hwnd, [ref]$candidateRect)) { return $true }
    $candidateWidth = $candidateRect.Right - $candidateRect.Left
    $candidateHeight = $candidateRect.Bottom - $candidateRect.Top
    $classBuilder = New-Object System.Text.StringBuilder 256
    [void][WeComCaptureNative]::GetClassName($hwnd, $classBuilder, $classBuilder.Capacity)
    $candidates.Add([pscustomobject]@{
      process = $candidate
      hwnd = $hwnd
      class = $classBuilder.ToString()
      rect = $candidateRect
      width = $candidateWidth
      height = $candidateHeight
      area = $candidateWidth * $candidateHeight
      visible = [WeComCaptureNative]::IsWindowVisible($hwnd)
    })
    return $true
  }
  [void][WeComCaptureNative]::EnumWindows($cb, [IntPtr]::Zero)
}

$selected = $candidates |
  Where-Object { $_.visible -and $_.width -gt 100 -and $_.height -gt 100 -and ($_.class -eq "WeWorkWindow" -or $_.class -eq "WeWorkSearchWindow") } |
  Sort-Object area -Descending |
  Select-Object -First 1

if (-not $selected) {
  $selected = $candidates |
    Where-Object { $_.visible -and $_.width -gt 100 -and $_.height -gt 100 } |
    Sort-Object area -Descending |
    Select-Object -First 1
}

if (-not $selected) {
  [pscustomobject]@{
    ok = $false
    error = "get_window_rect_failed"
    processName = $ProcessName
  } | ConvertTo-Json -Depth 4
  exit 1
}

$proc = $selected.process
$rect = $selected.rect
$hwnd = $selected.hwnd
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
  [pscustomobject]@{
    ok = $false
    error = "invalid_window_size"
    pid = $proc.Id
    width = $width
    height = $height
  } | ConvertTo-Json -Depth 4
  exit 1
}

if (-not $OutFile) {
  $date = Get-DateOnly
  $OutFile = Join-Path $OutDir "wecom_window_capture_$date.png"
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
$rendered = $false
try {
  $rendered = [WeComCaptureNative]::PrintWindow($hwnd, $hdc, 2)
} finally {
  $graphics.ReleaseHdc($hdc)
  $graphics.Dispose()
}

$metrics = Measure-Bitmap -Bitmap $bitmap
$bitmap.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

[pscustomobject]@{
  ok = $true
  processName = $proc.ProcessName
  pid = $proc.Id
  title = $proc.MainWindowTitle
  hwnd = $hwnd.ToInt64()
  class = $selected.class
  visible = [WeComCaptureNative]::IsWindowVisible($hwnd)
  rendered = $rendered
  outFile = (Resolve-Path $OutFile).Path
  width = $width
  height = $height
  sampled = $metrics.sampled
  darkRatio = $metrics.darkRatio
  nonWhiteRatio = $metrics.nonWhiteRatio
  likelyBlank = ($metrics.nonWhiteRatio -lt 0.01 -or $metrics.darkRatio -gt 0.98)
} | ConvertTo-Json -Depth 4
