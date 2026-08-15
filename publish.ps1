# 一键发布脚本：上传全部代码到 GitHub Pages + 可选版本归档
# 用法：powershell -ExecutionPolicy Bypass -File publish.ps1 -Version v1.1 -Message "本次更新说明"
#   -Version 可选：填了则同时归档版本（本地 versions\ + 仓库 versions/）
# 注意：publish-config.json 内含 Token，绝不上传 GitHub

param(
  [string]$Version = "",
  [string]$Message = "update ledger app"
)

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir 'publish-config.json'
if (-not (Test-Path -LiteralPath $configPath)) { Write-Error "缺少 publish-config.json"; exit 1 }

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$token = $config.token
$repo  = $config.repo
$branch = "main"
$api = "https://api.github.com"
$headers = @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json"; "X-GitHub-Api-Version" = "2022-11-28"; "User-Agent" = "ledger-publish" }

function GH($Method, $Path, $Body = $null) {
  $p = @{ Uri = "$api$Path"; Method = $Method; Headers = $headers; UseBasicParsing = $true }
  if ($Body) { $p.Body = ($Body | ConvertTo-Json -Depth 10); $p.ContentType = "application/json" }
  try { return Invoke-RestMethod @p }
  catch {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 404) { return $null }
    throw "GitHub API $Method $Path -> $status : $($_.ErrorDetails.Message)"
  }
}

Write-Host "==> 1/3 收集项目文件（排除 data/、versions/、敏感文件）"
$skipDirs = @('data', 'versions', 'node_modules', '.tools')
$skipFiles = @('publish-config.json')
$files = @()
foreach ($d in (Get-ChildItem $scriptDir -Directory | Where-Object { $_.Name -notin $skipDirs })) {
  Get-ChildItem $d.FullName -Recurse -File | ForEach-Object {
    if ($_.Name -notlike 'TOKENS*') { $files += $_.FullName.Substring($scriptDir.Length + 1).Replace('\', '/') }
  }
}
Get-ChildItem $scriptDir -File | ForEach-Object {
  if ($_.Name -notin $skipFiles -and $_.Name -notlike 'TOKENS*' -and $_.Name -notlike '*.backup*') {
    $files += $_.Name
  }
}
$files = $files | Sort-Object -Unique
Write-Host "    共 $($files.Count) 个文件"

Write-Host "==> 2/3 Git Trees 提交（分支: $branch）"
$items = @()
foreach ($f in $files) {
  $local = Join-Path $scriptDir ($f.Replace('/', '\'))
  if (-not (Test-Path -LiteralPath $local)) { continue }
  $b = GH "POST" "/repos/$repo/git/blobs" @{ content = [System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes($local)); encoding = "base64" }
  $items += @{ path = $f; mode = "100644"; type = "blob"; sha = $b.sha }
}
$head = GH "GET" "/repos/$repo/git/ref/heads/$branch"
$hc = GH "GET" "/repos/$repo/git/commits/$($head.object.sha)"
$tree = GH "POST" "/repos/$repo/git/trees" @{ base_tree = $hc.tree.sha; tree = $items }
$commit = GH "POST" "/repos/$repo/git/commits" @{ message = $Message; tree = $tree.sha; parents = @($head.object.sha) }
GH "PATCH" "/repos/$repo/git/refs/heads/$branch" @{ sha = $commit.sha; force = $false } | Out-Null
Write-Host "    提交完成: $($commit.sha.Substring(0, 7))"
Write-Host "    线上地址: https://$($repo.Split('/')[0]).github.io/$($repo.Split('/')[1])/（1~3 分钟后生效）"

# ===== 版本归档 =====
if ($Version) {
  Write-Host "==> 3/3 版本归档: $Version"
  $verDir = Join-Path $scriptDir "versions\$Version"
  if (-not (Test-Path -LiteralPath $verDir)) { New-Item -ItemType Directory -Path $verDir -Force | Out-Null }

  foreach ($f in $files) {
    $src = Join-Path $scriptDir ($f.Replace('/', '\'))
    $dst = Join-Path $verDir ($f.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $src)) { continue }
    $dstDir = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
    Copy-Item -LiteralPath $src -Destination $dst -Force
  }
  $noteFile = Join-Path $verDir '版本说明.txt'
  if (-not (Test-Path -LiteralPath $noteFile)) {
    Set-Content -LiteralPath $noteFile -Value "# $Version" -Encoding UTF8
  }

  foreach ($f in $files) {
    $local = Join-Path $verDir ($f.Replace('/', '\'))
    if (-not (Test-Path -LiteralPath $local)) { continue }
    $remotePath = "versions/$Version/$f"
    $b = GH "POST" "/repos/$repo/git/blobs" @{ content = [System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes($local)); encoding = "base64" }
    $items += @{ path = $remotePath; mode = "100644"; type = "blob"; sha = $b.sha }
  }
  $noteLocal = Join-Path $verDir '版本说明.txt'
  if (Test-Path -LiteralPath $noteLocal) {
    $b = GH "POST" "/repos/$repo/git/blobs" @{ content = [System.Convert]::ToBase64String([System.IO.File]::ReadAllBytes($noteLocal)); encoding = "base64" }
    $items += @{ path = "versions/$Version/版本说明.txt"; mode = "100644"; type = "blob"; sha = $b.sha }
  }
  $head2 = GH "GET" "/repos/$repo/git/ref/heads/$branch"
  $hc2 = GH "GET" "/repos/$repo/git/commits/$($head2.object.sha)"
  $tree2 = GH "POST" "/repos/$repo/git/trees" @{ base_tree = $hc2.tree.sha; tree = $items }
  $commit2 = GH "POST" "/repos/$repo/git/commits" @{ message = "archive $Version"; tree = $tree2.sha; parents = @($head2.object.sha) }
  GH "PATCH" "/repos/$repo/git/refs/heads/$branch" @{ sha = $commit2.sha; force = $false } | Out-Null
  Write-Host "    版本 $Version 已归档（本地 + 仓库）"
}

Write-Host "ALL DONE"
