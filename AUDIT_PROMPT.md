# 코드 전수 감사 지시문 (ChatGPT 등 외부 모델용)

> 이 파일을 그대로 복사해서 감사 모델에게 붙여넣으면 됨.
> 대상: `index.html` (단일 파일 HTML 앱, 약 2만 줄, 순수 JS + localStorage, 빌드 없음)

---

## 지시문 (여기부터 복사)

너는 시니어 프론트엔드 코드 감사관이다. 아래 **단일 파일 HTML 앱**(`index.html`, 약 2만 줄, 순수 JS + localStorage, 빌드 없음)을 정적 분석해서 버그를 찾아라. 이 앱은 AI 이미지 프롬프트 도구이고 ComfyUI(로컬 AI 서버)와 통신한다.

테마(레이아웃)가 여러 개다:
- **클래식 · 스튜디오** = text2img. 서로 설정을 공유한다.
- **이미지 변환 · 이미지 인페인팅** = img2img. 이 둘은 클래식/스튜디오와 **완전히 격리돼야 한다** (특히 ComfyUI 설정).

**중요 제약: 코드에 실제로 존재하는 줄만 근거로 지적하라. 없는 함수·없는 코드를 지어내지 마라. 확실하지 않으면 "추정"이라고 명시하라.**

### 감사 우선순위 (이 앱은 아래에서 반복적으로 터졌다 — 집중해서 봐라)

1. **상태 격리 누수**: 이미지 테마(img2img/inpaint) 조작이 메인(클래식/스튜디오)의 localStorage 설정을 오염시키는가?
   - 핵심 함수: `_comfySaveSettings` / `_comfyRestoreSettings` / `_comfyActiveSettingsKey` / `_comfyEnterImageSettings` / `_comfyExitImageSettings`.
   - 핵심 플래그: `_comfyImgSettingsOn`, `_comfyImgKind`, `_comfyMainLoaded`.
   - **"플래그가 false인데 폼이 다른 테마 값을 담은 채로 저장(save)되는" 경로**를 전부 찾아라. (부팅 직후, async 도중 테마 전환, 이벤트 핸들러 순서)

2. **async 레이스**: `async function`이 `await` 도중에 사용자가 테마를 바꾸거나 다른 액션을 하면, 재개 시점에 잘못된 전역 상태(예: `_comfyImgSettingsOn`, `_plCurrent`, `_img2img.uploadedName`, `_comfyRunningPid`)를 읽고 쓰는가? 특히 `comfyGenerate`, `comfyQuickSend`, `_i2iAnalyzeAndFill`, `_img2imgEnsureUploaded`, `_comfyAssembleWorkflow` 주변.

3. **localStorage 키 일관성**: 저장하는 키와 읽는 키가 다른가? 테마별 키를 쓰는 곳과 안 쓰는 곳이 섞여 있는가?
   - 관련 키: 메인 `comfy_settings_v1`, `comfy_settings_transform_v1`, `comfy_settings_inpaint_v1`, `comfy_img2img_transform_v1`, `comfy_img2img_inpaint_v1`, 세션 탭/상태 키들, `pl_layout`.

4. **이벤트/타이밍**: `load` vs `DOMContentLoaded`, `setTimeout` 순서 의존, 리스너 중복 등록/미해제(테마 teardown에서 `removeEventListener` 누락), popstate/history 스택 꼬임.

5. **정리(teardown) 누락**: 각 레이아웃 `init()`이 반환하는 teardown 함수가 자기가 만든 DOM·이벤트 리스너·전역 상태·`URL.createObjectURL`을 전부 되돌리는가? (메모리 누수·유령 리스너)

6. **ComfyUI 워크플로우 빌드**: `_comfyBuildWorkflow`(text2img) / `_comfyBuildImg2ImgWorkflow` / `_comfyBuildInpaintWorkflow`에서 노드 배선(연결) 오류, 파일명 충돌(overwrite), 조건화 이중 적용, 노드 id 충돌 등.

### 찾아야 할 버그 클래스 (구체적으로)

- 같은 파일명 + `overwrite=true` 업로드로 이전(대기 중) 작업이 덮어써지는가
- `if (typeof x !== 'string') return` 같은 조기 리턴이 정당한 데이터(바이너리 프레임 등)까지 버리는가
- 전역 배열/객체가 리셋 없이 누적되는가 (태그·프리뷰 노드·job·objectURL)
- HTML 기본값이 실제 저장값을 덮어쓰는 부팅 경로
- 숫자 입력(`<input type=number>`)에 `onchange` 저장이 없어 값이 유실되는가
- 정규식·문자열 파싱에서 괄호/가중치/이모지/특수문자 태그가 깨지는가
- 필터/거르기 로직(예: 미리보기 노드 선택)이 엉뚱한 모드에서까지 적용돼 정상 동작을 막는가

### 작업 방식 (큰 단일 파일이라 이렇게 해라)

- 통독하지 말고 **위 핵심 함수 이름들로 검색**해서 호출 그래프를 따라가라.
- 각 전역 플래그(`_comfyImgSettingsOn` 등)에 대해 **"set 되는 곳 전부"와 "그 값에 의존해 저장/분기하는 곳 전부"**를 나열하고 불일치를 찾아라.
- 추측이면 "추정"이라고 명시하고, 확실하면 재현 시나리오를 적어라.

### 보고 형식 (반드시 이 형식)

각 발견마다:

```
[심각도: 치명적 / 높음 / 중간 / 낮음]
위치: 함수명 (+가능하면 근처 코드 스니펫이나 줄 번호)
증상: 사용자가 겪는 현상 (한 줄)
원인: 왜 발생하는가 (코드 근거)
재현: 1) ... 2) ... 3) ...
수정 제안: 구체적 코드 변경
```

- 확실한 것부터, 심각도 높은 순으로.
- **추측성 지적은 맨 아래 "확인 필요" 섹션에 따로 모아라.**
- 코드에 근거가 없는 지적은 하지 마라.

## 지시문 끝 (여기까지 복사)

---

## 운영 팁

- **파일이 커서 한 번에 못 넣으면**: 감사 모델에게 "핵심 함수 목록을 줄 테니, 내가 각 함수 코드를 붙여넣으면 그 부분만 감사해줘"라고 하고, 위 핵심 함수 이름들을 편집기에서 검색해 그 블록만 복붙한다.
- **환각 방지**: 값싼 모델은 없는 함수/버그를 지어내기 쉽다. "코드에 실제로 있는 줄만 근거로 대라. 없으면 모른다고 해라"를 꼭 유지한다.
- **결과 검증**: 감사 모델이 준 지적은 그대로 믿지 말고, 실제 코드에서 해당 함수를 찾아 근거가 맞는지 확인한 뒤 수정한다.

## 실제로 이 앱에서 나왔던 버그 (감사 모델에게 예시로 줘도 됨)

- 대기열에 여러 작업을 쌓아둔 상태에서 원본 이미지를 바꾸면, 같은 파일명 + `overwrite=true` 업로드가 서버의 원본을 덮어써 대기 중 작업이 새 이미지로 뒤바뀜 → 업로드마다 고유 파일명으로 해결.
- 이미지 테마 상태로 새로고침하면, 폼이 메인값으로 채워지기 전(HTML 기본값)에 진입 로직이 그 기본값을 메인 키에 저장 → 클래식/스튜디오 설정 초기화. `_comfyMainLoaded` 가드로 해결.
- 레이아웃 복원(`restore`)이 window `load` 이벤트에 걸려 있어, 외부 CDN(폰트·아이콘·three.js)이 느리면 복원이 안 돌고 항상 클래식으로 남음 → `DOMContentLoaded` 기준으로 변경.
- 미리보기 노드 필터(`_comfyPreviewInfo`)가 메인 커스텀 워크플로우에서 물려받은 목록 때문에 이미지 워크플로우 노드를 걸러 미리보기가 통째로 안 뜸 → 기본 모드에선 항상 표시하도록 수정.
- 인페인트 워크플로우가 `InpaintModelConditioning` + Fooocus 패치를 동시에 써서 조건화 이중 적용 → 결과가 무지개빛으로 뭉개짐 → 경로 분기로 해결.
