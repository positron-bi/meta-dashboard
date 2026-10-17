$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

if (-not (Test-Path (Join-Path $repo '.git'))) {
    git init
    git branch -M main
}

$remotes = @(git remote)
if ($remotes -notcontains 'origin') {
    throw 'ابتدا ریپازیتوری GitHub را بسازید و آدرس آن را با git remote add origin اضافه کنید.'
}

git add -A
if (@(git status --porcelain).Count -eq 0) {
    Write-Host 'تغییری برای انتشار وجود ندارد.'
    exit 0
}

git commit -m 'Publish Meta financial dashboard'
git push -u origin main
Write-Host 'انتشار انجام شد.'
