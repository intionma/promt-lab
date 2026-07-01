// ============================================================
// 치지직 통계 대시보드 — Vercel 서버리스 함수
//   매 요청마다 Supabase(service 키)에서 읽어 HTML 렌더. RLS 유지·키 노출 없음.
//   OFFLINE(방송 종료): 실데이터(broadcast_analytics + 수집 데이터).
//   LIVE(방송 중): 가상(mock) 실시간 뷰 — 실시간 채팅/랭킹/시청자별 타임라인.
//   상단 토글로 전환. 모든 해상도 대응(반응형).
//   환경변수: SUPABASE_URL, SUPABASE_SERVICE_KEY
// ============================================================
import { createClient } from '@supabase/supabase-js'

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
      d.bcCount = bcs.length
      d.bcHours = Math.round(bcs.reduce((a, b) => a + (b.duration_min || 0), 0) / 60)
      const ccu = bcs.map((b) => b.avg_ccu).filter((v) => v != null)
      d.avgViewers = ccu.length ? Math.round(ccu.reduce((a, b) => a + b, 0) / ccu.length) : null
      d.peakViewers = Math.max(...bcs.map((b) => b.peak_ccu || 0))
      const ret = bcs.map((b) => b.retention_pct).filter((v) => v != null)
      d.avgRetention = ret.length ? (ret.reduce((a, b) => a + Number(b), 0) / ret.length).toFixed(2) : null
      d.cheese = bcs.reduce((a, b) => a + (b.cheese || 0), 0)
      d.donations = bcs.reduce((a, b) => a + (b.donation_cnt || 0), 0)
      // 최근 방송 테이블
      d.recentBc = bcs.slice(0, 8).map((b) => ({ date: md(b.started_at), title: b.title, plays: b.plays, avg: b.avg_ccu, peak: b.peak_ccu, ret: b.retention_pct, chat: b.chat_rate_pct }))
      // 시간대 히트맵 (0~23시, 방송 시작시각 기준)
      const hours = new Array(24).fill(0)
      for (const b of bcs) if (b.started_at) hours[khour(b.started_at)]++
      d.hourHeat = hours
      // 동접 추이(최근→과거 역순, 방송별 평균/최대)
      const chrono = [...bcs].reverse()
      d.bcAvgSeries = sample(chrono.map((b) => b.avg_ccu), 40)
      d.bcPeakSeries = sample(chrono.map((b) => b.peak_ccu), 40)
      // 하이라이트
      const peakBc = bcs.reduce((m, b) => ((b.peak_ccu || 0) > (m.peak_ccu || 0) ? b : m), bcs[0])
      d.peakBc = { title: peakBc.title, peak: peakBc.peak_ccu, date: md(peakBc.started_at) }
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
    d.vods = vods.slice(0, 5)
  } catch (e) { console.warn('vods:', e.message) }

  // ── 실시간 라이브 감지 + 실데이터 (chat_snapshots가 최근 3.5분 내면 방송 중)
  try {
    const { data: lastSnap } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,category_rank,chat_count,live_id,live_thumbnail_url').order('captured_at', { ascending: false }).limit(1).maybeSingle()
    const freshMs = lastSnap?.captured_at ? Date.now() - new Date(lastSnap.captured_at).getTime() : Infinity
    if (lastSnap && freshMs < 3.5 * 60 * 1000 && lastSnap.live_id != null) {
      const liveId = lastSnap.live_id
      const { data: sess } = await supabase.from('chat_snapshots').select('captured_at,concurrent_users,category_rank,chat_count').eq('live_id', liveId).order('captured_at', { ascending: true }).limit(1000)
      const rows = sess || []
      const start = rows.length ? new Date(rows[0].captured_at).getTime() : Date.now()
      const elapsedMs = Date.now() - start
      const L = {
        isLive: true,
        viewers: lastSnap.concurrent_users,
        rank: lastSnap.category_rank,
        rankStart: rows.find((r) => r.category_rank != null)?.category_rank ?? null,
        chatTotal: rows.reduce((a, r) => a + (r.chat_count || 0), 0),
        cpm: rows.length ? Math.round((rows.slice(-5).reduce((a, r) => a + (r.chat_count || 0), 0) / Math.min(5, rows.length)) * 10) / 10 : null,
        elapsed: fmtDur(elapsedMs),
        startMs: start,
        viewerSeries: sample(rows.map((r) => r.concurrent_users), 40),
        chatSeries: sample(rows.map((r) => r.chat_count), 40),
      }
      // 이번 방송 채팅 메시지 → 피드 / 리더보드 / 시청자별 타임라인
      const { data: lm } = await supabase.from('chat_messages').select('nickname,message,emojis,msg_type,msg_time,is_subscriber,is_follower,user_role').eq('live_id', liveId).order('id', { ascending: false }).limit(4000)
      const msgs = (lm || []).filter((m) => m.nickname)
      const isStreamer = (r) => r === 'streamer' || r === 'streaming_channel_owner'
      L.feed = msgs.filter((m) => m.msg_type === 'chat' && m.message).slice(0, 14).reverse().map((m) => ({
        nm: m.nickname, t: m.message, emojis: m.emojis,
        badge: isStreamer(m.user_role) ? '👑' : /manager/.test(m.user_role || '') ? '🛡' : '',
        cls: isStreamer(m.user_role) ? 'streamer' : m.is_subscriber ? 'sub' : m.is_follower ? 'fol' : '',
      }))
      const cnt = new Map()
      for (const m of msgs) cnt.set(m.nickname, (cnt.get(m.nickname) || 0) + 1)
      const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
      const mx = top[0]?.[1] || 1
      L.leaderboard = top.map(([nm, c]) => ({ nm, c, w: Math.round((c / mx) * 100) }))
      const colors = ['#16a34a', '#f5a623', '#e5484d', '#3b82f6']
      const top4 = top.slice(0, 4).map((t) => t[0])
      const B = 14, spanMs = Math.max(elapsedMs, 60000)
      const buckets = top4.map(() => new Array(B).fill(0))
      for (const m of msgs) {
        const ui = top4.indexOf(m.nickname); if (ui < 0) continue
        const t = m.msg_time ? new Date(m.msg_time).getTime() : null; if (t == null) continue
        let bi = Math.floor(((t - start) / spanMs) * B); if (bi < 0) bi = 0; if (bi >= B) bi = B - 1
        buckets[ui][bi]++
      }
      const gmax = Math.max(1, ...buckets.flat())
      L.timeline = top4.map((nm, i) => ({
        nm, color: colors[i], total: cnt.get(nm),
        pts: buckets[i].map((v, b) => `${(18 + b * (864 / (B - 1))).toFixed(0)},${(155 - (v / gmax) * 118).toFixed(0)}`).join(' '),
      }))
      d.live = L
    }
  } catch (e) { console.warn('live:', e.message) }

  return d
}

// 가상(mock) 실시간 데이터 — 방송 중일 때만 표시. 실제 방송이 켜지면 수집값으로 대체 예정.
const MOCK = {
  title: '엠마 미스릴 달리기 🔥', viewers: 41, rank: 3, rankStart: 9, chat: 512, cpm: 4.2, newFollowers: 8, elapsed: '2:14:37',
  timeline: [
    { nm: '전국제패엘프', color: '#16a34a', pts: '18,155 170,152 280,50 400,38 520,38 640,42 760,55 840,150 880,155', total: 128 },
    { nm: '깜퓨퓨', color: '#f5a623', pts: '18,156 130,148 230,100 340,80 450,95 560,130 680,152 880,156', total: 94 },
    { nm: '문돌이', color: '#e5484d', pts: '18,153 110,108 190,95 290,128 390,113 510,138 620,153 880,156', total: 71 },
    { nm: 'Silver', color: '#3b82f6', pts: '18,157 190,153 260,151 320,125 360,156 500,155 600,151 660,125 700,157 820,154 860,120 890,157', total: 63 },
  ],
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

function statCard(k, v, unit, delta, deltaClass) {
  return `<div class="card"><div class="k">${esc(k)}</div><div class="v">${v}${unit ? `<small> ${esc(unit)}</small>` : ''}</div>${delta ? `<div class="delta ${deltaClass}">${esc(delta)}</div>` : ''}</div>`
}

function renderOffline(d) {
  const chatters = (d.topChatters || []).map((u, i) => {
    const md = ['🥇', '🥈', '🥉'][i] || (i + 1)
    const badge = u.sub ? `<span class="tagbadge">구독 ${u.months ?? ''}개월</span>` : u.follower ? `<span class="tagbadge">팔로워</span>` : ''
    return `<div class="li"><span class="rk">${md}</span><span class="nm">${esc(u.nm)} ${badge}</span><span class="ct">${num(u.count)}</span></div>`
  }).join('') || '<div class="muted">아직 데이터 없음 (방송 시 채워짐)</div>'
  const emotes = (d.topEmotes || []).map((e) => {
    const img = e.url ? `<img src="${esc(e.url)}" width="22" height="22" style="border-radius:4px" loading="lazy"/>` : `<span class="ei"></span>`
    return `<div class="emo">${img} ×${num(e.count)}</div>`
  }).join('') || '<div class="muted">아직 데이터 없음</div>'
  const vods = (d.vods || []).map((v) => `<div class="li"><span class="nm">${esc(v.title)}</span><span class="ct">조회 ${num(v.read_count)}</span></div>`).join('') || '<div class="muted">-</div>'
  const bcRows = (d.recentBc || []).map((b) => `<tr><td>${esc(b.date)}</td><td class="tt">${esc(b.title)}</td><td class="num">${num(b.plays)}</td><td class="num">${num(b.avg)}</td><td class="num">${num(b.peak)}</td><td class="num">${b.ret != null ? b.ret + '%' : '-'}</td><td class="num">${b.chat != null ? b.chat + '%' : '-'}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">broadcast_analytics 테이블을 만들면 실제 방송 이력이 표시됩니다.</td></tr>'
  const heat = (d.hourHeat || []).length ? d.hourHeat.map((c, h) => {
    const mx = Math.max(...d.hourHeat, 1); const lv = c === 0 ? 0 : Math.ceil((c / mx) * 4)
    return `<div class="g g${lv}" title="${h}시 · ${c}회"></div>`
  }).join('') : ''

  return `<div class="v-off">
<div class="cards">
${statCard('평균 동시 시청자', num(d.avgViewers), '명', d.peakViewers != null ? `최고 ${num(d.peakViewers)}명` : '', 'flat')}
${statCard('누적 방송', num(d.bcCount), '회', d.bcHours != null ? `약 ${num(d.bcHours)}시간` : '', 'flat')}
${statCard('평균 지속률', d.avgRetention != null ? d.avgRetention : '-', '%', '공식 분석', 'flat')}
${statCard('이터널리턴 최고순위', d.bestRank != null ? num(d.bestRank) : '-', '위', '', 'flat')}
</div>
<div class="cards">
${statCard('팔로워', num(d.followers), '', d.followerDelta != null ? `${d.followerDelta >= 0 ? '▲ +' : '▼ '}${d.followerDelta} (7일)` : '', d.followerDelta >= 0 ? 'up' : 'down')}
${statCard('후원 치즈', num(d.cheese), '', d.donations != null ? `후원 ${num(d.donations)}건` : '', 'flat')}
${statCard('최고 동접 방송', d.peakBc ? num(d.peakBc.peak) + '명' : '-', '', d.peakBc ? `${esc(d.peakBc.date)} ${esc(d.peakBc.title).slice(0, 12)}` : '', 'flat')}
${statCard('수집 채팅', num(d.chatMsgTotal), '건', '실시간+다시보기', 'flat')}
</div>

<div class="row3">
<div class="card"><div class="panel-h"><span class="t">방송별 시청자 추이</span><span class="muted">평균 · 최대 (전 기간)</span></div>
${lineSVG([{ data: d.bcPeakSeries || [], color: '#c9d6ff' }, { data: d.bcAvgSeries || [], color: '#0070f3' }], { H: 190 })}
<div class="legend"><span><i class="dotc" style="background:#0070f3"></i> 평균 동접</span><span><i class="dotc" style="background:#c9d6ff"></i> 최대 동접</span></div></div>
<div class="card"><div class="panel-h"><span class="t">방송 시간대</span><span class="muted">주로 오전~낮</span></div>
${heat ? `<div class="grass">${heat}</div><div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23시</span></div>` : '<div class="muted">데이터 대기</div>'}
<div class="panel-h" style="margin-top:16px"><span class="t">플레이 카테고리</span></div>
<div class="pie"><div class="donut"><i></i></div><div class="leg"><div><s style="background:#7c3aed"></s>이터널 리턴 92%</div><div><s style="background:#0070f3"></s>토크 5%</div><div><s style="background:#f5a623"></s>기타 3%</div></div></div></div>
</div>

<div class="card"><div class="panel-h"><span class="t">방송 이력</span><span class="muted">최근 8회 · 공식 분석</span></div>
<div class="tablewrap"><table><thead><tr><th>날짜</th><th>제목</th><th class="num">재생</th><th class="num">평균</th><th class="num">최대</th><th class="num">지속률</th><th class="num">채팅%</th></tr></thead><tbody>${bcRows}</tbody></table></div></div>

<div class="card" style="margin-top:16px"><div class="panel-h"><span class="t">팔로워 성장</span></div>
${lineSVG([{ data: d.followerSeries || [], color: '#16a34a' }], { H: 130 })}</div>

<div class="row2" style="margin-top:16px">
<div class="card"><div class="panel-h"><span class="t">최다 채팅 시청자</span><span class="muted">전 기간(실시간+다시보기)</span></div><div class="lst">${chatters}</div></div>
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
  const timeline = (real ? live.timeline : MOCK.timeline) || []
  const feedArr = (real ? live.feed : MOCK.feed) || []
  const rankArr = real ? (live.leaderboard || []) : MOCK.rank5

  const tl = timeline.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2.4" points="${s.pts}"/>`).join('')
  const legend = timeline.map((s) => `<span><i class="dotc" style="background:${s.color};width:14px;height:3px;border-radius:2px"></i> ${esc(s.nm)} (${s.total})</span>`).join('')
  const feed = feedArr.length ? feedArr.map((f) => `<div><span class="n ${f.cls}">${f.badge ? f.badge + ' ' : ''}${esc(f.nm)}</span> ${renderMsg(f.t, f.emojis)}</div>`).join('') : '<div class="muted">채팅 수집 대기 중…</div>'
  const rankLb = rankArr.length ? rankArr.map((r, i) => `<div class="li"><span class="rk">${['🥇', '🥈', '🥉'][i] || (i + 1)}</span><div class="nm">${esc(r.nm)}<div class="bar" style="width:${r.w}%"></div></div><span class="ct" style="font-weight:700">${r.c}</span></div>`).join('') : '<div class="muted">-</div>'
  const rankDelta = rankStart != null && rank != null ? `▲ 시작 ${rankStart}위` : '실시간'
  // 경과 시간: 방송 시작 epoch를 심어두고 클라이언트가 매초 카운트(느낌만). mock은 가짜 시작점.
  const startMs = real ? live.startMs : Date.now() - (2 * 3600 + 14 * 60 + 37) * 1000
  const tlNote = real ? '↑ 방송 시작부터 지금까지 상위 4명의 분당 채팅량' : '↑ 예시: 시청자별 채팅 활동 추이 (실제 방송 데이터로 대체됨)'

  return `<div class="v-live">
<div class="cards">
<div class="card hi"><div class="k"><span class="livedot"><i></i>LIVE</span> 현재 시청자</div><div class="v">${num(viewers)}<small> 명</small></div><div class="delta up">${real ? '실시간' : '▲ 방금 +6'}</div></div>
${statCard('이터널리턴 순위', rank != null ? rank : '50+', '위', rankDelta, 'up')}
${statCard('이번 방송 채팅', num(chat), '', cpm != null ? `분당 ${cpm}개` : '', 'flat')}
<div class="card"><div class="k">경과 시간</div><div class="v" id="elapsed" data-start="${startMs}">${esc(elapsed)}</div><div class="delta flat">${real ? '실시간 카운트' : '가상'}</div></div>
</div>
<div class="card"><div class="panel-h"><span class="t">시청자별 채팅 활동</span><span class="muted">방송 시작 → 지금 · 상위 4명</span></div>
<svg viewBox="0 0 900 170" width="100%" height="170" preserveAspectRatio="none"><line x1="0" y1="158" x2="900" y2="158" stroke="#eee"/>${tl || `<text x="450" y="90" fill="#bbb" font-size="12" text-anchor="middle">채팅 수집 대기 중</text>`}</svg>
<div class="legend">${legend}</div>
<div class="muted" style="margin-top:6px">${tlNote}</div></div>
<div class="row2" style="margin-top:16px">
<div class="card"><div class="panel-h"><span class="t">실시간 채팅</span><span class="muted">● 흐르는 중</span></div><div class="feed">${feed}</div></div>
<div class="card"><div class="panel-h"><span class="t">채팅 랭킹 🏆</span><span class="muted">이번 방송</span></div><div class="lst rankbars">${rankLb}</div></div>
</div>
${real ? '' : '<div class="muted" style="margin-top:12px">※ 지금은 방송 감지 전이라 <b>가상(mock)</b> 예시입니다. 실제 방송이 켜지면(수집기 가동 중) 이 화면이 실시간 실데이터로 자동 전환됩니다.</div>'}
</div>`
}

function renderHTML(d) {
  const hasLive = !!d.live?.isLive // 실시간 감지: 방송 중이면 LIVE 뷰로 시작
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
${hasLive ? '<meta http-equiv="refresh" content="60">' : ''}<title>치지직 통계 — SoundVoltex1</title>
<style>
:root{--bg:#fafafa;--panel:#fff;--border:#ebebeb;--text:#171717;--dim:#666;--dim2:#8f8f8f;--green:#16a34a;--red:#e5484d;--blue:#0070f3;--amber:#f5a623;--purple:#7c3aed;--radius:12px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:14px;-webkit-font-smoothing:antialiased}
.app{display:grid;grid-template-columns:200px 1fr;min-height:100vh}
.side{border-right:1px solid var(--border);background:var(--panel);padding:16px 10px}
.brand{display:flex;align-items:center;gap:9px;padding:6px 8px 16px;font-weight:600}
.brand .dot{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#ec4899)}
.navi{display:flex;flex-direction:column;gap:2px}.navi a{padding:7px 10px;border-radius:7px;color:var(--dim);cursor:pointer;text-decoration:none}.navi a.on{background:#f2f2f2;color:var(--text);font-weight:500}
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
.feed{height:210px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:7px;font-size:12.5px}.feed .n{font-weight:600}.feed .sub{color:#c026d3}.feed .fol{color:#0284c7}.feed .streamer{color:#f5a623}
.feed img.emoji{width:22px;height:22px;vertical-align:-5px;border-radius:3px;margin:0 1px;display:inline-block}
.livedot{display:inline-flex;align-items:center;gap:6px;color:var(--red);font-weight:650;font-size:12px}.livedot i{width:8px;height:8px;border-radius:50%;background:var(--red);animation:bk 1.2s infinite}@keyframes bk{50%{opacity:.3}}
body.live .v-off{display:none}body:not(.live) .v-live{display:none}
.foot{color:var(--dim2);font-size:11.5px;margin-top:18px;border-top:1px solid var(--border);padding-top:12px}
@media(max-width:900px){.app{grid-template-columns:1fr}.side{display:none}.main{padding:18px 16px;max-width:100%}.cards{grid-template-columns:repeat(2,1fr)}.row3,.row2{grid-template-columns:1fr}}
@media(max-width:560px){.grass{grid-template-columns:repeat(12,1fr)}}
@media(max-width:420px){.main{padding:14px 12px}.cards{grid-template-columns:1fr 1fr;gap:10px}.card{padding:13px}.top h1{font-size:17px}.tg button{padding:6px 10px}}
</style></head><body class="${hasLive ? 'live' : ''}"><div class="app">
<aside class="side"><div class="brand"><span class="dot"></span> 치지직 통계</div>
<nav class="navi"><a class="on">개요</a><a>방송 이력</a><a>시청자·순위</a><a>채팅 분석</a><a>랭킹</a></nav></aside>
<main class="main">
<div class="top"><div><h1>SoundVoltex1 ${hasLive ? '<span class="livedot" style="margin-left:6px"><i></i>LIVE</span>' : ''}</h1><div class="sub">이터널 리턴 · ${hasLive ? '지금 방송 중 — 실시간 실데이터' : '실데이터(과거 방송 포함) · 방송 중엔 실시간'}</div></div>
<div class="tg"><button class="o ${hasLive ? '' : 'act'}" onclick="sw(0)">⚫ 방송 종료</button><button class="l ${hasLive ? 'act' : ''}" onclick="sw(1)">🔴 방송 중</button></div></div>
${renderOffline(d)}
${renderLive(d)}
<div class="foot">OFFLINE=실데이터 · LIVE=${hasLive ? '실시간 실데이터(60초 자동 새로고침)' : '가상 예시(방송 켜지면 실제값)'} · 갱신 ${esc(d.updated)} (UTC)</div>
</main></div>
<script>
function sw(l){document.body.classList.toggle('live',!!l);document.querySelectorAll('.tg button').forEach(b=>b.classList.remove('act'));document.querySelector(l?'.tg .l':'.tg .o').classList.add('act')}
(function(){var el=document.getElementById('elapsed');if(!el)return;var st=+el.dataset.start;function p(n){return String(n).padStart(2,'0')}function f(){var s=Math.max(0,Math.floor((Date.now()-st)/1000));el.textContent=Math.floor(s/3600)+':'+p(Math.floor(s%3600/60))+':'+p(s%60)}f();setInterval(f,1000)})();
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
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=120')
    return res.status(200).send(renderHTML(d))
  } catch (e) {
    res.setHeader('content-type', 'text/html; charset=utf-8')
    return res.status(500).send(`<h3>대시보드 오류</h3><pre>${esc(e.message)}</pre>`)
  }
}
