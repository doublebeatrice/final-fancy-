param(
  [Parameter(Mandatory = $true)]
  [string]$Image,
  [string]$OutFile = "",
  [string]$Language = "zh-Hans-CN"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]

function Await-WinRt {
  param(
    [Parameter(Mandatory = $true)] $Async,
    [Parameter(Mandatory = $true)] [Type] $ResultType
  )
  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      $_.IsGenericMethodDefinition -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1
  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Async))
  $task.Wait()
  return $task.Result
}

$resolved = Resolve-Path $Image
$lang = [Windows.Globalization.Language]::new($Language)
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
if (-not $engine) {
  [pscustomobject]@{
    ok = $false
    error = "ocr_language_unavailable"
    language = $Language
  } | ConvertTo-Json -Depth 4
  exit 1
}

$storageFile = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($resolved.Path)) ([Windows.Storage.StorageFile])
$stream = Await-WinRt ($storageFile.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
$decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$ocrResult = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

$lines = @()
foreach ($line in $ocrResult.Lines) {
  $words = @()
  foreach ($word in $line.Words) {
    $rect = $word.BoundingRect
    $words += [pscustomobject]@{
      text = $word.Text
      x = [Math]::Round($rect.X, 2)
      y = [Math]::Round($rect.Y, 2)
      width = [Math]::Round($rect.Width, 2)
      height = [Math]::Round($rect.Height, 2)
    }
  }
  $x = ($words | Measure-Object -Property x -Minimum).Minimum
  $y = ($words | Measure-Object -Property y -Minimum).Minimum
  $right = ($words | ForEach-Object { $_.x + $_.width } | Measure-Object -Maximum).Maximum
  $bottom = ($words | ForEach-Object { $_.y + $_.height } | Measure-Object -Maximum).Maximum
  $lines += [pscustomobject]@{
    text = $line.Text
    x = [Math]::Round($x, 2)
    y = [Math]::Round($y, 2)
    width = [Math]::Round($right - $x, 2)
    height = [Math]::Round($bottom - $y, 2)
    words = $words
  }
}

$result = [pscustomobject]@{
  ok = $true
  image = $resolved.Path
  language = $Language
  text = $ocrResult.Text
  lineCount = $lines.Count
  lines = $lines
}

if ($OutFile) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutFile) | Out-Null
  $result | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $OutFile
}

$result | ConvertTo-Json -Depth 8
