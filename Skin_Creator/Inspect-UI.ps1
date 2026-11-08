[CmdletBinding()]
param([string]$StatePath='', [string]$OutputPath='', [ValidatePattern('^[-a-zA-Z0-9_]{1,64}$')][string]$Label='current')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use powershell.exe / 请使用 Windows PowerShell'}
$candidates=@(
 (Join-Path $PSScriptRoot 'scripts\inspect-ui-regions.mjs'),
 (Join-Path $PSScriptRoot 'runtime\scripts\inspect-ui-regions.mjs'),
 (Join-Path $PSScriptRoot '..\Skin_Engine\scripts\inspect-ui-regions.mjs'),
 (Join-Path $PSScriptRoot '..\Skin_Usage\runtime\scripts\inspect-ui-regions.mjs')
) | Where-Object {Test-Path -LiteralPath $_}
if(!$candidates){throw 'Skin runtime is required / 需要配套引擎或使用包'}
$selected=$null
if(!$StatePath){$selected=$candidates | Where-Object {Test-Path -LiteralPath (Join-Path (Split-Path -Parent (Split-Path -Parent $_)) 'launcher.json')} | Select-Object -First 1}
if(!$selected){$selected=$candidates | Select-Object -First 1}
$scriptPath=[IO.Path]::GetFullPath($selected)
if(!$StatePath){
 $runtimeRoot=Split-Path -Parent (Split-Path -Parent $scriptPath)
 . (Join-Path (Split-Path -Parent $scriptPath) 'Skin-LaunchConfig.ps1')
 $config=Get-SkinLaunchConfig -Root $runtimeRoot
 $StatePath=Join-Path $config.stateRoot 'session.json'
}
if(!$OutputPath){$OutputPath=Join-Path $PSScriptRoot ('work\ui-inventory\'+$Label+'-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')+'.json')}
$node=(Get-Command node.exe -ErrorAction Stop).Source
& $node $scriptPath --state $StatePath --out $OutputPath --label $Label
if($LASTEXITCODE -ne 0){throw 'UI inventory failed / 区域盘点未完成'}
