# Sonny Job Alerts

국내 대기업/중견기업 경력직 채용공고를 추적해서 Telegram Bot으로 알림을 보내는 로컬 MVP입니다.

## 구조

- `config/targets.json`: 추적할 기업/채용 페이지
- `config/keywords.json`: 관심 키워드와 제외 키워드 점수
- `src/job-alerts.js`: 수집, 점수화, 중복 제거, Telegram 발송
- `data/jobs-db.json`: 로컬 알림 이력 DB
- `.env`: Telegram Bot 토큰과 chat id

## Telegram 연결

1. Telegram에서 `@BotFather`에게 `/newbot`으로 봇을 생성합니다.
2. 발급받은 token을 `.env`의 `TELEGRAM_BOT_TOKEN`에 넣습니다.
3. 만든 봇에게 개인 Telegram 계정으로 아무 메시지나 보냅니다.
4. 아래 URL을 브라우저에서 열어 `chat.id`를 확인합니다.

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

5. 확인한 `chat.id`를 `.env`의 `TELEGRAM_CHAT_ID`에 넣습니다.

또는 아래 스크립트로 token 입력부터 chat id 조회, `.env` 저장, 테스트 발송까지 한 번에 처리할 수 있습니다.

```powershell
.\setup-telegram.ps1
```

이미 `.env`에 token을 넣은 상태라면, 봇에게 메시지를 보낸 뒤 아래 스크립트로 `TELEGRAM_CHAT_ID`만 갱신할 수 있습니다.

```powershell
.\refresh-telegram-chat-id.ps1
```

## 실행

```powershell
cd C:\Users\Sonny\claude\job-alerts
Copy-Item .env.example .env
notepad .env
.\telegram-test.ps1
.\dry-run.ps1
.\run-once.ps1
```

## 점수 기준

- `JOB_ALERTS_MIN_SCORE`: 즉시 Telegram 알림 기준점입니다. 기본값은 `70`입니다.
- `JOB_ALERTS_DAILY_SUMMARY_SCORE`: DB에 저장할 최소 후보 기준점입니다. 기본값은 `50`입니다.

## 자동 실행 예시

Windows 작업 스케줄러에서 아래 명령을 하루 2~3회 실행하면 됩니다.

```powershell
powershell.exe -ExecutionPolicy Bypass -File C:\Users\Sonny\claude\job-alerts\run-once.ps1
```

로컬 PC에서 `api.telegram.org` HTTPS가 타임아웃 나는 경우에는 GitHub Actions로 발송을 우회할 수 있습니다.

1. 이 폴더를 GitHub 비공개 repo로 올립니다.
2. repo secrets에 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`를 등록합니다.
3. `.github/workflows/job-alerts.yml`이 매일 KST 09:00, 13:00, 18:30에 실행됩니다.

## 운영 메모

공식 채용 사이트 중 일부는 JavaScript 렌더링이 강해서 본문 HTML만으로 공고 제목이 충분히 잡히지 않을 수 있습니다. 그런 회사는 추후 Playwright 기반 회사별 파서를 추가하는 방식으로 보강합니다.
