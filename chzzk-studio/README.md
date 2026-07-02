# 치지직 방송 통계 수집 시스템 — 런북

> **목적**: 친구 채널(SoundVoltex1)의 **버튜버 데뷔 전 vs 후** 방송 지표를 자동 수집해서,
> "버튜버가 수치에 영향을 주는가"를 데이터로 검증한다. (데뷔 예정: 2026년 8월 초·중순)
> 24시간 자동 수집 → 나중에 데뷔 전/후 비교 대시보드로 시각화.

---

## 1. 전체 구조

```
치지직 API ──┬─▶ Supabase pg_cron (서버 불필요)     ──▶ 시청자·팔로워
             └─▶ Oracle 서버 (Node/pm2 collector)  ──▶ 채팅·다시보기·클립·순위·썸네일
                                                         │
                                                         ▼
                                              Supabase (Postgres + Storage)
```

- **Supabase pg_cron**: 1분마다 스스로 치지직을 폴링 → 시청자·팔로워 저장 (서버 없이 DB 안에서 동작)
- **Oracle 서버**: 채팅 WebSocket 상시 접속 + 다시보기/클립 폴링 (24시간 프로세스 필요한 것)
- **저장**: 전부 Supabase 통계 프로젝트 (DB 500MB + Storage 1GB, 무료)

## 2. 핵심 정보

| 항목 | 값 |
|------|-----|
| 수집 대상 채널 | **SoundVoltex1** / ID `508279ea46820b3104c9c9944bebf07e` |
| Supabase 프로젝트 | 통계 전용 프로젝트 (버튜버 프로젝트와 별개) — ref·키는 Supabase 대시보드에서 확인 |
| 서버 | Oracle Cloud, Japan East(Osaka), Ubuntu 22.04, `VM.Standard.E2.1.Micro` (Always Free) |
| 서버 공인 IP | Oracle 콘솔에서 확인 (임시 IP — 인스턴스 재생성 시 바뀜) |
| SSH 유저 | `ubuntu` (키: 로컬 보관) |
| 코드 위치 | 이 저장소 `chzzk-studio/collector/`, 브랜치 `claude/untitled-session-e2prdl` |
| 프로세스 관리 | pm2, 프로세스명 `chzzk-chat` |
| 모니터링 | healthchecks.io (핑 끊기면 minenetion@gmail.com 으로 이메일) |

## 3. 수집 데이터 (Supabase 테이블)

| 테이블 | 내용 | 주기 | 방송꺼져도 | 수집처 |
|--------|------|------|:---:|--------|
| `stream_snapshots` | 동시/누적 시청자·제목·카테고리 | 1분 | ✕ | pg_cron |
| `follower_snapshots` | 팔로워 수·방송여부 | 5분 | ✓ | pg_cron |
| `chat_snapshots` | 채팅수·참여자·도네·**카테고리순위**·라이브썸네일 | 1분 | ✕ | 서버 |
| `chat_messages` | 메시지별: 닉·내용·**팔로워/구독여부·구독개월**·역할·도네금액·이모티콘 | 실시간 | ✕ | 서버 |
| `video_snapshots` | 다시보기 조회수·생방송시청수(livePv)·썸네일 | 1시간 | ✓ | 서버 |
| `clip_snapshots` | 클립별 조회수·썸네일 | 1시간 | ✓ | 서버 |
| `vod_chat_messages` | 과거 다시보기 채팅 (백필, 일회성) | 수동 | — | backfill 스크립트 |
| `collector_config` | 설정: `channel_id`, `debut_date`, `healthcheck_url` | — | — | — |
| `poll_queue` | pg_net 내부 큐 (건들지 말 것) | — | — | — |
| Storage `thumbs` | 다시보기/클립 썸네일 **이미지** (삭제 대비 영구보관) | 1시간 | ✓ | 서버 |

- 이모티콘: 메시지에 `{:코드:}` 로 저장, `emojis` 컬럼에 코드→이미지URL 매핑. 대시보드에서 이미지로 렌더.

## 4. 자동화 (손 안 대도 되는 것들)

- **pm2**: 크래시/재부팅 자동 재시작, 메모리 300MB 초과 시 재시작
- **자동배포**: crontab이 15분마다 이 브랜치를 pull → 변경 있으면 `npm install` + `pm2 restart`
  (즉 **코드 수정은 push만 하면 서버에 자동 반영**, SSH 불필요)
- **로그정리**: pm2-logrotate (10MB, 7개 유지)
- **DB 용량관리**: `prune_chat_messages()` pg_cron — `chat_messages` 100만 건 초과 시 오래된 것 자동 삭제 (~300MB 상한). 집계·순위·다시보기는 영구 보존.
- **모니터링(하트비트)**: 서버가 5분마다 healthchecks.io에 핑. 단, **팔로워가 15분 내 쌓였을 때만** 핑 → 수집기 death + pg_cron 멈춤 **둘 다** 감지.

## 5. 상태 확인 (건강한지 보는 법)

**A. Supabase에서 (제일 빠름)** — 마지막 수집 시각 확인:
```sql
select now() - max(captured_at) as 팔로워_경과 from follower_snapshots;   -- 15분 이내면 정상
```
행 개수 한 방에:
```sql
select 'stream' t,count(*) from stream_snapshots
union all select 'follower',count(*) from follower_snapshots
union all select 'chat',count(*) from chat_snapshots
union all select 'chat_msg',count(*) from chat_messages
union all select 'video',count(*) from video_snapshots
union all select 'clip',count(*) from clip_snapshots
union all select 'vod_chat',count(*) from vod_chat_messages;
```

**B. healthchecks.io** — 초록불이면 정상, 멈추면 이메일 옴.

**C. 서버에서 (SSH)**:
```bash
pm2 status                       # chzzk-chat = online 이면 정상
pm2 logs chzzk-chat --lines 30   # 최근 로그 (💬 순위저장 / 🎬 다시보기 / ✂️ 클립 / 📝 세부채팅)
```

## 6. 자주 하는 작업

**SSH 접속**
```bash
ssh -i <키경로> ubuntu@<서버_공인IP>   # IP는 Oracle 콘솔에서 확인
```

**수집 채널 변경** (친구 채널이 바뀌면 — 드묾)
```bash
nano ~/2026test1/chzzk-studio/collector/.env   # CHANNEL_ID 수정
pm2 restart chzzk-chat
```
+ Supabase `collector_config`의 `channel_id`도 같이 수정 (pg_cron용):
```sql
update collector_config set value='새채널ID' where key='channel_id';
```

**데뷔일 등록** (8월에 확정되면 — 대시보드 before/after 기준)
```sql
update collector_config set value='2026-08-10' where key='debut_date';
```

**과거 다시보기 채팅 백필** (서버가 죽어 놓친 방송 복구 / 최초 1회)
```bash
cd ~/2026test1/chzzk-studio/collector && git pull origin claude/untitled-session-e2prdl
node backfill-vod-chat.js        # VOD별 삭제 후 재삽입 → 재실행 안전
```

**코드 업데이트**: 그냥 이 브랜치에 push → 15분 내 자동 반영 (SSH 불필요)

## 7. 문제 대응

| 증상 | 원인 추정 | 대응 |
|------|-----------|------|
| 데이터가 갑자기 전부 멈춤 | 서버 다운 / chzzk API 변경 | `pm2 status` 확인 → 죽었으면 `pm2 restart chzzk-chat`. 여전히면 chzzk 라이브러리 업데이트 필요 |
| `follower_snapshots`만 멈춤 | pg_cron / pg_net 문제 | Supabase에서 `select * from cron.job;` 확인, 필요시 재스케줄 |
| 채팅만 안 쌓임 | WebSocket 끊김 | `pm2 restart chzzk-chat` |
| 썸네일 저장 실패 로그 | `thumbs` 버킷 없음 | Supabase Storage에 public 버킷 `thumbs` 생성 |
| DB 용량 경고 | chat_messages 급증 | prune가 자동 처리. 급하면 `keep_rows` 낮춰 재실행 |
| 30일 후 서버 꺼짐 | 무료체험→상시무료 전환 이슈 | Oracle 콘솔에서 인스턴스 Start / Always Free 상태 확인 |

## 8. 무료 한도 (초과 주의)

- Supabase: DB **500MB** (prune로 관리), Storage **1GB** (썸네일 월 몇 MB), egress 5GB/월
- Oracle: Always Free VM 1대 (E2.1.Micro) — 유휴로 회수될 수 있으니 가끔 생존 확인
- healthchecks.io: 무료 20 checks

## 9. 비밀값 (저장소에 없음 — 노출 금지)

- `SUPABASE_SERVICE_KEY` (secret): 서버 `.env` 에만. Supabase → Project Settings → API Keys → Secret
- `healthcheck_url`: Supabase `collector_config` 에 저장
- SSH 개인키: 로컬 보관

---

## 다음 단계
데이터가 쌓이면 → **데뷔 전/후 비교 대시보드** 제작 (시청자·팔로워·채팅몰입도·순위·이모티콘·다시보기 등 시각화, `debut_date` 기준 자동 분리).
