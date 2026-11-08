[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(!(Test-Path -LiteralPath (Join-Path $PSScriptRoot '..\Skin_Engine\scripts\coverage-runner.mjs'))){throw 'Keep Skin_Engine next to Skin_Creator / 创作需要相邻的 Skin_Engine'}
& $node (Join-Path $PSScriptRoot 'scripts\creator.mjs') @Arguments
if($LASTEXITCODE -ne 0){throw 'Skin creation step failed; inspect the reported reason / 创作步骤未完成，请处理报告中的原因'}
