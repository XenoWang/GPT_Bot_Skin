[CmdletBinding()]
param([string]$StatePath='', [string]$OutputPath='', [ValidatePattern('^[-a-zA-Z0-9_]{1,64}$')][string]$Label='current')
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Use powershell.exe / 请使用 Windows PowerShell'}
$runtimeRoot=$PSScriptRoot
if(!(Test-Path -LiteralPath (Join-Path $runtimeRoot 'scripts\inspect-ui-regions.mjs'))){$runtimeRoot=Join-Path $PSScriptRoot 'runtime'}
$scriptPath=Join-Path $runtimeRoot 'scripts\inspect-ui-regions.mjs'
if(!(Test-Path -LiteralPath $scriptPath)){throw 'The bundled runtime is missing / 缺少包内运行文件'}
if(!$StatePath){
 . (Join-Path $runtimeRoot 'scripts\Skin-LaunchConfig.ps1')
 $config=Get-SkinLaunchConfig -Root $runtimeRoot
 $StatePath=Join-Path $config.stateRoot 'session.json'
}
if(!$OutputPath){$OutputPath=Join-Path $PSScriptRoot ('work\ui-inventory\'+$Label+'-'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')+'.json')}
$node=(Get-Command node.exe -ErrorAction Stop).Source
& $node $scriptPath --state $StatePath --out $OutputPath --label $Label
if($LASTEXITCODE -ne 0){throw 'UI inventory failed / 区域盘点未完成'}
