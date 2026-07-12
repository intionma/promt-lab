# 프롬프트 랩 — 작업 태스크 파일

> 세션마다 여기에 진행/대기 항목을 기입한다. (요청·버그·아이디어를 절대 잊지 않기 위한 기록)
> 현재 최신 버전은 `CLAUDE.md` 참고. 개발 브랜치: `claude/prompt-lab-repo-setup-jdx0xs`

## 🔴 진행/대기 (Open)

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
