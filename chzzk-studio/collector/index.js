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
import { buildDashboard } from './dashboard.js'

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
let msgFailCount = 0 // 연속 저장 실패 횟수 (poison 행 감지용)
let liveNow = false // 현재 방송 중인지 (수집 주기 결정용)

// 수집 주기: 방송 중이면 빠르게(실시간 느낌), 꺼지면 느리게(API/DB 절약)
const FLUSH_LIVE_MS = 20 * 1000
const FLUSH_IDLE_MS = 60 * 1000

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
    emojis: emojis && typeof emojis === 'object' && Object.keys(emojis).length ? emojis : null,
  })
}

// ── 썸네일 이미지 영구 보관 (다시보기·클립은 삭제되므로 이미지째 저장) ──
const archivedThumbs = new Set()
async function archiveThumb(key, url) {
  if (!url || archivedThumbs.has(key)) return
  try {
    const img = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!img.ok) return
    const buf = Buffer.from(await img.arrayBuffer())
    const { error } = await supabase.storage.from('thumbs').upload(key, buf, { contentType: 'image/jpeg', upsert: false })
    // 성공했거나 이미 있으면 "보관됨"으로 표시 (재다운로드 방지)
    if (!error || /exist|dupl|already/i.test(error.message || '')) archivedThumbs.add(key)
  } catch { /* 조용히 스킵 */ }
}

// ── 하트비트: 수집기가 살아있다는 신호를 주기적으로 핑 ──────
// collector_config의 healthcheck_url(예: healthchecks.io)로 5분마다 핑.
// 핑이 멈추면 그 서비스가 "수집 멈춤"을 이메일로 알려줌. (설정 안 하면 아무 동작 안 함)
async function heartbeat() {
  try {
    const { data: cfg } = await supabase.from('collector_config').select('value').eq('key', 'healthcheck_url').maybeSingle()
    const url = cfg?.value
    if (!url) return

    // pg_cron(시청자·팔로워 수집)도 살아있는지 = 팔로워가 최근 15분 내 기록됐나
    const { data: fresh } = await supabase
      .from('follower_snapshots')
      .select('captured_at')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const freshMs = fresh?.captured_at ? Date.now() - new Date(fresh.captured_at).getTime() : Infinity

    if (freshMs < 15 * 60 * 1000) {
      await fetch(url).catch(() => {}) // 수집기 + pg_cron 둘 다 정상일 때만 핑
    } else {
      // 핑을 안 보내면 healthchecks가 지연을 감지해 알림 → pg_cron 멈춤도 잡힘
      console.warn(`⚠️ 팔로워 데이터 지연(${Number.isFinite(freshMs) ? Math.round(freshMs / 60000) + '분' : '없음'}) → 핑 보류`)
    }
  } catch { /* 조용히 스킵 */ }
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
  liveNow = !!live // 다음 수집 주기 결정에 사용

  // (1) 세부 메시지 배치 저장 (버퍼에 쌓인 것)
  if (messageBuffer.length) {
    const batch = messageBuffer.splice(0, messageBuffer.length)
    const liveId = live?.liveId ?? null
    for (const m of batch) if (m.live_id == null) m.live_id = liveId
    const { error } = await supabase.from('chat_messages').insert(batch)
    if (error) {
      msgFailCount++
      if (msgFailCount <= 2) {
        // 일시적 실패(네트워크 등)일 수 있음 → 되돌려 다음 분 재시도 (과다 시 최신 5만건만 유지)
        console.error(`❌ 메시지 저장 실패(${msgFailCount}회, 다음 분 재시도):`, error.message)
        messageBuffer = batch.concat(messageBuffer)
        if (messageBuffer.length > 50000) messageBuffer = messageBuffer.slice(-50000)
      } else {
        // 3회 연속 실패 → 나쁜 행(poison) 의심. 개별 저장으로 살릴 수 있는 것만 저장하고 나쁜 행은 버림
        console.error('❌ 메시지 반복 실패 → 개별 저장 시도(나쁜 행 건너뜀):', error.message)
        let bad = 0
        for (const m of batch) {
          const { error: e2 } = await supabase.from('chat_messages').insert(m)
          if (e2) bad++
        }
        console.warn(`  → 개별 저장 완료, ${bad}건 버림`)
        msgFailCount = 0
      }
    } else {
      msgFailCount = 0
      console.log(`📝 [${new Date().toISOString()}] 세부 채팅 ${batch.length}건 저장`)
    }
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

    // 썸네일 이미지 영구 보관 (아직 안 받은 것만)
    for (const v of list) await archiveThumb(`vod_${v.videoNo}.jpg`, v.thumbnailImageUrl)
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

    // 클립 썸네일 이미지 영구 보관
    for (const c of list) await archiveThumb(`clip_${c.clipUID}.jpg`, c.thumbnailImageUrl)
  } catch (e) {
    console.warn('⚠️ 클립 조회 실패:', e.message)
  }
}

// 수집 루프: 매 실행 후 방송 여부에 따라 다음 간격을 다시 정함
//   방송 중  → 20초 (시청자·순위·채팅이 대시보드에 빠르게 반영)
//   방송 종료 → 60초 (불필요한 폴링/기록 절약)
async function runFlushLoop() {
  try { await flush() } catch (e) { console.error('flush 오류:', e.message) }
  setTimeout(runFlushLoop, liveNow ? FLUSH_LIVE_MS : FLUSH_IDLE_MS)
}

// 채팅 접속 (실패해도 나머지 수집은 계속 — 30초 후 재시도)
async function connectChatWithRetry() {
  try {
    await chat.connect()
  } catch (e) {
    console.warn('⚠️ 채팅 접속 실패, 30초 후 재시도:', e.message)
    setTimeout(connectChatWithRetry, 30 * 1000)
  }
}

async function main() {
  console.log(`🚀 치지직 통계 수집기 v2 시작 — 채널 ${CHANNEL_ID}`)
  // 채팅 접속이 실패해도 VOD·클립·하트비트·집계는 계속 돌게 (접속은 백그라운드 재시도)
  connectChatWithRetry()
  runFlushLoop()
  pollVideos()
  setInterval(pollVideos, 60 * 60 * 1000)
  pollClips()
  setInterval(pollClips, 60 * 60 * 1000)
  heartbeat()
  setInterval(heartbeat, 5 * 60 * 1000)
  buildDashboard(supabase, SUPABASE_URL).catch((e) => console.warn('dash:', e.message))
  setInterval(() => buildDashboard(supabase, SUPABASE_URL).catch((e) => console.warn('dash:', e.message)), 20 * 60 * 1000)
}

main().catch((e) => {
  console.error('치명적 오류:', e)
  process.exit(1)
})

process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e))
