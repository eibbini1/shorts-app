$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
Set-Location 'C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app'
npx.cmd tsx src/cli/voiceOnly.ts episodes/menu-long.assemble.json *> out\voices_long.log
Get-ChildItem storage\episodes\menu-long\_voice | Measure-Object | Select-Object -ExpandProperty Count | Out-File out\voices_long.done
