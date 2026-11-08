param([string]$StateRoot='')
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'Skin-LaunchConfig.ps1')
$StateRoot=(Get-SkinLaunchConfig -Root $Root -StateRoot $StateRoot).stateRoot
$StatePath=Join-Path $StateRoot 'session.json'
if(!(Test-Path -LiteralPath $StatePath)){throw 'No managed theme session was recorded'}
& (Join-Path $PSScriptRoot 'Assert-CdpOwner.ps1') -StatePath $StatePath
[IO.File]::WriteAllText((Join-Path $StateRoot 'stop'),'stop',[Text.UTF8Encoding]::new($false))
$node=(Get-Command node.exe -ErrorAction Stop).Source
$helper=Join-Path $PSScriptRoot 'cdp-companion.mjs'
$watchers=@(Get-CimInstance Win32_Process -Filter "Name='node.exe'"|Where-Object {$_.ExecutablePath -ieq $node -and $_.CommandLine.Contains($helper) -and $_.CommandLine.Contains($StatePath) -and $_.CommandLine -match '\bwatch\b'})
foreach($watcher in $watchers){Wait-Process -Id $watcher.ProcessId -Timeout 30 -ErrorAction Stop}
& $node (Join-Path $PSScriptRoot 'cdp-companion.mjs') remove $StatePath
if($LASTEXITCODE -ne 0){throw 'Removal was not confirmed. Reload or exit the client normally.'}
Write-Output 'Theme layers removed. Exit Codex normally and reopen from the normal shortcut to close the debugging port.'
