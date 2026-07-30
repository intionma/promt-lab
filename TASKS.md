# 프롬프트 랩 — 작업 태스크 파일

> 세션마다 여기에 진행/대기 항목을 기입한다. (요청·버그·아이디어를 절대 잊지 않기 위한 기록)
> 현재 최신 버전은 `CLAUDE.md` 참고. 개발 브랜치: `claude/prompt-lab-repo-setup-jdx0xs`

## 🔴 진행/대기 (Open)

### 😀 [Anima] 표정 — v9.89.0까지 개편 완료, 추가 여지 있음
- **완료(v9.88.0)**: 15종 → **19종**. 백업은 `EXPR_BACKUP_2026-07-29.md` (마음에 안 들면 그 문서로 롤백).
  - 홍조 제거 / 절정 강화(`ecstasy` 유령 제거 + `rolling eyes`를 아헤가오에 넘김)
  - 신규 5종: 참는 표정 · 가쁜 숨 · 메스가키 · 얀데레 · 차가운 경멸
  - 절정↔아헤가오 **공유 태그 0개**로 분리됨
- **완료(v9.89.0)**: 19종 → **20종**. 경멸·얀데레가 **의도한 얼굴이 아니었던 것**을 교정.
  - 경멸: `narrowed eyes, looking down, scowl` → `jitome, half-closed eyes, shaded face, looking at viewer`
    - `looking down`은 '깔봄'이 아니라 **'바닥을 봄'**(시선 방향)이라 의미가 어긋나 있었음
    - `narrowed eyes`+`scowl` 동시 등장 **41건** — 서로 안 밀어주는 조합이었음
    - `contempt`·`condescending`·`looking down at viewer`·`forehead shadow` = **전부 0건 유령**
    - 실제 태그는 **`jitome`(ジト目, 48,825)** ★
  - 얀데레: `yandere, shaded face` → **광기/정적 2종**으로 분리
    - `yandere`(9,339)는 **표정이 아니라 캐릭터 성격 태그** — 얼굴을 못 지시했음
    - 얼굴을 만드는 건 `crazy eyes`(8,570)+`crazy smile`(5,552), 동시 **2,526**
    - `yandere`를 붙이면 조합이 **약해짐**(yandere+crazy smile = 364)
    - 광기 `crazy eyes, crazy smile, shaded face, looking at viewer` / 정적 `empty eyes, smile, shaded face`(1,726)
- **완료(v9.90.0)**: 메스가키 교정 — `mesugaki, smug, naughty face` → `mesugaki, smug, fang, looking at viewer`
  - danbooru 위키가 mesugaki 전형으로 **`a single fang / skin fang`** 을 직접 명시
  - mesugaki와 가장 많이 붙는 얼굴 요소가 `fang`(1,499 / **36.3%**), `smug`+`fang`은 전체 4,094
  - `naughty face`는 mesugaki와 **256건(6.2%)** 뿐이고, 위키 정의가 *"이거 네 취향인 거 알아"* 쪽
    **유혹 얼굴**(형제 태그 `seductive smile`) → **'유혹' 프리셋과 겹쳐서** 제거
    (`naughty face`+`seductive smile` = 1,510 / mesugaki+smug+naughty face 3개 동시 = **56**)
  - `fang`은 외형이 변하지만 **의도된 것** → J5 참조
- **완료(v9.91.0)**: `naughty face`(35,396)를 메스가키에서 **'유혹'으로 이설**.
  위키가 `seductive smile`의 형제로 걸어둔 태그라 유혹이 제자리.
  `seductive smile, naughty face, half-closed eyes, looking at viewer`
  (페어 전부 탄탄: seductive smile 1,510 / half-closed eyes 3,685 / looking at viewer 20,053)
  v9.88.0에서 `rolling eyes`를 절정→아헤가오로 넘긴 것과 같은 정리.
- **아직 안 넣은 후보** (목표 20~25종이므로 0~5개 더 여지 있음):
  - 귀여움: 덧니 `fang`(443,677) · 고양이 입 `:3`(178,066) · 별눈 `star-shaped pupils`(32,381)
  - 일반: 눈 감음 `closed eyes`(1,031,840) · 살짝 벌린 입 `parted lips`(725,225)
  - 성인: 침 자국 `saliva trail`(27,529) · 신음 `moaning`(17,363)
  - ~~넋 나감 `empty eyes`~~ → v9.89.0 **얀데레(정적)**에 흡수됨
- **완료(v9.92.0)**: 순서 재배치 + 죽은 `more` 플래그 제거
  - 순서: 아헤가오 · 절정 · 유혹 · 메스가키 · 경멸 · 얀데레(광기) · 얀데레(정적) · 참는 표정 · 가쁜 숨
    · 혀 내밀기 · 능글 · 하트눈 · 놀람 · 무표정 · 우는 · 미소 · 수줍음 · 화남 · 윙크 · 삐침
  - 기준: 앞 = 자주 쓰거나 공들인 것(낙차 큰 것) / 뒤 = 잘 안 쓰거나 변화 작은 것
  - ★ **배열 순서가 바꾸는 것 = 스윕 순서 + 더보기 패널 순서.** 하단 바는 `exprRecent`(최근 쓴 것)라 무관.
  - ★ **defaults만 바꾸면 기존 사용자에겐 아무 일도 안 일어난다** — 저장분은 예전 순서 그대로다.
    마이그레이션에서 실제로 다시 정렬해야 한다(커스텀 표정은 뒤로, 상대순서 유지).
  - `more: true` 23개(표정 20 + 포즈 3 등) 전부 제거 — **읽는 코드가 없는 死코드**였다.
    하단 바가 `exprRecent` 방식으로 바뀌면서 남은 잔재. 영속화 2곳에서도 뺐다.
- ★ 표정은 **batch로 돌리므로** 추가 1개 = 스윕 1장. 비슷해 보이는 건 넣으면 손해.
  (겹칠 위험으로 뺐던 것: 몽롱한 눈 — 유혹·절정에 이미 `half-closed eyes` 있음 /
   침 흘림 — 아헤가오에 `drooling` 있음 / 녹은 얼굴 — 절정에 `torogao`로 흡수됨)
- 0건이라 제외: `bedroom eyes` `trance` `pleasure` `biting lip` `contempt` `condescending`
  `arrogant` `smug face` `half-lidded eyes` `cat smile` `open mouth smile` `orgasm face` `gasping`

### 🧪 [Anima] 포즈 타율 — 1차 판정 완료 (v9.100.0), 재테스트 대기
- **진단 결과(사용자 실행, `게다리+더블피스`)**: 6장 **전부 똑같이** 무너짐(색 날아감·다리 두 벌·원본 소실).
  → ①kv_gating 우위 없음 ②강도 하향도 효과 없음. **참조 다이얼로는 포즈를 못 살린다.**
- **진단 자체는 유효했음(검증 완료)**: `_animaBuildWorkflow(pos, imageName, seed, snap)`이
  71번 `CosmosReferenceConditioning`에 `reference_weight`/`gating`을 실제로 다르게 싣는 것을
  6개 조합 전부 확인(`vpose.js`/`vdiag2.js`). 스냅샷·시드 고정도 정상.
  - 유일한 무효화 경로는 `customWf`(붙여넣은 JSON) — 그 경우 참조 설정이 통째로 무시된다.
    다만 사용자의 **스텝 테스트(8/12/16/24)가 눈에 띄게 달랐으므로** customWf는 비어 있음이 증명됨.
- **진단 축은 제거함(v9.100.0)** — `[진단]` 주석 7곳 + 블록 + `.ax-refmode` CSS + 죽은 `axis.apply` 분기까지.
- **1차 원인 후보 → 수정함(v9.100.0)**: `pose_mlegs_vsign` 문구에 **몸 방향 태그가 없었다.**
  - 기존: `(m legs, spread legs:1.3), double v, looking at viewer`
  - `m legs`는 **누운 자세 전제** 태그인데 방향이 없어 `looking at viewer`(정면 상반신)와 충돌 → 다리 두 벌.
  - **같은 포즈의 이미지 변환 프리셋은 원래부터 `lying, on back`을 갖고 있었다**(코드 내 불일치).
  - 수정: `(m legs, spread legs:1.3), lying, on back, double v, looking at viewer`
- **문구 수정은 실패 → 되돌림(v9.101.0)**. 재테스트에서 **다리가 4개**로 나왔다:
  선 자세 다리 2개가 그대로 남고 M자 다리가 옆에 덧그려짐. `lying, on back`은 통째로 무시됐다.
  → **자세를 바꾸는 게 아니라 더한다.** Cosmos Reference가 원본 배치를 조건에 박아 넣기 때문.
  표정·후타·가슴이 잘 먹는 이유도 같다(겉모습만 바꿔서 배치와 안 싸움).
- **B 완료(v9.101.0)**: 배치를 바꿔야 성립하는 포즈 6종(`_ANIMA_REPOSE_IDS`)에 주황 점 + 고르면 한 줄 안내.
  판정은 **id 기준**(`_animaIsRepose`) — 저장된 스니펫엔 플래그가 없어 데이터만 믿으면 샌다.
- **A 완료(v9.102.0) — 사용자 PC 검증 대기**:
  - 준비물 점검 `_animaCnDetect()` — `/object_info`로 전처리기(DW>Openpose)와 union LoRA를 직접 확인.
    연결 실패와 노드 없음을 구분해서 안내. 없으면 '무엇이/어디에'만 보여주고 토글을 잠근다.
  - 배선은 **공식 워크플로우 JSON에서 링크를 직접 추적해 확인함**(axiomgraph/ComfyUIWorkflow,
    `Qwen Image Union Diffsynth Lora OpenPose.json`):
    `LoraLoaderModelOnly(union)` → 모델 체인 / `LoadImage→DWPreprocessor→ImageScaleToTotalPixels→
    VAEEncode→ReferenceLatent(pos·neg)` → 조건. **ControlNetLoader/ApplyAdvanced를 안 쓴다.**
  - Cosmos 조건화(71) **뒤에** ReferenceLatent를 체인 — 캐릭터와 골격이 둘 다 조건에 들어가게.
  - `latent_image`는 원본(76) 유지. denoise=1이면 이 latent는 '출력 크기 틀'일 뿐이라 비율을 원본에 맞춘다.
  - ★ **참조 강도 자동 하향**(`cnRefWeight`, 기본 0.5). 이걸 빼면 모델을 받아도 증상이 그대로다.
    경계는 그림마다 다르므로 **[포즈 강도 전부 돌리기]** 축(0.8~0.2, 5장)으로 실측.
- **★ A는 폐기(v9.103.0에서 차단) — 아키텍처 불일치. 다시 시도하기 전에 반드시 읽을 것:**
  - **Anima의 백본은 NVIDIA Cosmos Predict 2.5다. Qwen-Image가 아니다.**
    근거는 워크플로우 자체 — `ApplyCosmosReferenceModelPatch` / `CosmosReferenceConditioning`을 쓰고,
    예전 기본값 `lora2Name`이 `Cosmos-Predict2.5-2B-base-distilled-LoRA.safetensors`였다.
    `qwen_image_vae`·`qwen_3_06b_base`는 **VAE와 텍스트 인코더일 뿐** 디퓨전 백본이 아니다.
    → TASKS.md에 "Qwen-Image용 ControlNet 존재"라고 적혀 있던 것을 그대로 믿고 진행한 게 실수였다.
      **다음에 모델 관련 작업을 할 땐 백본부터 확인한다.**
  - `qwen_image_union_diffsynth_lora`는 Qwen-Image DiT용이라 레이어가 대응되지 않는다.
    `ReferenceLatent`도 Qwen/Flux 계열 조건화 노드다.
  - **실측 증상(사용자 검증)**: 포즈 그림을 넣으니 **결과 배경이 새까매지고 인물이 세로로 뭉개짐**.
    골격 그림(검은 배경)이 '구조 안내'가 아니라 **두 번째 참조 이미지**로 들어간 것. 배선은 맞았고 메커니즘이 틀렸다.
  - 차단 방식: `_ANIMA_CN_SUPPORTED = false` 한 곳. 탐지·배선·골격 그리기 코드는 남겨 뒀다
    (Cosmos용 포즈 제어 수단이 생기면 이 플래그만 열면 된다).
  - **전송 워크플로우가 v9.101.0과 완전히 동일함을 테스트로 증명**(`vcnoff.js` 23종).
    노드 구성·참조 강도(1)·gating·KSampler 연결 전부 기준선과 일치.
- **내장 포즈 골격 그리기 코드는 만들어 뒀다**(`_ANIMA_POSE_SKEL` 6종 + `_animaDrawSkel`).
  사용자가 원한 건 '포즈 그림 업로드'가 아니라 **고른 칩이 그대로 먹히는 것**이었고, 그 답은
  앱이 골격을 직접 그리는 것이다(전처리기 의존도 사라진다). 메커니즘만 맞으면 바로 쓸 수 있다.
- **조사 완료(2026-07-30) — Anima 전용 ControlNet은 있다. 단 포즈용은 아직 없다.**
  - Anima가 Cosmos 기반이라는 건 3자 확인됨: ComfyUI-Cosmos-Reference 저장소가
    *"Cosmos 모델 또는 그에 기반한 모델(예: **Anima**)에 이미지 참조 기능 추가"* 라고 명시.
    Civitai 모델 카드에도 "Anima is built on NVIDIA Cosmos".
  - **있는 것**: `[Anima] Canny control LoRA (ControlNet-like)` (civitai 2443202) · Kohya의 `Anima-LLLite`
  - **없는 것**: openpose / depth. 커뮤니티도 "칸니 나왔다, depth랑 openpose도 나왔으면" 하는 단계.
  - **우회 가능성(미검증)**: Canny에 원하는 자세의 **선화**를 넣어 구조를 잡는 방법.
    다만 스틱맨 같은 건 엣지 분포가 학습 데이터와 달라 잘 될지 불확실. 시도해 볼 가치는 있는 정도.
  - **판단**: 지금 매달릴 일은 아니다. openpose용이 나오면 그때가 진짜 타이밍이고,
    그때 쓸 배선은 이미 있다(`_ANIMA_CN_SUPPORTED` 플래그만 열면 됨).
    다만 그 배선은 **Qwen용 union LoRA 기준**이므로, Anima용이 나오면 노드 구성을 다시 확인해야 한다.
- **ControlNet 조사 완료**: Qwen-Image용 존재. openpose는 **Union DiffSynth LoRA** 방식
  (`qwen_image_union_diffsynth_lora.safetensors` → `ComfyUI/models/loras/`, `LoraLoaderModelOnly`).
  전처리기는 **이미지 변환 테마에 이미 구현돼 작동 중**(`OpenposePreprocessor` +
  `ControlNetLoader` + `ControlNetApplyAdvanced`, 단 모델이 `OpenPoseXL2`= SDXL용이라 Anima엔 못 씀).
  앱이 `_comfyNodeEnum()`으로 `/object_info`를 조회하므로 **설치 여부는 앱이 자동 확인 가능**.
  포즈 지정은 스켈레톤 내장보다 **포즈 참조 이미지 업로드**(기존 업로드 기능 재사용) 방식을 추천.

### ✅ [Anima] 전송·수신이 느린 원인 — 썸네일 캐시로 해결 (v9.105.0)
- **해결**: 받은 썸네일을 IndexedDB(`pl_anima`/`thumbs`, DB v2)에 저장하고 blob 주소로 그린다.
  테스트(`vtcache.js` 12종): 새로고침 후 **서버 요청 0건**, 전부 blob에서 렌더, 그림 40/40 정상.
  CORS로 캐시를 못 채우는 환경에서도 예전처럼 네트워크로 뜬다(정상 저하).
- **레이아웃 안 건드림**: `src`는 캐시든 네트워크든 '항상 즉시' 정한다. 늦게 채우면 칸 높이가 0이 되어
  '튀는' 문제가 되살아나므로 그 방식은 쓰지 않았다.
- 첫 화면 몫(`_ANIMA_GAL_PAGE`+1)은 렌더 '전에' 미리 풀어 둔다 — 안 하면 첫 렌더가 전부 캐시 미스가 된다.
- 생성 중에는 캐시 채우기를 쉰다. 삭제·전체 비우기 시 같이 정리. 4000장 상한 초과 시 오래된 것부터 제거.

### (아래는 해결 전 측정 기록 — 근거 보존)
- **측정 결과(실측)**: 갤러리 300장에서 아래로 한 번 훑으면 `/view` 요청이 **200건 동시에** 터진다.
  그 사이에 낀 요청이 각각 썸네일과 겹친 정도 — 업로드 100건, 전송 99건, 수신 1건.
  브라우저는 호스트당 연결이 6개뿐이라 전송·수신이 썸네일 뒤에 줄을 선다.
- 썸네일 주소엔 `preview=webp;62`가 붙어 **ComfyUI가 매번 서버에서 다시 굽는다**
  — 그림을 만드는 그 PC의 CPU다. 폰 원격(Tailscale)이면 회선까지 같이 먹는다.
- **시도한 수정 ①** 전송·수신 fetch에 `priority:'high'`, 썸네일에 `fetchpriority="low"`.
  → 넣어 뒀지만 **효과는 증명 못 함**(측정 하네스가 Playwright 라우팅이라 소켓 한도를 우회해
  우선순위 효과가 안 잡힌다). 의미상 맞는 표기라 남겨 두되, 이걸로 해결됐다고 보면 안 된다.
- **시도한 수정 ② 동시 로드 4건 제한 — 효과는 확실했으나 되돌림**
  - 측정: 겹침 100건→1건, 동시 요청 101건→3건, 생성 왕복 265ms→171ms.
  - **되돌린 이유**: `src`를 늦게 넣으려면 로딩 전 칸 높이가 0이 된다. 이미지가 하나씩 뜨며
    목록이 자라 **예전에 고쳤던 '클릭할 때 튀는' 문제가 되살아난다.** 사용자가 특히 싫어하던 증상.
  - **제대로 하려면**: 결과 레코드에 이미지 가로·세로를 저장해 칸 높이를 미리 잡아 둔 뒤 붙인다.
    (`_animaAddResult`에 w/h 추가 → `.anima-gitem`에 `aspect-ratio` → 그 다음 동시 로드 제한)
- **더 근본적인 선택지**: 받은 썸네일을 IndexedDB에 캐시해 **두 번 다시 안 받게** 한다.
  295장을 매번 다시 굽는 비용이 통째로 사라진다. 위 높이 문제와 독립적으로 할 수 있다.

### 🐌 [Anima] 로딩 느림 — 정보 대기
- 크게 보기는 v9.71.0에서 해결(캐시 미스 + 원본 3장 동시 로드가 원인).
- "전반적으로 느리다"가 앱 전체인지 미확인. **갤러리에 몇 장 쌓였는지** 알아야 진행 가능
  (수천 장이면 부팅 시 IndexedDB 전량 읽기 비용이 원인일 수 있음).

---

### 🐛 [Anima] 표정 순서가 안 바뀌던 버그 — v9.93.0에서 해결
- **원인**: `_animaRestore()` 안에 **옛 `EXPR_ORDER` 하드코딩 정렬**이 남아 있었고,
  그게 v9.92.0 마이그레이션보다 **뒤에서 실행돼 매번 되돌리고** 있었다.
  (9개짜리 옛 순서 `유혹·절정·무표정·아헤가오·혀내밀기·홍조·미소·윙크·우는` — 화면에 나온 순서와 정확히 일치)
- **★ 교훈**: "저장분을 한 번 정렬해 둔다"는 방식은 취약하다.
  ① 뒤에서 누가 덮어쓰면 못 막고 ② `try{}catch{}` 안이라 앞줄이 터지면 통째로 건너뛴다.
- **해결**: 저장분 순서를 **아예 안 본다.** `_animaSortByDefault()` / `_animaGroupList()` 로
  **그릴 때마다** 기본값 순서로 정렬한다. 마이그레이션 자체가 필요 없어졌고, 다음에 순서를
  또 바꿔도 배열만 고치면 끝난다. 표정·포즈·가슴 **읽는 곳 14군데 전부** 이걸 통과한다.

### ✅ [Anima] v9.97.0 — 연속 생성 문구 강조 (완료)
- 칸마다 반복되던 `전부 돌리기`를 한 톤 낮추고 **축 이름 전부**(노출·후타 크기·표정·포즈·가슴·품질·참조 설정)를 밝게.
- 블러가 아니라 **색만** 낮춘다. 다크 `#fff 68%` / 라이트 `--text-main 62%`.
- 대비 실측: 축 이름 15~16:1, 흐린 쪽도 **다크 7.8~8.0 / 라이트 4.7~4.9** → 전부 4.5:1 이상(읽힘).
- 마크업은 `<b>축 이름</b><i>전부 돌리기</i>`. `.anima-sweep-row.cfg`(⚙ 설정)는 b/i가 없어 영향 없음.

### 🔎 [Anima] v9.96.0 — 코드 검토에서 잡은 누락 3건
- **후타 상세 칩(`data-fd`)·후타 팝오버 ✕·가슴포즈 팝오버 ✕** 가 v9.95.0에서 빠져 있었다.
  셋 다 아직 `_animaRenderSnippets()`를 부르고 있어 눌림 모션이 끊겼다 → 인플레이스로 교체.
  `_animaSyncChipStates`에 `[data-fd]` 처리도 추가.
- **★ 회귀 위험이었던 것**: 하단 바 후타 아이콘을 인플레이스로 바꾸면서, ② 패널의
  **후타 상세 줄(발기·포피·사정)이 생겼다 사라지는 동작이 깨질 뻔했다.**
  → `_animaRenderSnippetsInner`를 `_animaRenderPanelOnly()` + `_animaRenderMactOnly()`로 쪼개고,
  후타 토글 시 **② 패널만 다시 그리고 하단 바는 제자리 갱신**하도록 했다(누른 아이콘이 살아남음).
- **대비 보정**: 연속 생성 '몇 장' 배지가 라이트 2.4~4.0 / 다크(표정·가슴) 3.9~4.2로 4.5:1 미달이었다.
  다크는 `transparent` 대신 `--bg-base`와 직접 섞고(38%), 라이트는 글자를 더 어둡게(32%) → 전부 8.4:1 이상.
- ⚠️ **테스트 함정 2건 (또 속았다)**:
  ① `data-theme`은 `<html>`이 아니라 **`<body>`**에 붙는다.
  ② 반투명 배경(`color-mix(... transparent)`)의 대비는 **항상 검정 위에 합성하면 안 된다.**
     칸 배경 → 페이지 배경 순으로 실제 합성해야 맞는 값이 나온다(잘못 재서 두 번 헛짚었다).

### 🎨 [Anima] v9.95.0 — 눌림 모션이 '끝까지' 재생되게 (근본 원인)
- **★ v9.94.0으로도 여전히 반쪽이었다.** 눌리는 0.07초는 나오지만 **돌아오는 0.24초가 통째로 잘렸다.**
  손을 떼는 순간 `_animaRenderSnippets()`가 `innerHTML`을 다시 만들어 **누른 요소가 사라지기** 때문.
  쑥 들어갔다 딱 끊기니 "빠르고 안 보인다"로 느껴진다.
- **★ 사용자가 '노출 아이콘만 느낌이 좋다'고 한 이유가 이것.** 노출 아이콘만 `_animaSyncChipStates()`로
  다시 그리지 않고 상태만 갱신하고 있었다. **모양·크기가 똑같은 후타 아이콘과도 다르게 느껴진** 것도
  같은 이유(후타는 다시 그림). 축소량은 셋 다 `0.955`로 동일했다 — **거리 문제가 아니었다.**
- **해결**: `_animaToggleSnip()` 하나로 모으고, **보이는 목록이 그대로면 다시 그리지 않는다.**
  - `_animaSyncChipStates()` — 칩/아이콘 `.on` (팝오버 칩 `[data-gd]`도 추가)
  - `_animaSyncGrpBtns()` — 하단 바 가슴·포즈 버튼의 값·✕를 제자리에서 갈아 끼움
  - `_animaSyncPops()` — 팝오버(후타 상세/가슴·포즈)만 떼었다 붙임 → 누른 아이콘이 살아남음
  - `_animaRenderPromptFold()` — ② 프롬프트 접힘 요약줄
  - **다시 그리는 경우는 하나뿐**: 최근 목록이 바뀔 때(바에 없던 걸 골라 칩 구성이 달라질 때)
- **덤**: 하단 바 좌우 스크롤 위치가 안 튄다(`_animaSyncChipStates`가 원래 그래서 만들어진 함수).
- 검증(실제 앱, 헤드리스): 표정칩·노출·후타·가슴포즈상자·팝오버칩 **5종 전부 클릭 후 생존 + 복귀 모션 재생**,
  기능 회귀 12건 통과(토글·배타·저장·✕해제·펼침선택·팝오버).
- ⚠️ 테스트 함정: 저장 키는 `pl_anima`가 아니라 **`anima_settings_v1`**.
  잘못된 키로 부정 조건을 검사하면 **가짜 통과**가 난다(실제로 한 번 속았다).

### 🎨 [Anima] v9.94.0 — 눌림 반응이 '실제로' 보이게 + 꼬리표 ✕ + 칸 색
- **★ v9.93.0의 눌림 모션은 전혀 안 보이고 있었다.** 원인 두 가지:
  ① 칩을 누르면 핸들러가 곧바로 `innerHTML`을 다시 그려 **누른 요소가 사라진다** → `:active`가 나올 틈이 없음
  ② `-webkit-tap-highlight-color:transparent`로 **브라우저 기본 탭 반응까지 껐다** → 예전보다 더 안 느껴짐
- **해결**: `pointerdown`(캡처 단계)에서 `.pl-press`를 직접 붙인다(`_animaBindPress`).
  캡처로 듣는 이유 — 중간에 `stopPropagation` 하는 핸들러가 여럿이라 버블로는 일부 칩이 반응 안 함.
  `pointerleave`/`blur`는 **쓰면 안 된다** — 캡처 단계에선 자식에서도 잡혀 손가락이 조금만 움직여도 풀린다.
- **대상**: 하단 바 + ② 프롬프트 캡슐 + 연속 생성 칸 + 시드 선택 + 팝오버 ✕ (Anima에서 누르는 것 전부)
- **✕ 꼬리표(F안)**: 18×18 → **32×29**. 별도 프레임이 아니라 상자 오른쪽 끝에 높이 꽉 채워 이어붙음.
  - `.anima-gbtn{overflow:hidden}` 으로 모서리 라운드를 부모가 잘라 준다
  - 눌림은 **✕ 글자만** `scale(.72)` — 꼬리표를 줄이면 상자 모서리에서 떨어져 보인다
  - **색은 안 바꾼다** — 예전에 원색 100%로 튀게 했다가 "끔찍하다"는 피드백을 받았다
  - ★ `.anima-gbtn`은 `:active` 폴백을 **쓰면 안 된다** — ✕가 상자 안에 있어 조상까지 `:active`가 걸려
    ✕를 눌러도 상자가 같이 눌린다. `.pl-press`만 쓴다(closest가 ✕를 먼저 잡아 자동으로 갈린다).
- **연속 생성 칸 색**: 배경 `--ax-c` **20%**(B안). 14%는 얌전하고 28%는 밝은 색에서 흰 글자 대비가 깎인다.
  라이트 테마는 13% + 어두운 글자로 따로 처리.
- **후타 축 표식**: SVG가 작게 줄면 안 읽혀서 이모지 🍆로. 노출은 SVG가 잘 읽혀 그대로.

### 🎨 [Anima] v9.93.0에서 같이 한 것
- **가슴·포즈 ✕**: 고른 게 있으면 버튼 오른쪽 끝에 ✕. 팝오버 안 열고 바로 해제.
  - ✕는 `position:absolute`, 상자는 `.on`일 때 `padding-right:28px` → **글자가 ✕를 침범 불가**
    (헤드리스로 측정: 아주 긴 이름에도 글자 오른쪽 끝과 ✕ 사이 **6px** 유지)
  - `<button>` 중첩 불가라 ✕는 `<span>`, 클릭은 `e.target.closest('.anima-gbtn-x')`로 갈라 받음
- **연속 생성 축 표식**: 아이콘/이모지 + 축별 색. 하단 바에서 쓰던 **같은 SVG·같은 색** 재사용.
  노출 `nude` / 후타 `f-s` SVG(대표 1개만), 나머지는 이모지 😀🧍🍒✨🎛️
- **공통 눌림 모션**: 누를 때 70ms로 빠르게 들어가고, 240ms `cubic-bezier(.22,1,.36,1)`로
  천천히 돌아온다(같은 속도로 오가면 딱딱하게 읽힌다). `prefers-reduced-motion` 대응 포함.

## 🔬 검증 대기 — **작업 아님. 생성 몇 장으로 판정만 하면 되는 것**
> 위 '진행/대기'와 달리 **코드를 짜기 전에 사실부터 확인해야 하는** 항목들.
> 전부 사용자가 그림을 뽑아야 알 수 있고, 판정 결과에 따라 할 일이 정해지거나 사라진다.

### V1. ★ 가중치 문법이 이 모델에서 작동하는가 (가장 중요)
- 이 워크플로우의 텍스트 인코더는 **`qwen_3_06b_base`(LLM)**. `(태그:1.3)` 같은 가중치 문법은
  원래 CLIP 시절 것이라, **이 조합에서 실제로 먹히는지 확인된 적이 없다.**
- `CLIPLoader`의 `clipType`이 `'stable_diffusion'`이라 SD식 가중치 경로를 탈 가능성이 높지만 **추정이다.**
- **안 먹히는 것으로 판명되면 파일 안의 가중치 20개가 전부 무의미**해지고, 지금까지의 가중치 논의도
  전부 헛것이 된다. 그만큼 파급이 크다.
- **판정법**: 같은 시드로 `(huge penis:1.4)` 한 장, `(huge penis:0.5)` 한 장. 차이가 없으면 가중치는 무효.

### V2. 노출 프리셋의 `:2`가 적정한가
- 파일에서 제일 센 값(`(nude, completely nude, uncensored, :2)`). **원래 있던 값이라 손대지 않았다.**
- 통상 1.5를 넘기면 그 부분만 뭉개지는 부작용이 알려져 있으나, 사용자가 계속 써왔고 결과가 나쁘지 않았다.
- **판정법**: ✏️ 편집에서 `:2` → `:1.5`로 바꿔 같은 시드로 한 장. 차이 없으면 그대로, 1.5가 깨끗하면 교체.
- (V1이 '무효'로 나오면 이 항목은 자동 소멸)

### V3. 앞뒤 순서(front-loading)가 효과가 있는가
- v9.82.0에서 **부위별 뭉치기만** 하고 앞뒤 위치는 일부러 안 건드렸다. "앞에 둘수록 세다"는 통설은
  CLIP 77토큰 시절 것이라 LLM 인코더에 그대로 적용된다는 근거가 없어서.
- **판정법**: ✏️ 편집으로 같은 태그를 프롬프트 맨 앞/맨 뒤에 두고 같은 시드로 두 장.
- 차이가 없으면 **순서 논의는 여기서 종결**한다(없는 효과를 쫓지 않기 위해).

---

## 🧭 판단 기록 — **다시 논의하지 않기 위해**
> 검토했고 "이렇게 하기로" 결론이 난 것들. 같은 논의를 반복하지 않으려고 남긴다.

### J1. 모순 검사 9건 — 손대지 않기로 함
조합 모순 검사에서 걸렸지만 **고치지 않기로 판정**한 것들. 다시 검사를 돌리면 또 나올 테니 이유를 남긴다.
| 조합 | 왜 안 고치나 |
|---|---|
| 반발기·무발기 + 사정 (4건) | 사정 직후 흐물해진 상태를 원할 수 있다. 막으면 그 표현이 불가능해짐 |
| 귀두 가림 + 사정 (2건) | 껍질 사이로 새어나오는 그림은 실재함 |
| 유혹 + 엉덩이 내밀기 | **가짜 양성.** `from behind`는 카메라 각도지 얼굴 방향이 아니다. `looking back`과 함께 흔히 쓰임 |
| 무표정 + 딥키스 | 진짜 모순(`closed mouth` vs `french kiss`)이지만, **눌러보면 바로 이상한 걸 아는** 조합이라 코드로 막을 필요 없음 |

**자동 제거의 기준**: `veiny penis`·`erection`·`breasts out`처럼 **사용자가 고르지 않았는데 프리셋에 딸려와
다른 선택을 방해하는 것**만 뺀다. 위 9건은 **사용자가 두 버튼을 각각 눌러 만든 조합**이라 존중한다.

### J2. `veiny penis` 완전 제거는 열려 있는 선택지
- 이 태그는 **세 번 연속 충돌**했다(포피 v9.75 → 반발기·무발기 v9.76 → 과잉 제거 되돌림 v9.77).
- 현재는 **무발기일 때만** 자동 제거. 포피·반발기에서는 질감 유지를 위해 남긴다(v9.77에서 확정).
- **대안**: 거근·초거근 프리셋에서 아예 빼기. 크기는 `huge penis`가 담당하고 `veiny`는 부가 묘사일 뿐.
  충돌 조건을 하나씩 찾아 추가하는 지금 방식보다 근본적이다.
- **대가**: 아무 옵션도 안 골랐을 때의 '핏줄 선 우락부락한' 질감이 약해진다 → 사용자가 그 질감을 원해서 보류 중.
- 대체 태그 `veins`(62,393)는 동시출현 프로필이 `veiny penis`(40,234)와 거의 같아(둘 다 `erection`·
  `large penis`와 붙음) **갈아끼워도 '발기했다'는 연상이 그대로**라 기각됨.

### J3. 갸웃(`head tilt` 171,069)은 표정이 아니라 자세
- 표정 후보로 조사됐으나 얼굴 표정이 아니라 고개 각도 → **넣는다면 포즈 그룹**이 맞다.

### J4. Anima 밖 전수검사는 하지 않는다 (사용자 결정)
- `data/` 폴더 태그 5,202개 · 이미지 변환 테마 점검을 제안했으나 **"토큰 낭비"로 거절됨.**
- Anima가 현재 주력 테마라 거기에 집중한다. **다시 제안하지 말 것.**

---


- [x] **[연속 붙여넣기 배치 생성]** — ✅완료(v9.47.0). autoGenerate ON+변환 테마에서 이미지 연달아 넣으면
  `useImage`가 `_i2iEnqueueBatch`로 큐잉 → `_i2iBatchRun` 워커가 하나씩 [prep→setImg→analyze→
  updateMasterOutput→`await comfyQuickSend('pos')`] 직렬 처리. comfyQuickSend가 comfyGenerate Promise
  반환하도록 변경(await 가능, 락은 내부 finally 해제). 진행 배지(batchBadge). 테스트 vbatch.js(직렬 순서 검증).
- [x] **[외부 감사 1차 5건]** — ✅검증+수정(v9.46.4). AUDIT_FINDINGS_2026-07-17.md(외부 모델). 5건 모두 실제
  코드 근거 확인됨(환각 없음). ①`comfyGenerate` 연결상태 성공문구가 실패를 무조건 덮어씀→else 분기.
  ②`_comfyAbortInline` 호출에 `inline` 미전달→인라인 탭 상태 미갱신, 전부 inline 전달. ③`_comfyAssembleWorkflow`
  await 도중 테마/모드 전환 레이스→`_mode0` 스냅샷+`_themeChanged()` 가드로 취소. ④`_comfyTarget` 미스냅샷
  →클릭시점 `_tgt` 고정(검증·라벨). ⑤`_comfyRestoreSettings`가 내부 setWfMode/setTarget로 복원 중 저장 유발
  →`_comfyRestoring` 가드로 복원 중 `_comfySaveSettings` no-op. 테스트 vaudit.js. 회귀 전부 통과.
  ⏳ 외부 전수감사 다음 회차 대기(같은 파일 누적 예정).
- [x] **[새로고침 시 클래식 복귀]** — ✅수정(v9.46.3). 근본원인: `restore()`가 window 'load' 이벤트에
  걸려 있어 외부 CDN(fonts.googleapis/gstatic, cdnjs FontAwesome, jsdelivr three.js)이 느리거나
  막히면 load가 안 떠서 복원이 영영 안 돌고 클래식에 머묾. DOMContentLoaded 기준(+250ms)으로 실행
  +load는 안전망(idempotent `_plRestored`). 테스트 vrestore.js(정상)/vrestore2.js(CDN 행 시에도 복원).
  ↳ 예전 TASKS의 '새로고침 시 클래식 복귀 재현안됨' 항목의 진짜 원인이었음.
- [x] **[설정 격리 누수 — 새로고침]** — ✅수정(v9.46.2). 재현: 이미지 테마 상태로 새로고침하면 메인
  ComfyUI 설정이 기본값(steps28/cfg7/ckpt''/basic)으로 초기화. 원인: 부팅 시 폼이 메인값으로
  복원되기 전(HTML 기본값)에 `restore()`→`applyLayout(이미지테마)`→`_comfyEnterImageSettings`가
  진입부에서 `_comfySaveSettings()`로 그 기본값을 메인 키에 저장. 수정: `_comfyMainLoaded` 가드
  (`_comfyRestoreSettings`가 flag=false로 실제 로드됐을 때만 true) → 진입부 저장은 `_comfyMainLoaded`일
  때만. 테스트 vleak.js/vleak2.js(reload)/vimgset.js. 클래식/스튜디오 코드 안 건드림.
- [x] **[미리보기 진짜 원인]** — ✅수정(v9.46.1). 클래식/스튜디오는 정상인데 이미지 테마만 안 뜬 이유:
  `_comfyPreviewInfo`가 `_comfyPreviewNodes`(메인 커스텀 워크플로우에서 물려받음, node 9 없음) 때문에
  이미지 워크플로우 SaveImage(9)를 show:false로 걸러 `_comfyStageImages`가 통째로 스킵. 필터는
  `_comfyWfMode==='custom'`일 때만 적용하도록 수정(basic이면 항상 표시). 클래식/스튜디오 코드 안 건드림.
  테스트 vprevinfo.js. (v9.46.0 바이너리 프리뷰는 서버가 보낼 때 뜨는 보너스로 유지)
- [x] **[미리보기 전수조사]** — ✅수정(v9.46.0). 근본 2원인:
  ① ComfyUI 단계별 미리보기는 '바이너리' 웹소켓 프레임인데 `_comfyOnSocketMessage`가 non-string 전부
     무시 → 단계별 프리뷰 아예 안 뜸. `sock.binaryType='arraybuffer'` + `_comfyHandleBinaryPreview`
     (헤더 8B: event=1, fmt 1=JPEG/2=PNG) + `_comfyShowLiveFrame`(인라인/모달 단일 갱신 프레임).
  ② 자동생성이 `comfyGenerate()`(inline=null)라 모달로 감→안 보임. `comfyQuickSend('pos')`로 변경.
  실행 시작 시 `_comfyClearLive`로 라이브 영역 초기화. 테스트 vpreview.js/vautogen2.js.
  ⚠ 서버가 --preview-method none이면 프레임 안 옴(사용자 안내). ↳ #31 FaceDetailer 2패스 프리뷰도 이걸로 해결될 가능성.
- [x] **[대기열 이미지 섞임]** — ✅수정(v9.45.1). 근본 원인 발견. `_img2imgEnsureUploaded`가
  원본 파일명(source.png 등)+overwrite=true로 업로드 → 큐 남은 상태에서 다른 이미지 올리면 서버
  같은 파일 덮어써 대기 작업이 새 이미지로 뒤바뀜. 업로드마다 고유명(promptlab_src_ts_seq_rand.ext)
  사용으로 해결. 테스트 vupload.js. (사용자가 겪던 '2번째부터 뭉개짐'의 유력 원인일 수 있음)
- [~] **[생성 멈춤/느낌 조사]** — ⚙️일부 완화(v9.45.0). 매 생성마다 웹소켓과 별개로 500ms 폴백 폴링을
  돌려 백그라운드 부하 → 1500ms로 완화(+tries 상한 400). ⏳ **실제 멈춤 재현 조건 사용자 확인 대기**
  (전체 UI 무응답인지 / 진행바만 멈춘 건지(FaceDetailer 2패스 중 progress 미발생) / 갤러리 170장 렌더 부하인지).
- [x] **[변환 자동 생성 토글]** — ✅완료(v9.45.0). `autoGenerate`(기본 OFF). `afterNewImage` async화 →
  autoTag 분석 완료 후 autoGenerate면 `updateMasterOutput`+`comfyGenerate`(200ms 지연). UI는 analyzeRow.
  save/restore/_syncPipelineUI 연결. 테스트 vautogen.js.
- [x] **[변환 검열 태그 필터]** — ✅완료(v9.44.0). `dropCensor`(기본 ON). `_I2I_CENSOR_TAGS`.
  `_i2iAnalyzeAndFill`에서 분석 태그 임포트 시 제거 + `updateMasterOutput` 긍정 제거 + 부정에 핵심 검열
  억제 태그 추가. uncensored는 보존. UI는 advBody(자동 태깅 고급). 테스트 vcensor.js.
- [x] **[변환 조합 드로어]** — ✅완료(v9.43.0). 이미지 변환 좌하단 '조합' FAB → panel-left(combo 모드)를
  왼쪽 드로어로 소환(간편/추천/추가/폴더). body로 이동+`pl-i2i-combo` 클래스, 스크림·닫기X·Esc·뒤로가기.
  teardown에서 panel-left 트랙 복귀+요소 제거. 인페인팅 제외. 테스트 vcombo.js.
- [x] **[모바일 스와이프 밀림]** — ✅수정(v9.42.1). `initMobileNav` 스냅은 `translateX(-idx*100vw)`,
  드래그는 `-idx*innerWidth(px)` 사용 → vw/px 불일치로 트랙이 살짝 밀려 고정됨. `panelW()`(실제 패널
  getBoundingClientRect 폭)로 스냅·baseOffset·minX 통일. 테스트 vswipe.js(실제 터치 제스처 후 정렬 확인).
- [x] **[변환 얼굴 처리 토글 2종]** — ✅완료(v9.42.0). 씹덕→실사 언캐니 방지.
  ① `faceRealism`(기본 ON): 부정에 `_I2I_FACE_NEG_TAGS`(large/anime eyes 등) 주입.
  ② `dropExpression`(기본 OFF): 최종 긍정에서 `_I2I_EXPRESSION_TAGS` 제거 + FaceDetailer denoise 0.5→0.65.
  UI는 고급 파이프라인 '얼굴 처리' 블록. save/restore/recommended/_syncPipelineUI 연결. 테스트 vface.js.
- [ ] **[미리보기/스텝] FaceDetailer 2패스(30+30) 중 스텝별 라이브 미리보기 안 뜸** — 다음 작업.
  KSampler는 미리보기 나오는데 FaceDetailer 내부 샘플러 패스에서 스텝별 프리뷰가 안 나옴.
  `_comfyOnSocketMessage` progress/preview 처리 + `_comfyPreviewNodes` 노드 선택 조사 필요.
- [x] **[인페인팅 무지개빛 녹아내림 — 진짜 원인]** — ✅수정(v9.41.1). `_comfyBuildInpaintWorkflow`에서
  `InpaintModelConditioning` + Fooocus 패치를 동시에 써서 인페인트 조건화가 이중 적용 → 마스크 영역
  무지개빛 melt. Fooocus 있으면 `VAEEncodeForInpaint`+평범한 조건(6/7)+Fooocus, 없으면
  InpaintModelConditioning 단독으로 배선 분기. 테스트 vinpwire.js. ⏳ 사용자 실기 확인 대기.
- [x] **[인페인팅 프롬프트 오염]** — ✅수정(v9.41.0). 인페인팅 최종 긍정은 '칠한 곳에 넣을 것'
  박스만 사용하도록 `updateMasterOutput`에서 override(다른 탭·레이어 태그 차단). 노이즈 핵심 원인.
- [x] **[자동분석 피드백]** — ✅수정(v9.41.0). `_i2iAnalyzeAndFill` 시작 시 '분석 중…' 토스트.
- [x] **[테마별 추천 설정]** — ✅완료(v9.40.0). 변환/인페인팅 각각 추천 생성설정.
  · ComfyUI 설정 키를 테마별 분리: `COMFY_TRANSFORM_KEY`/`COMFY_INPAINT_KEY`(+구 `COMFY_IMG_KEY` 폴백),
    `_comfyActiveSettingsKey()`가 `_comfyImgKind`로 선택. `_comfyEnterImageSettings(kind)`.
  · `_img2img` 파이프라인도 테마별 저장: `_img2imgKey()` → `comfy_img2img_transform_v1`/`_inpaint_v1`.
  · 추천값: `_i2iRecommendedValues(kind)` (변환 30/6/dpmpp_2m_sde/karras/den0.5/CN0.65/FD ON,
    인페인트 30/7/den0.85/grow10/Fooocus/CN·FD OFF). `_i2iApplyRecommendedFor(kind,silent)`.
  · **최초 1회만** 자동 주입: `comfy_<kind>_seeded_v1` 플래그. 이후엔 버튼(추천 설정으로)만.
  · **메인 보호**: gen 파라미터는 `_comfyImgSettingsOn`일 때만 씀(격리 밖에선 절대 안 씀). 테스트 vimgset.js.
- [x] **[실사태그 토글 버그]** — ✅수정(v9.40.0). `addRealism` 체크박스 onchange가 상태만 바꾸고
  `updateMasterOutput()`를 안 불러 결과창에 실사 태그가 남던 것 → onchange에 재계산 추가. 테스트 vrealtoggle.js.
- [x] **[갤러리 개별 삭제]** — ✅완료(v9.39.0). 썸네일 hover(모바일 상시) X 버튼 + 우클릭/롱프레스
  메뉴 '이 이미지 삭제'. `galleryDeleteImage(url)`이 `_galleryUrls`/`_galleryMeta`에서 제거+저장+재렌더.
  라이트박스에선 삭제 제외(화면 상태 꼬임 방지). 테스트 vgaldel.js.
- [x] **[인페인팅 뭉개짐] 칠한 영역이 녹아내린 노이즈로 나옴** — ✅원인+수정(v9.38.1).
  Pony 계열은 score_9 등 품질 태그가 없으면 결과가 망가지는데, 인페인트 모드는 실사 태그를
  일부러 안 넣으면서 스코어 태그까지 빠졌고(고정 접두도 꺼져 있었음) → "dress" 단독 = Pony 노이즈.
  수정: 인페인트 + 체크포인트명 `/pony/`면 `updateMasterOutput`에서 score_9/8_up/7_up/6_up를
  맨 앞 자동 주입(화풍 중립, 실사 태그는 안 넣음), 부정에도 score_6/5/4·worst quality 등 기본선 보강.
  비-Pony 체크포인트엔 주입 안 함. transform 모드 실사 태그는 회귀 없음(테스트 vinpscore.js).

- [~] **[audit] 고급 노드 회귀** — ✅원인 찾음+수정(v9.37.1). `_comfyNodeInputs` 병합순서 오류로 설치본
  기본값이 내가 지정한 IPAdapter `preset`("FACEID PLUS V2")을 덮어써 SD1.5용 'FACEID'로 바뀜 →
  'IPAdapter model not found'. `Object.assign(defs, fallback, overrides)`로 수정. ⏳ **사용자 실기 확인 대기.**
- [x] **[확인] IPAdapter .bin** — `models/ipadapter/ip-adapter-faceid-plusv2_sdxl.bin`(1.45GB) 존재 확인 → 파일 문제 아님(코드 회귀).
- [~] **[미리보기] 이미지 테마 결과창 미리보기 안 뜸** — 가설: IPAdapter/CLIP 오류로 생성 전체 실패 → 미리보기 안 나옴.
  v9.37.1 + Pony 체크포인트로 해소 기대. ⏳ **오류 없이 성공했는데도 안 뜨면 별도 조사**(_comfyStageImages/comfy-inline-pos).
- [ ] **[미해결/재현안됨] 새로고침 시 클래식 복귀** — 현재 코드/테스트로는 정상 유지 확인됨.
  사용자가 재발 보고 시 정확한 재현 조건(PC/모바일, 테마, 순서) 받아 재조사.
- [ ] **[anima-preview2 CLIP 없음]** — 이 체크포인트는 CLIP 미탑재로 인페인팅/변환 시 CLIPSetLastLayer 오류.
  Pony 등 CLIP 내장 모델 쓰면 됨(앱이 오류 안내함). 별도 조치 불필요.

### J5. ★ 표정은 '외형이 변해도' 괜찮다 — 오히려 목적에 가깝다
- 사용자 원문: *"어차피 이왕 달라지는거 확 달라지는것도 꼴림 포인트가 될수있음
  (무표정인 캐릭터가 이런 표정을 짓는다고 생각해보셈)"*
- **표정 기능의 목적 자체가 갭모에**다. "이 캐릭터가 이런 표정을?" + "이런 표정을 짓게 하고 싶다".
  즉 원본과의 **낙차가 클수록 좋다**.
- 따라서 `fang`(덧니)처럼 **표정이 아니라 외형을 바꾸는 태그도 허용**한다.
  v9.90.0 메스가키에 `fang`을 넣은 근거가 이것.
- ⚠️ 단, **무엇이든 다 되는 건 아니다.** 아래는 여전히 금지:
  - `loli` / `flat chest` — **체형**을 바꿔서 가슴 선택(group 'bust')과 정면 충돌
  - `twintails` 등 **머리 모양** — 캐릭터를 아예 다른 사람으로 만듦
  - 기준: **얼굴 주변에서 끝나면 OK, 몸/머리로 번지면 NG.**
    다른 선택지(가슴·포즈)를 덮어쓰는지가 실질적인 선이다.
- 이전에 내가 "외형 변하니까 빼자"고 판단하던 건 **방향이 틀렸다.** 다시 그러지 말 것.

## ✅ 사용자 환경 (ComfyUI 설치 현황, 확인됨)

- 체크포인트: ponyRealism_V22 ✓, juggernautXL, illustriousXL, asianRealism, anima-preview2(CLIP 없음 주의)
- ControlNet: OpenPoseXL2 ✓ + comfyui_controlnet_aux ✓
- LoRA: FaceID LoRA(ip-adapter-faceid-plusv2_sdxl_lora) ✓, D-ART_XL, k4_anime_nude 등
- Upscale: 4x-UltraSharp, 2x-AnimeSharpV3 ✓ + comfyui_ultimatesdupscale ✓
- 커스텀노드: impact-pack ✓, impact-subpack ✓, ipadapter_plus ✓, faceanalysis(InsightFace) ✓,
  wd14-tagger ✓, easy-use(Fooocus inpaint) ✓, inspire-pack, manager, rgthree 등
- FaceDetailer bbox: face_yolov8m.pt(models/ultralytics/bbox) ✓
- ⚠️ 미확인: `models/ipadapter/*.bin` (IPAdapter FaceID 본체 모델)

## 📌 핵심 설계 메모 (건드릴 때 주의)

- **이미지 테마 2종**: `img2img`(실사 변환, editMode=transform) / `inpaint`(인페인팅, editMode=inpaint).
  둘 다 `mountImg2img`가 처리, `_plCurrent`로 모드 결정.
- **태그 세션 분리**: `_i2iSessionKind`('transform'|'inpaint'|null) → 저장 키 3종(main/i2i/inpaint).
- **ComfyUI 설정 분리**: `_comfyImgSettingsOn` + `COMFY_IMG_KEY` → 이미지 테마는 메인 설정(커스텀 워크플로우·스텝·시드) 안 건드림. `_comfyEnterImageSettings`/`_comfyExitImageSettings`.
- **워크플로우 라우팅**: `_comfyAssembleWorkflow`에서 `_img2img.enabled`면 커스텀 모드여도 최우선으로 img2img/inpaint 빌드.
- **실행 오류 표시**: `_comfyOnExecError`(websocket execution_error) → 결과창 오류 박스 + 힌트.
- **규칙**: index.html 수정 시 항상 버전업 3곳 동기화(title, .app-version-tooltip, CHANGELOG) + CLAUDE.md.
