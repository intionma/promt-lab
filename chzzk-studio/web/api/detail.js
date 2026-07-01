// ============================================================
// 상세 뷰 데이터 엔드포인트 (on-demand) — 실시간 채팅 풀뷰 / 시청자 활동 풀뷰
//   params: view=live-chat | viewer-activity
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { loadDetail } from './_live.js'

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return res.status(500).json({ error: 'env' })
  const view = (req.query && req.query.view) === 'viewer-activity' ? 'viewer-activity' : 'live-chat'
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const d = await loadDetail(supabase, view)
    return res.status(200).json(d || {})
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
