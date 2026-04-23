$chromeArgs = @(
  "--remote-debugging-port=9222",
  "--user-data-dir=C:\Users\Administrator\AppData\Local\Google\Chrome\User Data",
  "--variations-override-country=us",
  "--lang=en-US"
)

Start-Process -FilePath "chrome.exe" -ArgumentList $chromeArgs

Write-Host "Started Chrome with remote debugging on http://127.0.0.1:9222"
Write-Host "Next: open https://adv.yswg.com.cn/ and the extension panel."
