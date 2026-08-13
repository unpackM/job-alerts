$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logPath = Join-Path $logDir "run_$stamp.log"

try {
  node .\src\job-alerts.js --collect-only *>&1 | Tee-Object -FilePath $logPath
} catch {
  $_ | Out-File -FilePath $logPath -Append
  throw
}
