$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
node .\src\job-alerts.js --telegram-test
