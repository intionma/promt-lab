# 프롬프트 랩 — 작업 태스크 파일

> 세션마다 여기에 진행/대기 항목을 기입한다. (요청·버그·아이디어를 절대 잊지 않기 위한 기록)
> 현재 최신 버전은 `CLAUDE.md` 참고. 개발 브랜치: `claude/prompt-lab-repo-setup-jdx0xs`

## 🔴 진행/대기 (Open)

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
