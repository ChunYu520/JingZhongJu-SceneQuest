[CmdletBinding()]
param([string]$OutputPath)

$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not $OutputPath) { $OutputPath = Join-Path $AppRoot 'output\SceneQuest-Windows-Server-Deployment.zip' }
$secretFile = Join-Path $AppRoot 'runtime\config\.env.production'
if (Test-Path $secretFile) { throw '生产密钥配置文件存在。移出部署目录后再打包，避免把密钥放入发布包。' }

$StageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("SceneQuest-release-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null
$include = @(
  'index.html', 'app.js', 'styles.css', 'package.json', '.env.example', '.gitignore',
  'README.md', 'SceneQuest PRD.md', 'SceneQuest 开发文档.md', 'apps', 'docs', 'deploy\windows'
)
if (Test-Path (Join-Path $AppRoot 'package-lock.json')) { $include += 'package-lock.json' }
foreach ($item in $include) {
  $source = Join-Path $AppRoot $item
  if (-not (Test-Path $source)) { throw "发布文件缺失：$item" }
  $destination = Join-Path $StageRoot $item
  $parent = Split-Path $destination -Parent
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}
$manual = Join-Path $AppRoot 'output\景中局-产品说明书-完整应用版.docx'
if (Test-Path $manual) {
  $docsOut = Join-Path $StageRoot 'docs\景中局-产品说明书-完整应用版.docx'
  Copy-Item -LiteralPath $manual -Destination $docsOut -Force
}

$outDirectory = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Force -Path $outDirectory | Out-Null
Compress-Archive -Path (Join-Path $StageRoot '*') -DestinationPath $OutputPath -CompressionLevel Optimal -Force
Write-Host "Windows Server 发布包已创建：$OutputPath" -ForegroundColor Green
Write-Host '包内不包含 node_modules、本地日志、PPT、临时文件或生产密钥。'
