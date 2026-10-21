[CmdletBinding()]
param([string]$TaskName = 'SceneQuest API')
$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Write-Host "已停止任务：$TaskName。重新启动请运行 Start-ScheduledTask -TaskName '$TaskName'。"
