# 프롬프트 랩 — 작업 태스크 파일

> 세션마다 여기에 진행/대기 항목을 기입한다. (요청·버그·아이디어를 절대 잊지 않기 위한 기록)
> 현재 최신 버전은 `CLAUDE.md` 참고. 개발 브랜치: `claude/prompt-lab-repo-setup-jdx0xs`

## 🔴 진행/대기 (Open)

### 🌱 [Anima] 시드 이어받기 + 스윕 토스트 정리 — 기획 확정, 착수 대기
> 2026-07-29 상담 완료. **이 항목은 작업이 끝나면 삭제해도 됨.**

**왜 필요한가 (사용자 실제 워크플로)**
표정을 하나씩 골라 쓰지 않는다. 신체·후타·가슴을 맞춰가며 여러 장 뽑다가(=탐색),
마음에 드는 외형이 나오면 **그 상태에서 표정 스윕을 돌려** 여러 짤을 건지고 다음으로 넘어간다.
그런데 시드가 `-1`(랜덤)이면 `_animaRunSweep`이 `_animaSeedVal()`로 **새 랜덤을 뽑아** 세트를 고정하므로,
정작 마음에 들었던 그림과 무관한 그림 15장이 나온다. ("갑자기 이상한 걸로 나올 때가 있다"의 원인)

**① 시드 이어받기 (B안)**
- 스윕 시작 시 시드가 `-1`이면 **선택된 결과의 시드**를 이어받아 세트를 돌린다.
- 시드를 직접 숫자로 넣어둔 경우엔 기존 동작 유지(그 값 사용).
- `_anima.seed`는 스윕이 이미 백업/복원하므로 **설정은 안 바뀐다**(끝나면 여전히 -1).
- **원본 이미지(srcKey)가 다르면 이어받지 않고 조용히 새 랜덤** — 경고창으로 흐름을 끊지 않는다.
- 결과에 시드가 없으면(구버전 `seed: null`) 이어받지 않음.

**② 켜고 끄기 — 스윕 메뉴 상단에 라디오**
탐색 중엔 새 랜덤, 좋은 걸 찾으면 이어받기로 **모드가 자주 바뀐다**. 영구 토글은 잊어버리고,
매번 고르는 건 귀찮다 → **메뉴를 열면 반드시 눈에 들어오는 자리**에 둔다.
```
🔁 연속 생성          나머지는 지금 설정 그대로
  시드   ● 선택한 그림 (8472619)   ○ 새로 뽑기
  ├ 표정 전부 돌리기       15장
  └ ⚙ 무엇을 돌릴지 설정
```
- 라벨은 **"선택한 그림"** (확정). 비교창에 떠 있는 그 이미지 = `_anima.results[_animaResSel]`.
- 선택이 유지되되 스윕을 고르기 직전에 보이므로 까먹을 수 없음.
- 기본값은 **"새로 뽑기"**(= 지금까지의 동작). 모르고 써도 달라지는 게 없게.
- 선택된 결과가 없으면 이 줄 자체를 숨김. 원본 불일치·시드 없음이면 "선택한 그림"을 비활성.

**③ 스윕 대기열 토스트 억제**
`_animaGenerate`가 호출마다 "대기열에 추가됨" 토스트를 띄워 **15종 스윕 = 15개**가 쌓인다.
`#toast-container`는 `pointer-events:none`이지만 `.toast`가 `all`이라(탭하면 닫기 기능)
**쌓이면 화면 오른쪽 절반이 터치를 먹는다.**
→ `_animaGenerate`에 조용히 옵션을 넘겨 스윕 중엔 개별 토스트 생략. 끝나고 요약 1개만(이미 있음).
→ **완료 토스트·진동은 그대로 둔다** (장당 3초 이상 걸려 실제로 안 겹침).

**④ 토스트 동시 표시 상한 8개 (전역 안전망)**
넘치면 오래된 것부터 제거. 이번 건이 해결되면 평소엔 안 걸리지만, 다른 기능에서 같은 실수가 나도
화면이 덮이지 않게 하는 보험.

**보류 — A안(시드 고정 버튼)**
결과 옆에 `[이 시드로 고정]`을 두어 `_anima.seed`에 **영구 반영**하는 방식.
B와 배타적이지 않고 용도가 다르다(같은 시드로 프롬프트를 손봐가며 뽑기 등).
다만 지금 겪는 불편은 B로 전부 해결되고, A는 **푸는 것까지 기억해야** 하는 부담이 있어 보류.
필요해지면 작게 붙일 수 있음(결과에 시드 저장됨 + 고급 설정에 시드 입력칸 있음).

### 😀 [Anima] 표정 개편 — 일부 확정, 신규 선정 대기
- **확정**: `홍조`(`blush`) 제거 — `수줍음`(`shy, blush, embarrassed`)에 포함되고 `blush`는 400만 건이라
  다른 표정에도 자연히 딸려 온다. 사용자도 안 씀.
- **확정**: `절정`의 `ecstasy` 제거 — danbooru 159건짜리 사실상 유령. `orgasm`(24,936)만 남김.
  `rolling eyes`도 빼면 `아헤가오`와 구분이 선명해짐(현재 둘이 공유 중).
- **자주 쓰는 순서**: 아헤가오 > 절정 > 무표정 > 유혹 > 혀 내밀기 > 능글 > 놀람 > 하트눈 > 우는
  (안 쓰는 것: 미소·수줍음·홍조·화남·삐침·윙크 — 유지하기로 함)
- **목표 20~25종.** ★ 표정은 **batch로 돌리므로** 추가 1개 = 스윕 1장. 비슷해 보이는 건 넣으면 손해.
  (단, ⚙ 무엇을 돌릴지 설정에서 스윕 대상은 따로 고를 수 있어 개수 부담은 완화 가능)
- **batch 관점 추천 4~5개**: 참는 표정 `clenched teeth`(103,299) · 가쁜 숨 `heavy breathing`(50,555) ·
  메스가키 `mesugaki, smug, naughty face`(4,135) · 얀데레 `yandere, shaded face`(9,339) ·
  차가운 경멸 `narrowed eyes, looking down, scowl`(136,015)
- **겹칠 위험이 있어 뺀 것**: 몽롱한 눈(`half-closed eyes` — 유혹에 이미 있음) ·
  침 흘림(`drooling` — 아헤가오에 있음) · 녹은 얼굴(`torogao` — 절정~아헤가오 사이) ·
  덧니(`fang` — 표정이 아니라 이빨)
- 조사해 둔 전체 후보(성인 11 / 귀여움 9 / 경멸 7 / 일반 11)는 세션 기록 참고.
  0건이라 제외: `bedroom eyes` `trance` `pleasure` `biting lip` `contempt` `condescending` `arrogant`
  `smug face` `half-lidded eyes` `cat smile` `open mouth smile`

### 🧪 [Anima] 포즈 타율 — 진단 대기 (사용자 실행 필요)
- v9.83.0에 **[참조 설정 (진단)]** 스윕 축을 임시로 넣어둠. 포즈 하나 켜고 돌리면
  `temporal_mask`/`kv_gating` × 강도 1.0/0.7/0.5 = 6장이 같은 시드로 나온다.
- **판정 후 이 축은 제거한다.** 코드에 `[진단]` 주석 7곳 + `▼▼▼~▲▲▲` 16줄 블록으로 표시해 둠.
- 결과에 따라: ①kv_gating이 나으면 기본값 교체 ②강도만 낮추면 되면 포즈 켤 때 자동 조정
  ③둘 다 아니면 ControlNet.
- **ControlNet 조사 완료**: Qwen-Image용 존재. openpose는 **Union DiffSynth LoRA** 방식
  (`qwen_image_union_diffsynth_lora.safetensors` → `ComfyUI/models/loras/`, `LoraLoaderModelOnly`).
  전처리기는 **이미지 변환 테마에 이미 구현돼 작동 중**(`OpenposePreprocessor` +
  `ControlNetLoader` + `ControlNetApplyAdvanced`, 단 모델이 `OpenPoseXL2`= SDXL용이라 Anima엔 못 씀).
  앱이 `_comfyNodeEnum()`으로 `/object_info`를 조회하므로 **설치 여부는 앱이 자동 확인 가능**.
  포즈 지정은 스켈레톤 내장보다 **포즈 참조 이미지 업로드**(기존 업로드 기능 재사용) 방식을 추천.

### 🐌 [Anima] 로딩 느림 — 정보 대기
- 크게 보기는 v9.71.0에서 해결(캐시 미스 + 원본 3장 동시 로드가 원인).
- "전반적으로 느리다"가 앱 전체인지 미확인. **갤러리에 몇 장 쌓였는지** 알아야 진행 가능
  (수천 장이면 부팅 시 IndexedDB 전량 읽기 비용이 원인일 수 있음).

---

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
