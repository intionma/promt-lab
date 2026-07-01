# 치지직 채팅 수집기 (chzzk-chat-collector)

방송이 켜지면 자동으로 채팅에 접속해서 **분당 채팅 수 / 참여자 수 / 도네 수 / 동시 시청자**를
1분마다 Supabase `chat_snapshots` 테이블에 저장합니다. 상시 서버에서 24시간 돌리는 용도입니다.

> 시청자 수·팔로워는 Supabase pg_cron이 따로 수집합니다(서버 불필요). 이 수집기는 **채팅 전용**입니다.

---

## 0. 먼저 Supabase에 채팅 테이블 만들기

Supabase SQL Editor에서 실행:

```sql
create table if not exists public.chat_snapshots (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  live_id bigint,
  chat_count int not null default 0,      -- 그 1분 동안 채팅 개수
  unique_chatters int not null default 0, -- 채팅 친 고유 사람 수
  donation_count int not null default 0,  -- 도네 개수
  concurrent_users int                    -- 그 시점 동시 시청자
);
create index if not exists idx_chat_time on public.chat_snapshots(captured_at);
```

---

## 1. Oracle Cloud 무료 VM 만들기 (최초 1회)

1. https://www.oracle.com/kr/cloud/free/ → **무료로 시작하기** → 계정 생성
   (카드 인증 필요하지만 **과금 안 됨** — Always Free 리소스만 씀)
2. 콘솔 로그인 → **Compute → Instances → Create Instance**
   - Image: **Canonical Ubuntu 22.04**
   - Shape: **Always Free 대상**(`VM.Standard.E2.1.Micro` 또는 Ampere `A1.Flex` 1 OCPU/6GB)
   - **SSH 키**: "Generate a key pair for me" → **개인키(private key) 다운로드해서 보관**
3. 생성되면 인스턴스의 **Public IP** 를 메모.

## 2. 서버 접속 & 준비

```bash
# 다운로드한 키 권한 설정 (맥/리눅스)
chmod 400 ~/Downloads/ssh-key-*.key
# 접속 (윈도우는 PowerShell 또는 PuTTY)
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<서버_PUBLIC_IP>

# Node.js 20 + git + pm2 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
```

## 3. 코드 받기 & 설정

```bash
git clone https://github.com/intionma/2026test1.git
cd 2026test1/chzzk-studio/collector
npm install

# 환경변수 파일 만들기
cp .env.example .env
nano .env      # SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID 채우고 저장(Ctrl+O, Enter, Ctrl+X)
```

`.env` 값 찾는 법 (Supabase 대시보드):
- **SUPABASE_URL / SUPABASE_SERVICE_KEY**: Project Settings → **API Keys** (service_role 키는 secret)
- **CHANNEL_ID**: 방송 URL `https://chzzk.naver.com/live/<이 부분>`

## 4. 실행 (pm2로 24시간 상시)

```bash
pm2 start index.js --name chzzk-chat
pm2 save
pm2 startup        # 출력되는 명령 한 줄을 복사해서 그대로 실행 (재부팅 후 자동 시작)

# 상태/로그 보기
pm2 status
pm2 logs chzzk-chat
```

방송 중이면 로그에 `💬 ... 저장`이 1분마다 찍히고, Supabase `chat_snapshots`에 줄이 쌓입니다.
방송이 꺼져 있으면 조용히 대기하다가, 켜지면 자동으로 다시 수집합니다.

---

## 업데이트하려면
```bash
cd ~/2026test1 && git pull
cd chzzk-studio/collector && npm install
pm2 restart chzzk-chat
```
