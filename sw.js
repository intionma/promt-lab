/* 프롬프트 랩 서비스워커
 *
 * 하는 일은 둘뿐이다.
 *  1) 안드로이드 '공유'로 넘어온 이미지 받기 (POST를 가로채야 해서 서비스워커만 할 수 있다)
 *  2) 앱 파일 캐시 — 새로고침·공유 진입 때 2MB짜리 index.html을 매번 새로 받지 않게
 *
 * ★★ 캐시 방식은 'stale-while-revalidate' 다. 예전에 캐시를 아예 안 했던 이유는
 *     "낡은 화면이 계속 떠서 업데이트가 안 된다"는 문제 때문인데, 그건 cache-first로만
 *     끝낼 때의 이야기다. 여기서는 캐시본을 즉시 내주면서 '동시에' 네트워크로 새 파일을
 *     받아 캐시를 갈아 끼운다. 내용이 달라졌으면 열려 있는 화면에 알려 준다
 *     → 사용자는 좌상단 브랜드 → [새로고침] 한 번으로 새 버전을 받는다.
 *     즉 '한 박자 늦게 최신'이 되고, 늦는다는 사실을 사용자가 안다.
 *
 * ★ 다른 출처(ComfyUI 서버 등)는 절대 건드리지 않는다. 같은 출처 GET만 캐시한다.
 */
const SHARE_CACHE = 'pl-share-v1';
const APP_CACHE = 'pl-app-v1';
//  ★ 공유 한 건마다 '자기 칸'을 쓴다 (v9.183.0).
//    예전엔 이 한 칸에 덮어써서, 빠르게 두 번 공유하면 먼저 뜬 문서가 나중 것을 읽고 지워
//    **한 장이 통째로 사라졌다**(사용자 신고: "짧은 시간에 여러 장 공유하면 씹힌다").
const SHARE_KEY = './__shared_image__';            // 옛 칸 — 예전 서비스워커가 남긴 것도 읽어 준다
const SHARE_PREFIX = './__shared_image__/';        // 새 칸들 — 뒤에 시각+무작위를 붙인다
function _shareSlot() {
    return SHARE_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
const KEEP = [SHARE_CACHE, APP_CACHE];

self.addEventListener('install', (e) => {
    self.skipWaiting();   // 새 버전이 나오면 즉시 교체(구버전이 남아 공유를 가로채지 않게)
    //  설치하는 김에 본체를 받아 둔다 — 안 그러면 '한 번 더 열어야' 캐시가 차서,
    //  설치 직후 첫 공유 진입이 여전히 2MB를 새로 받는다.
    e.waitUntil((async () => {
        try {
            const c = await caches.open(APP_CACHE);
            const u = new URL('./index.html', self.registration.scope).href;
            const r = await fetch(u, { cache: 'reload' });
            if (r && r.ok) await c.put(new Request(u), r.clone());
        } catch (err) {}
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        try {
            const names = await caches.keys();
            await Promise.all(names.filter(n => KEEP.indexOf(n) < 0).map(n => caches.delete(n)));
        } catch (err) {}
        await self.clients.claim();
    })());
});

self.addEventListener('message', (e) => {
    // 페이지가 '캐시 비우고 새로 받아'라고 하면(완전 초기화 등) 앱 캐시만 지운다
    if (e.data && e.data.type === 'pl-drop-cache') {
        e.waitUntil(caches.delete(APP_CACHE));
    }
});

// 캐시해도 되는 것: 같은 출처의 문서 + 앱이 쓰는 정적 파일. 그 외에는 손대지 않는다.
function _cacheable(req, url) {
    if (req.method !== 'GET') return false;
    if (url.origin !== self.location.origin) return false;       // ComfyUI 등 외부는 제외
    if (req.mode === 'navigate') return true;                    // 페이지 자체
    return /\.(html|json|png|svg|ico|webmanifest)$/i.test(url.pathname);
}

async function _notifyUpdate() {
    try {
        const cs = await self.clients.matchAll({ type: 'window' });
        cs.forEach(c => { try { c.postMessage({ type: 'pl-update' }); } catch (e) {} });
    } catch (e) {}
}

// 배경에서 새로 받아 캐시를 갈아 끼우고, 내용이 달라졌으면 화면에 알린다.
async function _revalidate(cache, req, oldRes) {
    try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (!fresh || !fresh.ok || fresh.type === 'opaque') return;
        const copy = fresh.clone();
        let changed = true;
        if (oldRes) {
            //  2MB 본문을 매번 문자열로 만들지 않도록 ETag·Last-Modified·길이를 먼저 본다
            const a = oldRes.headers, b = fresh.headers;
            const et = b.get('etag'), lm = b.get('last-modified'), cl = b.get('content-length');
            if (et && a.get('etag')) changed = et !== a.get('etag');
            else if (lm && a.get('last-modified')) changed = lm !== a.get('last-modified');
            else if (cl && a.get('content-length')) changed = cl !== a.get('content-length');
            else {
                const [x, y] = await Promise.all([oldRes.clone().text(), fresh.clone().text()]);
                changed = x !== y;
            }
        }
        await cache.put(req, copy);
        if (changed && oldRes) _notifyUpdate();
    } catch (e) { /* 오프라인 등 — 캐시본으로 계속 쓴다 */ }
}

self.addEventListener('fetch', (e) => {
    let url;
    try { url = new URL(e.request.url); } catch (err) { return; }

    // ── 1) 안드로이드 공유 받기 ────────────────────────────────
    //  ⚠⚠ 실패해도 **아무 말 없이 앱만 열면 안 된다** (v9.200.0 — 사용자 신고 "앱은 열리는데 이미지만 없음").
    //     예전엔 그래서 원인이 하나도 안 보였다. 지금은 왜 안 됐는지를 주소에 실어 보내고 앱이 말해 준다.
    if (e.request.method === 'POST' && /\/share-target\/?$/.test(url.pathname)) {
        e.respondWith((async () => {
            let ok = false, why = 'unknown', info = '';
            try {
                const fd = await e.request.formData();
                //  ★ 후보를 모은다 — manifest 에 적은 이름부터, 그다음 값 전체.
                const cand = [];
                ['image', 'file', 'files', 'photo', 'media', 'images'].forEach(k => {
                    try { const v = fd.get(k); if (v) cand.push(v); } catch (err) {}
                });
                try { for (const v of fd.values()) cand.push(v); } catch (err) {}

                const isBlob = (v) => !!(v && typeof v === 'object' && typeof v.size === 'number' && typeof v.arrayBuffer === 'function');
                const byMime = (v) => !!(v && v.type && String(v.type).indexOf('image/') === 0);
                const byName = (v) => /\.(png|jpe?g|jfif|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(String((v && v.name) || ''));

                //  ① MIME 이 image/* ② 확장자가 그림 ③ **그냥 알맹이 있는 파일**
                //  ⚠ ③ 이 꼭 필요하다 — 삼성 갤러리 등은 MIME 을 비우거나 application/octet-stream
                //    으로 보내는 일이 있다. 예전엔 ① 만 봐서 그런 공유가 통째로 버려졌고,
                //    앱은 아무 말 없이 그냥 열렸다(이 신고의 원인).
                let f = cand.find(v => isBlob(v) && v.size > 0 && byMime(v))
                     || cand.find(v => isBlob(v) && v.size > 0 && byName(v))
                     || cand.find(v => isBlob(v) && v.size > 0);

                if (!f) {
                    //  무엇이 오긴 왔는지 짧게 적어 보낸다 — 이게 없으면 다음에도 원인을 못 찾는다.
                    const parts = [];
                    try {
                        for (const [k, v] of fd.entries()) {
                            parts.push(isBlob(v) ? (k + ':blob/' + (v.type || '?') + '/' + v.size) : (k + ':text'));
                            if (parts.length >= 6) break;
                        }
                    } catch (err) {}
                    why = parts.length ? 'nofile' : 'empty';
                    info = parts.join(',').slice(0, 160);
                } else {
                    try {
                        const c = await caches.open(SHARE_CACHE);
                        await c.put(new Request(_shareSlot(), { method: 'GET' }), new Response(f, {
                            headers: {
                                //  ⚠ 타입이 없으면 image/png 로 적어 둔다 — 앱은 dataURL 로 읽으므로
                                //    실제 포맷은 브라우저가 알아서 본다(잘못 적어도 그림은 뜬다).
                                'Content-Type': (f.type && String(f.type).indexOf('image/') === 0) ? f.type : 'image/png',
                                // 파일명은 한글이 섞일 수 있어 인코딩해서 싣는다(헤더에 원문은 못 넣음)
                                'X-Share-Name': encodeURIComponent(f.name || 'shared'),
                            }
                        }));
                        ok = true;
                    } catch (err) {
                        why = 'store';   // 저장 공간 부족 등
                        info = String((err && (err.name || err.message)) || '').slice(0, 80);
                    }
                }
            } catch (err) {
                why = 'read';
                info = String((err && (err.name || err.message)) || '').slice(0, 80);
            }
            //  앱을 열면서 결과를 함께 알린다. 실패해도 **왜 실패했는지**를 싣는다.
            const q = ok ? '?shared=1'
                : ('?shared=0&why=' + encodeURIComponent(why) + (info ? '&info=' + encodeURIComponent(info) : ''));
            const to = new URL('./index.html' + q, self.registration.scope);
            return Response.redirect(to.href, 303);
        })());
        return;
    }

    // ── 2) 앱 파일: 캐시본을 즉시 주고 뒤에서 새로 받는다 ──────
    if (!_cacheable(e.request, url)) return;   // 그 외에는 서비스워커가 없는 것과 동일

    //  ★ 'no-store' = 캐시를 아예 건드리지 말라는 뜻. 'HTML 저장'이 최신 원문을 받으려고 이걸 쓴다.
    //    여기서 캐시본을 주면 낡은 버전이 저장되는 사고가 난다 → 손대지 않고 그냥 통과시킨다.
    if (e.request.cache === 'no-store') return;

    e.respondWith((async () => {
        const cache = await caches.open(APP_CACHE);
        //  문서 요청은 쿼리(?shared=1 등)가 붙어도 같은 파일이다 → 쿼리를 뗀 주소를 열쇠로 쓴다
        const key = e.request.mode === 'navigate' ? new Request(url.origin + url.pathname) : e.request;
        //  ★ '문서 이동'은 언제나 캐시본을 먼저 준다. 공유로 들어오는 진입은 POST 리다이렉트라
        //    브라우저가 reload 로 표시하는데, 그게 이 앱에서 제일 빨라야 하는 경로다(2.2MB를 다시 받으면 말짱 도루묵).
        //    손으로 누른 새로고침은 reloadApp() 이 미리 pl-drop-cache 를 보내 캐시를 비우므로
        //    여기서 따로 막지 않아도 최신본을 받는다.
        //  문서가 아닌 파일(json·png 등)만 reload/no-cache 를 존중한다. 받아온 새 파일은 캐시에 넣는다.
        const fresh = (e.request.mode !== 'navigate') && (e.request.cache === 'reload' || e.request.cache === 'no-cache');
        const hit = fresh ? null : await cache.match(key);
        if (hit) {
            e.waitUntil(_revalidate(cache, key, hit.clone()));
            return hit;
        }
        const res = await fetch(e.request);   // 캐시에 없으면 평소처럼 네트워크(실패도 평소처럼 실패)
        if (res && res.ok && res.type !== 'opaque') { try { await cache.put(key, res.clone()); } catch (err) {} }
        return res;
    })());
});
