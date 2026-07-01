// ============================================================
// 라이브(방송 중) 실데이터 로더 — HTML 페이지(index.js)와 JSON 엔드포인트(live.js) 공용
//   chat_snapshots가 최근 3.5분 내면 방송 중으로 보고 실시간 지표를 구성.
// ============================================================
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
export const fmtDur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
export function sample(arr, target) { if (arr.length <= target) return arr; const step = arr.length / target, out = []; for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)]); return out }
// 채팅 메시지 안의 이모티콘 코드 {:code:} → <img> (esc는 { } : 안 건드리므로 escape 후 치환해도 안전)
export const renderMsg = (message, emojis) => {
  const map = emojis || {}
  return esc(message).replace(/\{:([^:}]+):\}/g, (whole, code) => (map[code] ? `<img src="${esc(map[code])}" class="emoji" alt=":${esc(code)}:" loading="lazy">` : whole))
}
// 시청자별 고정 색상 — 닉네임 해시(djb2)로 팔레트 선택(같은 닉=항상 같은 색). 방송인은 노랑 고정.
const PALETTE = ['#e5484d', '#ec4899', '#d6409f', '#a855f7', '#7c3aed', '#6366f1', '#2563eb', '#0284c7', '#0891b2', '#0d9488', '#16a34a', '#65a30d', '#ea580c', '#db2777', '#9333ea', '#0369a1']
export const colorFor = (nick) => {
  if (nick === 'SoundVoltex1') return '#f5a623'
  let h = 5381; for (let i = 0; i < nick.length; i++) h = ((h << 5) + h + nick.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
// 피드 한 줄 HTML (id/시각 data 속성 포함 — 클릭 이동·무한 스크롤용). 서버·엔드포인트 공용.
export const renderFeedItem = (m) => {
  const streamer = m.user_role === 'streamer' || m.user_role === 'streaming_channel_owner'
  const manager = /manager/.test(m.user_role || '')
  const badge = streamer ? '👑 ' : manager ? '🛡 ' : ''
  const mt = m.msg_time ? new Date(m.msg_time).getTime() : ''
  const role = streamer ? 'streamer' : manager ? 'manager' : ''
  const hasEmoji = m.emojis && typeof m.emojis === 'object' && Object.keys(m.emojis).length ? '1' : ''
  return `<div data-id="${m.id ?? ''}" data-mt="${mt}" data-nick="${esc(m.nickname)}" data-role="${role}" data-emoji="${hasEmoji}"><span class="n" style="color:${colorFor(m.nickname)}">${badge}${esc(m.nickname)}</span> ${renderMsg(m.message, m.emojis)}</div>`
}

export async function loadLive(supabase) {
  const { data: lastSnap } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,category_rank,chat_count,live_id,live_thumbnail_url').order('captured_at', { ascending: false }).limit(1).maybeSingle()
  const freshMs = lastSnap?.captured_at ? Date.now() - new Date(lastSnap.captured_at).getTime() : Infinity
  // 방송 중 스냅샷은 20초 주기 → 90초(≈4.5×) 안에 없으면 종료로 판정(false-LIVE 최소화)
  if (!(lastSnap && freshMs < 90 * 1000 && lastSnap.live_id != null)) return null

  const liveId = lastSnap.live_id
  const { data: sess } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,category_rank,chat_count').eq('live_id', liveId).order('captured_at', { ascending: true }).limit(1000)
  const rows = sess || []
  const start = rows.length ? new Date(rows[0].captured_at).getTime() : Date.now()
  const elapsedMs = Date.now() - start
  const chatTotal = rows.reduce((a, r) => a + (r.chat_count || 0), 0)
  const L = {
    isLive: true,
    viewers: lastSnap.concurrent_users,
    rank: lastSnap.category_rank,
    rankStart: rows.find((r) => r.category_rank != null)?.category_rank ?? null,
    chatTotal,
    cpm: Math.round((chatTotal / Math.max(1 / 60, elapsedMs / 60000)) * 10) / 10,
    elapsed: fmtDur(elapsedMs),
    startMs: start,
    viewerSeries: sample(rows.map((r) => r.concurrent_users), 40),
    chatSeries: sample(rows.map((r) => r.chat_count), 40),
  }

  L.liveId = liveId
  const { data: lm } = await supabase.from('chat_messages').select('id,nickname,message,emojis,msg_type,msg_time,user_role').eq('live_id', liveId).order('id', { ascending: false }).limit(4000)
  const msgs = (lm || []).filter((m) => m.nickname)
  // 피드: 완성된 HTML 문자열 배열(서버·클라이언트 공용) · 최신 80개 · 시청자별 고정색
  L.feed = msgs.filter((m) => m.msg_type === 'chat' && m.message).slice(0, 80).reverse().map(renderFeedItem)
  const cnt = new Map()
  for (const m of msgs) cnt.set(m.nickname, (cnt.get(m.nickname) || 0) + 1)
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const mx = top[0]?.[1] || 1
  L.leaderboard = top.map(([nm, c]) => ({ nm, c, w: Math.round((c / mx) * 100) }))
  const colors = ['#16a34a', '#f5a623', '#e5484d', '#3b82f6']
  const top4 = top.slice(0, 4).map((t) => t[0])
  const stepMs = 60000
  const nb = Math.max(1, Math.ceil(Math.max(elapsedMs, stepMs) / stepMs))
  const pm = top4.map(() => new Array(nb).fill(0))
  for (const m of msgs) {
    const ui = top4.indexOf(m.nickname); if (ui < 0) continue
    const t = m.msg_time ? new Date(m.msg_time).getTime() : null; if (t == null) continue
    let bi = Math.floor((t - start) / stepMs); if (bi < 0) bi = 0; if (bi >= nb) bi = nb - 1
    pm[ui][bi]++
  }
  L.tlStart = start; L.tlStep = stepMs
  L.tlSeries = top4.map((nm, i) => ({ nm, color: colors[i], total: cnt.get(nm), vals: pm[i] }))
  return L
}

// 상세 뷰 데이터 (on-demand · /api/detail). 최신 live_id 기준(방송 중이면 실시간, 아니면 지난 방송).
export async function loadDetail(supabase, view) {
  const { data: lastSnap } = await supabase.from('chat_snapshots').select('captured_at,live_id').order('captured_at', { ascending: false }).limit(1).maybeSingle()
  if (!lastSnap?.live_id) return { empty: true }
  const liveId = lastSnap.live_id
  const isLive = (Date.now() - new Date(lastSnap.captured_at).getTime()) < 90 * 1000
  const { data: sess } = await supabase.from('chat_snapshots').select('captured_at,chat_count').eq('live_id', liveId).order('captured_at', { ascending: true }).limit(3000)
  const rows = sess || []
  const start = rows.length ? new Date(rows[0].captured_at).getTime() : Date.now()
  const end = rows.length ? new Date(rows[rows.length - 1].captured_at).getTime() : Date.now()
  const elapsedMs = Math.max(end - start, 60000)
  const chatTotal = rows.reduce((a, r) => a + (r.chat_count || 0), 0)
  const { data: lm } = await supabase.from('chat_messages').select('id,nickname,message,emojis,msg_type,msg_time,user_role').eq('live_id', liveId).order('id', { ascending: false }).limit(6000)
  const msgs = (lm || []).filter((m) => m.nickname)
  const cnt = new Map(), uinfo = new Map()
  for (const m of msgs) {
    cnt.set(m.nickname, (cnt.get(m.nickname) || 0) + 1)
    const t = m.msg_time ? new Date(m.msg_time).getTime() : null
    if (t != null) { const u = uinfo.get(m.nickname) || { first: t, last: t }; u.first = Math.min(u.first, t); u.last = Math.max(u.last, t); uinfo.set(m.nickname, u) }
  }
  if (view === 'live-chat') {
    const feed = msgs.filter((m) => m.msg_type === 'chat' && m.message).slice(0, 300).reverse().map(renderFeedItem)
    return { isLive, chatTotal, unique: cnt.size, cpm: Math.round((chatTotal / Math.max(1 / 60, elapsedMs / 60000)) * 10) / 10, elapsed: fmtDur(elapsedMs), feed, cpmSeries: sample(rows.map((r) => r.chat_count || 0), 60), start, step: 60000 }
  }
  // viewer-activity
  const { data: past } = await supabase.from('chat_messages').select('nickname').neq('live_id', liveId).limit(6000)
  const pastSet = new Set((past || []).map((p) => p.nickname))
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1])
  const colors = ['#16a34a', '#f5a623', '#e5484d', '#3b82f6', '#a855f7', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#6366f1']
  const topN = top.slice(0, 10).map((t) => t[0])
  const stepMs = 60000, nb = Math.max(1, Math.ceil(elapsedMs / stepMs))
  const pm = topN.map(() => new Array(nb).fill(0))
  for (const m of msgs) { const ui = topN.indexOf(m.nickname); if (ui < 0) continue; const t = m.msg_time ? new Date(m.msg_time).getTime() : null; if (t == null) continue; let bi = Math.floor((t - start) / stepMs); if (bi < 0) bi = 0; if (bi >= nb) bi = nb - 1; pm[ui][bi]++ }
  return {
    isLive, unique: cnt.size, tlStart: start, tlStep: stepMs,
    tlSeries: topN.map((nm, i) => ({ nm, color: colors[i % colors.length], total: cnt.get(nm), vals: pm[i] })),
    list: top.slice(0, 20).map(([nm, c]) => ({ nm, c, first: uinfo.get(nm)?.first ?? null, last: uinfo.get(nm)?.last ?? null, isNew: !pastSet.has(nm) })),
  }
}

// 방송 종료 시: 가장 최근 방송의 시청자별 타임라인/랭킹/요약 (신선도 무관, 최신 live_id 기준)
export async function loadLastBroadcast(supabase) {
  const { data: lastSnap } = await supabase.from('chat_snapshots').select('live_id').order('captured_at', { ascending: false }).limit(1).maybeSingle()
  if (!lastSnap?.live_id) return null
  const liveId = lastSnap.live_id
  const { data: sess } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,chat_count').eq('live_id', liveId).order('captured_at', { ascending: true }).limit(3000)
  const rows = sess || []
  if (!rows.length) return null
  const start = new Date(rows[0].captured_at).getTime()
  const end = new Date(rows[rows.length - 1].captured_at).getTime()
  const ccv = rows.map((r) => r.concurrent_users).filter((v) => v != null)
  const avgViewers = ccv.length ? Math.round(ccv.reduce((a, b) => a + b, 0) / ccv.length) : null
  const maxViewers = ccv.length ? Math.max(...ccv) : null
  const chatTotal = rows.reduce((a, r) => a + (r.chat_count || 0), 0)

  const { data: lm } = await supabase.from('chat_messages').select('nickname,msg_type,msg_time,user_role').eq('live_id', liveId).order('id', { ascending: false }).limit(8000)
  const msgs = (lm || []).filter((m) => m.nickname)
  const cnt = new Map()
  for (const m of msgs) cnt.set(m.nickname, (cnt.get(m.nickname) || 0) + 1)
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const mx = top[0]?.[1] || 1
  const leaderboard = top.map(([nm, c]) => ({ nm, c, w: Math.round((c / mx) * 100) }))
  const colors = ['#16a34a', '#f5a623', '#e5484d', '#3b82f6']
  const top4 = top.slice(0, 4).map((t) => t[0])
  const stepMs = 60000, elapsedMs = Math.max(end - start, stepMs)
  const nb = Math.max(1, Math.ceil(elapsedMs / stepMs))
  const pm = top4.map(() => new Array(nb).fill(0))
  for (const m of msgs) {
    const ui = top4.indexOf(m.nickname); if (ui < 0) continue
    const t = m.msg_time ? new Date(m.msg_time).getTime() : null; if (t == null) continue
    let bi = Math.floor((t - start) / stepMs); if (bi < 0) bi = 0; if (bi >= nb) bi = nb - 1
    pm[ui][bi]++
  }
  const kdate = new Date(start + 9 * 36e5)
  return {
    date: `${String(kdate.getUTCMonth() + 1).padStart(2, '0')}-${String(kdate.getUTCDate()).padStart(2, '0')}`,
    avgViewers, maxViewers, chatTotal, durationMin: Math.round((end - start) / 60000),
    tlStart: start, tlStep: stepMs,
    tlSeries: top4.map((nm, i) => ({ nm, color: colors[i], total: cnt.get(nm), vals: pm[i] })),
    leaderboard,
  }
}
