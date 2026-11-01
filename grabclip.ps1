param([string]$Name = '')
$dl = Join-Path $env:USERPROFILE 'Downloads'
$f = Get-ChildItem $dl -Filter *.mp4 -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 3
foreach ($x in $f) { Write-Output ($x.Name + ' | ' + $x.Length + ' | ' + $x.LastWriteTime) }
if ($Name -ne '' -and $f) {
  $dest = 'C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app\storage\episodes\haute-ep1\clips'
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  Copy-Item $f[0].FullName (Join-Path $dest $Name) -Force
  Write-Output ('COPIED ' + $f[0].Name + ' -> ' + $Name)
}
