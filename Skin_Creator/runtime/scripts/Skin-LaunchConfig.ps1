# Pure configuration helpers; sourcing this file launches nothing.
function Get-SkinRuntimeRole {
 param([Parameter(Mandatory=$true)][string]$Root)
 $runtimeProfilePath=Join-Path $Root 'runtime-profile.json'
 if(!(Test-Path -LiteralPath $runtimeProfilePath)){return 'usage'}
 $item=Get-Item -LiteralPath $runtimeProfilePath
 if($item.Length -gt 32768 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid runtime profile'}
 $data=Get-Content -LiteralPath $runtimeProfilePath -Raw -Encoding UTF8|ConvertFrom-Json
 if($null -eq $data -or $data -is [array] -or ($data.schemaVersion -isnot [int] -and $data.schemaVersion -isnot [long]) -or $data.schemaVersion -ne 1 -or $data.role -notin @('creator','usage')){throw 'Invalid runtime profile'}
 foreach($key in $data.PSObject.Properties.Name){if($key -notin @('schemaVersion','role')){throw 'Unknown runtime profile field'}}
 return $data.role
}
function Get-SkinLaunchConfig {
 param([Parameter(Mandatory=$true)][string]$Root,[int]$Port=0,[string]$ProxyMode='',[string]$ProxyServer='',[string]$StateRoot='')
 $configPath=Join-Path $Root 'launcher.json'
 $config=@{}
 if(Test-Path -LiteralPath $configPath){
  $item=Get-Item -LiteralPath $configPath
  if($item.Length -gt 32768 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid launcher.json'}
  $config=Get-Content -LiteralPath $configPath -Raw -Encoding UTF8|ConvertFrom-Json
  if($config -is [array] -or $null -eq $config){throw 'Expected a launcher configuration object'}
  foreach($key in $config.PSObject.Properties.Name){if($key -notin @('port','proxyMode','proxyServer','stateRoot')){throw ('Unknown launch option: '+$key)}}
 }
 if(!$Port){if($config.port){$Port=$config.port}else{$Port=9335}}
 if(!$ProxyMode){$ProxyMode=$config.proxyMode}
 if($ProxyMode -notin @('proxy','direct')){throw 'Run Configure-CodexSkin.ps1 to choose proxy or direct / 请先配置代理或直连'}
 if(!$ProxyServer){$ProxyServer=$config.proxyServer}
 if($ProxyMode -eq 'proxy'){
  if($ProxyServer -notmatch '^127\.0\.0\.1:(\d{1,5})$'){throw 'Expected local HTTP proxy 127.0.0.1:port / 需要本机 HTTP 代理'}
  $proxyPort=[int]$Matches[1];if($proxyPort -lt 1 -or $proxyPort -gt 65535){throw 'Invalid proxy port'}
 }else{$ProxyServer=''}
 if($Port -lt 1024 -or $Port -gt 65535){throw 'Invalid CDP port'}
 if(!$StateRoot){$StateRoot=$config.stateRoot}
 if(!$StateRoot){$folder=if((Get-SkinRuntimeRole -Root $Root) -eq 'creator'){'CodexSkinCreator'}else{'CodexSkin'};$StateRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) $folder}
 if(![IO.Path]::IsPathRooted($StateRoot)){$StateRoot=Join-Path $Root $StateRoot}
 $StateRoot=[IO.Path]::GetFullPath($StateRoot)
 [pscustomobject]@{port=$Port;proxyMode=$ProxyMode;proxyServer=$ProxyServer;stateRoot=$StateRoot}
}
function Get-SkinClientArguments {
 param([Parameter(Mandatory=$true)]$Config)
 $arguments=@('--remote-debugging-address=127.0.0.1',('--remote-debugging-port='+$Config.port))
 if($Config.proxyMode -eq 'proxy'){$arguments+=@(('--proxy-server=http://'+$Config.proxyServer),'--proxy-bypass-list=localhost;127.0.0.1;[::1]')}
 elseif($Config.proxyMode -eq 'direct'){$arguments+='--no-proxy-server'}else{throw 'Invalid proxy mode'}
 return $arguments
}
