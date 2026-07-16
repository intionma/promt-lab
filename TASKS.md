# 프롬프트 랩 — 작업 태스크 파일

> 세션마다 여기에 진행/대기 항목을 기입한다. (요청·버그·아이디어를 절대 잊지 않기 위한 기록)
> 현재 최신 버전은 `CLAUDE.md` 참고. 개발 브랜치: `claude/prompt-lab-repo-setup-jdx0xs`

## 🔴 진행/대기 (Open)

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
