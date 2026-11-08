[CmdletBinding()]
param([int]$Port=0,[ValidateSet('','proxy','direct')][string]$ProxyMode='',[string]$ProxyServer='',[string]$StateRoot='',[switch]$WaitForExit)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use Windows PowerShell: powershell.exe -NoProfile -File scripts\Start-CodexTheme.ps1'}
$Root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Skin-LaunchConfig.ps1')
$launch=Get-SkinLaunchConfig -Root $Root -Port $Port -ProxyMode $ProxyMode -ProxyServer $ProxyServer -StateRoot $StateRoot
$Port=$launch.port;$ProxyMode=$launch.proxyMode;$ProxyServer=$launch.proxyServer;$StateRoot=$launch.stateRoot
if($ProxyMode -eq 'proxy'){
 $proxyPort=[int]($ProxyServer.Split(':')[1])
 if(!@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $proxyPort -State Listen -ErrorAction SilentlyContinue).Count){throw 'Local proxy is not listening; client was not changed / 本机代理未启动'}
}
$probe=$StateRoot
while($probe){if(Test-Path -LiteralPath $probe){if((Get-Item -LiteralPath $probe -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Runtime directory must not use reparse points'}};$parent=Split-Path -Parent $probe;if($parent -eq $probe){break};$probe=$parent}
[IO.Directory]::CreateDirectory($StateRoot)|Out-Null
$StatePath=Join-Path $StateRoot 'session.json'
$helper=Join-Path $PSScriptRoot 'cdp-companion.mjs'
$node=(Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion=(& $node -p 'process.versions.node' | Select-Object -Last 1)
if($LASTEXITCODE -ne 0 -or [int](($nodeVersion -split '\.')[0]) -lt 22){throw 'Node 22+ is required'}
foreach($file in @('cdp-payload.js','cdp-payload.json')){if(!(Test-Path -LiteralPath (Join-Path $Root ('dist\'+$file)))){throw 'Build the CDP payload first'}}
function Start-ThemeCompanion {
 $stop=Join-Path $StateRoot 'stop';if(Test-Path -LiteralPath $stop){Remove-Item -LiteralPath $stop}
 $helperArgs=@(('"'+$helper+'"'),'watch',('"'+$StatePath+'"'))
 $env:NO_PROXY='127.0.0.1,localhost,::1'
 $daemon=Start-Process -FilePath $node -ArgumentList $helperArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $StateRoot 'companion.log') -RedirectStandardError (Join-Path $StateRoot 'companion-error.log')
 Write-Output ('Theme companion PID '+$daemon.Id)
}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$mutex=[Threading.Mutex]::new($false,('Local\CodexAppearance.'+$sid))
$locked=$false
try{
 try{$locked=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$locked=$true}
 if(!$locked){throw 'A theme launch is already in progress'}
 $pkg=Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
 if(!$pkg -or $pkg.SignatureKind -ne 'Store' -or $pkg.IsDevelopmentMode){throw 'Official Codex Store package not found'}
 $exe=Join-Path $pkg.InstallLocation 'app\ChatGPT.exe'
 if(!(Test-Path -LiteralPath $exe)){throw 'Registered Codex executable not found'}
 $current=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {$_.ExecutablePath -ieq $exe})
 if($current.Count -and (Test-Path -LiteralPath $StatePath)){
  $reuse=$false
  try{$saved=Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8|ConvertFrom-Json;if([int]$saved.port -eq $Port -and $saved.proxy -ceq $ProxyServer -and (($saved.proxyMode -eq $ProxyMode) -or (!$saved.proxyMode -and $ProxyMode -eq 'proxy'))){& (Join-Path $PSScriptRoot 'Assert-CdpOwner.ps1') -StatePath $StatePath;$reuse=$true}}catch{Write-Verbose 'Saved session is not reusable'}
  if($reuse){
   $watchers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.ExecutablePath -ieq $node -and $_.CommandLine.Contains($helper) -and $_.CommandLine.Contains($StatePath) -and $_.CommandLine -match '\bwatch\b'})
   if(!$watchers.Count){Start-ThemeCompanion}
   Start-Process -FilePath $exe -WindowStyle Normal | Out-Null
   Write-Output 'Reused the verified theme session; client was not restarted.'
   return
  }
 }
 if($current.Count){
  if(!$WaitForExit){throw 'Codex is running. Save input and exit Codex normally, or use -WaitForExit to queue startup. This launcher never force-closes it.'}
  Write-Output 'Waiting for the user to exit Codex normally; no processes will be terminated.'
  $deadline=[DateTime]::UtcNow.AddMinutes(10)
  do{Start-Sleep -Milliseconds 500;$current=@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe'" | Where-Object {$_.ExecutablePath -ieq $exe});if([DateTime]::UtcNow -gt $deadline){throw 'Timed out waiting for user exit'}}while($current.Count)
  # Package may have updated while waiting: discover it again, never trust stale paths.
  $pkg=Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object Version -Descending | Select-Object -First 1
  if(!$pkg -or $pkg.SignatureKind -ne 'Store' -or $pkg.IsDevelopmentMode){throw 'Package identity changed'}
  $exe=Join-Path $pkg.InstallLocation 'app\ChatGPT.exe'
 }
 if(@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count){throw 'Requested CDP port is occupied; no connection attempted'}
 # No profile copy, binary patch, security-disabling flags or settings rewrite.
 $arguments=@(Get-SkinClientArguments -Config $launch)
 foreach($proxyName in @('HTTP_PROXY','HTTPS_PROXY','ALL_PROXY')){
  if($ProxyMode -eq 'proxy'){[Environment]::SetEnvironmentVariable($proxyName,'http://'+$ProxyServer,'Process')}
  else{[Environment]::SetEnvironmentVariable($proxyName,$null,'Process')}
 }
 $env:NO_PROXY='127.0.0.1,localhost,::1'
 Start-Process -FilePath $exe -ArgumentList $arguments -WindowStyle Normal | Out-Null
 $deadline=[DateTime]::UtcNow.AddSeconds(45);$listeners=@()
 do{
  $listeners=@(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  if($listeners.Count){break};Start-Sleep -Milliseconds 400
 }while([DateTime]::UtcNow -lt $deadline)
 if(!$listeners.Count){throw 'Official client did not expose CDP. No patch or security changes will be attempted.'}
 if(@($listeners|Where-Object {$_.LocalAddress -ne '127.0.0.1'}).Count){throw 'CDP is not loopback-only. Exit Codex normally to close that listener.'}
 $owners=@($listeners.OwningProcess|Select-Object -Unique)
 if($owners.Count -ne 1){throw 'Ambiguous CDP owner'}
 $owner=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$owners[0])
 if(!$owner -or $owner.ExecutablePath -ine $exe){throw 'Unexpected CDP process'}
 $request=[Net.HttpWebRequest]::Create('http://127.0.0.1:'+$Port+'/json/version')
 $request.Proxy=$null;$request.Timeout=5000;$request.AllowAutoRedirect=$false
 $response=$request.GetResponse()
 try{if([int]$response.StatusCode -ne 200){throw 'Invalid CDP discovery response'};$reader=[IO.StreamReader]::new($response.GetResponseStream());try{$version=$reader.ReadToEnd()|ConvertFrom-Json}finally{$reader.Dispose()}}finally{$response.Dispose()}
 $url=[Uri]$version.webSocketDebuggerUrl
 if($url.Scheme -cne 'ws' -or $url.Host -cne '127.0.0.1' -or $url.Port -ne $Port -or $url.UserInfo -or $url.Query -or $url.Fragment -or $url.AbsolutePath -notmatch '^/devtools/browser/([A-Za-z0-9._-]{1,200})$'){throw 'Invalid browser identity'}
 $browserId=$Matches[1]
 $state=[ordered]@{port=$Port;proxy=$ProxyServer;proxyMode=$ProxyMode;exe=$exe;packageFullName=$pkg.PackageFullName;ownerPid=$owner.ProcessId;ownerStarted=$owner.CreationDate.ToUniversalTime().ToString('o');browserId=$browserId;browserUrl=$url.AbsoluteUri;created=[DateTime]::UtcNow.ToString('o')}
 $temp=Join-Path $StateRoot 'session.json.tmp'
 [IO.File]::WriteAllText($temp,($state|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
 Move-Item -LiteralPath $temp -Destination $StatePath -Force
 & (Join-Path $PSScriptRoot 'Assert-CdpOwner.ps1') -StatePath $StatePath
 Start-ThemeCompanion
 Write-Output ('Official Codex started: '+$ProxyMode+' '+$ProxyServer+'. Inspect status.json and the actual window before claiming success.')
}finally{if($locked){$mutex.ReleaseMutex()};$mutex.Dispose()}
