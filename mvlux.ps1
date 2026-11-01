$b='C:\Users\Acer\OneDrive\Desktop\esam\shorts-app-fixed\shorts-app\storage\episodes'
New-Item -ItemType Directory -Force "$b\haute-ep1\stills" | Out-Null
$map=@('05','04','03','02','01','00')
for ($i=0; $i -lt 6; $i++) { Copy-Item "$b\_inbox\h_f$($map[$i]).jpg" "$b\haute-ep1\stills\scene$($i+1).jpg" -Force }
Get-ChildItem "$b\haute-ep1\stills" | ForEach-Object { $_.Name + ' ' + $_.Length }
