// ============================================================
// 치지직 채팅 수집기
//   - 방송이 켜지면 자동으로 채팅에 접속(chzzk 라이브러리가 감지·재연결)
//   - 1분마다 "분당 채팅 수 / 고유 채팅 참여자 수 / 도네 수 / 동시 시청자"를
//     집계해서 Supabase(chat_snapshots)에 한 줄씩 저장
//   - 방송이 꺼져 있으면 아무것도 저장하지 않음
//
// 상시 서버(Oracle Cloud 등)에서 pm2로 24시간 돌리는 용도.
// ============================================================
import 'dotenv/config'
import { ChzzkClient } from 'chzzk'
import { createClient } from '@supabase/supabase-js'

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  CHANNEL_ID,
} = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CHANNEL_ID) {
  console.error('❌ .env 설정이 필요합니다: SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
})

// ── 1분 집계 버킷 ──────────────────────────────────────────
let chatCount = 0
let donationCount = 0
let chatters = new Set()

function resetBucket() {
  chatCount = 0
  donationCount = 0
  chatters = new Set()
}

// ── 라이브 상태 직접 조회(필드가 확실한 공식 응답 사용) ──────
async function getLive() {
  try {
    const res = await fetch(
      `https://api.chzzk.naver.com/service/v3/channels/${CHANNEL_ID}/live-detail`,
      { headers: { 'User-Agent': UA } }
    )
    const json = await res.json()
    const c = json?.content
    if (c && c.status === 'OPEN') return c
    return null
  } catch (e) {
    console.warn('⚠️ 라이브 조회 실패:', e.message)
    return null
  }
}

// ── 채팅 클라이언트 (익명 읽기) ─────────────────────────────
const client = new ChzzkClient()
const chat = client.chat({
  channelId: CHANNEL_ID,
  pollInterval: 30 * 1000, // 방송 시작/채팅채널 변경 자동 감지
})

chat.on('connect', () => {
  console.log(`✅ [${new Date().toISOString()}] 채팅 접속됨`)
})

chat.on('reconnect', () => {
  console.log(`🔄 [${new Date().toISOString()}] 재접속(방송 시작/채널 변경)`)
})

chat.on('chat', (msg) => {
  chatCount++
  const id = msg?.profile?.userIdHash || msg?.profile?.nickname
  if (id) chatters.add(id)
})

chat.on('donation', () => {
  donationCount++
  chatCount++ // 도네 메시지도 채팅 흐름에 포함
})

// ── 1분마다 집계 저장 ──────────────────────────────────────
async function flush() {
  const live = await getLive()
  if (!live) {
    resetBucket() // 방송 꺼짐 → 저장 안 함
    return
  }

  const row = {
    live_id: live.liveId ?? null,
    chat_count: chatCount,
    unique_chatters: chatters.size,
    donation_count: donationCount,
    concurrent_users: live.concurrentUserCount ?? null,
  }
  resetBucket()

  const { error } = await supabase.from('chat_snapshots').insert(row)
  if (error) {
    console.error('❌ 저장 실패:', error.message)
  } else {
    console.log(`💬 [${new Date().toISOString()}] 채팅 ${row.chat_count} · 참여 ${row.unique_chatters}명 · 시청 ${row.concurrent_users} 저장`)
  }
}

// 정각(:00초)에 맞춰 1분 간격 실행
function scheduleFlush() {
  const now = new Date()
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
  setTimeout(() => {
    flush()
    setInterval(flush, 60 * 1000)
  }, msToNextMinute)
}

// ── 시작 ───────────────────────────────────────────────────
async function main() {
  console.log(`🚀 치지직 채팅 수집기 시작 — 채널 ${CHANNEL_ID}`)
  await chat.connect()
  scheduleFlush()
}

main().catch((e) => {
  console.error('치명적 오류:', e)
  process.exit(1)
})

// pm2가 재시작하도록 예기치 못한 오류 시 종료
process.on('unhandledRejection', (e) => {
  console.error('unhandledRejection:', e)
})
