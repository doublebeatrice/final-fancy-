Write-Warning "scripts\execute\open_debug_browser.ps1 is legacy. Use npm run chrome:debug or open_debug_browser_fixed_profile.ps1."

$launcher = Join-Path $PSScriptRoot "open_debug_browser_fixed_profile.ps1"
& $launcher @args
exit $LASTEXITCODE
