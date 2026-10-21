[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw '未找到 Node.js。请安装 Node.js 20 LTS 或更高版本，并确认 node.exe 在系统 PATH 中。' }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw '未找到 npm.cmd。请重新安装带 npm 的 Node.js Windows 版本。' }

$nodeVersion = (& node.exe --version).TrimStart('v')
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 20) { throw "当前 Node.js 版本为 $nodeVersion，要求 20 或更高版本。" }
Push-Location $AppRoot
try {
  & npm.cmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm 依赖安装失败。请检查服务器能否访问 npm registry。' }
} finally { Pop-Location }
Write-Host "运行依赖已安装，Node.js $nodeVersion。" -ForegroundColor Green
