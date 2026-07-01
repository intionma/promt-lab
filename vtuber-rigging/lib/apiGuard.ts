// API 남용/브루트포스 완화용 best-effort 레이트리밋 (IP 기준, 인메모리).
// 주의: 서버리스(Vercel)는 인스턴스가 여러 개·수시로 재시작되므로 완벽한 방어가 아님.
// 진짜 방어는 RLS + 강한 비밀번호. 이건 지속적 공격을 늦추는 방어심층(defense-in-depth).
const hits = new Map<string, number[]>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// windowMs 안에 max 회를 넘으면 429 Response 반환, 아니면 null.
export function rateLimit(req: Request, max = 30, windowMs = 60_000): Response | null {
  const ip = clientIp(req);
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  // 메모리 누수 방지: 가끔 오래된 키 정리
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  if (arr.length > max) {
    return Response.json({ error: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요." }, { status: 429 });
  }
  return null;
}
