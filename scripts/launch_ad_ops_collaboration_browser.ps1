param(
  [switch]$OpenStartupUrls
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runnerPath = Join-Path $repoRoot "scripts\execute\open_debug_browser_fixed_profile.ps1"

$runnerArgs = @{
  WindowStyle = "Normal"
  ShowWindow = $true
}

if ($OpenStartupUrls) {
  $runnerArgs.OpenStartupUrls = $true
}

& $runnerPath @runnerArgs
