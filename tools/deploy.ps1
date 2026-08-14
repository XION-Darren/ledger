# 自动部署到 GitHub Pages（无需本地 Git，纯 GitHub REST API）
# 用法：powershell -ExecutionPolicy Bypass -File tools/deploy.ps1 -Token ghp_xxx [-RepoName ledger] [-Owner 你的用户名]
# 流程：校验 token → 创建仓库（如不存在）→ 上传全部项目文件 → 启用 GitHub Pages → 输出线上地址

param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$RepoName = "ledger",
  [string]$Owner = "",
  [switch]$Private
)

$ErrorActionPreference = "Stop"
$Api = "https://api.github.com"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Headers = @{
  Authorization = "Bearer $Token"
  Accept = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent" = "ledger-deploy"
}

function Invoke-GH($Method, $Path, $Body = $null) {
  $attempts = 0
  while ($true) {
    $attempts++
    $params = @{ Uri = "$Api$Path"; Method = $Method; Headers = $Headers; UseBasicParsing = $true }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 10); $params.ContentType = "application/json" }
    try {
      $res = Invoke-RestMethod @params
      return $res
    } catch {
      $status = [int]$_.Exception.Response.StatusCode
      # 仓库刚创建时 contents API 偶发 404（瞬态），GET 重试几次
      if ($status -eq 404 -and $Method -eq "GET" -and $attempts -lt 4) {
        Start-Sleep -Seconds 2
        continue
      }
      if ($status -eq 404) { return $null }
      $msg = ""
      try {
        if ($_.Exception.Response) {
          $msg = (New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd()
        }
        if (-not $msg -and $_.ErrorDetails) { $msg = $_.ErrorDetails.Message }
      } catch { $msg = $_.Exception.Message }
      throw "GitHub API $Method $Path -> $status : $msg"
    }
  }
}

Write-Host "==> 1/4 校验 token"
if (-not $Owner) {
  $user = Invoke-GH "GET" "/user"
  $Owner = $user.login
  Write-Host "    所有者: $Owner"
}

Write-Host "==> 2/4 确保仓库 $Owner/$RepoName 存在"
$repo = Invoke-GH "GET" "/repos/$Owner/$RepoName"
if (-not $repo) {
  $created = Invoke-GH "POST" "/user/repos" @{ name = $RepoName; private = [bool]$Private; auto_init = $true }
  Write-Host "    已创建仓库: $($created.html_url)"
  Start-Sleep -Seconds 3
  $repo = Invoke-GH "GET" "/repos/$Owner/$RepoName"
} else {
  Write-Host "    仓库已存在: $($repo.html_url)"
}
$branch = "main"
if ($repo.default_branch -ne "main") { $branch = $repo.default_branch }

Write-Host "==> 3/4 通过 Git Trees API 提交全部文件（分支: $branch）"
# 需要上传的目录清单（相对项目根）
$dirs = @("css", "js", "assets", "data", "tools", "tests")
$files = @("index.html", "manifest.webmanifest", "sw.js", "package.json", "README.md", "DESIGN.md", ".gitignore")
foreach ($d in $dirs) {
  Get-ChildItem -Path (Join-Path $Root $d) -Recurse -File | ForEach-Object {
    $files += $_.FullName.Substring($Root.Length + 1).Replace("\", "/")
  }
}
$files = $files | Sort-Object -Unique

# 1) 每个文件创建 blob
$items = @()
foreach ($f in $files) {
  $local = Join-Path $Root ($f.Replace("/", "\"))
  if (-not (Test-Path $local)) { continue }
  $bytes = [System.IO.File]::ReadAllBytes($local)
  $blob = Invoke-GH "POST" "/repos/$Owner/$RepoName/git/blobs" @{ content = [System.Convert]::ToBase64String($bytes); encoding = "base64" }
  $items += @{ path = $f; mode = "100644"; type = "blob"; sha = $blob.sha }
  Write-Host "    ✓ $f"
}

# 2) 基于当前 head tree 构建新 tree（未列出的既有文件保留）
$head = Invoke-GH "GET" "/repos/$Owner/$RepoName/git/ref/heads/$branch"
$headSha = $head.object.sha
$headCommit = Invoke-GH "GET" "/repos/$Owner/$RepoName/git/commits/$headSha"
$newTree = Invoke-GH "POST" "/repos/$Owner/$RepoName/git/trees" @{ base_tree = $headCommit.tree.sha; tree = $items }

# 3) 提交
$commit = Invoke-GH "POST" "/repos/$Owner/$RepoName/git/commits" @{ message = "deploy: ledger app"; tree = $newTree.sha; parents = @($headSha) }

# 4) 更新分支引用
Invoke-GH "PATCH" "/repos/$Owner/$RepoName/git/refs/heads/$branch" @{ sha = $commit.sha; force = $false } | Out-Null
Write-Host "    提交完成: $($commit.sha.Substring(0, 7))（$($items.Count) 个文件）"

Write-Host "==> 4/4 启用 GitHub Pages"
try {
  Invoke-GH "POST" "/repos/$Owner/$RepoName/pages" @{ source = @{ branch = $branch; path = "/" } } | Out-Null
} catch {
  Write-Host "    Pages 可能已启用（首次启用需等待 1-2 分钟构建）"
}

$url = "https://$Owner.github.io/$RepoName/"
Write-Host ""
Write-Host "部署完成！线上地址: $url"
Write-Host "提示：首次访问可能需等待 1~2 分钟让 Pages 构建；token 用完请到 GitHub 撤销。"
