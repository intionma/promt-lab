// ============================================================
// 치지직 통계 수집기 (v2)
//   [1분마다·방송중]  chat_snapshots  : 채팅수/참여자/도네수/시청자/카테고리순위/라이브썸네일
//   [메시지마다·방송중] chat_messages  : 누가/무슨채팅/팔로워여부/구독여부/역할/도네금액/이모티콘
//   [1시간마다]        video_snapshots : 다시보기 조회수 + 썸네일
//   (시청자수·팔로워는 Supabase pg_cron이 별도 수집)
//
// 상시 서버에서 pm2로 24시간 실행.
// ============================================================
import 'dotenv/config'
import { ChzzkClient } from 'chzzk'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CHANNEL_ID) {
  console.error('❌ .env 필요: SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

// ── 1분 집계 버킷 + 메시지 버퍼 ────────────────────────────
let chatCount = 0
let donationCount = 0
let chatters = new Set()
let messageBuffer = []

function resetBucket() {
  chatCount = 0
  donationCount = 0
  chatters = new Set()
}

// 채팅/도네/구독 이벤트 → 세부 메시지 1건 기록
function recordMessage(type, ev, donationAmount) {
  const p = ev?.profile || {}
  const sp = p.streamingProperty || {}
  const emojis = ev?.extras?.emojis
  messageBuffer.push({
    msg_time: ev?.time ? new Date(ev.time).toISOString() : new Date().toISOString(),
    user_id_hash: p.userIdHash ?? null,
    nickname: p.nickname ?? ev?.extras?.nickname ?? null,
    message: ev?.message ?? null,
    msg_type: type,
    is_follower: !!sp.following,
    follow_date: sp.following?.followDate ?? null,
    is_subscriber: !!sp.subscription,
    sub_months: sp.subscription?.accumulativeMonth ?? null,
    sub_tier: sp.subscription?.tier ?? null,
    user_role: p.userRoleCode ?? null,
    donation_amount: donationAmount ?? null,
    os_type: ev?.extras?.osType ?? null,
    emoji_count: emojis && typeof emojis === 'object' ? Object.keys(emojis).length : 0,
  })
}

// ── 라이브 상태 조회 ────────────────────────────────────────
async function getLive() {
  try {
    const res = await fetch(`https://api.chzzk.naver.com/service/v3/channels/${CHANNEL_ID}/live-detail`, { headers: { 'User-Agent': UA } })
    const c = (await res.json())?.content
    return c && c.status === 'OPEN' ? c : null
  } catch (e) {
    console.warn('⚠️ 라이브 조회 실패:', e.message)
    return null
  }
}

// ── 카테고리 순위 (같은 게임 방송 중 몇 위인지) ──────────────
async function getCategoryRank(live) {
  const cat = live?.liveCategory
  const type = live?.categoryType || 'GAME'
  if (!cat) return null
  try {
    const res = await fetch(`https://api.chzzk.naver.com/service/v1/categories/${type}/${cat}/lives?sortType=POPULAR&size=50`, { headers: { 'User-Agent': UA } })
    const list = (await res.json())?.content?.liveInfoResponseList || []
    const idx = list.findIndex((L) => L?.channel?.channelId === CHANNEL_ID)
    return idx >= 0 ? idx + 1 : null // null = 50위 밖
  } catch (e) {
    console.warn('⚠️ 순위 조회 실패:', e.message)
    return null
  }
}

// ── 채팅 클라이언트 (익명 읽기) ─────────────────────────────
const client = new ChzzkClient()
const chat = client.chat({ channelId: CHANNEL_ID, pollInterval: 30 * 1000 })

chat.on('connect', () => console.log(`✅ [${new Date().toISOString()}] 채팅 접속됨`))
chat.on('reconnect', () => console.log(`🔄 [${new Date().toISOString()}] 재접속(방송 시작/채널 변경)`))

chat.on('chat', (ev) => {
  chatCount++
  const id = ev?.profile?.userIdHash || ev?.profile?.nickname
  if (id) chatters.add(id)
  recordMessage('chat', ev, null)
})
chat.on('donation', (ev) => {
  donationCount++
  chatCount++
  recordMessage('donation', ev, ev?.extras?.payAmount ?? null)
})
chat.on('subscription', (ev) => {
  recordMessage('subscription', ev, null)
})

// ── 1분마다: 세부 메시지 배치 저장 + 집계/순위/썸네일 저장 ──
async function flush() {
  const live = await getLive()

  // (1) 세부 메시지 배치 저장 (버퍼에 쌓인 것)
  if (messageBuffer.length) {
    const batch = messageBuffer.splice(0, messageBuffer.length)
    const liveId = live?.liveId ?? null
    for (const m of batch) m.live_id = liveId
    const { error } = await supabase.from('chat_messages').insert(batch)
    if (error) console.error('❌ 메시지 저장 실패:', error.message)
    else console.log(`📝 [${new Date().toISOString()}] 세부 채팅 ${batch.length}건 저장`)
  }

  // (2) 분당 집계 (방송 중일 때만)
  if (!live) {
    resetBucket()
    return
  }
  const rank = await getCategoryRank(live)
  const row = {
    live_id: live.liveId ?? null,
    chat_count: chatCount,
    unique_chatters: chatters.size,
    donation_count: donationCount,
    concurrent_users: live.concurrentUserCount ?? null,
    category_rank: rank,
    live_thumbnail_url: live.liveImageUrl ? live.liveImageUrl.replace('{type}', '480') : null,
  }
  resetBucket()

  const { error } = await supabase.from('chat_snapshots').insert(row)
  if (error) console.error('❌ 집계 저장 실패:', error.message)
  else console.log(`💬 [${new Date().toISOString()}] 채팅 ${row.chat_count} · 참여 ${row.unique_chatters} · 시청 ${row.concurrent_users} · 순위 ${rank ?? '-'}위 저장`)
}

// ── 1시간마다: 다시보기 조회수 + 썸네일 ─────────────────────
async function pollVideos() {
  try {
    const res = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${CHANNEL_ID}/videos?size=30&sortType=LATEST`, { headers: { 'User-Agent': UA } })
    const list = (await res.json())?.content?.data || []
    if (!list.length) return
    const rows = list.map((v) => ({
      video_no: v.videoNo ?? null,
      title: v.videoTitle ?? null,
      read_count: v.readCount ?? null,
      publish_date: v.publishDate ? v.publishDate.replace(' ', 'T') + '+09:00' : null,
      duration: v.duration ?? null,
      category: v.videoCategoryValue ?? null,
      video_type: v.videoType ?? null,
      thumbnail_url: v.thumbnailImageUrl ?? null,
      live_pv: v.livePv ?? null, // 생방송 당시 시청수
    }))
    const { error } = await supabase.from('video_snapshots').insert(rows)
    if (error) console.error('❌ VOD 저장 실패:', error.message)
    else console.log(`🎬 [${new Date().toISOString()}] 다시보기 ${rows.length}개 저장`)
  } catch (e) {
    console.warn('⚠️ VOD 조회 실패:', e.message)
  }
}

// ── 1시간마다: 클립 조회수 수집 (바이럴/외부유입 지표) ──────
async function pollClips() {
  try {
    const res = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${CHANNEL_ID}/clips?size=50&orderType=RECENT&filterType=ALL`, { headers: { 'User-Agent': UA } })
    const list = (await res.json())?.content?.data || []
    if (!list.length) return
    const rows = list.map((c) => ({
      clip_uid: c.clipUID ?? null,
      title: c.clipTitle ?? null,
      read_count: c.readCount ?? null,
      duration: c.duration ?? null,
      category: c.clipCategoryValue ?? c.clipCategory ?? null,
      created_date: c.createdDate ?? null,
      thumbnail_url: c.thumbnailImageUrl ?? null,
    }))
    const { error } = await supabase.from('clip_snapshots').insert(rows)
    if (error) console.error('❌ 클립 저장 실패:', error.message)
    else console.log(`✂️ [${new Date().toISOString()}] 클립 ${rows.length}개 저장`)
  } catch (e) {
    console.warn('⚠️ 클립 조회 실패:', e.message)
  }
}

// 정각(:00초) 맞춰 1분 간격
function scheduleFlush() {
  const now = new Date()
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
  setTimeout(() => {
    flush()
    setInterval(flush, 60 * 1000)
  }, ms)
}

async function main() {
  console.log(`🚀 치지직 통계 수집기 v2 시작 — 채널 ${CHANNEL_ID}`)
  await chat.connect()
  scheduleFlush()
  pollVideos()
  setInterval(pollVideos, 60 * 60 * 1000)
  pollClips()
  setInterval(pollClips, 60 * 60 * 1000)
}

main().catch((e) => {
  console.error('치명적 오류:', e)
  process.exit(1)
})

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e))
