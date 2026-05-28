@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "D:\ad-ops-workbench\scripts\launch_ad_ops_collaboration_browser.ps1"

if errorlevel 1 (
  echo.
  echo Failed to start the ad ops collaboration browser.
  echo Keep this window open and share the error output for diagnosis.
  pause
)
