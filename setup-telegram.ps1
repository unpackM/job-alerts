$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "Telegram Bot 연결 설정"
Write-Host "1. Telegram에서 @BotFather 실행"
Write-Host "2. /newbot 으로 봇 생성"
Write-Host "3. 발급된 token을 아래에 붙여넣기"
Write-Host "4. 만든 봇에게 개인 Telegram 계정으로 아무 메시지나 한 번 보내기"
Write-Host ""

$token = Read-Host "TELEGRAM_BOT_TOKEN"
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "TELEGRAM_BOT_TOKEN is required."
}

$updatesUrl = "https://api.telegram.org/bot$token/getUpdates"

Write-Host ""
Write-Host "Telegram getUpdates 조회 중..."

$updates = $null
try {
  $updates = Invoke-RestMethod -Uri $updatesUrl -Method Get -TimeoutSec 20
} catch {
  $raw = curl.exe -L --silent --show-error --ssl-no-revoke --max-time 20 $updatesUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Telegram getUpdates 연결 실패. 봇에게 메시지를 보냈는지, api.telegram.org 접속이 가능한 네트워크인지 확인하세요."
  }
  $updates = $raw | ConvertFrom-Json
}

if (-not $updates.ok) {
  throw "Telegram API returned ok=false. Token을 확인하세요."
}

$chatId = $null
$latest = $updates.result | Select-Object -Last 1
if ($latest.message.chat.id) {
  $chatId = $latest.message.chat.id
} elseif ($latest.channel_post.chat.id) {
  $chatId = $latest.channel_post.chat.id
}

if (-not $chatId) {
  Write-Host ""
  Write-Host "chat_id를 찾지 못했습니다."
  Write-Host "방금 만든 봇에게 Telegram에서 아무 메시지나 보내고 이 스크립트를 다시 실행하세요."
  throw "TELEGRAM_CHAT_ID not found."
}

$envText = @"
TELEGRAM_BOT_TOKEN=$token
TELEGRAM_CHAT_ID=$chatId

JOB_ALERTS_MIN_SCORE=70
JOB_ALERTS_DAILY_SUMMARY_SCORE=50
"@

Set-Content -LiteralPath ".env" -Value $envText -Encoding UTF8

Write-Host ""
Write-Host ".env 저장 완료"
Write-Host "TELEGRAM_CHAT_ID=$chatId"
Write-Host ""
Write-Host "테스트 메시지 전송 중..."

node .\src\job-alerts.js --telegram-test

Write-Host ""
Write-Host "Telegram 연결 완료."
