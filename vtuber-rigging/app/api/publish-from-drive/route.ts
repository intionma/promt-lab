import { getAdminClient, MISSING_KEY_MSG } from "@/lib/supabaseAdmin";
import { checkAdminPassword } from "@/lib/auth";


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

async function listAll(sb: NonNullable<ReturnType<typeof getAdminClient>>, prefix: string): Promise<string[]> {
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
  if (!checkAdminPassword(password)) return Response.json({ error: "비밀번호가 틀렸어요" }, { status: 403 });
  if (!folder) return Response.json({ error: "폴더가 없어요" }, { status: 400 });

  try {
    const sb = getAdminClient();
    if (!sb) return Response.json({ error: MISSING_KEY_MSG }, { status: 500 });
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
    const failed: string[] = [];
    for (const full of files) {
      const rel = full.slice(prefixLen); // drive 에 이미 안전 이름으로 저장됨
      const dest = `${session.id}/${rel}`;
      if (full === model3Path) {
        const { error: upErr } = await sb.storage.from("models").upload(dest, model3Body, { upsert: true, contentType: "application/json" });
        if (upErr) failed.push(`${rel}: ${upErr.message}`);
      } else {
        const { error: cpErr } = await sb.storage.from("models").copy(full, dest);
        if (cpErr) {
          // 복사 실패 시 다운로드→업로드 폴백
          const { data: b, error: dErr } = await sb.storage.from("models").download(full);
          if (b) {
            const { error: u2 } = await sb.storage.from("models").upload(dest, b, { upsert: true });
            if (u2) failed.push(`${rel}: ${u2.message}`);
          } else {
            failed.push(`${rel}: ${dErr?.message || cpErr.message}`);
          }
        }
      }
    }

    // model3 또는 일부 파일 복사 실패 → 깨진 세션이므로 롤백 후 오류 반환
    const model3Rel = model3Path.slice(prefixLen);
    const model3Failed = failed.some((f) => f.startsWith(`${model3Rel}:`));
    if (model3Failed || failed.length) {
      // 깨진 세션 정리(베스트 에포트)
      try { await sb.storage.from("models").remove(files.map((f) => `${session.id}/${f.slice(prefixLen)}`)); } catch { /* noop */ }
      try { await sb.from("sessions").delete().eq("id", session.id); } catch { /* noop */ }
      return Response.json({ error: `파일 복사 실패(${failed.length}개): ${failed[0]}` }, { status: 500 });
    }

    return Response.json({ ok: true, id: session.id });
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "등록 실패";
    return Response.json({ error: msg }, { status: 500 });
  }
}
