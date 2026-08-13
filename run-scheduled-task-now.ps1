$ErrorActionPreference = "Stop"
Start-ScheduledTask -TaskName "Sonny Job Alerts"
Start-Sleep -Seconds 3
Get-ScheduledTaskInfo -TaskName "Sonny Job Alerts" |
  Select-Object LastRunTime,LastTaskResult,NextRunTime,NumberOfMissedRuns
