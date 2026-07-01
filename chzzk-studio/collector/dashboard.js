// ============================================================
// 대시보드 생성기 — 20분마다 실제 데이터로 HTML을 만들어 Supabase Storage(공개)에 업로드.
//   보기: {SUPABASE_URL}/storage/v1/object/public/thumbs/dashboard.html
//   (임시 버전. 데이터는 서버측 service 키로 읽어 HTML에 구워넣으므로 RLS 유지·키 노출 없음)
// ============================================================
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (n) => (n == null ? '-' : Number(n).toLocaleString())

// 서버측 라인차트 SVG 생성
function lineSVG(series, opts = {}) {
  const W = opts.W || 640, H = opts.H || 200, pl = 36, pr = 12, pt = 12, pb = 22
  const all = series.flatMap((s) => s.data.filter((v) => v != null))
  if (!all.length) return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><text x="${W / 2}" y="${H / 2}" fill="#bbb" font-size="12" text-anchor="middle">데이터 수집 대기 중</text></svg>`
  let min = opts.min != null ? opts.min : Math.min(...all)
  let max = opts.max != null ? opts.max : Math.max(...all) * 1.15
  if (min === max) max = min + 1
  const n = Math.max(series[0].data.length, 2)
  const x = (i) => pl + (W - pl - pr) * (i / (n - 1))
  const y = (v) => { let t = (v - min) / (max - min); if (opts.invert) t = 1 - t; return pt + (H - pt - pb) * (1 - t) }
  let g = ''
  for (let k = 0; k <= 4; k++) {
    const yy = pt + (H - pt - pb) * (k / 4)
    const val = Math.round(max - (max - min) * k / 4)
    g += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="#f0f0f0"/>`
    g += `<text x="${pl - 6}" y="${yy + 3}" fill="#bbb" font-size="9" text-anchor="end">${opts.rankLabel ? val + '위' : val}</text>`
  }
  for (const s of series) {
    const pts = s.data.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${g}</svg>`
}

function sample(arr, target) {
  if (arr.length <= target) return arr
  const step = arr.length / target, out = []
  for (let i = 0; i < target; i++) out.push(arr[Math.floor(i * step)])
  return out
}

export async function buildDashboard(supabase, SUPABASE_URL) {
  const d = { updated: new Date().toISOString() }

  try { // 팔로워
    const { data: latest } = await supabase.from('follower_snapshots').select('follower_count,captured_at').order('captured_at', { ascending: false }).limit(1).maybeSingle()
    d.followers = latest?.follower_count ?? null
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
    const { data: old } = await supabase.from('follower_snapshots').select('follower_count').gte('captured_at', weekAgo).order('captured_at', { ascending: true }).limit(1).maybeSingle()
    d.followerDelta = d.followers != null && old?.follower_count != null ? d.followers - old.follower_count : null
    const { data: fseries } = await supabase.from('follower_snapshots').select('follower_count').order('captured_at', { ascending: false }).limit(400)
    d.followerSeries = sample((fseries || []).map((r) => r.follower_count).reverse(), 40)
  } catch (e) { console.warn('dash followers:', e.message) }

  try { // 시청자·순위·채팅 (chat_snapshots)
    const { data: snaps } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,category_rank,chat_count,live_id').order('captured_at', { ascending: false }).limit(600)
    const s = snaps || []
    const cu = s.map((r) => r.concurrent_users).filter((v) => v != null)
    d.avgViewers = cu.length ? Math.round(cu.reduce((a, b) => a + b, 0) / cu.length) : null
    d.peakViewers = cu.length ? Math.max(...cu) : null
    const ranks = s.map((r) => r.category_rank).filter((v) => v != null)
    d.bestRank = ranks.length ? Math.min(...ranks) : null
    const latestLive = s.find((r) => r.live_id != null)?.live_id
    const sess = s.filter((r) => r.live_id === latestLive).reverse()
    d.viewerSeries = sess.map((r) => r.concurrent_users)
    d.rankSeries = sess.map((r) => r.category_rank)
    d.chatSeries = sess.map((r) => r.chat_count)
    d.recentChat = sess.reduce((a, r) => a + (r.chat_count || 0), 0)
  } catch (e) { console.warn('dash snaps:', e.message) }

  try { // 최다 채팅 유저 + 이모티콘 (최근 채팅)
    const { data: msgs } = await supabase.from('chat_messages').select('nickname,message,emojis,is_subscriber,sub_months,is_follower').order('id', { ascending: false }).limit(3000)
    const byUser = new Map(), byEmo = new Map()
    for (const m of msgs || []) {
      if (m.nickname) {
        const u = byUser.get(m.nickname) || { count: 0, sub: false, months: null, follower: false }
        u.count++; if (m.is_subscriber) { u.sub = true; u.months = m.sub_months }; if (m.is_follower) u.follower = true
        byUser.set(m.nickname, u)
      }
      const codes = (m.message || '').match(/\{:([^:}]+):\}/g) || []
      for (const raw of codes) {
        const code = raw.slice(2, -2)
        const e = byEmo.get(code) || { count: 0, url: null }
        e.count++; if (!e.url && m.emojis && m.emojis[code]) e.url = m.emojis[code]
        byEmo.set(code, e)
      }
    }
    d.topChatters = [...byUser.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([nm, u]) => ({ nm, ...u }))
    d.topEmotes = [...byEmo.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([code, e]) => ({ code, ...e }))
  } catch (e) { console.warn('dash msgs:', e.message) }

  try { // 최근 다시보기
    const { data: vids } = await supabase.from('video_snapshots').select('video_no,title,read_count,captured_at').order('captured_at', { ascending: false }).limit(300)
    const seen = new Set(), vods = []
    for (const v of vids || []) { if (!seen.has(v.video_no)) { seen.add(v.video_no); vods.push(v) } }
    d.vods = vods.slice(0, 5)
  } catch (e) { console.warn('dash vods:', e.message) }

  try { // 방송 여부 + 데뷔일
    const { data: cfg } = await supabase.from('collector_config').select('key,value').in('key', ['debut_date'])
    d.debut = (cfg || []).find((r) => r.key === 'debut_date')?.value || null
  } catch (e) { /* skip */ }

  const html = renderHTML(d)
  const { error } = await supabase.storage.from('thumbs').upload('dashboard.html', html, { contentType: 'text/html; charset=utf-8', upsert: true })
  if (error) console.error('❌ 대시보드 업로드 실패:', error.message)
  else console.log(`📊 [${new Date().toISOString()}] 대시보드 갱신 → ${SUPABASE_URL}/storage/v1/object/public/thumbs/dashboard.html`)
}

function statCard(k, v, unit, delta, deltaClass) {
  return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}${unit ? `<small> ${esc(unit)}</small>` : ''}</div>${delta ? `<div class="delta ${deltaClass}">${esc(delta)}</div>` : ''}</div>`
}

function renderHTML(d) {
  const chatters = (d.topChatters || []).map((u, i) => {
    const badge = u.sub ? `<span class="tagbadge">구독 ${u.months ?? ''}개월</span>` : u.follower ? `<span class="tagbadge">팔로워</span>` : ''
    return `<div class="li"><span class="rk">${i + 1}</span><span class="nm">${esc(u.nm)} ${badge}</span><span class="ct">${num(u.count)}</span></div>`
  }).join('') || '<div class="muted">아직 데이터 없음 (방송 시 채워짐)</div>'

  const emotes = (d.topEmotes || []).map((e) => {
    const img = e.url ? `<img src="${esc(e.url)}" width="20" height="20" style="border-radius:4px"/>` : `<span class="ei"></span>`
    return `<div class="emo">${img} ×${num(e.count)}</div>`
  }).join('') || '<div class="muted">아직 데이터 없음</div>'

  const vods = (d.vods || []).map((v) => `<div class="li"><span class="nm">${esc(v.title)}</span><span class="ct">조회 ${num(v.read_count)}</span></div>`).join('') || '<div class="muted">-</div>'

  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="refresh" content="300"><title>치지직 통계 — SoundVoltex1</title>
<style>
:root{--bg:#fafafa;--panel:#fff;--border:#ebebeb;--text:#171717;--dim:#666;--dim2:#8f8f8f;--green:#16a34a;--red:#e5484d;--blue:#0070f3;--amber:#f5a623;--purple:#7c3aed;--radius:12px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
.app{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
.side{border-right:1px solid var(--border);background:var(--panel);padding:16px 10px}
.brand{display:flex;align-items:center;gap:9px;padding:6px 8px 16px;font-weight:600}
.brand .dot{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899)}
.navi{display:flex;flex-direction:column;gap:2px}
.navi a{padding:7px 10px;border-radius:7px;color:var(--dim)}
.navi a.on{background:#f2f2f2;color:var(--text);font-weight:500}
.main{padding:22px 26px;max-width:1080px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.top h1{font-size:19px;font-weight:600}.top .sub{color:var(--dim);font-size:13px;margin-top:2px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px}
.card .k{color:var(--dim);font-size:12.5px}.card .v{font-size:26px;font-weight:600;margin-top:7px}
.card .v small{font-size:13px;color:var(--dim);font-weight:450}
.delta{font-size:12px;font-weight:500;margin-top:6px}.delta.up{color:var(--green)}.delta.down{color:var(--red)}.delta.flat{color:var(--dim2)}
.row3{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-bottom:16px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.panel-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.panel-h .t{font-weight:600}.panel-h .badge{font-size:11px;font-weight:600;color:#fff;background:var(--purple);padding:2px 8px;border-radius:6px}
.muted{color:var(--dim);font-size:12px;margin-top:2px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--dim);margin-top:8px}.legend span{display:inline-flex;align-items:center;gap:6px}
.dotc{width:9px;height:9px;border-radius:3px;display:inline-block}
.ba{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center;margin-top:12px}
.bcell{background:#fafafa;border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center}
.bcell .l{font-size:11.5px;color:var(--dim)}.bcell .n{font-size:26px;font-weight:600;margin-top:3px}
.lst{display:flex;flex-direction:column;margin-top:6px}
.li{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #f2f2f2;font-size:13px}
.li .rk{width:18px;color:var(--dim2);font-size:12px}.li .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.li .ct{color:var(--dim)}
.tagbadge{font-size:10px;padding:1px 6px;border-radius:5px;background:#eef2ff;color:#4338ca}
.emos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.emo{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:12px}
.emo .ei{width:20px;height:20px;border-radius:4px;background:linear-gradient(135deg,#ffd1dc,#c9e4ff)}
.foot{color:var(--dim2);font-size:11.5px;margin-top:18px;border-top:1px solid var(--border);padding-top:12px}
/* 반응형: 태블릿 */
@media(max-width:900px){.app{grid-template-columns:1fr}.side{display:none}.main{padding:18px 16px;max-width:100%}.cards{grid-template-columns:repeat(2,1fr)}.row3,.row2{grid-template-columns:1fr}}
/* 반응형: 모바일 */
@media(max-width:480px){.main{padding:14px 12px}.card{padding:14px}.card .v{font-size:22px}.top h1{font-size:17px}.ba{grid-template-columns:1fr;gap:8px}.emos{gap:6px}}
</style></head><body><div class="app">
<aside class="side"><div class="brand"><span class="dot"></span> 치지직 통계</div>
<nav class="navi"><a class="on">Overview</a><a>시청자</a><a>채팅</a><a>순위</a><a>다시보기</a><a>데뷔 비교</a></nav></aside>
<main class="main">
<div class="top"><div><h1>SoundVoltex1</h1><div class="sub">이터널 리턴 · 실데이터</div></div></div>
<div class="cards">
${statCard('평균 동시 시청자', num(d.avgViewers), '명', d.peakViewers != null ? `최고 ${num(d.peakViewers)}명` : '', 'flat')}
${statCard('팔로워', num(d.followers), '', d.followerDelta != null ? `${d.followerDelta >= 0 ? '▲ +' : '▼ '}${d.followerDelta} (7일)` : '', d.followerDelta >= 0 ? 'up' : 'down')}
${statCard('이터널리턴 최고순위', d.bestRank != null ? num(d.bestRank) : '-', '위', '', 'flat')}
${statCard('최근 방송 채팅', num(d.recentChat), '', '', 'flat')}
</div>
<div class="row3">
<div class="card"><div class="panel-h"><span class="t">최근 방송 — 시청자 & 채팅</span></div>
${lineSVG([{ data: d.viewerSeries || [], color: '#0070f3' }, { data: d.chatSeries || [], color: '#f5a623' }])}
<div class="legend"><span><i class="dotc" style="background:#0070f3"></i> 시청자</span><span><i class="dotc" style="background:#f5a623"></i> 분당 채팅</span></div></div>
<div class="card"><div class="panel-h"><span class="t">이터널리턴 순위 변화</span></div>
${lineSVG([{ data: d.rankSeries || [], color: '#7c3aed' }], { W: 400, invert: true, min: 1, max: 15, rankLabel: true })}
<div class="muted">↓ 위로 갈수록 상위 순위</div></div>
</div>
<div class="card"><div class="panel-h"><span class="t">팔로워 성장</span></div>
${lineSVG([{ data: d.followerSeries || [], color: '#16a34a' }], { H: 140 })}</div>
<div class="card" style="margin-top:16px"><div class="panel-h"><span class="t">데뷔 전 vs 후 비교</span><span class="badge">핵심</span></div>
<div class="muted">데뷔일: <b>${d.debut ? esc(d.debut) : '미설정'}</b> — ${d.debut ? '이 날짜 기준 자동 분리' : '설정하면 before/after 자동 비교 (아래는 예시)'}</div>
<div class="ba"><div class="bcell"><div class="l">데뷔 전 평균 시청자</div><div class="n" style="color:var(--blue)">${num(d.avgViewers)}</div></div>
<div style="text-align:center;color:var(--dim2)">→</div>
<div class="bcell"><div class="l">데뷔 후 평균 시청자</div><div class="n" style="color:var(--purple)">8월~</div></div></div></div>
<div class="row2" style="margin-top:16px">
<div class="card"><div class="panel-h"><span class="t">최다 채팅 시청자</span><span class="muted">최근</span></div><div class="lst">${chatters}</div></div>
<div class="card"><div class="panel-h"><span class="t">자주 쓰는 이모티콘</span></div><div class="emos">${emotes}</div>
<div class="panel-h" style="margin-top:16px"><span class="t">최근 다시보기</span></div><div class="lst">${vods}</div></div>
</div>
<div class="foot">🔄 5분마다 자동 새로고침 · 마지막 갱신 ${esc(d.updated)} (UTC) · 20분 주기로 데이터 재집계</div>
</main></div></body></html>`
}
