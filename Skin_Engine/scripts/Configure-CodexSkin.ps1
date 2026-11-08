[CmdletBinding()]
param([ValidateSet('','proxy','direct')][string]$ProxyMode='',[string]$ProxyServer='127.0.0.1:7897',[int]$Port=9335,[string]$StateRoot='',[switch]$DesktopShortcut,[string]$ShortcutName='Codex Skin')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use powershell.exe'}
$Root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Skin-LaunchConfig.ps1')
if(!$ProxyMode){
 Write-Host '1: 本机代理 / Local proxy   2: 直连 / Direct'
 $choice=Read-Host '选择 / Choose (1/2)'
 if($choice -eq '1'){$ProxyMode='proxy';$ProxyServer=Read-Host 'HTTP proxy / HTTP 代理 (127.0.0.1:7897)';if(!$ProxyServer){$ProxyServer='127.0.0.1:7897'}}
 elseif($choice -eq '2'){$ProxyMode='direct'}else{throw 'No configuration was saved / 未保存配置'}
}
$launch=Get-SkinLaunchConfig -Root $Root -Port $Port -ProxyMode $ProxyMode -ProxyServer $ProxyServer -StateRoot $StateRoot
$config=[ordered]@{port=$launch.port;proxyMode=$launch.proxyMode;proxyServer=$launch.proxyServer}
if($StateRoot){$config.stateRoot=$launch.stateRoot}
$configPath=Join-Path $Root 'launcher.json'
if(Test-Path -LiteralPath $configPath){Copy-Item -LiteralPath $configPath -Destination ($configPath+'.previous') -Force}
[IO.File]::WriteAllText($configPath,($config|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
if($DesktopShortcut){
 if($ShortcutName -notmatch '^[^<>:"/\\|?*\x00-\x1f]{1,80}$' -or $ShortcutName.EndsWith('.') -or $ShortcutName.EndsWith(' ')){throw 'Invalid shortcut name'}
 $desktop=[Environment]::GetFolderPath('Desktop')
 $shortcutPath=Join-Path $desktop ($ShortcutName+'.lnk')
 $shell=New-Object -ComObject WScript.Shell
 if(Test-Path -LiteralPath $shortcutPath){Copy-Item -LiteralPath $shortcutPath -Destination ($shortcutPath+'.previous') -Force}
 $shortcut=$shell.CreateShortcut($shortcutPath)
 $shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
 $shortcut.Arguments='-NoLogo -NoProfile -WindowStyle Hidden -File "'+(Join-Path $PSScriptRoot 'Start-CodexTheme.ps1')+'" -WaitForExit'
 $shortcut.WorkingDirectory=$Root;$shortcut.WindowStyle=7;$shortcut.Description='Codex Skin - official client / 官方客户端';$shortcut.Save()
 Write-Output ('Shortcut / 快捷方式: '+$shortcutPath)
}
Write-Output ('Saved / 已保存: '+$configPath)
Write-Output 'Configuration affects the next managed launch; no client was closed / 配置用于下次启动，未关闭客户端'
