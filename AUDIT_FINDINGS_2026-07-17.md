# Prompt Lab 코드 감사 결과 — 1차

- 대상 저장소: `intionma/promt-lab`
- 대상 파일: `index.html`
- 감사일: 2026-07-17
- 범위: ComfyUI 설정, 생성 흐름, 비동기 상태, 인라인 상태 표시
- 상태: 1차 결과. 전체 전수감사는 계속 필요함.

> 이 문서는 실제 코드 근거가 확인된 항목과 구조상 추가 검증이 필요한 항목을 분리해 기록한다. 추측만으로 수정하지 말고, 재현과 호출 경로를 다시 확인한 뒤 반영할 것.

---

## 요약

현재까지 확정성이 높은 문제는 4건이다.

1. 연결 확인 실패 후에도 UI가 `✅ 연결됨`으로 덮어써짐
2. 일부 인라인 생성 실패 경로에서 대상 탭 상태가 갱신되지 않을 수 있음
3. 이미지 워크플로우 조립 도중 테마 전환 시 전역 상태 레이스 가능
4. 생성 준비 중 전송 대상 변경 시 실제 작업과 라벨·검증 기준이 어긋날 수 있음

추가로, 설정 복원 함수가 내부에서 다시 저장을 발생시키는 구조가 있어 별도 검증이 필요하다.

---

## 1. 연결 실패인데 화면에는 `연결됨`으로 표시됨

**심각도: 중간**

### 위치

`comfyGenerate()` 내부 연결 확인 구간

```js
const ok = await _comfyPing(2, 6000);

if (!ok && !_comfyConnectedOnce) {
    statusEl.innerHTML = '❌ 연결 안 됨';
    statusEl.style.color = 'var(--accent-danger)';
    showToast(...);
    _comfyAbortInline('연결 안 됨');
    return;
}

if (!ok) {
    statusEl.textContent = '연결 확인 생략(계속 진행)';
    statusEl.style.color = 'var(--text-dim)';
}

statusEl.textContent = '✅ 연결됨';
statusEl.style.color = 'var(--accent-green)';
```

### 증상

핑이 실패했지만 과거 연결 이력이 있다는 이유로 계속 진행하는 경우, 실제 연결 확인은 실패했는데 화면에는 `✅ 연결됨`이 표시된다.

### 원인

`!ok` 분기에서 실패 상태 문구를 설정한 직후, 조건과 무관하게 성공 문구가 다시 실행되어 덮어쓴다.

### 재현

1. 한 번 이상 ComfyUI 연결에 성공한다.
2. ComfyUI를 종료하거나 네트워크를 끊는다.
3. 다시 생성을 시도한다.
4. 핑은 실패하지만 과거 연결 이력 때문에 진행된다.
5. 화면에는 `연결 확인 생략`이 아니라 `✅ 연결됨`이 표시된다.

### 수정 제안

```js
if (!ok) {
    statusEl.textContent = '연결 확인 실패 · 이전 연결 이력으로 계속 진행';
    statusEl.style.color = 'var(--text-dim)';
} else {
    statusEl.textContent = '✅ 연결됨';
    statusEl.style.color = 'var(--accent-green)';
}
```

---

## 2. 인라인 생성 실패 시 해당 탭 상태가 갱신되지 않을 수 있음

**심각도: 중간**

### 위치

`_comfyAbortInline()` 및 `comfyGenerate()` 내부 오류 분기

```js
function _comfyAbortInline(msg, inline) {
    const key = inline || (
        _comfyRunningPid && _comfyJobs[_comfyRunningPid]
            ? _comfyJobs[_comfyRunningPid].inline
            : null
    );

    if (key) {
        const st = document.getElementById('comfy-inline-status-' + key);
        if (st) st.textContent = msg || '취소됨';
    }
}
```

일반 생성 경로의 일부 호출:

```js
_comfyAbortInline('긍정 비어있음');
_comfyAbortInline('부정 비어있음');
_comfyAbortInline('연결 안 됨');
_comfyAbortInline('설정 확인 필요');
_comfyAbortInline('전송 실패');
```

반면 개발자 모드 경로는 다음처럼 `inline`을 전달한다.

```js
_comfyAbortInline('긍정 비어있음', inline);
```

### 증상

긍정 또는 부정 탭에서 빠른 전송을 시도한 뒤 오류가 발생해도, 해당 탭 상태 문구가 `전송 준비...` 등 이전 값으로 남을 수 있다.

### 원인

`_comfyAbortInline()`은 명시적인 `inline` 값이 없으면 `_comfyRunningPid`에 의존한다. 하지만 오류가 발생한 시점에는 아직 실행 중 PID가 없거나, 다른 작업 PID를 가리킬 수 있다.

### 재현

1. 긍정 또는 부정 탭에서 인라인 전송을 시작한다.
2. 프롬프트 누락, 연결 실패, 워크플로우 조립 실패 중 하나를 발생시킨다.
3. 오류 토스트는 나오지만 해당 탭의 상태 문구가 갱신되지 않는지 확인한다.

### 수정 제안

`comfyGenerate()` 내부의 모든 `_comfyAbortInline()` 호출에 현재 함수의 `inline` 값을 전달한다.

```js
_comfyAbortInline('전송 실패', inline);
```

---

## 3. 이미지 워크플로우 조립 중 테마 전환 레이스 가능

**심각도: 높음**

### 위치

`_comfyAssembleWorkflow()`

```js
if (_img2img.enabled) {
    name = await _img2imgEnsureUploaded();

    if (_img2img.faceDetailer) {
        await _comfyNodeDefaults('FaceDetailer');
    }

    if (_img2img.editMode === 'inpaint') {
        await _comfyNodeDefaults('InpaintModelConditioning');
    }

    if (_img2img.editMode === 'inpaint') {
        return _comfyBuildInpaintWorkflow(
            pos,
            neg,
            name,
            maskName,
            _img2img.inpaintDenoise,
            fooocusKind,
            fooocusNames
        );
    }

    return _comfyBuildImg2ImgWorkflow(
        pos,
        neg,
        name,
        _img2img.denoise
    );
}
```

### 증상

생성 버튼을 누른 뒤 업로드나 노드 정보 조회가 진행되는 동안 사용자가 테마를 바꾸면, 클릭 당시와 다른 모드·옵션으로 워크플로우가 조립될 수 있다.

가능한 결과:

- 이미지 변환 생성이 인페인팅 분기로 바뀜
- 마스크가 없다는 오류가 갑자기 발생
- 클릭 당시와 다른 denoise 값이 적용됨
- 클래식으로 이동했는데도 이미지 워크플로우가 전송됨

### 원인

함수 시작 시 `_img2img.enabled`를 확인하지만, 여러 `await` 이후에도 `_img2img.editMode`, `_img2img.denoise`, `_img2img.inpaintDenoise`, `_img2img.fooocus` 등 변경 가능한 전역 상태를 다시 읽는다.

### 재현

1. 이미지 변환 테마에서 원본 이미지를 넣는다.
2. 생성을 누른다.
3. 업로드 또는 노드 정보 요청이 끝나기 전에 인페인팅이나 클래식 테마로 이동한다.
4. 최종 전송 워크플로우와 오류 상태가 클릭 당시 설정과 일치하는지 확인한다.

### 수정 제안

함수 시작 시 필요한 상태를 스냅샷으로 복사하고, 이후에는 전역 `_img2img`를 읽지 않는다.

```js
const ctx = {
    enabled: _img2img.enabled,
    editMode: _img2img.editMode,
    denoise: _img2img.denoise,
    inpaintDenoise: _img2img.inpaintDenoise,
    faceDetailer: _img2img.faceDetailer,
    upscale: _img2img.upscale,
    ipadapter: _img2img.ipadapter,
    fooocus: _img2img.fooocus,
    uploadedName: _img2img.uploadedName
};
```

가능하면 생성 클릭 시점의 전체 상태를 하나의 `generationContext`로 만들고 `_comfyAssembleWorkflow(pos, neg, generationContext)`에 전달한다.

---

## 4. 생성 준비 중 전송 대상 변경 시 작업 메타가 어긋날 수 있음

**심각도: 높음**

### 위치

`comfyGenerate()` 및 `comfySetTarget()`

```js
function comfySetTarget(t) {
    _comfyTarget = t;
    ...
    _comfySaveSettings();
}
```

`comfyGenerate()`에서는 시작 시 `_comfyTarget`을 고정하지 않고 여러 위치에서 현재 전역값을 다시 읽는다.

```js
if (_comfyTarget !== 'neg' && !pos) ...
if (_comfyTarget === 'neg' && !neg) ...
```

비동기 대기 이후:

```js
const workflow = await _comfyAssembleWorkflow(pos, neg);

const label =
    (_comfyTarget === 'neg' ? '[부정] ' : '') +
    _comfyKorLabel(_comfyTarget === 'neg' ? neg : pos);
```

### 증상

생성 준비 중 사용자가 긍정·부정·둘 다 대상을 변경하면 다음 불일치가 생길 수 있다.

- 실제 워크플로우와 작업 라벨 불일치
- 긍정 전송 작업이 부정 작업처럼 표시됨
- 입력 검증 기준이 클릭 당시와 달라짐
- 저장되는 작업 메타데이터가 실제 전송 내용과 다름

### 원인

생성 함수가 클릭 시점의 `_comfyTarget`을 스냅샷으로 저장하지 않고, 비동기 처리 전후에 변경 가능한 전역값을 계속 읽는다.

### 재현

1. 긍정 또는 부정 대상 상태에서 생성을 시작한다.
2. 연결 확인이나 이미지 업로드가 진행되는 동안 대상 버튼을 바꾼다.
3. 큐 라벨과 실제 전송 프롬프트가 일치하는지 확인한다.

### 수정 제안

함수 시작 시 대상을 고정한다.

```js
const targetSnapshot = _comfyTarget;
```

이후 유효성 검사, 워크플로우 조립, 작업 라벨, 작업 메타데이터 저장에 모두 `targetSnapshot`만 사용한다.

---

## 확인 필요: 설정 복원 중 다시 저장이 발생하는 구조

**심각도: 확인 필요**

### 위치

`_comfyRestoreSettings()`, `comfySetWfMode()`, `comfySetTarget()`

`_comfyRestoreSettings()`는 아래 함수를 호출한다.

```js
comfySetWfMode(s.wfMode || 'basic');
comfySetTarget(s.target || 'both');
```

그런데 두 함수 모두 내부에서 `_comfySaveSettings()`를 호출한다.

따라서 설정 복원 과정이 동시에 저장도 수행한다.

### 위험

현재 활성 설정 키가 정확하면 같은 값이 다시 저장되는 수준일 수 있다. 하지만 부팅·테마 전환·복원 순서가 어긋나면 중간 상태가 다른 키에 저장될 가능성이 있다.

### 권장 검증

- 이미지 테마 진입 직후 복원 중 어떤 키에 저장되는지 추적
- 부팅 직후 `_comfyMainLoaded`가 false일 때 저장 발생 여부 추적
- `_comfyImgSettingsOn`, `_comfyImgKind` 변경 직전·직후 호출 순서 확인

### 수정 제안

복원 중 저장을 막는 가드를 추가한다.

```js
let _comfyRestoring = false;

function _comfyRestoreSettings() {
    _comfyRestoring = true;
    try {
        // 복원
    } finally {
        _comfyRestoring = false;
    }
}

function _comfySaveSettings() {
    if (_comfyRestoring) return;
    // 저장
}
```

또는 `comfySetWfMode(mode, { save: false })`처럼 복원 전용 옵션을 두는 편이 더 명시적이다.

---

## 우선 검증 순서

1. 이미지 생성 준비 중 테마 전환 테스트
2. 생성 준비 중 긍정·부정 대상 변경 테스트
3. 연결 실패 상태 표시 테스트
4. 인라인 오류 상태 문구 테스트
5. 설정 복원 중 localStorage 쓰기 로그 추적

---

## 주의

- 이 문서는 전체 2만 줄 전수감사의 최종 결과가 아니다.
- 현재는 ComfyUI 생성·설정·비동기 상태 구간의 1차 감사 결과다.
- 수정 전 반드시 실제 브라우저에서 재현하거나 디버그 로그로 호출 순서를 확인할 것.
- 확인되지 않은 항목은 바로 수정하지 말고 `확인 필요` 상태로 유지할 것.
