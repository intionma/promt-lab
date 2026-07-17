# 코드 감사 2차 결과 — 에디터·프롬프트·모바일·갤러리

- 대상: `index.html` v9.46.4
- 감사일: 2026-07-17
- 범위: BREAK 처리, 고정 접두 태그, 모바일 스와이프, ComfyUI 라이브 프리뷰, 갤러리 메타데이터
- 상태: 2차 정적 감사 결과. 실제 수정 전 재현 테스트 권장.

---

## 1. 라이브 바이너리 프리뷰 Object URL이 화면 초기화 시 즉시 해제되지 않음

[심각도: 낮음]

### 위치
- `_comfyHandleBinaryPreview`
- `_comfyShowLiveFrame`
- `_comfyClearLive`

### 증상
라이브 프리뷰가 표시된 뒤 작업이 종료되거나 라이브 영역이 초기화되어도 마지막 `blob:` URL이 다음 바이너리 프레임이 올 때까지 메모리에 남는다.

### 원인
`_comfyShowLiveFrame()`은 새 프레임이 들어올 때만 기존 `_comfyLiveFrameURL`을 `URL.revokeObjectURL()` 한다. 반면 `_comfyClearLive()`은 컨테이너의 `innerHTML`만 비우며 URL을 해제하거나 `null`로 초기화하지 않는다.

### 재현
1. 바이너리 라이브 프리뷰가 나오는 작업 실행
2. 프리뷰가 표시된 후 작업 완료 또는 다음 작업 시작
3. 새 바이너리 프레임이 오지 않는 상태 유지
4. 기존 Object URL이 계속 유지되는지 확인

### 수정 제안

```js
if (_comfyLiveFrameURL) {
    try { URL.revokeObjectURL(_comfyLiveFrameURL); } catch (e) {}
    _comfyLiveFrameURL = null;
}
```

---

## 2. 모바일 스와이프 `touchcancel`이 드래그 확정 전 상태를 정리하지 않음

[심각도: 낮음]

### 위치
모바일 패널 스와이프 초기화 코드의 `touchcancel` 리스너

### 증상
터치가 취소됐지만 수평 드래그로 확정되기 전이라면 `swStartX`, `swStartY`, `swLocked`가 남을 수 있다.

### 원인
현재 `touchcancel`은 `!swDragging`이면 즉시 반환한다. 방향이 결정되지 않았거나 세로 방향으로 잠긴 상태에서 터치가 취소되면 시작 좌표가 정리되지 않는다.

### 수정 제안
모바일 여부만 확인하고 상태는 항상 정리한다. 실제 수평 드래그였을 때만 스냅 복원한다.

```js
document.addEventListener('touchcancel', () => {
    if (!isMobile) return;
    const wasDragging = swDragging;
    swStartX = swStartY = null;
    swLocked = null;
    swDragging = false;
    if (wasDragging) springTo(currentIdx);
}, { passive: true });
```

---

## 3. 고정 접두 태그 중복 제거가 가중치 표현을 동일 태그로 인식하지 못함

[심각도: 중간]

### 위치
`_applyFixedPrefix(out, fmt, useBreak)`

### 증상
고정 접두에 `score_9`가 있고 본문에 `(score_9:1.2)` 또는 `[score_9]` 같은 가중치 표현이 있으면 둘이 동시에 남는다.

예시:

```text
score_9, score_8_up, (score_9:1.2), character
```

### 원인
중복 제거가 소문자 변환 후 문자열 완전 일치만 비교한다. 괄호·대괄호·가중치 접미사를 정규화하지 않아 의미상 같은 태그를 다른 문자열로 취급한다.

### 재현
1. 고정 접두 활성화: `score_9, score_8_up`
2. 본문에 `(score_9:1.2)` 추가
3. 최종 프롬프트 확인
4. 일반형과 가중치형이 모두 존재하는지 확인

### 수정 제안
비교 전용 정규화 함수를 사용한다. 본문에 가중치 버전이 있으면 사용자가 지정한 가중치를 우선하고 고정 접두의 일반형을 제거하는 정책을 권장한다.

---

## 4. 갤러리 URL 중복 시 메타데이터와 삭제 상태가 어긋날 수 있음

[심각도: 중간 / 확인 필요]

### 위치
- `galleryAddImage`
- `galleryDeleteImage`
- `_galleryMeta`

### 증상
동일 URL이 갤러리에 두 번 들어오면 두 항목이 하나의 메타데이터 객체를 공유한다. 하나를 삭제하면 남은 동일 URL 항목의 메타데이터도 사라진다.

### 원인
목록은 배열이라 URL 중복을 허용하지만 메타데이터는 URL을 객체 키로 사용한다.

```js
_galleryUrls.unshift(url);
_galleryMeta[url] = { sec, pos, neg, seed };
```

삭제 시에는 첫 번째 배열 항목만 제거하지만 메타데이터는 URL 키 전체를 삭제한다.

```js
const i = _galleryUrls.indexOf(url);
_galleryUrls.splice(i, 1);
delete _galleryMeta[url];
```

### 재현
1. 같은 URL을 `galleryAddImage()`에 두 번 전달
2. 두 카드가 렌더링되는지 확인
3. 한 카드 삭제
4. 남은 카드의 시간·프롬프트·시드 메타가 사라지는지 확인

### 수정 제안
단순 구조에서는 URL 중복 자체를 차단하는 편이 적합하다.

```js
const old = _galleryUrls.indexOf(url);
if (old !== -1) _galleryUrls.splice(old, 1);
_galleryUrls.unshift(url);
```

---

# 추가 확인 메모

## BREAK 분할의 단일 초장문 태그

`_breakChunks()`는 쉼표로 나눈 태그 단위로만 이동하므로 태그 하나가 이미 75토큰을 넘으면 해당 청크는 그대로 75토큰을 초과한다. 태그 내부를 자르지 않는 것이 의도라면 버그는 아니다. 다만 UI의 “BREAK로 나누면 온전히 반영” 문구는 단일 초장문 태그에는 맞지 않으므로 별도 경고가 더 정확하다.

## 이번 회차 확인 범위

- BREAK 분할 및 토큰 경고
- 고정 접두 태그 적용과 중복 제거
- 모바일 패널 스와이프 상태 관리
- 모바일 롱프레스 컨텍스트 메뉴
- 라이브 바이너리 미리보기 Object URL
- 갤러리 URL·메타데이터 저장 및 삭제
- 백업 파일 Object URL 정리

## 다음 감사 권장 영역

- `importPromptToEditor` 전체 분류 경로
- 태그 DB 수정·삭제·이동과 인덱스 동기화
- 간편 조합 drag/drop 및 모바일 재정렬
- 레이아웃별 init/teardown 이벤트 정리
- 백업 복원 시 `appPrefs` 키 화이트리스트
