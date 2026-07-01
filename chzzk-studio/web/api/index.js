// ============================================================
// 치지직 통계 대시보드 — Vercel 서버리스 함수
//   매 요청마다 Supabase(service 키)에서 읽어 HTML 렌더. RLS 유지·키 노출 없음.
//   OFFLINE(방송 종료): 실데이터(broadcast_analytics + 수집 데이터).
//   LIVE(방송 중): 가상(mock) 실시간 뷰 — 실시간 채팅/랭킹/시청자별 타임라인.
//   상단 토글로 전환. 모든 해상도 대응(반응형).
//   환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
// ============================================================
import { createClient } from '@supabase/supabase-js'
import { loadLive, loadLastBroadcast, colorFor } from './_live.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const num = (n) => (n == null ? '-' : Number(n).toLocaleString())
// 채팅 메시지 안의 이모티콘 코드 {:code:} → <img>. (esc는 { } : 를 안 건드리므로 escape 후 치환해도 안전)
const renderMsg = (message, emojis) => {
  const map = emojis || {}
  return esc(message).replace(/\{:([^:}]+):\}/g, (whole, code) => (map[code] ? `<img src="${esc(map[code])}" class="emoji" alt=":${esc(code)}:" loading="lazy">` : whole))
}
const md = (iso) => { const d = new Date(iso); const k = new Date(d.getTime() + 9 * 36e5); return `${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}` }
const khour = (iso) => (new Date(iso).getUTCHours() + 9) % 24
const fmtDur = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }

function lineSVG(series, opts = {}) {
  const W = opts.W || 640, H = opts.H || 200, pl = 36, pr = 12, pt = 12, pb = 22
  const all = series.flatMap((s) => s.data.filter((v) => v != null))
  if (!all.length) return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}"><text x="${W / 2}" y="${H / 2}" fill="#bbb" font-size="12" text-anchor="middle">데이터 수집 대기 중 (방송 시 채워짐)</text></svg>`
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
    g += `<line x1="${pl}" y1="${yy}" x2="${W - pr}" y2="${yy}" stroke="#ececec"/>`
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

async function loadData(supabase) {
  const d = { updated: new Date().toISOString() }

  // ── 팔로워
  try {
    const { data: latest } = await supabase.from('follower_snapshots').select('follower_count,captured_at').order('captured_at', { ascending: false }).limit(1).maybeSingle()
    d.followers = latest?.follower_count ?? null
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
    const { data: old } = await supabase.from('follower_snapshots').select('follower_count').gte('captured_at', weekAgo).order('captured_at', { ascending: true }).limit(1).maybeSingle()
    d.followerDelta = d.followers != null && old?.follower_count != null ? d.followers - old.follower_count : null
    const { data: fseries } = await supabase.from('follower_snapshots').select('follower_count').order('captured_at', { ascending: false }).limit(400)
    d.followerSeries = sample((fseries || []).map((r) => r.follower_count).reverse(), 40)
  } catch (e) { console.warn('followers:', e.message) }

  // ── 실시간 수집 스냅샷(순위/동접) — 최고 순위 등 보조 지표
  try {
    const { data: snaps } = await supabase.from('chat_snapshots').select('category_rank,concurrent_users').order('captured_at', { ascending: false }).limit(1000)
    const ranks = (snaps || []).map((r) => r.category_rank).filter((v) => v != null)
    d.bestRank = ranks.length ? Math.min(...ranks) : null
  } catch (e) { console.warn('snaps:', e.message) }

  // ── 공식 방송 분석(엑셀 임포트) — OFFLINE 핵심 실데이터
  try {
    const { data: bcs } = await supabase.from('broadcast_analytics').select('*').order('started_at', { ascending: false }).limit(200)
    if (bcs && bcs.length) {
      // 확정 스키마: avg_ccv/max_ccv/duration_sec/cheese_total/donation_count/er_best_rank/source
      d.bcCount = bcs.length
      d.bcHours = Math.round(bcs.reduce((a, b) => a + (b.duration_sec || 0), 0) / 3600)
      const ccu = bcs.map((b) => b.avg_ccv).filter((v) => v != null)
      d.avgViewers = ccu.length ? Math.round(ccu.reduce((a, b) => a + b, 0) / ccu.length) : null
      d.peakViewers = Math.max(...bcs.map((b) => b.max_ccv || 0))
      const ret = bcs.map((b) => b.retention_pct).filter((v) => v != null)
      d.avgRetention = ret.length ? (ret.reduce((a, b) => a + Number(b), 0) / ret.length).toFixed(2) : null
      d.cheese = bcs.reduce((a, b) => a + (b.cheese_total || 0), 0)
      d.donations = bcs.reduce((a, b) => a + (b.donation_count || 0), 0)
      const ranks = bcs.map((b) => b.er_best_rank).filter((v) => v != null)
      if (ranks.length) d.bestRank = Math.min(d.bestRank ?? Infinity, ...ranks)
      // 최근 방송 테이블 (renderOffline이 쓰는 키 유지)
      d.recentBc = bcs.slice(0, 8).map((b) => ({ date: md(b.started_at), title: b.title, plays: b.plays, avg: b.avg_ccv, peak: b.max_ccv, ret: b.retention_pct, chat: b.chat_rate_pct }))
      // 시간대 히트맵 (0~23시, 방송 시작시각 기준)
      const hours = new Array(24).fill(0)
      for (const b of bcs) if (b.started_at) hours[khour(b.started_at)]++
      d.hourHeat = hours
      // 동접 추이(과거→최근, 방송별 평균/최대)
      const chrono = [...bcs].reverse()
      d.bcAvgSeries = sample(chrono.map((b) => b.avg_ccv), 40)
      d.bcPeakSeries = sample(chrono.map((b) => b.max_ccv), 40)
      // 하이라이트
      const peakBc = bcs.reduce((m, b) => ((b.max_ccv || 0) > (m.max_ccv || 0) ? b : m), bcs[0])
      d.peakBc = { title: peakBc.title, peak: peakBc.max_ccv, date: md(peakBc.started_at) }
    }
  } catch (e) { console.warn('broadcast_analytics (테이블 미생성일 수 있음):', e.message) }

  // ── 채팅(실시간 + 다시보기) → 최다 채팅 랭킹 / 이모티콘
  try {
    const [{ data: msgs }, { data: vmsgs }] = await Promise.all([
      supabase.from('chat_messages').select('nickname,message,emojis,is_subscriber,sub_months,is_follower').order('id', { ascending: false }).limit(3000),
      supabase.from('vod_chat_messages').select('nickname,message,emojis').order('id', { ascending: false }).limit(8000),
    ])
    const all = [...(msgs || []), ...(vmsgs || [])]
    d.chatMsgTotal = all.length
    const byUser = new Map(), byEmo = new Map()
    for (const m of all) {
      if (m.nickname) {
        const u = byUser.get(m.nickname) || { count: 0, sub: false, months: null, follower: false }
        u.count++; if (m.is_subscriber) { u.sub = true; u.months = m.sub_months }; if (m.is_follower) u.follower = true
        byUser.set(m.nickname, u)
      }
      for (const raw of (m.message || '').match(/\{:([^:}]+):\}/g) || []) {
        const code = raw.slice(2, -2)
        const e = byEmo.get(code) || { count: 0, url: null }
        e.count++; if (!e.url && m.emojis && m.emojis[code]) e.url = m.emojis[code]
        byEmo.set(code, e)
      }
    }
    d.topChatters = [...byUser.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([nm, u]) => ({ nm, ...u }))
    d.topEmotes = [...byEmo.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([code, e]) => ({ code, ...e }))
  } catch (e) { console.warn('msgs:', e.message) }

  // ── 다시보기
  try {
    const { data: vids } = await supabase.from('video_snapshots').select('video_no,title,read_count,captured_at').order('captured_at', { ascending: false }).limit(300)
    const seen = new Set(), vods = []
    for (const v of vids || []) if (!seen.has(v.video_no)) { seen.add(v.video_no); vods.push(v) }
    d.vods = vods.slice(0, 40)
  } catch (e) { console.warn('vods:', e.message) }

  // ── 실시간 라이브 감지 + 실데이터 (공용 모듈)
  try { d.live = await loadLive(supabase) } catch (e) { console.warn('live:', e.message) }
  // ── 방송 종료 상태면 가장 최근 방송 타임라인도 로드
  if (!d.live) { try { d.lastBroadcast = await loadLastBroadcast(supabase) } catch (e) { console.warn('lastBc:', e.message) } }

  return d
}

// 가상(mock) 실시간 데이터 — 방송 중일 때만 표시. 실제 방송이 켜지면 수집값으로 대체 예정.
const MOCK = {
  title: '엠마 미스릴 달리기 🔥', viewers: 41, rank: 3, rankStart: 9, chat: 512, cpm: 4.2, newFollowers: 8, elapsed: '2:14:37',
  feed: [
    { nm: '깜퓨퓨', t: '엠마 이번판 캐리각', cls: 'fol' },
    { nm: '전국제패엘프', t: '미스릴 가자!! 🧀', cls: 'sub' },
    { nm: 'Silver', t: '오 좋은데?', cls: '' },
    { nm: '문돌이', t: '방송 몇시까지에요~', cls: 'sub' },
    { nm: '깜퓨퓨', t: 'ㅋㅋㅋㅋ', cls: 'fol' },
    { nm: '전국제패엘프', t: '이 각도 예술이다', cls: 'sub' },
    { nm: '뉴비시청자', t: '첨왔어요 안녕하세요!', cls: '' },
  ],
  rank5: [{ nm: '전국제패엘프', c: 128, w: 100 }, { nm: '깜퓨퓨', c: 94, w: 73 }, { nm: '문돌이', c: 71, w: 55 }, { nm: 'Silver', c: 63, w: 49 }],
}
MOCK.tlN = 40
MOCK.tlSeries = (() => {
  const mk = (f) => Array.from({ length: MOCK.tlN }, (_, i) => Math.max(0, Math.round(f(i))))
  return [
    { nm: '전국제패엘프', color: '#16a34a', total: 128, vals: mk((i) => 6 * Math.sin(i / 5) + 6 + (i > 16 && i < 28 ? 7 : 0)) },
    { nm: '깜퓨퓨', color: '#f5a623', total: 94, vals: mk((i) => 4 * Math.sin(i / 3 + 1) + 4) },
    { nm: '문돌이', color: '#e5484d', total: 71, vals: mk((i) => 3 * Math.sin(i / 6 + 2) + 3 + (i < 8 ? 3 : 0)) },
    { nm: 'Silver', color: '#3b82f6', total: 63, vals: mk((i) => 2.2 * Math.sin(i / 2 + 0.5) + 2.2) },
  ]
})()

function statCard(k, v, unit, delta, deltaClass) {
  return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}${unit ? `<small> ${esc(unit)}</small>` : ''}</div>${delta ? `<div class="delta ${deltaClass}">${esc(delta)}</div>` : ''}</div>`
}
// ── 재사용 패널 조각 (대시보드 + 개별 뷰 공용) ──
const htChatters = (d) => (d.topChatters || []).map((u, i) => {
  const md = ['🥇', '🥈', '🥉'][i] || (i + 1)
  const badge = u.sub ? `<span class="tagbadge">구독 ${u.months ?? ''}개월</span>` : u.follower ? `<span class="tagbadge">팔로워</span>` : ''
  return `<div class="li"><span class="rk">${md}</span><span class="nm">${esc(u.nm)} ${badge}</span><span class="ct">${num(u.count)}</span></div>`
}).join('') || '<div class="muted">아직 데이터 없음 (방송 시 채워짐)</div>'
const htChatBars = (d) => { // 랭킹(막대) 형태
  const mx = (d.topChatters || [])[0]?.count || 1
  return (d.topChatters || []).map((u, i) => `<div class="li"><span class="rk">${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><div class="nm">${esc(u.nm)}<div class="bar" style="width:${Math.round((u.count / mx) * 100)}%"></div></div><span class="ct" style="font-weight:700">${num(u.count)}</span></div>`).join('') || '<div class="muted">아직 데이터 없음</div>'
}
const htEmotes = (d) => (d.topEmotes || []).map((e) => {
  const img = e.url ? `<img src="${esc(e.url)}" width="22" height="22" style="border-radius:4px" loading="lazy"/>` : `<span class="ei"></span>`
  return `<div class="emo">${img} ×${num(e.count)}</div>`
}).join('') || '<div class="muted">아직 데이터 없음</div>'
const htVods = (d, n) => (d.vods || []).slice(0, n || 6).map((v) => `<div class="li"><span class="nm">${esc(v.title)}</span><span class="ct">조회 ${num(v.read_count)}</span></div>`).join('') || '<div class="muted">아직 데이터 없음</div>'
const htBcRows = (d) => (d.recentBc || []).map((b) => `<tr><td>${esc(b.date)}</td><td class="tt">${esc(b.title)}</td><td class="num">${num(b.plays)}</td><td class="num">${num(b.avg)}</td><td class="num">${num(b.peak)}</td><td class="num">${b.ret != null ? b.ret + '%' : '-'}</td><td class="num">${b.chat != null ? b.chat + '%' : '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">방송 종료 후 집계됩니다 (broadcast_analytics)</td></tr>'
const htHeat = (d) => (d.hourHeat || []).length ? d.hourHeat.map((c, h) => {
  const mx = Math.max(...d.hourHeat, 1); const lv = c === 0 ? 0 : Math.ceil((c / mx) * 4)
  return `<div class="g g${lv}" title="${h}시 · ${c}회"></div>`
}).join('') : ''
const cardViewerTrend = (d) => `<div class="card"><div class="panel-h"><span class="t">방송별 시청자 추이</span><span class="muted">평균 · 최대 (전 기간)</span></div>
${lineSVG([{ data: d.bcPeakSeries || [], color: '#c9d6ff' }, { data: d.bcAvgSeries || [], color: '#0070f3' }], { H: 190 })}
<div class="legend"><span><i class="dotc" style="background:#0070f3"></i> 평균 동접</span><span><i class="dotc" style="background:#c9d6ff"></i> 최대 동접</span></div></div>`
const cardTimeHeat = (d) => { const heat = htHeat(d); return `<div class="card"><div class="panel-h"><span class="t">방송 시간대</span><span class="muted">주로 오전~낮</span></div>
${heat ? `<div class="grass">${heat}</div><div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23시</span></div>` : '<div class="muted">방송 종료 후 집계</div>'}
<div class="panel-h" style="margin-top:16px"><span class="t">플레이 카테고리</span></div>
<div class="pie"><div class="donut"><i></i></div><div class="leg"><div><s style="background:#7c3aed"></s>이터널 리턴 92%</div><div><s style="background:#0070f3"></s>토크 5%</div><div><s style="background:#f5a623"></s>기타 3%</div></div></div></div>` }
const cardHistory = (d) => `<div class="card"><div class="panel-h"><span class="t">방송 이력</span><span class="muted">최근 8회 · 공식/수집</span></div>
<div class="tablewrap"><table><thead><tr><th>날짜</th><th>제목</th><th class="num">재생</th><th class="num">평균</th><th class="num">최대</th><th class="num">지속률</th><th class="num">채팅%</th></tr></thead><tbody>${htBcRows(d)}</tbody></table></div></div>`
const cardFollower = (d) => `<div class="card"><div class="panel-h"><span class="t">팔로워 성장</span></div>${lineSVG([{ data: d.followerSeries || [], color: '#16a34a' }], { H: 150 })}</div>`

// 지난 방송 시청자별 타임라인 — 정적 부드러운 곡선(상호작용 없이 읽기용)
function staticTimeline(series) {
  const W = 900, H = 170, base = 150, top = 14
  const all = (series || []).flatMap((s) => s.vals); const mx = Math.max(1, ...all)
  const n = series?.[0]?.vals.length || 1
  const smooth = (p) => {
    if (p.length < 2) return p.length ? `M${p[0][0]},${p[0][1]}` : ''
    let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i > 0 ? i - 1 : 0], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2 < p.length ? i + 2 : i + 1]
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    return d
  }
  const paths = (series || []).map((s) => {
    let last = -1; s.vals.forEach((v, i) => { if (v > 0) last = i })
    const end = last >= 0 && (s.vals.length - 1 - last) >= 3 ? last : s.vals.length - 1
    const pairs = []; for (let i = 0; i <= end; i++) pairs.push([(n < 2 ? W / 2 : (i / (n - 1)) * W), base - (s.vals[i] / mx) * (base - top)])
    return `<path fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" d="${smooth(pairs)}"/>`
  }).join('')
  const legend = (series || []).map((s) => `<span><i class="dotc" style="background:${s.color};width:14px;height:3px;border-radius:2px"></i> ${esc(s.nm)} (${num(s.total)})</span>`).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"><line x1="0" y1="${base + 8}" x2="${W}" y2="${base + 8}" stroke="#eee"/>${paths}</svg><div class="legend">${legend}</div>`
}
const cardLastBroadcast = (d) => {
  const b = d.lastBroadcast
  if (!b || !(b.tlSeries || []).some((s) => s.total)) return ''
  const lb = (b.leaderboard || []).map((r, i) => `<div class="li"><span class="rk">${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><div class="nm">${esc(r.nm)}<div class="bar" style="width:${r.w}%"></div></div><span class="ct" style="font-weight:700">${r.c}</span></div>`).join('') || '<div class="muted">-</div>'
  return `<div class="row3" style="margin-bottom:16px">
<div class="card"><div class="panel-h"><span class="t">🎬 지난 방송 시청자 활동</span><span class="muted">${esc(b.date)} · 평균 ${num(b.avgViewers)}·최대 ${num(b.maxViewers)}명 · 채팅 ${num(b.chatTotal)} · ${num(b.durationMin)}분</span></div>${staticTimeline(b.tlSeries)}<div class="muted" style="margin-top:6px">↑ 가장 최근 방송의 상위 4명 분당 채팅량</div></div>
<div class="card"><div class="panel-h"><span class="t">🏆 지난 방송 채팅 랭킹</span></div><div class="lst rankbars">${lb}</div></div>
</div>`
}

// ── SSOT 탭 뷰들 ──
const viewAnalysis = (d) => `<div class="card"><div class="panel-h"><span class="t">팔로워 성장</span><span class="muted">방송 지속 · 우상향</span></div>${lineSVG([{ data: d.followerSeries || [], color: '#16a34a' }], { H: 200 })}</div>
<div class="row3" style="margin-top:16px">${cardViewerTrend(d)}${cardTimeHeat(d)}</div>`

const viewChat = (d) => { const heat = htHeat(d); return `<div class="row3">
<div class="card"><div class="panel-h"><span class="t">방송 시간대 분포</span><span class="muted">채팅 활동 시간대</span></div>${heat ? `<div class="grass">${heat}</div><div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23시</span></div>` : '<div class="muted">집계 중</div>'}</div>
<div class="card"><div class="panel-h"><span class="t">자주 쓰는 이모티콘</span><span class="muted">비중</span></div><div class="emos">${htEmotes(d)}</div></div></div>
<div class="card" style="margin-top:16px"><div class="panel-h"><span class="t">최다 채팅 시청자</span><span class="muted">전 기간(실시간+다시보기)</span></div><div class="lst">${htChatters(d)}</div></div>` }

const viewRanking = (d) => `<div class="card"><div class="panel-h"><span class="t">🏆 채팅왕</span><span class="muted">전 기간 최다 채팅</span></div><div class="lst rankbars">${htChatBars(d)}</div></div>
<div class="row2" style="margin-top:16px">
<div class="card"><div class="panel-h"><span class="t">📅 개근왕</span><span class="muted">준비 중</span></div><div class="muted" style="padding:16px 0">방송별 참여 기록이 쌓이면 활성돼요</div></div>
<div class="card"><div class="panel-h"><span class="t">😄 이모티콘 장인</span><span class="muted">준비 중</span></div><div class="muted" style="padding:16px 0">시청자별 이모티콘 사용 집계 후 활성</div></div></div>`

const viewVods = (d) => {
  const vods = d.vods || []
  const total = vods.length, sum = vods.reduce((a, v) => a + (v.read_count || 0), 0)
  const avg = total ? Math.round(sum / total) : 0
  const top = vods.reduce((m, v) => ((v.read_count || 0) > (m ? m.read_count || 0 : 0) ? v : m), null)
  const ranked = [...vods].sort((a, b) => (b.read_count || 0) - (a.read_count || 0))
  const mx = ranked[0]?.read_count || 1
  const rows = ranked.slice(0, 15).map((v, i) => `<div class="li"><span class="rk">${i + 1}</span><div class="nm">${esc(v.title)}<div class="bar" style="width:${Math.round((v.read_count || 0) / mx * 100)}%;background:linear-gradient(90deg,#0070f3,#7c3aed)"></div></div><span class="ct" style="font-weight:700">${num(v.read_count)}</span></div>`).join('') || '<div class="muted">아직 데이터 없음</div>'
  const STOP = new Set(['엠마', '방송', '다시보기', '오늘', '조금', '하다가여', '하는', '보는', '까지', '이터', '리턴'])
  const kw = new Map()
  for (const v of vods) { const seen = new Set(); for (const w of (v.title || '').split(/[\s,·\-\/\[\]()]+/)) { if (w.length < 2 || seen.has(w) || STOP.has(w)) continue; seen.add(w); const e = kw.get(w) || { n: 0, sum: 0 }; e.n++; e.sum += v.read_count || 0; kw.set(w, e) } }
  const kws = [...kw.entries()].filter(([, e]) => e.n >= 2).map(([w, e]) => ({ w, avg: Math.round(e.sum / e.n), n: e.n })).sort((a, b) => b.avg - a.avg).slice(0, 8)
  const kwHtml = kws.map((k) => `<div class="li"><span class="nm">${esc(k.w)} <span class="tagbadge">${k.n}개</span></span><span class="ct">평균 ${num(k.avg)}</span></div>`).join('') || '<div class="muted">키워드 집계 중 (VOD 더 쌓이면)</div>'
  return `<div class="cards">
${statCard('총 VOD', num(total), '개', '', 'flat')}${statCard('누적 조회', num(sum), '', '', 'flat')}${statCard('평균 조회', num(avg), '', '', 'flat')}${statCard('최고 조회', top ? num(top.read_count) : '-', '', top ? esc(top.title).slice(0, 14) : '', 'flat')}
</div>
<div class="row2" style="margin-top:16px">
<div class="card"><div class="panel-h"><span class="t">▶️ VOD 조회 랭킹</span><span class="muted">상위 15</span></div><div class="lst">${rows}</div></div>
<div class="card"><div class="panel-h"><span class="t">🔑 제목 키워드 인사이트</span><span class="muted">키워드별 평균 조회</span></div><div class="lst">${kwHtml}</div></div></div>
<div class="card" style="margin-top:16px"><div class="panel-h"><span class="t">📈 롱테일 분석</span><span class="muted">반짝형 vs 꾸준형</span></div>
<div class="muted" style="padding:16px 0;line-height:1.7">조회수 시간 스냅샷을 누적하는 중이에요. 데이터가 쌓이면 <b>"지금도 조회수 오르는 꾸준형 VOD"</b>와 반짝형을 자동 분류해서 강조할게요. (수집기에 업로드일·길이·좋아요·댓글이 붙으면 더 정밀해져요.)</div></div>`
}

function renderOffline(d) {
  const chatters = htChatters(d)
  const emotes = htEmotes(d)
  const vods = htVods(d)
  const bcRows = htBcRows(d)
  const heat = htHeat(d)

  return `<div class="v-off">
<div class="cards" id="overview">
${statCard('평균 동시 시청자', num(d.avgViewers), '명', d.peakViewers != null ? `최고 ${num(d.peakViewers)}명` : '', 'flat')}
${statCard('누적 방송', num(d.bcCount), '회', d.bcHours != null ? `약 ${num(d.bcHours)}시간` : '', 'flat')}
${statCard('평균 지속률', d.avgRetention != null ? d.avgRetention : '-', '%', '공식 분석', 'flat')}
<div class="card rankcard" onclick="openErRank()"><div class="k">이터널리턴 최고순위</div><div class="v">${d.bestRank != null ? num(d.bestRank) : '-'}<small> 위</small></div><div class="delta flat">지금 순위 보기</div></div>
</div>
<div class="cards">
${statCard('팔로워', num(d.followers), '', d.followerDelta != null ? `${d.followerDelta >= 0 ? '▲ +' : '▼ '}${d.followerDelta} (7일)` : '', d.followerDelta >= 0 ? 'up' : 'down')}
${statCard('후원 치즈', num(d.cheese), '', d.donations != null ? `후원 ${num(d.donations)}건` : '', 'flat')}
${statCard('최고 동접 방송', d.peakBc ? num(d.peakBc.peak) + '명' : '-', '', d.peakBc ? `${esc(d.peakBc.date)} ${esc(d.peakBc.title).slice(0, 12)}` : '', 'flat')}
${statCard('수집 채팅', num(d.chatMsgTotal), '건', '실시간+다시보기', 'flat')}
</div>

${cardLastBroadcast(d)}
<div class="row3" id="viewers">
<div class="card"><div class="panel-h"><span class="t">방송별 시청자 추이</span><span class="muted">평균 · 최대 (전 기간)</span></div>
${lineSVG([{ data: d.bcPeakSeries || [], color: '#c9d6ff' }, { data: d.bcAvgSeries || [], color: '#0070f3' }], { H: 190 })}
<div class="legend"><span><i class="dotc" style="background:#0070f3"></i> 평균 동접</span><span><i class="dotc" style="background:#c9d6ff"></i> 최대 동접</span></div></div>
<div class="card"><div class="panel-h"><span class="t">방송 시간대</span><span class="muted">주로 오전~낮</span></div>
${heat ? `<div class="grass">${heat}</div><div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23시</span></div>` : '<div class="muted">데이터 대기</div>'}
<div class="panel-h" style="margin-top:16px"><span class="t">플레이 카테고리</span></div>
<div class="pie"><div class="donut"><i></i></div><div class="leg"><div><s style="background:#7c3aed"></s>이터널 리턴 92%</div><div><s style="background:#0070f3"></s>토크 5%</div><div><s style="background:#f5a623"></s>기타 3%</div></div></div></div>
</div>

<div class="card" id="history"><div class="panel-h"><span class="t">방송 이력</span><span class="muted">최근 8회 · 공식 분석</span></div>
<div class="tablewrap"><table><thead><tr><th>날짜</th><th>제목</th><th class="num">재생</th><th class="num">평균</th><th class="num">최대</th><th class="num">지속률</th><th class="num">채팅%</th></tr></thead><tbody>${bcRows}</tbody></table></div></div>

<div class="card" style="margin-top:16px"><div class="panel-h"><span class="t">팔로워 성장</span></div>
${lineSVG([{ data: d.followerSeries || [], color: '#16a34a' }], { H: 130 })}</div>

<div class="row2" id="chat" style="margin-top:16px">
<div class="card" id="ranking"><div class="panel-h"><span class="t">최다 채팅 시청자</span><span class="muted">전 기간(실시간+다시보기)</span></div><div class="lst">${chatters}</div></div>
<div class="card"><div class="panel-h"><span class="t">자주 쓰는 이모티콘</span></div><div class="emos">${emotes}</div>
<div class="panel-h" style="margin-top:16px"><span class="t">최근 다시보기</span></div><div class="lst">${vods}</div></div>
</div>
</div>`
}

function renderLive(d) {
  const live = d.live
  const real = !!live
  // 실데이터 있으면 실데이터, 없으면 가상(mock)
  const viewers = real ? live.viewers : MOCK.viewers
  const rank = real ? live.rank : MOCK.rank
  const rankStart = real ? live.rankStart : MOCK.rankStart
  const chat = real ? live.chatTotal : MOCK.chat
  const cpm = real ? live.cpm : MOCK.cpm
  const elapsed = real ? live.elapsed : MOCK.elapsed
  const series = (real ? live.tlSeries : MOCK.tlSeries) || []
  const tlStart = real ? live.tlStart : Date.now() - MOCK.tlN * 60000
  const tlStep = real ? (live.tlStep || 60000) : 60000
  const feedRows = real ? (live.feed || []) : MOCK.feed.map((f) => `<div><span class="n" style="color:${colorFor(f.nm)}">${esc(f.nm)}</span> ${renderMsg(f.t)}</div>`)
  const rankArr = real ? (live.leaderboard || []) : MOCK.rank5

  const legend = series.map((s) => `<span><i class="dotc" style="background:${s.color};width:14px;height:3px;border-radius:2px"></i> ${esc(s.nm)} (${num(s.total)})</span>`).join('')
  const tlJSON = JSON.stringify({ start: tlStart, step: tlStep, series: series.map((s) => ({ nm: s.nm, color: s.color, vals: s.vals })) }).replace(/</g, '\\u003c')
  const feed = feedRows.length ? feedRows.join('') : '<div class="muted">채팅 수집 대기 중…</div>'
  const rankLb = rankArr.length ? rankArr.map((r, i) => `<div class="li"><span class="rk">${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><div class="nm">${esc(r.nm)}<div class="bar" style="width:${r.w}%"></div></div><span class="ct" style="font-weight:700">${r.c}</span></div>`).join('') : '<div class="muted">-</div>'
  const rankDelta = rankStart != null && rank != null ? `▲ 시작 ${rankStart}위` : '실시간'
  // 경과 시간: 방송 시작 epoch를 심어두고 클라이언트가 매초 카운트(느낌만). mock은 가짜 시작점.
  const startMs = real ? live.startMs : Date.now() - (2 * 3600 + 14 * 60 + 37) * 1000
  const tlNote = real ? '↑ 방송 시작부터 지금까지 상위 4명의 분당 채팅량' : '↑ 예시: 시청자별 채팅 활동 추이 (실제 방송 데이터로 대체됨)'

  return `<div class="v-live">
<div class="cards" id="lv-hero">
<div class="card hi"><div class="k"><span class="livedot"><i></i>LIVE</span> 현재 시청자</div><div class="v"><span id="lv-viewers">${num(viewers)}</span><small> 명</small></div><div class="delta up">${real ? '실시간' : '▲ 방금 +6'}</div></div>
<div class="card rankcard" onclick="openErRank()"><div class="k">이터널리턴 순위</div><div class="v"><span id="lv-rank">${rank != null ? rank : '50+'}</span><small> 위</small></div><div class="delta up" id="lv-rankd">${esc(rankDelta)}</div></div>
<div class="card"><div class="k">이번 방송 채팅</div><div class="v" id="lv-chat">${num(chat)}</div><div class="delta flat" id="lv-cpm">${cpm != null ? `분당 ${cpm}개` : ''}</div></div>
<div class="card"><div class="k">경과 시간</div><div class="v" id="elapsed" data-start="${startMs}">${esc(elapsed)}</div><div class="delta flat">${real ? '실시간 카운트' : '가상'}</div></div>
</div>
<div class="card" id="lv-tlcard"><div class="panel-h"><span class="t">시청자별 채팅 활동</span><span class="muted">방송 시작 → 지금 · 상위 4명</span></div>
<div class="tlbar"><span class="muted">확대</span><input type="range" id="tlzoom" min="0" max="100" value="0" aria-label="시간축 확대"><span class="muted" id="tlrange"></span></div>
<div class="tlscroll" id="tlscroll"><div class="tlcanvas" id="tlcanvas"><svg id="tlsvg" preserveAspectRatio="none"></svg><div class="tlpulses" id="tlpulses"></div></div></div>
<div class="tlmini" id="tlmini"><svg id="tlminisvg" preserveAspectRatio="none"></svg><div class="tlwindow" id="tlwindow"><span class="h l"></span><span class="h r"></span></div></div>
<div class="legend">${legend}</div>
<div class="muted" style="margin-top:6px">${tlNote} · 확대 바를 늘리면 시간축이 커지고, 아래 미니맵을 끌면 구간 이동·양끝을 잡으면 구간 조절</div>
<script>window.__TL=${tlJSON}</script></div>
<div class="row2" style="margin-top:16px">
<div class="card feedcard" id="lv-feedcard"><div class="panel-h"><span class="t">실시간 채팅</span><span class="muted">● 흐르는 중 · 그래프 클릭=그 시각 이동 · 위로 스크롤=과거</span></div><div class="feed" id="lv-feed" data-live="${real ? esc(String(live.liveId ?? '')) : ''}">${feed}</div><button class="newmsg" id="lv-newmsg" onclick="lvFeedBottom()">↓ 새 채팅 <span id="lv-newn">0</span></button><button class="newmsg resume" id="lv-resume" onclick="lvResume()">↻ 실시간으로</button></div>
<div class="card"><div class="panel-h"><span class="t">채팅 랭킹 🏆</span><span class="muted">이번 방송</span></div><div class="lst rankbars" id="lv-rank5">${rankLb}</div></div>
</div>
${real ? '' : '<div class="muted" style="margin-top:12px">※ 지금은 방송 감지 전이라 <b>가상(mock)</b> 예시입니다. 실제 방송이 켜지면(수집기 가동 중) 이 화면이 실시간 실데이터로 자동 전환됩니다.</div>'}
</div>`
}

function renderHTML(d, debug) {
  const hasLive = !!d.live?.isLive // 실시간 감지: 방송 중이면 LIVE 뷰로 시작
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
${hasLive ? '<meta http-equiv="refresh" content="90">' : ''}<title>치지직 통계 — SoundVoltex1</title>
<style>
:root{--bg:#fafafa;--panel:#fff;--border:#ebebeb;--text:#171717;--dim:#666;--dim2:#8f8f8f;--green:#16a34a;--red:#e5484d;--blue:#0070f3;--amber:#f5a623;--purple:#7c3aed;--radius:12px}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
.app{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
.side{border-right:1px solid var(--border);background:var(--panel);padding:16px 10px}
.brand{display:flex;align-items:center;gap:9px;padding:6px 8px 16px;font-weight:600}
.brand .dot{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899)}
.navi{display:flex;flex-direction:column;gap:2px}.navi a{padding:7px 10px;border-radius:7px;color:var(--dim);cursor:pointer;text-decoration:none}.navi a.on{background:#f2f2f2;color:var(--text);font-weight:500}
.topnav{display:none;position:sticky;top:0;z-index:30;gap:6px;padding:10px 0;margin-bottom:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;background:var(--bg);border-bottom:1px solid var(--border)}
.topnav::-webkit-scrollbar{display:none}.topnav{scrollbar-width:none}
.topnav a{white-space:nowrap;padding:7px 13px;border-radius:999px;color:var(--dim);font-size:13px;font-weight:500;background:#f0f0f0;flex-shrink:0;text-decoration:none;cursor:pointer}.topnav a.on{background:var(--text);color:#fff}
#overview,#history,#viewers,#chat,#ranking{scroll-margin-top:16px}
/* ── 재설계 사이드바 + 뷰 전환 ── */
.side{display:flex;flex-direction:column}
.idcard{display:flex;gap:10px;align-items:flex-start;padding:4px 8px 14px;border-bottom:1px solid var(--border);margin-bottom:8px}
.avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899);flex-shrink:0}
.chname{font-weight:700;font-size:14px}.chsub{color:var(--dim);font-size:11.5px;margin-top:1px}
.idbadges{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.lvpill{display:inline-flex;align-items:center;gap:5px;background:#fdecec;color:var(--red);font-weight:700;font-size:10.5px;padding:2px 8px;border-radius:999px}.lvpill i{width:6px;height:6px;border-radius:50%;background:var(--red);animation:bk 1.2s infinite}
.folpill{font-size:10.5px;color:var(--dim);background:#f3f3f3;padding:2px 8px;border-radius:999px}
.navgroup{font-size:10px;color:var(--dim2);font-weight:700;letter-spacing:.05em;padding:13px 10px 4px}
.navi a.navlink{display:flex;align-items:center;gap:8px}
.navi a.disabled{color:var(--dim2);cursor:default;opacity:.7}
.navbadge{margin-left:auto;font-size:10px;background:#eef2ff;color:#4338ca;padding:1px 7px;border-radius:999px;font-weight:600}.navbadge.soon{background:#f3f3f3;color:var(--dim)}
.sidestatus{margin-top:auto;padding:12px 10px 2px;border-top:1px solid var(--border);font-size:11px;color:var(--green);line-height:1.7}.sidestatus .mut{color:var(--dim);font-size:10.5px}
.view{display:none}.view.active{display:block}
/* ── 순위 모달 ── */
.rankcard{cursor:pointer}.rankcard:hover{border-color:var(--dim2)}.rankcard .k::after{content:" ▸";color:var(--dim2)}
.modal{display:none;position:fixed;inset:0;z-index:100;background:#00000066;justify-content:center;padding:40px 16px;overflow-y:auto}
.modal.show{display:flex}
.modal-box{background:var(--panel);border:1px solid var(--border);border-radius:14px;max-width:520px;width:100%;box-shadow:0 20px 60px #0004;max-height:86vh;display:flex;flex-direction:column;align-self:flex-start}
.modal-h{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid var(--border)}
.modal-h .t{font-weight:700}.modal-h button{border:0;background:#f2f2f2;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:14px}
.modal-body{overflow-y:auto;padding:6px 8px;scrollbar-width:thin}
.er-row{display:flex;align-items:center;gap:12px;padding:9px 10px;border-radius:9px;border-bottom:1px solid #f4f4f4}
.er-row.sabol{background:#fff7ed;border:1px solid #fed7aa}
.er-rank{width:28px;text-align:center;font-weight:700;color:var(--dim2);flex-shrink:0}.er-row.sabol .er-rank{color:#ea580c}
.er-ch{flex:1;min-width:0;font-weight:600}.er-ch .er-title{font-weight:400;color:var(--dim);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.er-v{color:var(--dim);flex-shrink:0;font-variant-numeric:tabular-nums}
.main{padding:22px 26px;max-width:1120px}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap}
.top h1{font-size:19px;font-weight:600}.top .sub{color:var(--dim);font-size:13px;margin-top:2px}
.tg{display:inline-flex;background:#f0f0f0;border-radius:9px;padding:3px;flex-shrink:0}
.tg button{border:0;background:none;padding:6px 14px;border-radius:7px;font-size:12.5px;font-weight:550;color:var(--dim);cursor:pointer;white-space:nowrap}
.tg button.act{background:#fff;color:var(--text);box-shadow:0 1px 3px #0000001a}
body.live .tg .l.act{color:var(--red)}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px;min-width:0}
.card .k{color:var(--dim);font-size:12.5px}.card .v{font-size:clamp(20px,4.5vw,26px);font-weight:600;margin-top:7px}.card .v small{font-size:13px;color:var(--dim);font-weight:450}
.card.hi{border-color:#f3c2c8;background:#fff7f7}.card.hi .v{color:var(--red)}
.delta{font-size:12px;font-weight:500;margin-top:6px}.delta.up{color:var(--green)}.delta.down{color:var(--red)}.delta.flat{color:var(--dim2)}
.row3{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
.panel-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap}.panel-h .t{font-weight:600}
.muted{color:var(--dim);font-size:12px}
.legend{display:flex;gap:14px;font-size:12px;color:var(--dim);margin-top:8px;flex-wrap:wrap}.legend span{display:inline-flex;align-items:center;gap:6px}.dotc{width:9px;height:9px;border-radius:3px;display:inline-block;flex-shrink:0}
.tlbar{display:flex;align-items:center;gap:10px;margin:6px 0 8px;font-size:12px}.tlbar input[type=range]{flex:1;max-width:280px;accent-color:var(--blue)}
.tlscroll{overflow-x:auto;overflow-y:hidden;border:1px solid var(--border);border-radius:8px;-webkit-overflow-scrolling:touch;touch-action:pan-x}.tlscroll svg{display:block}
.tlmini{position:relative;height:44px;margin-top:8px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fafafa;touch-action:none;user-select:none}
.tlmini svg{position:absolute;inset:0;width:100%;height:100%}
.tlwindow{position:absolute;top:0;bottom:0;left:0;width:100%;background:#0070f31a;border:1px solid #0070f3aa;border-radius:6px;cursor:grab;box-sizing:border-box;min-width:16px}
.tlwindow .h{position:absolute;top:0;bottom:0;width:12px;cursor:ew-resize;touch-action:none}.tlwindow .h.l{left:-2px}.tlwindow .h.r{right:-2px}
.tlwindow .h::after{content:"";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:3px;height:18px;background:#0070f3;border-radius:2px}
/* ── 시청자별 채팅 활동: 흐르는 선(draw-on + 빛 흐름 + 끊김 펄스) ── */
.tlcanvas{position:relative;height:180px}.tlcanvas svg{display:block;position:absolute;inset:0;width:100%;height:100%}
.tlpulses{position:absolute;inset:0;pointer-events:none}
.tl-draw path{stroke-dasharray:100;stroke-dashoffset:100;animation:tlDraw 1.1s cubic-bezier(.4,0,.2,1) forwards}
.tl-draw path:nth-child(2){animation-delay:.12s}.tl-draw path:nth-child(3){animation-delay:.24s}.tl-draw path:nth-child(4){animation-delay:.36s}
@keyframes tlDraw{to{stroke-dashoffset:0}}
.tl-sheen{animation:tlSweep 3.6s linear 1.1s infinite}
@keyframes tlSweep{from{transform:translateX(0)}to{transform:translateX(var(--sweep,1000px))}}
.pnode{position:absolute}.pnode>*{position:absolute;left:0;top:0;border-radius:50%}
.pnode .ring{width:22px;height:22px;border:2px solid;transform:translate(-50%,-50%) scale(.25);opacity:.55;animation:tlPing 2.6s ease-out infinite}
@keyframes tlPing{0%{transform:translate(-50%,-50%) scale(.25);opacity:.55}70%{transform:translate(-50%,-50%) scale(1);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}
.pnode .core{width:6px;height:6px;transform:translate(-50%,-50%);animation:tlBeat 2.6s ease-in-out infinite}
@keyframes tlBeat{0%,100%{opacity:1}50%{opacity:.55}}
@media(prefers-reduced-motion:reduce){.tl-draw path{animation:none;stroke-dashoffset:0}.tl-sheen{animation:none;opacity:0}.pnode .ring{animation:none;opacity:0}.pnode .core{animation:none}}
.lst{display:flex;flex-direction:column;margin-top:6px}.li{display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #f2f2f2;font-size:13px}
.li:last-child{border-bottom:0}.li .rk{width:22px;color:var(--dim2);font-size:13px;flex-shrink:0}.li .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.li .ct{color:var(--dim);flex-shrink:0}
.rankbars .nm{white-space:normal}.bar{height:5px;border-radius:3px;margin-top:4px;background:linear-gradient(90deg,#e5484d,#a855f7)}
.tagbadge{font-size:10px;padding:1px 6px;border-radius:5px;background:#eef2ff;color:#4338ca}
.emos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.emo{display:flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:8px;padding:5px 9px;font-size:12px}.emo .ei{width:22px;height:22px;border-radius:4px;background:linear-gradient(135deg,#ffd1dc,#c9e4ff)}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:520px}th{text-align:left;color:var(--dim);font-weight:500;padding:7px 8px;border-bottom:1px solid var(--border);font-size:11.5px;white-space:nowrap}
td{padding:8px;border-bottom:1px solid #f4f4f4}td.tt{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}tr:hover td{background:#fafafa}
.grass{display:grid;grid-template-columns:repeat(24,1fr);gap:3px}.g{aspect-ratio:1;border-radius:2px;background:#eef0f2}.g1{background:#c6e6d0}.g2{background:#7fd39b}.g3{background:#34c56b}.g4{background:#16a34a}
.axis{display:flex;justify-content:space-between;color:var(--dim);font-size:10px;margin-top:6px}
.pie{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.donut{width:104px;height:104px;border-radius:50%;background:conic-gradient(#7c3aed 0 92%,#0070f3 92% 97%,#f5a623 97% 100%);flex-shrink:0}.donut i{display:block;width:60px;height:60px;border-radius:50%;background:var(--panel);margin:22px}
.leg{font-size:12.5px}.leg div{display:flex;align-items:center;gap:8px;margin:5px 0}.leg s{width:10px;height:10px;border-radius:2px;display:inline-block;flex-shrink:0}
.feedcard{position:relative}
.feed{height:260px;overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;gap:7px;font-size:12.5px;padding-right:6px;scrollbar-width:thin;scrollbar-color:#d9d9d9 transparent;scroll-behavior:smooth;overscroll-behavior:contain}
.feed::-webkit-scrollbar{width:7px}.feed::-webkit-scrollbar-thumb{background:#d9d9d9;border-radius:4px}.feed::-webkit-scrollbar-thumb:hover{background:#c2c2c2}.feed::-webkit-scrollbar-track{background:transparent}
.feed>div{flex:0 0 auto}.feed>div:first-child{margin-top:auto}.feed .n{font-weight:600}
.feed img.emoji{width:22px;height:22px;vertical-align:-5px;border-radius:3px;margin:0 1px;display:inline-block}
.newmsg{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);background:#16a34a;color:#fff;border:0;border-radius:20px;padding:6px 13px;font-size:11.5px;font-weight:600;cursor:pointer;box-shadow:0 3px 10px #16a34a55;opacity:0;pointer-events:none;transition:opacity .18s;z-index:5}
.newmsg.show{opacity:1;pointer-events:auto}
.newmsg.resume{top:44px;bottom:auto;background:var(--text);box-shadow:0 3px 10px #0003}
.feed>div{transition:background .3s}
.livedot{display:inline-flex;align-items:center;gap:6px;color:var(--red);font-weight:650;font-size:12px}.livedot i{width:8px;height:8px;border-radius:50%;background:var(--red);animation:bk 1.2s infinite}@keyframes bk{50%{opacity:.3}}
body.live .v-off{display:none}body:not(.live) .v-live{display:none}
.foot{color:var(--dim2);font-size:11.5px;margin-top:18px;border-top:1px solid var(--border);padding-top:12px}
/* ── 태블릿 (≤1024px): 사이드바 → 상단 가로 메뉴, 2열 카드 ── */
@media(max-width:1024px){
  .app{grid-template-columns:1fr}.side{display:none}.topnav{display:flex}
  .main{padding:16px 18px;max-width:100%}
  .cards{grid-template-columns:repeat(2,1fr)}
  .row3,.row2{grid-template-columns:1fr}
  #overview,#history,#viewers,#chat,#ranking{scroll-margin-top:60px}
}
/* ── 모바일 (≤600px): 여백 축소, 히트맵 12칸, 큰 숫자 축소 ── */
@media(max-width:600px){
  .main{padding:12px 12px}
  .cards{gap:10px}
  .card{padding:13px}
  .top{margin-bottom:14px}.top h1{font-size:17px}
  .tg button{padding:6px 11px}
  .grass{grid-template-columns:repeat(12,1fr)}
  .feed{height:180px}
}
/* ── 초소형 (≤380px): 카드 1열 ── */
@media(max-width:380px){.cards{grid-template-columns:1fr}}
</style></head><body class="${hasLive ? 'live' : ''}"><div class="app">
<aside class="side">
<div class="idcard"><div class="avatar"></div><div><div class="chname">SoundVoltex1</div><div class="chsub">사볼 · 이터널 리턴</div>
<div class="idbadges">${hasLive ? '<span class="lvpill"><i></i>방송 중</span>' : ''}<span class="folpill">팔로워 ${num(d.followers)}${d.followerDelta != null ? ` <b style="color:${d.followerDelta >= 0 ? 'var(--green)' : 'var(--red)'}">${d.followerDelta >= 0 ? '▲+' + d.followerDelta : '▼' + d.followerDelta}</b>` : ''}</span></div></div></div>
<nav class="navi">
<a class="navlink on" data-view="dashboard" onclick="return nav(this,'dashboard')">📊 대시보드</a>
<div class="navgroup">분석</div>
<a class="navlink" data-view="analysis" onclick="return nav(this,'analysis')">📈 분석</a>
<a class="navlink" data-view="history" onclick="return nav(this,'history')">🎬 방송 이력</a>
<a class="navlink" data-view="chat" onclick="return nav(this,'chat')">💭 채팅 분석</a>
<a class="navlink" data-view="ranking" onclick="return nav(this,'ranking')">🏆 랭킹</a>
<a class="navlink" data-view="vods" onclick="return nav(this,'vods')">▶️ 다시보기 성과</a>
<div class="navgroup">수익</div>
<a class="navlink disabled">🪙 구독·치즈·광고 <span class="navbadge soon">곧</span></a>
</nav>
<div class="sidestatus">🟢 수집기 정상 · 오라클<div class="mut">동기화 ${esc((d.updated || '').slice(11, 19))} UTC · 60초</div></div>
</aside>
<main class="main">
<nav class="topnav">
<a class="navlink on" data-view="dashboard" onclick="return nav(this,'dashboard')">대시보드</a>
<a class="navlink" data-view="analysis" onclick="return nav(this,'analysis')">분석</a>
<a class="navlink" data-view="history" onclick="return nav(this,'history')">방송 이력</a>
<a class="navlink" data-view="chat" onclick="return nav(this,'chat')">채팅 분석</a>
<a class="navlink" data-view="ranking" onclick="return nav(this,'ranking')">랭킹</a>
<a class="navlink" data-view="vods" onclick="return nav(this,'vods')">다시보기</a></nav>
<div class="top"><div><h1>SoundVoltex1 ${hasLive ? '<span class="livedot" style="margin-left:6px"><i></i>LIVE</span>' : ''}</h1><div class="sub">이터널 리턴 · ${hasLive ? '지금 방송 중 — 실시간 실데이터' : '실데이터(과거 방송 포함) · 방송 중엔 실시간'}</div></div>
${debug ? `<div class="tg"><button class="o ${hasLive ? '' : 'act'}" onclick="sw(0)">⚫ 방송 종료</button><button class="l ${hasLive ? 'act' : ''}" onclick="sw(1)">🔴 방송 중</button></div>` : ''}</div>
<div class="views">
<section class="view active" data-view="dashboard">
${renderOffline(d)}
${renderLive(d)}
</section>
<section class="view" data-view="analysis">${viewAnalysis(d)}</section>
<section class="view" data-view="history">${cardHistory(d)}</section>
<section class="view" data-view="chat">${viewChat(d)}</section>
<section class="view" data-view="ranking">${viewRanking(d)}</section>
<section class="view" data-view="vods">${viewVods(d)}</section>
<section class="view" data-view="revenue"><div class="card"><div class="panel-h"><span class="t">구독 · 치즈 · 광고</span><span class="muted">준비 중</span></div><div class="muted" style="padding:22px 0;text-align:center">수익 지표는 수집 항목 추가 후 제공됩니다 💰</div></div></section>
</div>
<div class="foot">OFFLINE=실데이터 · LIVE=${hasLive ? '실시간 실데이터(채팅 4초 갱신 · 시청자/순위 20초)' : '가상 예시(방송 켜지면 실제값)'} · 갱신 ${esc(d.updated)} (UTC)</div>
</main></div>
<div class="modal" id="ermodal" onclick="if(event.target===this)closeEr()"><div class="modal-box"><div class="modal-h"><span class="t">🏆 이터널 리턴 · 실시간 상위 50 방송</span><button onclick="closeEr()" aria-label="닫기">✕</button></div><div class="modal-body" id="er-list"><div class="muted" style="padding:24px;text-align:center">불러오는 중…</div></div></div></div>
<script>
function sw(l){document.body.classList.toggle('live',!!l);document.querySelectorAll('.tg button').forEach(b=>b.classList.remove('act'));document.querySelector(l?'.tg .l':'.tg .o').classList.add('act');if(l&&window.__TLinit)requestAnimationFrame(window.__TLinit)}
function closeEr(){var m=document.getElementById('ermodal');if(m)m.classList.remove('show')}
function openErRank(){var m=document.getElementById('ermodal'),L=document.getElementById('er-list');if(!m||!L)return;m.classList.add('show');L.innerHTML='<div class="muted" style="padding:24px;text-align:center">불러오는 중…</div>';
  function ee(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  fetch('/api/errank',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){var items=(j&&j.items)||[];if(!items.length){L.innerHTML='<div class="muted" style="padding:24px;text-align:center">목록을 불러오지 못했어요<br>(진행 중인 이터널 리턴 방송이 없거나 일시 오류)</div>';return;}
    L.innerHTML=items.map(function(it){return '<div class="er-row'+(it.isSabol?' sabol':'')+'"><span class="er-rank">'+it.rank+'</span><span class="er-ch">'+ee(it.ch)+(it.isSabol?' · 사볼 👑':'')+'<div class="er-title">'+ee(it.title)+'</div></span><span class="er-v">'+(it.viewers!=null?Number(it.viewers).toLocaleString()+'명':'-')+'</span></div>';}).join('');}).catch(function(){L.innerHTML='<div class="muted" style="padding:24px;text-align:center">불러오기 실패</div>';});}
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeEr()});
// 사이드바/상단 메뉴 = 뷰 전환(선택 섹션만 표시). 실시간 항목은 대시보드로 전환 후 해당 패널로 스크롤.
function nav(el,v,scrollId){
  if(el&&el.classList.contains('disabled'))return false;
  document.querySelectorAll('.view').forEach(function(s){s.classList.toggle('active',s.dataset.view===v)});
  document.querySelectorAll('.navlink').forEach(function(a){a.classList.remove('on')});
  if(el)el.classList.add('on');
  window.scrollTo({top:0});
  if(v==='dashboard'&&window.__TLinit)requestAnimationFrame(window.__TLinit);
  if(scrollId){var t=document.getElementById(scrollId);if(t)setTimeout(function(){t.scrollIntoView({behavior:'smooth',block:'start'})},70)}
  return false;
}
// 경과 시간 초 단위 카운트
(function(){var el=document.getElementById('elapsed');if(!el)return;var st=+el.dataset.start;function p(n){return String(n).padStart(2,'0')}function f(){var s=Math.max(0,Math.floor((Date.now()-st)/1000));el.textContent=Math.floor(s/3600)+':'+p(Math.floor(s%3600/60))+':'+p(s%60)}f();setInterval(f,1000)})();
// ── 시청자별 채팅 활동: 전체 방송 가로 스크롤 + 확대 바 + 미니맵 브러시 ──
(function(){
  var TL=window.__TL; if(!TL||!TL.series||!TL.series.length)return;
  var scroll=document.getElementById('tlscroll'),svg=document.getElementById('tlsvg'),mini=document.getElementById('tlmini'),msvg=document.getElementById('tlminisvg'),win=document.getElementById('tlwindow'),zoom=document.getElementById('tlzoom'),lbl=document.getElementById('tlrange'),canvas=document.getElementById('tlcanvas'),pulses=document.getElementById('tlpulses');
  if(!scroll||!svg||!mini||!win||!zoom||!canvas)return;
  var n=TL.series[0].vals.length||1, ZK=19, H=180, BASE_Y=158, TOP=14, QUIET=3, drawn=false;
  var HI={'#16a34a':'#22e06a','#f5a623':'#ffb400','#e5484d':'#ff5860','#3b82f6':'#5aa0ff'};
  var maxVal=1; TL.series.forEach(function(s){s.vals.forEach(function(v){if(v>maxVal)maxVal=v})});
  function p2(x){return String(x).padStart(2,'0')}
  function clock(ms){var d=new Date(ms+9*3600000);return p2(d.getUTCHours())+':'+p2(d.getUTCMinutes())}
  // 부드러운 곡선(Catmull-Rom→베지어)로 라인 정리 (삐죽삐죽한 삼각형 제거)
  function smooth(p){
    if(p.length<2) return p.length?('M'+p[0][0].toFixed(1)+','+p[0][1].toFixed(1)):'';
    var d='M'+p[0][0].toFixed(1)+','+p[0][1].toFixed(1);
    for(var i=0;i<p.length-1;i++){
      var p0=p[i>0?i-1:0],p1=p[i],p2=p[i+1],p3=p[i+2<p.length?i+2:i+1];
      var c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
      var c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
      d+=' C'+c1x.toFixed(1)+','+c1y.toFixed(1)+' '+c2x.toFixed(1)+','+c2y.toFixed(1)+' '+p2[0].toFixed(1)+','+p2[1].toFixed(1);
    }
    return d;
  }
  // 각 시청자 선 좌표 + 끊김(3분+ 무발화) 판정 — 끊긴 사람은 그 지점서 선을 멈추고 펄스
  function geom(vals,width){
    var last=-1; for(var i=0;i<vals.length;i++) if(vals[i]>0) last=i;
    var endIdx=vals.length-1, cut=false;
    if(last>=0 && (vals.length-1-last)>=QUIET){ endIdx=last; cut=true; }
    var pairs=[];
    for(var i=0;i<=endIdx;i++){ var x=(n<2?width/2:(i/(n-1))*width); var y=BASE_Y-(vals[i]/maxVal)*(BASE_Y-TOP); pairs.push([x,y]); }
    var pulse=cut?{x:(n<2?width/2:(endIdx/(n-1))*width), y:BASE_Y-(vals[endIdx]/maxVal)*(BASE_Y-TOP)}:null;
    return {pairs:pairs, pulse:pulse};
  }
  function seriesHTML(width){
    var base='',hi='',pn='';
    TL.series.forEach(function(s,i){
      var g=geom(s.vals,width), dpath=smooth(g.pairs);
      base+='<path fill="none" stroke="'+s.color+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" pathLength="100" d="'+dpath+'"/>';
      hi+='<path fill="none" stroke="'+(HI[s.color]||s.color)+'" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round" d="'+dpath+'"/>';
      if(g.pulse){var d=(1.4+i*0.12).toFixed(2)+'s';pn+='<div class="pnode" style="left:'+(g.pulse.x/width*100).toFixed(3)+'%;top:'+(g.pulse.y/H*100).toFixed(3)+'%"><div class="ring" style="border-color:'+s.color+';animation-delay:'+d+'"></div><div class="core" style="background:'+s.color+';animation-delay:'+d+'"></div></div>';}
    });
    return {base:base,hi:hi,pn:pn};
  }
  // 시간축 눈금(HH:MM) — 그래프 하단에 실제 시간 표기
  function ticksHTML(width){
    if(!TL.start) return '';
    var t='',step=Math.max(1,Math.round(n/8));
    for(var i=0;i<n;i+=step){
      var tx=(n<2?width/2:(i/(n-1))*width);
      var anchor=i===0?'start':(i+step>=n?'end':'middle');
      t+='<line x1="'+tx.toFixed(1)+'" y1="'+BASE_Y+'" x2="'+tx.toFixed(1)+'" y2="'+(BASE_Y+4)+'" stroke="#ddd"/>';
      t+='<text x="'+tx.toFixed(1)+'" y="'+(H-4)+'" font-size="9" fill="#999" text-anchor="'+anchor+'">'+clock(TL.start+i*TL.step)+'</text>';
    }
    return t;
  }
  function drawMain(width,animate){
    var S=seriesHTML(width);
    canvas.style.width=width+'px';
    svg.setAttribute('viewBox','0 0 '+width+' '+H);
    svg.innerHTML='<defs>'
      +'<linearGradient id="tlband" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>'
      +'<mask id="tlsheen" maskUnits="userSpaceOnUse" x="0" y="0" width="'+width+'" height="'+H+'"><rect class="tl-sheen" x="-320" y="0" width="320" height="'+H+'" fill="url(#tlband)" style="--sweep:'+(width+320)+'px"/></mask>'
      +'<filter id="tlglow" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'
      +'</defs>'
      +'<line x1="0" y1="'+BASE_Y+'" x2="'+width+'" y2="'+BASE_Y+'" stroke="#eee"/>'
      +'<g id="tlticks">'+ticksHTML(width)+'</g>'
      +'<g id="tlbase" class="tl-base'+(animate?' tl-draw':'')+'">'+S.base+'</g>'
      +'<g id="tlhi" mask="url(#tlsheen)" filter="url(#tlglow)">'+S.hi+'</g>';
    pulses.innerHTML=S.pn;
  }
  function updateSeries(width){
    var b=document.getElementById('tlbase'); if(!b){drawMain(width,false);return;}
    var S=seriesHTML(width);
    b.classList.remove('tl-draw'); b.innerHTML=S.base;
    var h=document.getElementById('tlhi'); if(h)h.innerHTML=S.hi;
    var tk=document.getElementById('tlticks'); if(tk)tk.innerHTML=ticksHTML(width);
    pulses.innerHTML=S.pn; canvas.style.width=width+'px';
  }
  function drawMini(){
    var w=mini.clientWidth||300,h=44,bb=h-8,tt=6,g='<line x1="0" y1="'+bb+'" x2="'+w+'" y2="'+bb+'" stroke="#eee"/>';
    TL.series.forEach(function(s){
      var last=-1; for(var i=0;i<s.vals.length;i++) if(s.vals[i]>0) last=i;
      var end=(last>=0 && (s.vals.length-1-last)>=QUIET)?last:s.vals.length-1;
      var pts=[];for(var i=0;i<=end;i++){var x=(n<2?w/2:(i/(n-1))*w);var y=bb-(s.vals[i]/maxVal)*(bb-tt);pts.push(x.toFixed(1)+','+y.toFixed(1));}
      g+='<polyline fill="none" stroke="'+s.color+'" stroke-width="1.2" points="'+pts.join(' ')+'"/>';
    });
    msvg.setAttribute('viewBox','0 0 '+w+' '+h);msvg.innerHTML=g;
  }
  var Vw=0,world=0,fit=0;
  function vw(){return scroll.clientWidth||scroll.getBoundingClientRect().width||0}
  function relayout(centerFrac){
    Vw=vw(); if(Vw<50)return false;
    fit=Vw; var z=(+zoom.value)/100; world=Math.max(Vw, fit*(1+z*ZK));
    drawMain(world,!drawn); drawn=true;
    if(centerFrac!=null)scroll.scrollLeft=centerFrac*world-Vw/2;
    updWin(); return true;
  }
  function updWin(){
    if(world<=0)return;
    var lf=scroll.scrollLeft/world, wf=Math.min(1,Vw/world);
    win.style.left=(lf*100)+'%'; win.style.width=(wf*100)+'%';
    if(TL.start){var s=TL.start+lf*n*TL.step,e=TL.start+(lf+wf)*n*TL.step;lbl.textContent=clock(s)+' ~ '+clock(Math.min(e,TL.start+n*TL.step))}
  }
  function frac(cx){var r=mini.getBoundingClientRect();return Math.min(1,Math.max(0,(cx-r.left)/r.width))}
  zoom.addEventListener('input',function(){relayout(world>0?((scroll.scrollLeft+Vw/2)/world):0.5)});
  scroll.addEventListener('scroll',updWin);
  var rz; window.addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(function(){var c=world>0?((scroll.scrollLeft+Vw/2)/world):0.5;drawMini();relayout(c)},120)});
  var drag=null;
  win.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();var m=e.target.classList.contains('h')?(e.target.classList.contains('l')?'L':'R'):'M';drag={m:m,left:parseFloat(win.style.left)/100||0,width:parseFloat(win.style.width)/100||1};try{win.setPointerCapture(e.pointerId)}catch(_){}});
  mini.addEventListener('pointerdown',function(e){if(e.target!==mini&&e.target!==msvg)return;var wf=Vw/world,nl=Math.min(1-wf,Math.max(0,frac(e.clientX)-wf/2));scroll.scrollLeft=nl*world;updWin()});
  window.addEventListener('pointermove',function(e){
    if(!drag)return; var f=frac(e.clientX), wf=Vw/world;
    if(drag.m==='M'){var nl=Math.min(1-wf,Math.max(0,f-wf/2));scroll.scrollLeft=nl*world;updWin();}
    else{
      var left=drag.left,right=drag.left+drag.width;
      if(drag.m==='L')left=Math.min(right-0.03,Math.max(0,f));else right=Math.max(left+0.03,Math.min(1,f));
      var nf=Math.max(0.03,right-left),nw=Vw/nf,mult=nw/fit;if(mult<1)mult=1;
      zoom.value=Math.min(100,Math.max(0,((mult-1)/ZK)*100));
      world=Math.max(Vw,nw);drawMain(world,false);scroll.scrollLeft=left*world;updWin();
    }
  });
  window.addEventListener('pointerup',function(){drag=null});
  function init(){if(vw()<50)return false;drawMini();return relayout(null)}
  window.__TLinit=init;
  // 폴링으로 새 데이터가 오면 확대/스크롤 위치는 유지한 채 선만 다시 그림
  window.__TLset=function(data){
    if(!data||!data.series||!data.series.length)return;
    TL=data; n=TL.series[0].vals.length||1;
    maxVal=1; TL.series.forEach(function(s){s.vals.forEach(function(v){if(v>maxVal)maxVal=v})});
    if(world<=0){init();return;}
    var sl=scroll.scrollLeft; updateSeries(world); drawMini(); scroll.scrollLeft=sl; updWin();
  };
  // 그래프의 x좌표 → 실제 시각(ms). 그래프 클릭 시 그 시각 채팅으로 이동.
  window.__TLtimeAt=function(clientX){ if(world<=0||!TL.start)return null; var r=canvas.getBoundingClientRect(); var frac=Math.min(1,Math.max(0,(clientX-r.left)/world)); return TL.start+frac*n*TL.step; };
  canvas.addEventListener('click',function(ev){ var t=window.__TLtimeAt(ev.clientX); if(t!=null&&window.__chatJump)window.__chatJump(t); });
  requestAnimationFrame(init);
})();
// ── 실시간 채팅 빠른 갱신: /api/live 를 4초마다 폴링해 채팅/랭킹/카운트만 갱신(페이지 리로드 없이) ──
(function(){
  var POLL=4000, lvNew=0;
  function e(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function T(id){return document.getElementById(id)}
  window.lvFeedBottom=function(){var f=T('lv-feed');if(f)f.scrollTop=f.scrollHeight;hideNew();};
  function bumpNew(a){lvNew+=a;var b=T('lv-newmsg'),n=T('lv-newn');if(b&&n){n.textContent=lvNew;b.classList.add('show');}}
  function hideNew(){lvNew=0;var b=T('lv-newmsg');if(b)b.classList.remove('show');}
  window.__LIVEID=(T('lv-feed')&&T('lv-feed').dataset.live)||window.__LIVEID||null;
  var loadingOlder=false;
  function chatFetch(qs){var lid=window.__LIVEID;if(!lid)return Promise.resolve(null);return fetch('/api/chat?liveId='+encodeURIComponent(lid)+qs,{cache:'no-store'}).then(function(r){return r.json()}).catch(function(){return null});}
  function loadOlder(){var f=T('lv-feed');if(!f||loadingOlder)return;var first=f.querySelector('[data-id]');if(!first||!first.dataset.id)return;loadingOlder=true;var oldH=f.scrollHeight;chatFetch('&before='+first.dataset.id).then(function(j){var items=(j&&j.items)||[];if(items.length){f.insertAdjacentHTML('afterbegin',items.map(function(x){return x.html}).join(''));f.scrollTop+=(f.scrollHeight-oldH);}loadingOlder=false;});}
  window.__chatJump=function(t){var f=T('lv-feed');if(!f)return;window.__feedHist=true;chatFetch('&around='+Math.round(t)).then(function(j){var items=(j&&j.items)||[];if(!items.length){window.__feedHist=false;return;}f.innerHTML=items.map(function(x){return x.html}).join('');var target=null,best=1e18;f.querySelectorAll('[data-mt]').forEach(function(el){var d=Math.abs((+el.dataset.mt)-t);if(d<best){best=d;target=el;}});if(target){target.scrollIntoView({block:'center'});target.style.background='#fff7cc';setTimeout(function(){target.style.background='';},1600);}var rb=T('lv-resume');if(rb)rb.classList.add('show');});};
  window.lvResume=function(){window.__feedHist=false;var rb=T('lv-resume');if(rb)rb.classList.remove('show');tick();};
  (function(){var f=T('lv-feed');if(f){f.scrollTop=f.scrollHeight;f.addEventListener('scroll',function(){if(f.scrollHeight-f.scrollTop-f.clientHeight<40)hideNew();if(f.scrollTop<60)loadOlder();});}})(); // 최초 맨 아래 + 바닥복귀 배지숨김 + 위로 스크롤 과거로딩
  function apply(L){
    if(!L)return;
    var v=T('lv-viewers');if(v&&L.viewers!=null)v.textContent=Number(L.viewers).toLocaleString();
    var r=T('lv-rank');if(r)r.textContent=L.rank!=null?L.rank:'50+';
    var rd=T('lv-rankd');if(rd)rd.textContent=(L.rankStart!=null&&L.rank!=null)?('▲ 시작 '+L.rankStart+'위'):'실시간';
    var c=T('lv-chat');if(c&&L.chatTotal!=null)c.textContent=Number(L.chatTotal).toLocaleString();
    var cp=T('lv-cpm');if(cp&&L.cpm!=null)cp.textContent='분당 '+L.cpm+'개';
    var f=T('lv-feed');
    if(f&&!window.__feedHist&&L.feed&&L.feed.length){
      var atB=f.scrollHeight-f.scrollTop-f.clientHeight<40, nc=0;
      if(window.__lvLast){var idx=L.feed.lastIndexOf(window.__lvLast);nc=idx>=0?(L.feed.length-1-idx):L.feed.length;}
      window.__lvLast=L.feed[L.feed.length-1];
      if(atB){f.innerHTML=L.feed.join('');f.scrollTop=f.scrollHeight;hideNew();}
      else{
        // 위로 읽는 중: 화면 첫 메시지(data-id) 기준으로 스크롤 위치 보존(80개 롤링에도 안 튀게)
        var anchor=null,aOff=0,kids=f.children;
        for(var i=0;i<kids.length;i++){var id=kids[i].getAttribute('data-id');if(id&&kids[i].offsetTop+kids[i].offsetHeight>f.scrollTop){anchor=id;aOff=kids[i].offsetTop-f.scrollTop;break;}}
        f.innerHTML=L.feed.join('');
        if(anchor){var el=f.querySelector('[data-id="'+anchor+'"]');if(el)f.scrollTop=el.offsetTop-aOff;}
        if(nc>0)bumpNew(nc);
      }
    }
    var lb=T('lv-rank5');if(lb&&L.leaderboard)lb.innerHTML=L.leaderboard.map(function(x,i){var md=['🥇','🥈','🥉'][i]||(i+1);return '<div class="li"><span class="rk">'+md+'</span><div class="nm">'+e(x.nm)+'<div class="bar" style="width:'+x.w+'%"></div></div><span class="ct" style="font-weight:700">'+x.c+'</span></div>'}).join('');
    var el=T('elapsed');if(el&&L.startMs)el.dataset.start=L.startMs;
    if(window.__TLset&&L.tlSeries)window.__TLset({start:L.tlStart,step:L.tlStep,series:L.tlSeries.map(function(s){return{nm:s.nm,color:s.color,vals:s.vals}})});
  }
  function tick(){fetch('/api/live',{cache:'no-store'}).then(function(r){return r.json()}).then(function(j){if(j&&j.isLive&&j.live)apply(j.live);}).catch(function(){});}
  setInterval(tick,POLL); tick();
})();
</script>
</body></html>`
}

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.status(500).send('<h3>환경변수 SUPABASE_URL / SUPABASE_SERVICE_KEY 를 Vercel에 설정하세요.</h3>')
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    const d = await loadData(supabase)
    const debug = /[?&]debug=1(?:&|$)/.test(req.url || '') || req.query?.debug === '1'
    res.setHeader('content-type', 'text/html; charset=utf-8')
    // 방송 중이면 캐시 짧게(빠른 갱신), 종료 상태면 길게
    res.setHeader('cache-control', d.live?.isLive ? 's-maxage=10, stale-while-revalidate=20' : 's-maxage=60, stale-while-revalidate=120')
    return res.status(200).send(renderHTML(d, debug))
  } catch (e) {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.status(500).send(`<h3>대시보드 오류</h3><pre>${esc(e.message)}</pre>`)
  }
}

// 미리보기/테스트 렌더용 export (Vercel 런타임엔 영향 없음 — default export가 핸들러)
export { renderHTML }
