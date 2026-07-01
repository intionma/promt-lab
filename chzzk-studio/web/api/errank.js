// ============================================================
// 이터널 리턴 카테고리 실시간 상위 50 방송 목록 (치지직 공개 API 직접 호출)
//   대시보드에서 "이터널리턴 순위" 클릭 시 모달로 표시 · 사볼 방송 강조.
// ============================================================
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const CHANNEL_ID = process.env.CHANNEL_ID || '508279ea46820b3104c9c9944bebf07e' // SoundVoltex1(공개 채널ID)
const CAT = process.env.ER_CATEGORY || 'Black_Survival_Eternal_Return'

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=60')
  try {
    const r = await fetch(`https://api.chzzk.naver.com/service/v1/categories/GAME/${CAT}/lives?sortType=POPULAR&size=50`, { headers: { 'User-Agent': UA } })
    const list = (await r.json())?.content?.liveInfoResponseList || []
    const items = list.map((L, i) => ({
      rank: i + 1,
      ch: L?.channel?.channelName ?? '',
      id: L?.channel?.channelId ?? '',
      title: L?.liveTitle ?? '',
      viewers: L?.concurrentUserCount ?? null,
      isSabol: L?.channel?.channelId === CHANNEL_ID,
    }))
    return res.status(200).json({ items, sabolRank: (items.find((x) => x.isSabol) || {}).rank ?? null })
  } catch (e) {
    return res.status(500).json({ error: e.message, items: [] })
  }
}
