# Job Alerts 작업 현황

## 목적

국내 대기업/중견기업 중심의 경력직 채용공고를 추적하고, 관심 직무와 맞는 신규 공고를 Telegram으로 알림 받는 자동화 시스템.

관심 직무 축:

- 사업기획
- 상품기획
- 제휴/파트너십
- Business Development
- Growth PM
- 구독/멤버십/플랫폼/B2B/B2BC

## 현재 구조

```text
C:\Users\Sonny\claude\job-alerts
  config\
    targets.json
    keywords.json
  src\
    job-alerts.js
  data\
    jobs-db.json
  logs\
  .env
  run-once.ps1
  dry-run.ps1
  telegram-test.ps1
  setup-telegram.ps1
  refresh-telegram-chat-id.ps1
  install-scheduled-task.ps1
  run-scheduled-task-now.ps1
  .github\workflows\job-alerts.yml
```

## 주요 파일

- `src/job-alerts.js`
  - 채용 페이지 수집
  - HTML 본문 텍스트 추출
  - 관심 키워드 점수화
  - 중복 공고 제거
  - 신규 공고 DB 저장
  - Telegram Bot API 발송

- `config/targets.json`
  - 공식 채용 페이지와 채용 플랫폼 검색 URL 목록

- `config/keywords.json`
  - 포함/제외 키워드와 점수 기준

- `data/jobs-db.json`
  - 로컬 중복 제거 및 실행 이력 저장 DB

- `.env`
  - Telegram Bot token, chat id, 점수 기준 저장

## 추가된 수집 대상

공식 채용 페이지:

- SK Careers
- SK Telecom
- LG Careers
- LG Uplus
- NAVER
- NAVER Cloud
- NAVER Financial
- NAVER Webtoon
- Kakao
- Coupang
- Toss
- Hyundai Card
- CJ Group
- Samsung Careers
- Hyundai Motor Group

채용 플랫폼:

- Catch
  - 사업기획 경력
  - 제휴 경력
  - 상품기획 경력

- Saramin
  - 사업기획 경력
  - 제휴 경력
  - 상품기획 경력

- Wanted
  - 사업기획
  - 제휴
  - Growth PM

- Remember
  - 대기업 사업전략/기획
  - 사업기획
  - 제휴

## 자동화 상태

Windows 작업 스케줄러 등록 완료.

작업 이름:

```text
Sonny Job Alerts
```

실행 시간:

```text
매일 09:00
매일 13:00
매일 18:30
```

마지막 확인 상태:

```text
State: Ready
LastTaskResult: 0
NextRunTime: 2026-08-13 13:00
```

수동 실행:

```powershell
cd C:\Users\Sonny\claude\job-alerts
.\run-scheduled-task-now.ps1
```

로그 위치:

```text
C:\Users\Sonny\claude\job-alerts\logs
```

## Telegram 연결 상태

Bot:

```text
@unpackmbot
```

확인된 chat id:

```text
727348515
```

`.env` 상태:

```text
TELEGRAM_BOT_TOKEN=설정됨
TELEGRAM_CHAT_ID=727348515
JOB_ALERTS_MIN_SCORE=70
JOB_ALERTS_DAILY_SUMMARY_SCORE=50
```

주의:

- 실제 token은 `.env`에 저장되어 있음.
- token은 외부 노출 시 BotFather에서 재발급 필요.

## 현재 문제

이 PC/네트워크에서 `api.telegram.org` HTTPS 요청이 완료되지 않음.

확인 결과:

```text
DNS 조회: 성공
TCP 443 연결: 성공
Node fetch: timeout
curl GET/POST: timeout
PowerShell Invoke-WebRequest POST: timeout
브라우저 API URL 호출: 메시지 미수신
```

즉 Telegram token/chat id 문제라기보다 로컬 네트워크 또는 Windows HTTPS 경로 문제로 판단.

## 검증된 수집 결과

채용 플랫폼 추가 후 dry-run 결과:

```text
targets: 27
detected: 82~83
newJobs: 81~82
alerted: 8~9
errors: 1
```

즉시 알림 후보 예시:

```text
Saramin - Business Planning
[LOAS] 로아스 산업 AI·로봇 플랫폼 사업전략 / 사업기획 경력
점수: 90
키워드: 사업기획, 전략, 플랫폼
```

```text
NAVER Webtoon
[네이버웹툰] 콘텐츠 전략 PMO (Content Strategy PMO) (경력)
점수: 73
키워드: 전략, 콘텐츠
```

## 로컬 실행 명령

Dry-run:

```powershell
cd C:\Users\Sonny\claude\job-alerts
.\dry-run.ps1
```

실제 실행:

```powershell
.\run-once.ps1
```

Telegram 테스트:

```powershell
.\telegram-test.ps1
```

작업 스케줄러 등록:

```powershell
.\install-scheduled-task.ps1
```

작업 스케줄러 즉시 실행:

```powershell
.\run-scheduled-task-now.ps1
```

## GitHub Actions 우회안

로컬 PC에서 Telegram API가 timeout 되므로, 발송을 GitHub Actions로 우회하는 workflow를 추가함.

파일:

```text
.github\workflows\job-alerts.yml
```

실행 시간:

```text
KST 09:00
KST 13:00
KST 18:30
```

필요 작업:

1. GitHub CLI 로그인

```powershell
gh auth login
```

2. `job-alerts` 폴더를 비공개 GitHub repo로 업로드
3. GitHub repo secrets 등록

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=727348515
```

4. Actions에서 `Job Alerts` workflow 수동 실행 또는 예약 실행 확인

## 다음 권장 작업

1. GitHub CLI 로그인
2. 비공개 repo 생성
3. secrets 등록
4. Actions 수동 실행으로 Telegram 발송 확인
5. 3~5일간 알림 품질 확인
6. 오탐 키워드 조정
7. 원티드/리멤버는 필요 시 Playwright 기반 렌더링 수집으로 고도화
