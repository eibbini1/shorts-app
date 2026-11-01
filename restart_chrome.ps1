$free = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
Write-Output "free MB before: $free"
Get-Process chrome -ErrorAction SilentlyContinue | ForEach-Object { if ($_.MainWindowHandle -ne 0) { [void]$_.CloseMainWindow() } }
Start-Sleep -Seconds 8
Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
$exe = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
if (-not $exe) { $exe = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe" }
Start-Process $exe -ArgumentList '--restore-last-session'
Start-Sleep -Seconds 10
$free = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
Write-Output "free MB after: $free"
