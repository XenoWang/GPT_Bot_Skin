[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$SpecPath)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use Windows PowerShell'}
Add-Type -AssemblyName System.Drawing
$spec=Get-Content -LiteralPath $SpecPath -Raw -Encoding UTF8 | ConvertFrom-Json
$source=[IO.Path]::GetFullPath([string]$spec.input)
if((Get-Item -LiteralPath $source).Length -gt 20MB){throw 'Source image exceeds 20 MiB'}
$image=$null;$target=$null;$graphics=$null;$thumb=$null;$tg=$null;$stream=$null
try{
 try{$image=[Drawing.Image]::FromFile($source)}catch{throw 'Image decoder unavailable or invalid image. Provide PNG/JPEG; WebP requires an installed compatible Windows decoder.'}
 if([long]$image.Width*$image.Height -gt 64000000){throw 'Decoded image exceeds 64 million pixels'}
 if($image.PropertyIdList -contains 274){$orientation=[BitConverter]::ToUInt16($image.GetPropertyItem(274).Value,0);$rotations=@{2=4;3=2;4=6;5=5;6=1;7=7;8=3};if($rotations.ContainsKey([int]$orientation)){$image.RotateFlip([Drawing.RotateFlipType]$rotations[[int]$orientation])}}
 $width=$image.Width;$height=$image.Height
 $thumb=New-Object Drawing.Bitmap 96,96
 $tg=[Drawing.Graphics]::FromImage($thumb);$tg.DrawImage($image,0,0,96,96)
 $hist=@{}
 for($y=0;$y -lt 96;$y++){for($x=0;$x -lt 96;$x++){$c=$thumb.GetPixel($x,$y);if($c.A -lt 128){continue};$color='#{0:X2}{1:X2}{2:X2}' -f ([int][Math]::Min(255,([Math]::Floor($c.R/16)*16+8))),([int][Math]::Min(255,([Math]::Floor($c.G/16)*16+8))),([int][Math]::Min(255,([Math]::Floor($c.B/16)*16+8)));if(!$hist.ContainsKey($color)){$hist[$color]=0};$hist[$color]++}}
 $colors=@($hist.GetEnumerator() | Sort-Object @{Expression='Value';Descending=$true},@{Expression='Name';Descending=$false} | Select-Object -First 5 | ForEach-Object {$_.Name})
 if($spec.output){
  $w=[int]$spec.target[0];$h=[int]$spec.target[1];$crop=$spec.crop
  if($w -lt 1 -or $h -lt 1 -or [long]$w*$h -gt 64000000 -or $crop.Count -ne 4){throw 'Invalid output size or crop'}
  if($crop[0] -lt 0 -or $crop[1] -lt 0 -or $crop[2] -le 0 -or $crop[3] -le 0 -or ($crop[0]+$crop[2]) -gt ($width+0.001) -or ($crop[1]+$crop[3]) -gt ($height+0.001) -or $w -gt ($crop[2]+0.001) -or $h -gt ($crop[3]+0.001)){throw 'Invalid crop or enlargement'}
  $target=New-Object Drawing.Bitmap $w,$h
  $graphics=[Drawing.Graphics]::FromImage($target);$graphics.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy;$graphics.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$graphics.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $dest=New-Object Drawing.Rectangle 0,0,$w,$h
  $graphics.DrawImage($image,$dest,[single]$crop[0],[single]$crop[1],[single]$crop[2],[single]$crop[3],[Drawing.GraphicsUnit]::Pixel)
  $stream=[IO.File]::Open([IO.Path]::GetFullPath([string]$spec.output),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $target.Save($stream,[Drawing.Imaging.ImageFormat]::Png);$stream.Flush();$stream.Dispose();$stream=$null
 }
 @{width=$width;height=$height;colors=$colors;orientationApplied=$true} | ConvertTo-Json -Compress
}finally{foreach($item in @($stream,$graphics,$target,$tg,$thumb,$image)){if($null -ne $item){$item.Dispose()}}}
