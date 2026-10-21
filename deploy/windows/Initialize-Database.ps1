[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ConfigPath = Join-Path $AppRoot 'runtime\config\.env.production'
if (-not (Test-Path $ConfigPath)) { throw '先运行 Initialize-SceneQuest.ps1 创建生产配置。' }
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw '未找到 Node.js，请先安装 Node.js 20 或更高版本。' }
if (-not (Test-Path (Join-Path $AppRoot 'node_modules'))) { throw '先运行 Install-Dependencies.ps1 安装依赖。' }

$env:CONFIG_ENV_FILE = $ConfigPath
$env:NODE_ENV = 'production'
Push-Location $AppRoot
try {
  & node.exe 'apps/api/src/init-db.js'
  if ($LASTEXITCODE -ne 0) { throw '数据库结构初始化失败，请检查连接串、数据库权限和 PostgreSQL 日志。' }
} finally { Pop-Location }
