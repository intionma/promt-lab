// ============================================================
// 실시간 채팅용 경량 JSON 엔드포인트 — 대시보드가 몇 초마다 폴링해
//   페이지 리로드 없이 채팅 피드/랭킹/카운트만 갱신한다.
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { loadLive } from './_live.js'

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 's-maxage=3, stale-while-revalidate=6')
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'env' })
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const live = await loadLive(supabase)
    return res.status(200).json({ isLive: !!live, live: live || null, ts: Date.now() })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
