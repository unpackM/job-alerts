$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
node .\src\job-alerts.js --dry-run
