$ErrorActionPreference = "Stop"

$taskName = "Sonny Job Alerts"
$scriptPath = Join-Path $PSScriptRoot "run-once.ps1"

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$triggers = @(
  New-ScheduledTaskTrigger -Daily -At 09:00
  New-ScheduledTaskTrigger -Daily -At 13:00
  New-ScheduledTaskTrigger -Daily -At 18:30
)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Principal $principal `
  -Description "Career job posting monitor with Telegram alerts"

Get-ScheduledTask -TaskName $taskName | Select-Object TaskName,State,TaskPath
