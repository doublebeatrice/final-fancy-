Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "D:\ad-ops-workbench"
shell.Run "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""D:\ad-ops-workbench\scripts\desktop\watch_daily_reminder_widget.ps1"" -ClearExitRequest", 0, False
