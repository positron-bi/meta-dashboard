$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

python (Join-Path $repo 'python\refresh_from_sql.py')
if ($LASTEXITCODE -ne 0) {
    throw 'رفرش داده ناموفق بود؛ هیچ داده‌ای push نشد.'
}

& (Join-Path $repo 'publish-to-github.ps1')
