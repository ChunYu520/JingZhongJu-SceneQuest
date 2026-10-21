[CmdletBinding()]
param([string]$TaskName = 'SceneQuest API')

$ErrorActionPreference = 'Stop'
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$StartScript = Join-Path $PSScriptRoot 'Start-SceneQuest.ps1'
$ConfigPath = Join-Path $AppRoot 'runtime\config\.env.production'

if (-not (Test-Path $ConfigPath)) { throw '先运行 Initialize-SceneQuest.ps1 创建生产配置。' }
if (-not (Test-Path (Join-Path $AppRoot 'node_modules'))) { throw '先运行 Install-Dependencies.ps1 安装依赖。' }

$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $AppRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\NETWORK SERVICE' -LogonType ServiceAccount -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description '景中局 SceneQuest API 与实时服务' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $TaskName
Write-Host "已注册开机任务：$TaskName（$($task.State)）" -ForegroundColor Green
Write-Host '检查服务：Invoke-RestMethod http://127.0.0.1:3001/health'
Write-Host '任务日志位于 runtime\logs\。'
