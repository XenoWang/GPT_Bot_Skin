param([Parameter(Mandatory=$true)][string]$StatePath)
$ErrorActionPreference='Stop'
$state=Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
if([int]$state.port -lt 1024 -or [int]$state.port -gt 65535){throw 'Invalid CDP port'}
$package=Get-AppxPackage -Name 'OpenAI.Codex' | Where-Object {$_.PackageFullName -ceq $state.packageFullName} | Select-Object -First 1
if(!$package -or $package.SignatureKind -ne 'Store' -or $package.IsDevelopmentMode){throw 'Official Store package identity no longer matches'}
$exe=Join-Path $package.InstallLocation 'app\ChatGPT.exe'
if($exe -ine $state.exe){throw 'Executable identity mismatch'}
$listeners=@(Get-NetTCPConnection -LocalPort ([int]$state.port) -State Listen -ErrorAction SilentlyContinue)
if(!$listeners.Count){throw 'CDP endpoint is not listening'}
foreach($listener in $listeners){
 if($listener.LocalAddress -ne '127.0.0.1'){throw 'CDP listener is not restricted to IPv4 loopback'}
 if($listener.OwningProcess -ne [int]$state.ownerPid){throw 'CDP port owner changed'}
}
$owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$state.ownerPid)
if(!$owner -or $owner.ExecutablePath -ine $exe){throw 'CDP process is not the official client'}
if($owner.CreationDate.ToUniversalTime().ToString('o') -cne $state.ownerStarted){throw 'CDP process identity was reused'}
Write-Output 'Official loopback CDP owner confirmed'
