$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName 'Billionaire Bites Shorts Worker' -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName 'Billionaire Bites Shorts Worker' -Confirm:$false
Write-Host 'Removed the sign-in task. Check the worker PID before removing any stale lock file.'
