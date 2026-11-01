$c = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
$exe = $c | Where-Object { Test-Path $_ } | Select-Object -First 1
Write-Output "exe: $exe"
if ($exe) { Start-Process $exe -ArgumentList '--restore-last-session','https://studio.youtube.com/channel/UCfZ7tQ-hjo5OxRhZmFr775A/videos/short' }
Start-Sleep -Seconds 12
(Get-Process chrome -ErrorAction SilentlyContinue | Measure-Object).Count
