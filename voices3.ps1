$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
Set-Location 'C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app'
foreach ($e in @('biryani-ep1','steak-ep1','icecream-ep1')) {
  Write-Output "== $e"
  npx.cmd tsx src/cli/voiceOnly.ts "episodes/$e.assemble.json"
  Get-ChildItem "storage\episodes\$e\_voice" | Select-Object Name,Length | Format-Table -HideTableHeaders
}
Write-Output 'ALL DONE'
