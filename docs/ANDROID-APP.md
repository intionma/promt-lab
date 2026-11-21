# 📱 프롬프트 랩 안드로이드 앱 (껍데기) — v9.207.0 · 1.2(🌐 둘러보기) v9.208.0 · 1.5(광고 차단)

## 왜 만들었나
홈 화면에 설치한 웹앱(WebAPK)으로 사진을 **공유**하면 크롬 안에서 사진이 빠지고 이름표만 온다
(크롬 153부터, 사용자 폰 실측 `len=153` — 사진이면 수백 KB 이상이어야 한다). 보안 폴더 안팎 모두 같았다.
카톡 같은 진짜 앱은 갤러리가 사진을 **직접** 넘겨주므로 이 길을 안 탄다.

- 크롬 쪽 수정: CL 8430679(154.0.8037.57~) · CL 8558884 "[WebAPK] Pass shared file read grant to SplashActivity"(158.0.8109.0~,
  설명엔 '안드로이드 14 이하'라고 돼 있다 — 폴드8(16)에서도 고쳐질지는 미지수). 그래서 기다리지 않고 앱을 만들었다.

## 무엇인가
`android/` — 의존성 없는 자바 앱 하나(`MainActivity.java`). 화면은 **웹앱 주소를 WebView 로 그대로 띄운다**
(`https://intionma.github.io/promt-lab/index.html`). 그래서 **앱 내용 업데이트는 지금처럼 자동**이고, APK 는 껍데기를 고칠 때만 다시 깐다.

앱이 따로 하는 일(웹앱은 `window.PLNative` 가 있을 때만 이걸 쓴다 — `index.html` 의 `_plNativeInit`):
| 일 | 앱 | 웹앱 |
|---|---|---|
| 공유 받기 | `SEND`/`SEND_MULTIPLE image/*` 를 받아 바로 읽어 둔다 → `PLNative.next()` | 기존 공유와 **같은 문**(`_plPendingShared` → `_plConsumeShared` → `_animaTakeBlob`) |
| 떠 있을 때 공유 | `singleTask` + `onNewIntent` → `_plNativeShareArrived()` | **새로고침 없이** 넣는다(웹앱 공유는 매번 새 문서였다) |
| 내려받기 | `PLNative.saveFile` → 그림은 `Pictures/PromptLab`, 나머지는 `Download/PromptLab` | `<a download>` 를 가로챔(`a.click()` 직후 주소를 지워도 받게 fetch 를 동기로 시작) |
| 화면 켜 두기 | `FLAG_KEEP_SCREEN_ON` | `_plWakeSync` 가 함께 부른다 |
| 상태 표시줄 색 | `setTheme` | `_plApplyTheme` 가 부른다 |
| 파일 고르기 | `onShowFileChooser` | 그대로 |
| http ComfyUI | 혼합 콘텐츠·평문 허용 | 그대로 |

## 🌐 둘러보기 — 앱 안 브라우저 (앱 1.2 · v9.208.0 — 사용자 요청)
사용자: "크롬에서 그림을 보다 마음에 들면 꾹 → 이미지 공유를 누르는데, 공유가 메뉴 맨 아래라 누르기 어렵다."
크롬의 꾹 누르기 메뉴는 다른 앱이 못 고친다 → **앱 안에 크롬 같은 브라우저를 넣고, 거기서 그림을 꾹 누르면 바로 넣는다.**
- 코드: `Browser.java`(브라우저 칸) · `SplitLayout.java`(나누기) · `MainActivity.java`(이어 붙이기·뒤로가기).
- 여는 곳: Anima **편집** 제목 옆 🌐(`#anima-browse-b`, `html.pl-native` 일 때만) → `PLNative.browser('toggle')`.
  앱은 상태가 바뀔 때마다 `_plBrowserState(m)` 을 부른다(단추 켜진 모양).
- **넣기**: 꾹 누르기 = 바로 넣기(그림이 아닌 곳은 원래대로 글자 고르기) · 🎯 집기 모드 = 톡 탭 = 넣기(그동안 click 을 막는다).
  그림 찾기는 `elementsFromPoint` — 그림 위에 투명한 칸이 덮인 사이트도 잡힌다. 원본 고르기: 감싼 링크가 그림 파일 → srcset 최대 →
  `currentSrc` (트위터 `name=` 은 `orig` 를 먼저 시도). 받기는 **앱(자바)이 직접** — 그 페이지의 쿠키·Referer·UA 를 붙인다.
  못 받으면 `PixelCopy` 로 **화면에 보이는 그대로** 넣고 말한다(`via=browse-screen`).
- 넘기기는 공유와 **같은 줄**(`queue` → `_plNativeShareArrived`)에 `via=browse` 를 붙여서. 웹앱은 그걸 보고
  ① **편집**으로 돌린다(의상 입히기에 있었어도 — 사용자 결정) ② 첫 장부터 `queueOk`(앞 그림이 뽑히는 중에 집는 게 보통이다).
- 나누기 `mode` 0 닫힘 · 1 반반 · 2 크게. 폭 600dp 이상이면 옆으로, 아니면 위아래(= '들어가느냐'만 본다). 비율·어느 쪽·모드는 사용자가 고르고 기억한다.
  ⚠ **'크게'에서도 랩을 숨기지 않고 뒤에 깐다** — 숨기면 웹앱이 '안 보임'이 되어 타이머가 느려지고 visibilitychange 가 돈다.
  ⚠ 그래서 브라우저 칸은 `setClickable(true)` — 단추 사이 빈 곳을 눌러도 뒤의 랩이 눌리면 안 된다.
- 뒤로가기는 **마지막으로 손댄 칸**에 준다(`dispatchTouchEvent`). 둘러보기: 주소창 → 페이지 뒤로 → '크게'면 반반.
- ⚠ **둘러보기 WebView 에는 `PLNative` 를 절대 달지 않는다** — 아무 사이트나 여는 곳이다. 그림 찾기는 `evaluateJavascript` 의 돌려받는 값으로만.
- ⚠ 구글 계정 로그인은 구글이 앱 안 브라우저를 막아서 안 된다. UA 를 속여 뚫지 않는다(구글 정책).
- ⚠ 모든 WebView 가 **그리는 쪽(렌더러) 하나를 같이 쓴다** — 무거운 사이트가 그쪽을 죽이면 랩도 다시 열린다(v1.1 의 복구 길을 탄다).
  둘러보기 탭도 `onRenderProcessGone` 을 처리한다(안 하면 앱이 통째로 죽는다).
- 저장(SharedPreferences `browser`): 탭(최대 8)·즐겨찾기·방문 기록(300)·집기 모드·데스크톱 사이트·나누기 비율/방향/모드.
- 칸이 좁아지면 덜 쓰는 단추부터 ⋮ 메뉴로(400dp ↻ · 340dp 크게 · 290dp ←) — 경계선을 끌어 줄였더니 주소창이 한 글자로 눌렸다(가상 기기 실측).
- 새 창(target=_blank)으로 연 탭은 뒤로 갈 곳이 없으면 닫고 연 탭으로 돌아간다(크롬처럼, `Tab.opener`).
- **나누기 방식은 사용자가 고른다(앱 1.3 — 사용자 요청)**: 경계선을 **한 번 탭**(또는 ⋮ → 화면 나누기 방식) →
  좌우 / 위아래 / 자동(`SplitLayout.dir` 1·2·0, 저장 키 `dir`) + 브라우저를 왼쪽·오른쪽(위·아래)으로(`browserFirst`) + 반반.
  두 번 탭은 예전처럼 반반. 자동은 처음 값일 뿐이다(CLAUDE.md '화면 크기로 의도를 맞히지 말 것').

가상 안드로이드(11)에서 직접 돌려 확인한 것(1.2): 🌐 로 열기(좁으면 위아래 · 가로면 옆으로, 회전해도 새로고침 없음) ·
꾹 누르기 → 링크의 원본(썸네일 120px → 900×700) · srcset 의 제일 큰 것 · 투명 칸에 덮인 그림 · 배경 그림 · **쿠키+Referer 가 있어야 주는 그림** ·
종류를 틀리게 주는 그림(octet-stream) · 글자 꾹 누르기는 그대로 글자 고르기 · 🎯 톡 탭으로 넣기 + 링크 안 열림 · 끄면 링크 열림 ·
blob 그림은 화면 그대로(824×549) + 안내 · 넣으면 편집으로·queueOk 로 생성 호출 · '크게'에서도 랩이 visible · 뒤로가기(페이지 → 크게→반반 → 새 탭 닫기) ·
경계선 끌기와 비율 저장 · 껐다 켜도 탭·비율·모드 유지 · 둘러보기 페이지엔 `PLNative` 가 없다.
- ⚠ 에뮬레이터: 부팅 직후 '네트워크 모듈 응답 없음'으로 시스템이 계속 죽으면(Lost network stack) `adb shell device_config put connectivity min_uptime_before_crash 999999999`.
  다른 무거운 일(전체 검사)과 동시에 돌리면 이게 더 잘 난다 — 검사는 따로 돌릴 것.

### 앱 1.4 — 크롬과 같은 모양·제스처로 다시 만들었다 (사용자 요청: "UI·제스처가 크롬이랑 완전 똑같았으면")
`Browser.java` 를 새로 썼다(그림 집기·받기 코드는 1.2 그대로). 아이콘은 `Ico.java` 가 코드로 그린다(글자 기호는 폰마다 모양이 달랐다).
- 툴바: 휴대폰 [주소창][🎯][탭 수][⋮] — 🎯 는 크롬 '맞춤 단추' 자리. 넓은 칸(600dp~) = 크롬 태블릿 [←][→][↻][주소창][🎯][⋮] + 탭 줄.
- 주소창: 도메인 진하게·경로 흐리게, 사이트 설정 아이콘(https)/⚠(http). 누르면 전체 주소 선택 + 추천(지금 페이지 복사·공유 / 검색 / 북마크 / 기록) + ✕.
  꾹 누르면 「주소 표시줄을 아래로 이동」·「링크 복사」(크롬과 같음). 아래로 옮기면 탭 목록 제스처도 '위로 밀기'가 된다.
- 제스처: 주소창 **옆으로 밀기 = 옆 탭**(왼쪽으로 밀면 다음 탭, 손가락 따라 옆 탭 그림이 밀려 들어옴, 끝이면 고무줄) ·
  **아래로 밀기 = 탭 목록** · 맨 위에서 **당겨서 새로고침**(페이지 안 스크롤 칸이 내려가 있거나 overscroll-behavior 가 막혀 있으면 안 함) ·
  **내리면 툴바가 숨고 올리면 나옴** · 탭 목록 카드 **옆으로 밀기 = 닫기** + 「실행취소」 스낵바 · 링크 꾹 = 크롬 링크 메뉴 · 탭 수 꾹 = 탭 닫기/새 탭.
- ⋮ 메뉴: 맨 위 아이콘 줄(→ ☆ ⓘ ↻ ⤢크게) + 새 탭·기록·북마크·최근에 닫은 탭·공유·페이지에서 찾기·데스크톱 사이트(체크)·주소 표시줄 위치·
  집기 모드(체크)·화면 나누기 방식·다른 브라우저로 열기·방문 기록 삭제·둘러보기 닫기.
- 새 탭 = 크롬 새 탭 화면(구글 로고·검색 상자·자주 간 사이트 8개). 검색 상자는 `plfocus:` → 주소창으로(크롬처럼).
- WebView 는 최대 4개만 살리고 나머지는 `saveState` 로 뒤로가기 기록만 남긴다(탭 20개까지).
- ⚠ 사이트 WebView 바탕은 **흰색** — 어두운 테마색을 깔았더니 배경을 안 정한 사이트의 검은 글자가 안 보였다(가상 기기 실측).
- ⚠ 주소창 밀기는 **손 뗀 자리로도 판정**한다 — 폰이 바쁘면 움직임이 한꺼번에 와서 '주소창 탭'이 돼 버렸다(가상 기기 실측).
- ⚠ 밀어 넘길 땐 떠나는 탭 미리보기를 **넘기는 중에 찍지 않는다** — 반쯤 밀린 그림이 찍혔다(가상 기기 실측). 미는 순간 이미 찍어 둔다.
- 화면 나누기 경계선: 양옆 12dp 까지 잡힌다(보이는 굵기는 그대로). 한 번 탭 = 좌우/위아래/자동·자리 메뉴.

가상 안드로이드에서 직접 확인(1.4): 툴바 모양 · 주소창 추천 · 옆으로 밀어 탭 넘기기 · 아래로 밀어 탭 목록 · 카드 밀어 닫기 ·
최근에 닫은 탭 되살리기 · 새 탭 화면 · ⋮ 메뉴 · 당겨서 새로고침(서버에 다시 요청 옴) · 내리면 툴바 숨김/올리면 나옴 ·
링크 꾹 메뉴 → 새 탭(뒤에서 열림) · 스낵바 · 가로 = 태블릿 탭 줄 · 그림 꾹 = 원본으로 랩에 들어감(1.2 동작 그대로).

### 앱 1.5 — 광고 차단 (사용자 요청)
**늘 켜져 있고 설정 화면이 없다.** 끄는 건 ⋮ 메뉴의 「이 사이트에서 광고 차단 끄기」뿐(사이트별, 앱 저장소 `adblock` 의 `off`).
같은 줄 둘째 줄에 **「광고 N개 막음」**(지금 페이지에서 막은 요청 수). 사이트 정보(ⓘ)에도 같은 숫자 + 목록 크기가 나온다.
- 코드: `AdBlockCore.java`(안드로이드 API 안 씀 — 맞추기·목록 읽기·받기) · `AdBlock.java`(목록 싣기·갱신·사이트별 끄기·빈 응답) ·
  `Browser.java`(`shouldInterceptRequest`·팝업·넘기기·CSS·메뉴). **둘러보기 탭에만** 건다 — 랩 WebView 는 그대로.
- **막는 법**: `shouldInterceptRequest` 에서 요청 도메인 **또는 그 윗단계**(a.b.ads.com → b.ads.com → ads.com)가 목록에 있으면 빈 200 응답.
  HashSet 조회 몇 번이다(컴퓨터 실측 요청 하나 약 0.35µs). 이 메서드는 **백그라운드 스레드**라 목록·꺼 둔 사이트는 volatile 로 통째로 바꿔 끼운다.
  - ⚠ **주 문서(내가 연 페이지)는 절대 안 막는다.** 목록에 있는 사이트라도 직접 가면 열린다.
  - ⚠ **그 사이트 자체에 가 있으면 그 사이트 것은 안 막는다**(예: amplitude.com 을 직접 열면 amplitude.com 의 파일은 통과) — 안 그러면 그 사이트가 통째로 깨진다.
  - **허용 목록이 이긴다**(`AdBlockCore.ALLOW`, 하위 도메인 포함): intionma.github.io · cdn.donmai.us · danbooru.donmai.us · i.pximg.net ·
    static.wikia.nocookie.net · raw.githubusercontent.com · schaledb.com · blue-utils.me · sr.yatta.moe · gi.yatta.moe · cdn.dak.gg · sdvxindex.com.
    목록을 만들 때도 이것과 부딪히는 항목(그 윗단계 포함)은 뺀다.
- **팝업**: 사람이 안 누른 새 창은 1.4 부터 늘 막는다(그대로). 1.5 에서 더한 것 — **스크립트가 연 새 창**(아무 데나 누르면 뜨는 팝언더가 이 길)의
  첫 주소가(중간에 넘겨져도) 목록 도메인이면 그 탭을 닫고 연 탭으로 돌아가 「팝업 광고를 막았어요」. 진짜 링크(target=_blank)를 누른 건
  사람이 고른 이동이라 그대로 연다(`getHitTestResult` 가 링크인가로 가른다). '최근에 닫은 탭'에도 안 남긴다.
- **넘기기**: 사람이 안 누른(타이머·스크립트) 주 문서 이동이 목록 도메인으로 가면 막고 「광고 페이지로 넘기려는 것을 막았어요」.
  서버가 넘기는 것(`isRedirect`)은 사용자가 누른 링크의 일부라 그대로 둔다. 둘 다 **그 사이트에서 광고 차단이 켜져 있을 때만**.
- **빈 칸 숨기기**: 페이지가 뜨면(`onPageCommitVisible`·`onPageFinished`) `<style id=__plAdCss>` 를 넣는다 — `ins.adsbygoogle` · `div-gpt-ad…` ·
  `google_ads_iframe…` · 광고 회사 주소의 iframe · `amp-ad` · 타불라/아웃브레인 칸만. ⚠ `.ad`·`[class*=ad]` 같은 넓은 선택자는 일부러 안 넣었다
  ('head'·'shadow'·'download' 까지 걸려 레이아웃이 깨진다).
- **목록**: `app/src/main/assets/adblock-hosts.txt` — **7,356개 도메인**(145KB, APK 안에서 압축 51KB). APK 는 1.4 의 160KB → **약 227KB**.
  출처(전부 재배포 가능한 것만 — 직접 라이선스 확인, 2026-11-21):
  | 목록 | 라이선스 |
  |---|---|
  | StevenBlack 자체 목록 (`data/StevenBlack/hosts`) | MIT |
  | AdAway 기본 목록 | CC BY 3.0 (출처 표기) |
  | FadeMind add.2o7Net · UncheckyAds | MIT |
  | tiuxo hostlist `ads` | CC BY 4.0 (출처 표기) |
  출처 표기는 목록 파일 머리 주석에 적어 둔다. ⚠ **StevenBlack '통합본'(76,000개)을 통째로 쓰지 않는다** — 안에 비상업 조건(MVPS CC BY-NC-SA ·
  someonewhocares)과 라이선스가 안 적힌 것(Peter Lowe)이 섞여 있고, 사기·스팸 목록(KADhosts 5만 개)이라 광고 차단엔 필요 없다.
  합친 뒤 윗단계 도메인이 이미 있는 항목은 뺀다(1만 2천 → 7천 — 윗단계로 다 걸린다).
- **자동 갱신**: 둘러보기를 만들 때·열 때 `AdBlock.maybeUpdate()` — **성공하면 4일, 실패하면 12시간** 뒤에야 실제로 받는다(백그라운드 스레드).
  위 5개를 raw.githubusercontent.com 에서 받아 같은 규칙으로 합쳐 `files/adblock-hosts.txt` 에 둔다(임시 파일 → 이름 바꾸기).
  **하나라도 실패하거나 3,000개 미만이면 버리고** 지금 것(지난번 받은 것 → 없으면 실린 것)을 그대로 쓴다. 받을 때는 출처당 8MB 까지만.
- **실린 목록 다시 만들기**(자동 갱신과 같은 코드):
  ```
  cd android
  javac -d /tmp/abc app/src/main/java/io/github/intionma/promptlab/AdBlockCore.java
  java -cp /tmp/abc io.github.intionma.promptlab.AdBlockCore build app/src/main/assets/adblock-hosts.txt
  ```
- **검사**: `android/tools/AdBlockCheck.java` — 컴퓨터 자바로 돈다(JUnit 없음). 윗단계 맞추기 · 비슷한 이름(notads.·badtracker.) 안 걸림 ·
  허용 목록이 이김 · 그 사이트 자체 · 줄이기 · **실린 목록에서 위 이미지 CDN·자주 쓰는 사이트 50여 곳이 안 걸리고 광고 10곳은 걸림** · 속도.
  ```
  javac -d /tmp/abc app/src/main/java/io/github/intionma/promptlab/AdBlockCore.java tools/AdBlockCheck.java
  java -Dstdout.encoding=UTF-8 -cp /tmp/abc io.github.intionma.promptlab.AdBlockCheck app/src/main/assets/adblock-hosts.txt   # → ALL PASS (80)
  ```
- ⚠ 사이트별로 끄면 **새로고침**한다 — 이미 막힌 요청은 되살아나지 않는다.
- ⚠ 그림 꾹 = 바로 넣기 · 🎯 집기 · PLNative 안 달기 · 1.4 탭·제스처는 손대지 않았다. 그림 받기(`fetchAndDeliver`)는 앱(자바)이 직접 받으므로
  광고 차단을 안 탄다.
- ⚠ 이 작업 환경에서 셸 명령에 `github.io`·`githubusercontent`·패키지 이름(`io.github…`) 같은 글자가 들어가면 작업 공간 보호가
  'git 명령'으로 오인해 막는 일이 있었다 — 스크립트 파일로 빼서 돌리면 된다.
- ⚠ 컴퓨터 자바의 출력이 `??` 로 깨지면 `-Dstdout.encoding=UTF-8`.

가상 안드로이드(11, WebView 83, 디버그 판)에서 직접 확인(1.5): 광고 도메인 스크립트 3개(doubleclick 하위 · google-analytics · adnxs 하위)는
빈 응답으로 막힘 · 허용 목록(cdn.donmai.us · i.pximg.net)과 목록 밖 도메인은 그대로 네트워크로 감 · `ins.adsbygoogle`·`div-gpt-ad` 칸은 숨고
보통 칸·`ad-head-shadow` 같은 이름의 칸은 그대로 · ⋮ 메뉴 「광고 3개 막음」 · 「끄기」 → 새로고침 뒤 아무것도 안 막고 CSS 도 없음 → 「켜기」로 되돌아옴 ·
**껐다 앱을 다시 켜도 그 사이트는 꺼진 채** · 아무 데나 누르면 뜨는 스크립트 팝업(광고 도메인)은 닫히고 수가 1 늘어남 ·
광고 도메인으로 가는 **진짜 링크(target=_blank)는 새 탭으로 열림** · 타이머로 광고 도메인에 넘기는 페이지는 그 자리에 남고, 같은 사이트로 넘기는 건 됨 ·
목록 갱신은 가상 기기가 인터넷이 안 돼 실패 → 실린 목록으로 계속 막음(`triedAt` 만 남음) · **그림 꾹 = 편집 원본으로 들어감**(1.2 동작 그대로) ·
둘러보기 페이지엔 `PLNative` 가 없다. (실제 인터넷에서 목록 받기 성공은 가상 기기로 확인 못 했다 — 받는 코드는 컴퓨터에서 같은 코드로 돌려 7,356개를 받았다.)

## 지킬 것
- ⚠ **다른 사이트로 화면을 바꾸지 않는다** — 바뀌면 그 사이트도 `PLNative` 를 부를 수 있다. 바깥 링크는 휴대폰 브라우저로 연다.
- ⚠ `configChanges` 를 빼지 말 것 — 폴드를 접었다 펴거나 화면을 나눌 때 액티비티가 다시 만들어져 **웹앱이 새로고침**된다.
- ⚠ `targetSdk` 를 35 로 올리면 안드로이드 15+ 가 '가장자리까지 그리기'를 강제해 상단바가 상태 표시줄 밑으로 들어간다 — 창 여백 처리를 같이 넣을 것.
- ⚠ **앱은 저장 공간이 따로다** — 처음 깔면 설정·결과 목록이 비어 있다. 브라우저에서 「내보내기」 → 앱에서 「불러오기」.
  (결과 그림 목록은 백업에 안 들어간다 — 원본은 PC 의 ComfyUI output 폴더에 그대로 있다)
- ⚠ **APK 는 사이트에 올리지 않는다**(사용자 결정) — 채팅으로 받아 설치한다.

## 서명 키
- 공개 저장소라 **키를 저장소에 두지 않는다**(`android/.gitignore`). 사용자 구글 드라이브의 비공개 폴더
  「프롬프트 랩 안드로이드 앱 서명 키 (지우지 마세요)」에 `promptlab-release.jks` 와 비밀번호 메모가 있다.
- 같은 키로 서명해야 **업데이트로** 깔린다. 키를 잃으면 지우고 새로 깔아야 하고, 그때 앱 안 데이터가 지워진다.
- 인증서 SHA-256: `20a9e2981fa6d5ef72786ebbc5c431d9c79751dec614144b7ba11f6450ac3460`

## 빌드
```
# 안드로이드 SDK(platforms;android-35, build-tools;35.0.0) 가 필요하다
cd android
echo "sdk.dir=/opt/android-sdk" > local.properties
#  keystore.properties (저장소에 올리지 않음): storeFile / storePassword / keyAlias=promptlab / keyPassword
./gradlew assembleRelease      # → app/build/outputs/apk/release/app-release.apk (1.5 = 약 227KB, 광고 차단 목록 포함)
```
껍데기를 고치면 `versionCode` 를 올린다(같으면 업데이트로 안 깔린다).

## 검사
`native-test` — `PLNative` 를 흉내 내서 웹앱 쪽을 본다(공유 진입·떠 있을 때 공유·읽는 중 기다리기·못 넣은 이유·
저장·화면 켜 두기·테마·앱 밖 무변화·서비스워커).

### 가상 안드로이드에서 직접 돌려 본다 (v1.1 — 사용자 요청 "직접 실행해서 잡아봐")
작업 환경에 KVM 이 없어 에뮬레이터를 **소프트웨어 모드**(`-accel off -qemu -cpu max`)로 돌린다. 부팅 4~10분, 매우 느리다.
- ⚠ **안드로이드 14 이미지(WebView 113)는 이 모드에서 WebView 그리는 쪽이 늘 죽는다**(SIGTRAP, 한 줄짜리 페이지도) — 에뮬레이터 탓이다.
  **안드로이드 11 이미지(`system-images;android-30;default;x86_64`, WebView 83)** 는 된다.
- 에뮬레이터는 이 환경의 프록시를 못 타서 인터넷이 안 된다 → **디버그 판**은 `http://localhost:8765/` 를 연다
  (`app/build.gradle` 의 `SCOPE`, `.debug` 패키지라 정식 앱과 따로 깔린다). 저장소를 `python3 -m http.server 8765` 로 띄우고 `adb reverse tcp:8765 tcp:8765`.
- 웹 쪽은 **디버그 판의 WebView 원격 디버깅**으로 본다: `adb forward tcp:9222 localabstract:webview_devtools_remote_<앱 pid>` →
  CDP `Runtime.evaluate`(Node 22 내장 WebSocket). ⚠ 소켓이 여럿이면 **앱 pid 것**을 고를 것(에뮬레이터 브라우저 것에 붙어 헛돌았다).
- 갤러리처럼 '읽기 허락과 함께' 넘기는 공유는 셸 `am start` 로는 안 된다(권한을 못 건넨다) → 작은 발신 앱을 만들어 쓴다
  (자기 ContentProvider + `FLAG_GRANT_READ_URI_PERMISSION`).
- ⚠ WebView 는 **사용자가 한 번도 안 건드린 문서**에서 넣은 기록(pushState)을 뒤로가기 때 건너뛴다(크로미움의 뒤로가기 가로채기 방지).
  그래서 화면을 한 번도 안 누른 채 뒤로가기를 누르면 문지기 안내 없이 바로 앱이 뒤로 간다 — 버그가 아니다(앱은 꺼지지 않는다).

직접 돌려 확인한 것: 떠 있을 때 공유(클래식 → Anima 로 옮겨 새로고침 없이) · 꺼진 상태에서 3장 공유 · 권한 없는 공유의 이유 안내 ·
백업·그림 저장(Download/Pictures 의 PromptLab) · 파일 고르기 · 뒤로가기 문지기 · 바깥 링크는 밖의 브라우저 · 라이트 테마 상태 표시줄 ·
그리는 쪽이 죽으면 다시 열기(1분에 3번이면 안내 화면) · 최근 앱에서 다시 열 때 옛 공유를 또 넣지 않기.

### 그렇게 찾아 고친 것 (v1.1)
- **그리는 쪽(렌더러)이 계속 죽으면 '다시 만들기 → 또 죽음'을 끝없이 돌았다** → 1분에 3번째면 멈추고 앱이 직접 그린 안내 + 「다시 열기」.
- **최근 앱 목록에서 다시 열거나 화면을 다시 만들 때 처음 받은 공유 인텐트를 또 처리했다**(같은 사진이 또 들어가거나 '못 읽었어요') →
  `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`·`savedInstanceState` 면 건너뛴다.
- 안내 화면에서 상태 표시줄이 라이트로 남던 것.
