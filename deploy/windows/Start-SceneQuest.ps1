$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ConfigPath = Join-Path $AppRoot 'runtime\config\.env.production'
$LogRoot = Join-Path $AppRoot 'runtime\logs'
$LogDate = Get-Date -Format 'yyyyMMdd'
$StdoutLog = Join-Path $LogRoot "scenequest-$LogDate.log"
$StderrLog = Join-Path $LogRoot "scenequest-error-$LogDate.log"

if (-not (Test-Path $ConfigPath)) { throw "未找到生产配置：$ConfigPath。先运行 Initialize-SceneQuest.ps1。" }
if (-not (Test-Path (Join-Path $AppRoot 'node_modules'))) { throw '未找到 node_modules。先运行 Install-Dependencies.ps1。' }
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$env:CONFIG_ENV_FILE = $ConfigPath
$env:NODE_ENV = 'production'
Set-Location $AppRoot
$node = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $node -ArgumentList @('apps/api/src/server.js') -WorkingDirectory $AppRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $StdoutLog -RedirectStandardError $StderrLog
exit $process.ExitCode
