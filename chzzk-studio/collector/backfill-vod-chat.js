// ============================================================
// 과거 다시보기(VOD) 채팅 백필 — 일회성 실행
//   채널의 모든 다시보기를 돌며 채팅을 긁어 vod_chat_messages에 저장.
//   재실행해도 안전: VOD별로 기존 데이터를 지우고 다시 넣음(중복 방지).
//   서버가 죽어서 실시간 수집을 놓쳤을 때 다시 실행하면 복구됨.
//
//   실행: node backfill-vod-chat.js
// ============================================================
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CHANNEL_ID) {
  console.error('❌ .env 필요: SUPABASE_URL, SUPABASE_SERVICE_KEY, CHANNEL_ID')
  process.exit(1)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 채널의 모든 다시보기 목록 (페이지네이션)
async function getAllVods() {
  const vods = []
  let page = 0
  while (true) {
    const res = await fetch(`https://api.chzzk.naver.com/service/v1/channels/${CHANNEL_ID}/videos?size=30&page=${page}&sortType=LATEST`, { headers: { 'User-Agent': UA } })
    const c = (await res.json())?.content || {}
    const data = c.data || []
    vods.push(...data)
    const totalPages = c.totalPages ?? 1
    if (data.length < 30 || page >= totalPages - 1) break
    page++
    await sleep(150)
  }
  return vods
}

// 다시보기 1개의 채팅 전체 백필
async function backfillVod(v) {
  const no = v.videoNo
  if (!no) return 0

  // 재실행 안전: 이 VOD 기존 데이터 제거 후 새로 넣기
  await supabase.from('vod_chat_messages').delete().eq('video_no', no)

  let t = 0
  let total = 0
  let guard = 0
  while (true) {
    let c
    try {
      const res = await fetch(`https://api.chzzk.naver.com/service/v1/videos/${no}/chats?playerMessageTime=${t}&previousMaxChatNo=&size=50`, { headers: { 'User-Agent': UA } })
      c = (await res.json())?.content || {}
    } catch (e) {
      console.warn(`   ⚠️ ${no} 요청 실패(${t}ms):`, e.message)
      break
    }

    const chats = c.videoChats || []
    if (chats.length) {
      const rows = chats.map((e) => {
        let p = {}
        try { p = JSON.parse(e.profile) || {} } catch {}
        let ex = {}
        try { ex = (typeof e.extras === 'string' ? JSON.parse(e.extras) : e.extras) || {} } catch {}
        const emojis = ex.emojis && typeof ex.emojis === 'object' && Object.keys(ex.emojis).length ? ex.emojis : null
        return {
          video_no: no,
          player_message_time: e.playerMessageTime ?? null,
          message_time: e.messageTime ? new Date(e.messageTime).toISOString() : null,
          user_id_hash: e.userIdHash ?? p.userIdHash ?? null,
          nickname: p.nickname ?? null,
          message: e.content ?? null,
          user_role: p.userRoleCode ?? null,
          emojis,
        }
      })
      const { error } = await supabase.from('vod_chat_messages').insert(rows)
      if (error) { console.error(`   ❌ ${no} 저장 실패:`, error.message); break }
      total += rows.length
    }

    const next = c.nextPlayerMessageTime
    if (next == null || next <= t) break // 끝까지 도달
    t = next
    guard++
    if (guard > 20000) { console.warn(`   ⚠️ ${no} 안전장치 발동`); break }
    await sleep(120) // API 예의상 약간의 간격
  }

  console.log(`  ✓ VOD ${no} (${v.videoTitle}): ${total.toLocaleString()}건`)
  return total
}

async function main() {
  console.log('📼 과거 다시보기 채팅 백필 시작...')
  const vods = await getAllVods()
  console.log(`다시보기 ${vods.length}개 발견\n`)
  let grand = 0
  for (const v of vods) grand += await backfillVod(v)
  console.log(`\n✅ 완료 — 총 ${grand.toLocaleString()}건 저장`)
  process.exit(0)
}

main().catch((e) => { console.error('치명적 오류:', e); process.exit(1) })
