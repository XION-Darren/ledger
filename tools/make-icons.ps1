# 生成应用图标 PNG
# 流程：Edge 无头渲染 assets/icon.svg 得到 512px 底图，
#       再用 System.Drawing 缩放生成 192 / 180（避开 headless 最小窗口限制）。
# 用法：powershell -ExecutionPolicy Bypass -File tools/make-icons.ps1
# 产物：assets/icon-512.png、assets/icon-192.png、assets/apple-touch-icon.png

param([string]$EdgePath = "")

if (!$EdgePath) {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles}\Microsoft\Edge\Application\msedge.exe"
  )
  $EdgePath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (!$EdgePath -or !(Test-Path $EdgePath)) {
  Write-Error "未找到 Edge 浏览器，请使用 -EdgePath 参数指定 msedge.exe 路径"
  exit 1
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$renderHtml = Join-Path $PSScriptRoot "icon-render.html"
$htmlUrl = "file:///" + ($renderHtml -replace '\\', '/')
$big = Join-Path $root "assets\icon-512.png"
$tmpBig = Join-Path $env:TEMP "ledger-icon-512.png"

Write-Host "==> 渲染 512x512 底图"
$profile = "$env:TEMP\ledger-edge-profile-$([guid]::NewGuid().ToString('N').Substring(0,8))"
& $EdgePath --headless=new --disable-gpu --hide-scrollbars `
  --force-device-scale-factor=1 --default-background-color=00000000 `
  --user-data-dir="$profile" `
  --window-size="512,512" --virtual-time-budget=2000 --screenshot="$tmpBig" $htmlUrl 2>$null

if (!(Test-Path $tmpBig)) { Write-Error "底图生成失败"; exit 1 }

Add-Type -AssemblyName System.Drawing

# 512 原样保存
Copy-Item $tmpBig $big -Force

# 缩放生成 192 与 180（HighQualityBicubic）
foreach ($size in @(192, 180)) {
  if ($size -eq 180) {
    $dest = Join-Path $root "assets\apple-touch-icon.png"
  } else {
    $dest = Join-Path $root "assets\icon-$size.png"
  }
  Write-Host "==> 缩放生成 $size x $size -> $dest"
  $src = [System.Drawing.Image]::FromFile($tmpBig)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $size, $size)
  $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $src.Dispose()
}

Remove-Item $tmpBig -Force -ErrorAction SilentlyContinue
Write-Host "完成：icon-512.png / icon-192.png / apple-touch-icon.png"
