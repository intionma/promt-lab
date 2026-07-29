# Anima 표정 프리셋 백업 — 대개편 직전 (v9.87.0)

> 2026-07-29. 표정 대개편(v9.88.0) 이전 상태. **마음에 안 들면 이 문서로 되돌린다.**
> 되돌릴 땐 아래 '원본 코드' 절의 15줄을 `ANIMA_DEFAULT_SNIPPETS`의 expr 자리에 그대로 넣으면 된다.

## 목록 (15종)

| # | 이름 | 프롬프트 | 19+ | 더보기 |
|---:|---|---|:---:|:---:|
| 1 | 유혹 | `seductive smile, half-closed eyes, looking at viewer` | 🔞 |  |
| 2 | 절정 | `(orgasm:1.1), ecstasy, rolling eyes` | 🔞 |  |
| 3 | 아헤가오 | `(ahegao:1.2), rolling eyes, tongue out, drooling` | 🔞 |  |
| 4 | 미소 | `smile, happy` |  |  |
| 5 | 무표정 | `expressionless, closed mouth` |  | ✓ |
| 6 | 수줍음 | `shy, blush, embarrassed` |  | ✓ |
| 7 | 홍조 | `blush` | 🔞 | ✓ |
| 8 | 혀 내밀기 | `tongue out, saliva` | 🔞 | ✓ |
| 9 | 능글(도발) | `smug, grin` |  | ✓ |
| 10 | 화남 | `angry, frown` |  | ✓ |
| 11 | 놀람 | `surprised, open mouth` |  | ✓ |
| 12 | 하트눈 | `heart-shaped pupils` | 🔞 | ✓ |
| 13 | 삐침 | `pout` |  | ✓ |
| 14 | 윙크 | `one eye closed, smile` |  | ✓ |
| 15 | 우는 | `crying, tears` |  | ✓ |

## 원본 코드 (그대로 붙여넣으면 복구)

```js
            { id: 'expr_seductive', name: '유혹', kind: 'append', on: false, group: 'expr', nsfw: true, text: 'seductive smile, half-closed eyes, looking at viewer' },
            { id: 'expr_orgasm', name: '절정', kind: 'append', on: false, group: 'expr', nsfw: true, text: '(orgasm:1.1), ecstasy, rolling eyes' },
            { id: 'expr_ahegao', name: '아헤가오', kind: 'append', on: false, group: 'expr', nsfw: true, text: '(ahegao:1.2), rolling eyes, tongue out, drooling' },
            { id: 'expr_smile', name: '미소', kind: 'append', on: false, group: 'expr', text: 'smile, happy' },
            { id: 'expr_neutral', name: '무표정', kind: 'append', on: false, group: 'expr', more: true, text: 'expressionless, closed mouth' },
            { id: 'expr_shy', name: '수줍음', kind: 'append', on: false, group: 'expr', more: true, text: 'shy, blush, embarrassed' },
            { id: 'expr_blush', name: '홍조', kind: 'append', on: false, group: 'expr', nsfw: true, more: true, text: 'blush' },
            { id: 'expr_tongue', name: '혀 내밀기', kind: 'append', on: false, group: 'expr', nsfw: true, more: true, text: 'tongue out, saliva' },
            { id: 'expr_smug', name: '능글(도발)', kind: 'append', on: false, group: 'expr', more: true, text: 'smug, grin' },
            { id: 'expr_angry', name: '화남', kind: 'append', on: false, group: 'expr', more: true, text: 'angry, frown' },
            { id: 'expr_surprised', name: '놀람', kind: 'append', on: false, group: 'expr', more: true, text: 'surprised, open mouth' },
            { id: 'expr_heart', name: '하트눈', kind: 'append', on: false, group: 'expr', nsfw: true, more: true, text: 'heart-shaped pupils' },
            { id: 'expr_pout', name: '삐침', kind: 'append', on: false, group: 'expr', more: true, text: 'pout' },
            { id: 'expr_wink', name: '윙크', kind: 'append', on: false, group: 'expr', more: true, text: 'one eye closed, smile' },
            { id: 'expr_cry', name: '우는', kind: 'append', on: false, group: 'expr', more: true, text: 'crying, tears' },
```

## 참고 — 사용자가 자주 쓰던 순서

아헤가오 > 절정 > 무표정 > 유혹 > 혀 내밀기 > 능글 > 놀람 > 하트눈 > 우는  
(안 쓰던 것: 미소·수줍음·홍조·화남·삐침·윙크)

---

## v9.88.0 → v9.89.0 롤백용 (경멸·얀데레)

v9.89.0에서 이 두 개를 갈아엎었다. 되돌리려면 아래로 교체하고 `expr_yandere_calm` 줄을 지운다.

```js
{ id: 'expr_contempt', name: '차가운 경멸', kind: 'append', on: false, group: 'expr', more: true, text: 'narrowed eyes, looking down, scowl' },
{ id: 'expr_yandere', name: '얀데레', kind: 'append', on: false, group: 'expr', more: true, text: 'yandere, shaded face' },
```

**단, 되돌리길 권하지 않는다** — 위 두 줄은 의도한 얼굴이 안 나오는 게 실측으로 확인됐다:

| 문제 | 근거 |
|---|---|
| `looking down` = '깔봄'이 아니라 '바닥을 봄' | 시선 방향 태그(136,020) |
| `narrowed eyes` + `scowl` | 동시 등장 **41건** — 서로 안 밀어줌 |
| `contempt`·`condescending`·`looking down at viewer`·`forehead shadow` | **전부 0건**(없는 태그) |
| `yandere` | 표정이 아니라 **캐릭터 성격** 태그(9,339) |
| `yandere` + `crazy smile` | 364 — `yandere` 빼면 2,526으로 **7배** |
