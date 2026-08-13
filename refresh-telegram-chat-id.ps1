$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

$envLines = Get-Content -LiteralPath ".env" -ErrorAction Stop
$tokenLine = $envLines | Where-Object { $_ -like "TELEGRAM_BOT_TOKEN=*" } | Select-Object -First 1
$token = $tokenLine -replace "^TELEGRAM_BOT_TOKEN=", ""

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "TELEGRAM_BOT_TOKEN is empty. Run .\setup-telegram.ps1 first or edit .env."
}

$updatesUrl = "https://api.telegram.org/bot$token/getUpdates"
$raw = curl.exe -L --silent --show-error --ssl-no-revoke --max-time 20 $updatesUrl
if ($LASTEXITCODE -ne 0) {
  throw "Telegram getUpdates 연결 실패. 봇에게 메시지를 보냈는지, api.telegram.org 접속이 가능한지 확인하세요."
}

$updates = $raw | ConvertFrom-Json
if (-not $updates.ok) {
  throw "Telegram API returned ok=false. Token을 확인하세요."
}

$latest = $updates.result | Select-Object -Last 1
$chatId = $null
if ($latest.message.chat.id) {
  $chatId = $latest.message.chat.id
} elseif ($latest.channel_post.chat.id) {
  $chatId = $latest.channel_post.chat.id
}

if (-not $chatId) {
  throw "chat_id를 찾지 못했습니다. 봇에게 개인 Telegram 계정으로 아무 메시지나 보내고 다시 실행하세요."
}

$updated = $envLines | ForEach-Object {
  if ($_ -like "TELEGRAM_CHAT_ID=*") {
    "TELEGRAM_CHAT_ID=$chatId"
  } else {
    $_
  }
}

Set-Content -LiteralPath ".env" -Value $updated -Encoding UTF8
Write-Host "TELEGRAM_CHAT_ID=$chatId 저장 완료"
node .\src\job-alerts.js --telegram-test
