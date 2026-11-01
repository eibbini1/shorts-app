$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
Set-Location 'C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app'
foreach ($e in @('cupcake-ep1','glam-ep1')) {
  Write-Output "== $e"
  npx.cmd tsx src/cli/voiceOnly.ts "episodes/$e.assemble.json" 2>&1 | Select-Object -Last 2
  Get-ChildItem "storage\episodes\$e\_voice\*" | ForEach-Object { $_.FullName }
}
