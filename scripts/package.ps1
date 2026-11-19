$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$stage=& node scripts/distribution.js source
if($LASTEXITCODE -ne 0){throw 'Failed to stage public files'}
$version=(Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
$output=Join-Path (Get-Location).Path "dist/Qinghe-Guandan-AI-$version-source.zip"
if(Test-Path -LiteralPath $output){throw "Package already exists: $output. Rename the previous ZIP before rebuilding."}
& tar.exe -a -c -f $output -C $stage .
if($LASTEXITCODE -ne 0){throw 'Failed to create ZIP'}
Write-Output $output
