param(
 [Parameter(Mandatory=$true)][string]$StatePath,
 [Parameter(Mandatory=$true)][ValidateSet('snapshot','normal','maximized','restore')][string]$Operation,
 [string]$Token,
 [string]$Placement
)
$ErrorActionPreference='Stop'
# Identity checks are repeated for each operation, including restoration.
& (Join-Path $PSScriptRoot 'Assert-CdpOwner.ps1') -StatePath $StatePath | Out-Null
$state=Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
$ownerProcess=Get-Process -Id ([int]$state.ownerPid) -ErrorAction Stop
$ownerId=[int]$ownerProcess.Id
$startedTicks=$ownerProcess.StartTime.ToUniversalTime().ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)

Add-Type -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'native-window.cs') -Raw -Encoding UTF8)

function Read-Window([IntPtr]$Handle) {
 $saved=[CodexCreatorNativeWindows]::Read($Handle,$ownerId)
 return @{handle=$Handle.ToInt64().ToString([Globalization.CultureInfo]::InvariantCulture);foreground=([CodexCreatorNativeWindows]::GetForegroundWindow() -eq $Handle);placement=@{flags=[int]$saved.flags;showCmd=[int]$saved.showCmd;min=@($saved.min.x,$saved.min.y);max=@($saved.max.x,$saved.max.y);normal=@($saved.normal.left,$saved.normal.top,$saved.normal.right,$saved.normal.bottom)}}
}
function Convert-Placement($Value) {
 if(!$Value -or (($Value.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'flags,max,min,normal,showCmd'){throw 'Invalid saved window placement'}
 if(($Value.flags -isnot [int] -and $Value.flags -isnot [long]) -or $Value.flags -lt 0 -or $Value.flags -gt 7 -or ($Value.showCmd -isnot [int] -and $Value.showCmd -isnot [long]) -or $Value.showCmd -notin @(1,3)){throw 'Only a normal or maximized window can be restored'}
 foreach($field in @('min','max','normal')){
  $length=2;if($field -eq 'normal'){$length=4}
  if($Value.$field -isnot [Array] -or $Value.$field.Count -ne $length){throw 'Invalid saved window coordinates'}
  foreach($coordinate in $Value.$field){if(($coordinate -isnot [int] -and $coordinate -isnot [long]) -or $coordinate -lt -2147483648 -or $coordinate -gt 2147483647){throw 'Invalid saved window coordinates'}}
 }
 if($Value.normal[2] -le $Value.normal[0] -or $Value.normal[3] -le $Value.normal[1]){throw 'Invalid restored window size'}
 $p=New-Object CodexCreatorNativeWindows+PLACEMENT
 $p.flags=[uint32]$Value.flags;$p.showCmd=[uint32]$Value.showCmd
 $minPoint=New-Object CodexCreatorNativeWindows+POINT;$minPoint.x=$Value.min[0];$minPoint.y=$Value.min[1];$p.min=$minPoint
 $maxPoint=New-Object CodexCreatorNativeWindows+POINT;$maxPoint.x=$Value.max[0];$maxPoint.y=$Value.max[1];$p.max=$maxPoint
 $normalRect=New-Object CodexCreatorNativeWindows+RECT
 $normalRect.left=$Value.normal[0];$normalRect.top=$Value.normal[1];$normalRect.right=$Value.normal[2];$normalRect.bottom=$Value.normal[3];$p.normal=$normalRect
 return $p
}

if($Operation -eq 'snapshot'){
 $windows=@([CodexCreatorNativeWindows]::Windows($ownerId) | ForEach-Object {Read-Window $_})
 @{owner=@{pid=$ownerId;startedTicks=$startedTicks};windows=$windows} | ConvertTo-Json -Depth 8 -Compress
}else{
 $identity=$Token | ConvertFrom-Json
 if(!$identity -or (($identity.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'handle,pid,startedTicks' -or $identity.pid -ne $ownerId -or $identity.startedTicks -cne $startedTicks -or $identity.handle -isnot [string] -or $identity.handle -cnotmatch '^[1-9][0-9]*$'){throw 'Native window process identity changed'}
 $handle=[IntPtr]([long]::Parse($identity.handle,[Globalization.CultureInfo]::InvariantCulture))
 $current=Read-Window $handle
 if($Operation -eq 'restore'){$requested=$Placement | ConvertFrom-Json}else{
  $requested=$current.placement | ConvertTo-Json -Compress | ConvertFrom-Json
  $requested.flags=0;$requested.showCmd=1;if($Operation -eq 'maximized'){$requested.showCmd=3}
 }
 $native=Convert-Placement $requested
 [CodexCreatorNativeWindows]::Apply($handle,$ownerId,$native)
 $reached=$false
 for($attempt=0;$attempt -lt 40;$attempt++){
  $result=Read-Window $handle
  if($result.placement.showCmd -eq $requested.showCmd -and ($result.placement.normal -join ',') -ceq ($requested.normal -join ',')){$reached=$true;break}
  Start-Sleep -Milliseconds 50
 }
 if(!$reached){throw 'Native window transition did not reach the requested placement'}
 $result | ConvertTo-Json -Depth 8 -Compress
}
