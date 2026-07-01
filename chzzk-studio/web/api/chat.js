// ============================================================
// 채팅 페이지네이션 엔드포인트 — 무한 스크롤(older) + 그래프 클릭 점프(around)
//   params: liveId(필수), before=<id>(과거 로딩) | around=<ms>(특정 시각 주변)
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { renderFeedItem } from './_live.js'

const COLS = 'id,nickname,message,emojis,msg_type,msg_time,user_role'

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ items: [], error: 'env' })
  const q = req.query || {}
  const liveId = q.liveId
  if (!liveId) return res.status(400).json({ items: [], error: 'liveId required' })
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const base = () => supabase.from('chat_messages').select(COLS).eq('live_id', liveId).eq('msg_type', 'chat')
    let items = []
    if (q.before) {
      const { data } = await base().lt('id', Number(q.before)).order('id', { ascending: false }).limit(50)
      items = (data || []).filter((m) => m.nickname && m.message).reverse()
    } else if (q.around) {
      const iso = new Date(Number(q.around)).toISOString()
      const [{ data: bef }, { data: aft }] = await Promise.all([
        base().lte('msg_time', iso).order('msg_time', { ascending: false }).limit(40),
        base().gt('msg_time', iso).order('msg_time', { ascending: true }).limit(20),
      ])
      items = [...(bef || []).filter((m) => m.nickname && m.message).reverse(), ...(aft || []).filter((m) => m.nickname && m.message)]
    } else {
      const { data } = await base().order('id', { ascending: false }).limit(80)
      items = (data || []).filter((m) => m.nickname && m.message).reverse()
    }
    return res.status(200).json({ items: items.map((m) => ({ id: m.id, mt: m.msg_time ? new Date(m.msg_time).getTime() : null, html: renderFeedItem(m) })) })
  } catch (e) {
    return res.status(500).json({ items: [], error: e.message })
  }
}
