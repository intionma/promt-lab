/* 프롬프트 랩 서비스워커
 *
 * ★ 목적은 딱 하나 — 안드로이드 '공유'로 넘어온 이미지를 받는 것.
 *   (Web Share Target으로 파일을 받으려면 POST를 가로채야 하고, 그건 서비스워커만 할 수 있다)
 *
 * ★★ 캐시는 절대 하지 않는다. 이 앱은 하루에도 몇 번씩 배포되는데,
 *     서비스워커가 페이지를 캐시하면 낡은 화면이 계속 떠서 "업데이트가 안 된다"가 된다.
 *     그래서 아래 fetch 핸들러는 '공유 POST' 외에는 respondWith를 아예 호출하지 않는다.
 *     = 나머지 요청은 서비스워커가 없는 것과 완전히 동일하게 네트워크로 나간다.
 */
const SHARE_CACHE = 'pl-share-v1';
const SHARE_KEY = './__shared_image__';

self.addEventListener('install', (e) => {
    self.skipWaiting();   // 새 버전이 나오면 즉시 교체(구버전이 남아 공유를 가로채지 않게)
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        // 예전에 혹시 만들어 둔 캐시가 있으면 정리 — 공유 전달용 하나만 남긴다
        try {
            const names = await caches.keys();
            await Promise.all(names.filter(n => n !== SHARE_CACHE).map(n => caches.delete(n)));
        } catch (err) {}
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    let url;
    try { url = new URL(e.request.url); } catch (err) { return; }
    const isShare = e.request.method === 'POST' && /\/share-target\/?$/.test(url.pathname);
    if (!isShare) return;   // ★ 그 외에는 손대지 않는다(캐시 없음, 개입 없음)

    e.respondWith((async () => {
        let ok = false;
        try {
            const fd = await e.request.formData();
            // manifest에 image·file 두 이름을 다 열어 뒀다. 그래도 못 찾으면 값 전체에서 이미지를 고른다.
            let f = fd.get('image') || fd.get('file');
            if (!(f && f.type && f.type.indexOf('image/') === 0)) {
                f = null;
                for (const v of fd.values()) {
                    if (v && typeof v === 'object' && v.type && v.type.indexOf('image/') === 0) { f = v; break; }
                }
            }
            if (f) {
                const c = await caches.open(SHARE_CACHE);
                await c.put(new Request(SHARE_KEY, { method: 'GET' }), new Response(f, {
                    headers: {
                        'Content-Type': f.type || 'image/png',
                        // 파일명은 한글이 섞일 수 있어 인코딩해서 싣는다(헤더에 원문은 못 넣음)
                        'X-Share-Name': encodeURIComponent(f.name || 'shared'),
                    }
                }));
                ok = true;
            }
        } catch (err) {}
        // 앱을 열면서 '공유로 들어왔다'고 알린다. 실패했으면 그냥 평소처럼 연다.
        const to = new URL(ok ? './index.html?shared=1' : './index.html', self.registration.scope);
        return Response.redirect(to.href, 303);
    })());
});
