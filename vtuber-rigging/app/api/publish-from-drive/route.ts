import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function safeSeg(s: string) { return s.replace(/[^A-Za-z0-9._-]+/g, "_"); }
function safePath(p: string) { return p.replace(/\\/g, "/").replace(/^\.\//, "").split("/").map(safeSeg).join("/"); }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rewriteFileReferences(refs: any) {
  if (!refs) return;
  if (refs.Moc) refs.Moc = safePath(refs.Moc);
  if (Array.isArray(refs.Textures)) refs.Textures = refs.Textures.map((t: string) => safePath(t));
  if (refs.Physics) refs.Physics = safePath(refs.Physics);
  if (refs.Pose) refs.Pose = safePath(refs.Pose);
  if (refs.DisplayInfo) refs.DisplayInfo = safePath(refs.DisplayInfo);
  if (refs.UserData) refs.UserData = safePath(refs.UserData);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (Array.isArray(refs.Expressions)) refs.Expressions.forEach((e: any) => { if (e?.File) e.File = safePath(e.File); });
  if (refs.Motions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const g of Object.values(refs.Motions) as any[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray(g)) g.forEach((m: any) => { if (m?.File) m.File = safePath(m.File); if (m?.Sound) m.Sound = safePath(m.Sound); });
    }
  }
}

async function listAll(sb: ReturnType<typeof adminClient>, prefix: string): Promise<string[]> {
  const { data } = await sb.storage.from("models").list(prefix, { limit: 1000 });
  if (!data) return [];
  let out: string[] = [];
  for (const item of data) {
    const full = `${prefix}/${item.name}`;
    if (item.id === null) out = out.concat(await listAll(sb, full));
    else out.push(full);
  }
  return out;
}

// 드라이브 폴더를 모델 갤러리(세션)로 발행
export async function POST(request: Request) {
  let body: { folder?: string; title?: string; password?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "잘못된 요청" }, { status: 400 }); }

  const { folder, title, password } = body;
  const expected = process.env.DELETE_PASSWORD || "12290505";
  if (!password || password !== expected) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  if (!folder) return Response.json({ error: "폴더가 없어요" }, { status: 400 });

  try {
    const sb = adminClient();
    const basePrefix = `drive/${folder}`;
    const files = await listAll(sb, basePrefix);
    if (files.length === 0) return Response.json({ error: "폴더에 파일이 없어요" }, { status: 400 });

    const model3Path = files.find((p) => p.toLowerCase().endsWith(".model3.json"));
    if (!model3Path) return Response.json({ error: "이 폴더엔 .model3.json 이 없어 모델로 등록할 수 없어요" }, { status: 400 });

    // model3 다운로드 → 참조 안전화
    const { data: blob, error: dlErr } = await sb.storage.from("models").download(model3Path);
    if (dlErr || !blob) throw dlErr || new Error("model3 다운로드 실패");
    const json = JSON.parse(await blob.text());
    rewriteFileReferences(json.FileReferences);
    const model3Body = new Blob([JSON.stringify(json)], { type: "application/json" });

    const m3name = (model3Path.split("/").pop() || "model").replace(/\.model3\.json$/i, "");

    // 세션 생성
    const { data: session, error: sErr } = await sb
      .from("sessions")
      .insert({ title: title?.trim() || m3name, model_name: m3name })
      .select()
      .single();
    if (sErr) throw sErr;

    const prefixLen = `${basePrefix}/`.length;
    for (const full of files) {
      const rel = full.slice(prefixLen); // drive 에 이미 안전 이름으로 저장됨
      const dest = `${session.id}/${rel}`;
      if (full === model3Path) {
        await sb.storage.from("models").upload(dest, model3Body, { upsert: true, contentType: "application/json" });
      } else {
        const { error: cpErr } = await sb.storage.from("models").copy(full, dest);
        if (cpErr) {
          // 복사 실패 시 다운로드→업로드 폴백
          const { data: b } = await sb.storage.from("models").download(full);
          if (b) await sb.storage.from("models").upload(dest, b, { upsert: true });
        }
      }
    }

    return Response.json({ ok: true, id: session.id });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "등록 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
