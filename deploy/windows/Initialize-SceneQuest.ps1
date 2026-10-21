[CmdletBinding()]
param(
  [string]$PublicOrigin,
  [string]$DatabaseUrl,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$serviceRuntime = Join-Path $AppRoot 'runtime'
$configDirectory = Join-Path $serviceRuntime 'config'
$ConfigPath = Join-Path $configDirectory '.env.production'
New-Item -ItemType Directory -Force -Path $configDirectory | Out-Null
if ((Test-Path $ConfigPath) -and -not $Force) { throw '生产配置已存在。为避免覆盖现有密钥与模型设置，脚本已停止；只有在已备份并确实要重建配置时才添加 -Force。' }

function New-Secret([int]$Length = 48) {
  $bytes = New-Object byte[] $Length
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
  return ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_'))
}

if (-not $PublicOrigin) { $PublicOrigin = Read-Host '输入玩家访问应用的 HTTPS 域名，例如 https://play.example.com' }
if ($PublicOrigin -notmatch '^https://[A-Za-z0-9.-]+(?::[0-9]+)?$') {
  throw '生产环境 WEB_ORIGIN 必须是 HTTPS 源地址，例如 https://play.example.com，不要填写路径。'
}
if (-not $DatabaseUrl) {
  $secureDatabaseUrl = Read-Host '输入 PostgreSQL 连接串（密码中的特殊字符请 URL 编码）' -AsSecureString
  $databaseUrlPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDatabaseUrl)
  try { $DatabaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($databaseUrlPointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($databaseUrlPointer) }
}
if ($DatabaseUrl -notmatch '^postgres(ql)?://[^\s]+$') { throw 'DATABASE_URL 格式无效。' }

$adminToken = New-Secret
$tokenPepper = New-Secret
$lines = @(
  'NODE_ENV=production',
  'API_PORT=3001',
  'API_HOST=127.0.0.1',
  'TRUST_PROXY_HOPS=1',
  "WEB_ORIGIN=$PublicOrigin",
  "DATABASE_URL=$DatabaseUrl",
  "ADMIN_TOKEN=$adminToken",
  "TOKEN_PEPPER=$tokenPepper",
  'ADMIN_DEBUG_ENABLED=false',
  'SESSION_TTL_HOURS=24',
  'AI_PROVIDER=openai_compatible',
  'AI_BASE_URL=',
  'AI_API_KEY=',
  'AI_MODEL=',
  'AI_VISION_MODEL=',
  'AI_TIMEOUT_MS=45000',
  'AI_MAX_RETRIES=1',
  'AI_TEMPERATURE=0.3',
  'AI_JUDGE_TIMEOUT_MS=35000',
  'TAVILY_API_KEY=',
  'TAVILY_BASE_URL=https://api.tavily.com/search',
  'OVERPASS_URL=https://overpass-api.de/api/interpreter',
  'DISCOVERY_RADIUS_METERS=1800',
  'DISCOVERY_TIMEOUT_MS=18000',
  'LOG_LEVEL=info',
  'SESSION_RETENTION_HOURS=24'
)
$content = ($lines -join "`r`n") + "`r`n"
[System.IO.File]::WriteAllText($ConfigPath, $content, [System.Text.UTF8Encoding]::new($false))

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
New-Item -ItemType Directory -Force -Path (Join-Path $serviceRuntime 'logs') | Out-Null
& icacls.exe $ConfigPath /inheritance:r /grant:r "$identity`:(F)" '*S-1-5-20:(M)' '*S-1-5-18:(F)' '*S-1-5-32-544:(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法限制生产配置文件权限，请以管理员身份运行。' }
& icacls.exe $serviceRuntime /inheritance:r /grant:r "$identity`:(OI)(CI)(F)" '*S-1-5-20:(OI)(CI)(M)' '*S-1-5-18:(OI)(CI)(F)' '*S-1-5-32-544:(OI)(CI)(F)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法设置运行日志目录权限，请以管理员身份运行。' }

Write-Host "生产配置已创建：$ConfigPath" -ForegroundColor Green
Write-Host "管理员口令（请立即保存）：$adminToken" -ForegroundColor Yellow
Write-Host 'TOKEN_PEPPER 已随机生成并写入受限配置文件。'
Write-Host '接下来安装依赖、检查 PostgreSQL 连接，再安装开机任务。'
Write-Host '首次登录管理员后台时，使用本文件中的 ADMIN_TOKEN；之后可在后台填写 AI 服务 API Key。'
