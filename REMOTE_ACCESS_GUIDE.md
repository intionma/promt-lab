# 폰에서 프롬프트 랩 쓰기 — 원격 사용 가이드

> **상태: 적용 완료 (2026-07-25) · 정상 동작 확인**
> PC를 켜두면 폰에서 **어디서든**(LTE·5G·외부 WiFi) 생성하고, **원격으로 PC를 끌 수도** 있다.
>
> 이후 세션(다른 Claude 포함)이 현재 구성을 바로 파악하도록 남기는 문서다.

---

## 0. 현재 구성 요약

| 항목 | 내용 |
|---|---|
| PC | Windows · **유선(랜선)** · ComfyUI Windows Portable |
| 공유기 | iptime(거실). PC가 유선이라 WoL은 가능하나 **미설정** |
| 연결 | **Tailscale** (메시 VPN, 무료) — 공개 노출 없이 내 기기끼리만 |
| 앱 | GitHub Pages `https://intionma.github.io/promt-lab/` — **수정 불필요** |
| 비용 | **0원** |

### 왜 Tailscale인가
- 예전엔 `http://192.168.0.3:8188`(사설 IP)이라 **폰이 집 WiFi에 붙어야만** 했고, 그 WiFi가 느리고 자주 끊겼다.
- Tailscale은 **집 WiFi를 거치지 않는다**(폰=LTE, PC=랜선) → 실제로 체감 속도 개선 확인됨.
- **https**라서 아이폰 혼합 콘텐츠 차단 문제도 함께 해결(6장).
- 주소가 **고정**이고 공개 인터넷에 노출되지 않는다(`tailnet only`).

---

## 1. Tailscale 설정 (완료됨)

### 최초 1회
1. [tailscale.com](https://tailscale.com) 가입(Google 등 소셜 로그인)
2. PC에 설치 → 로그인
3. ⚠️ **[login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns) → `HTTPS Certificates` 활성화**
   → **빼먹으면 아래 `serve`가 인증서 오류로 실패한다. 가장 흔한 실수.**
4. 폰에 Tailscale 앱 설치 → **같은 계정** → VPN 토글 ON
   - 갤럭시: `설정 → 앱 → Tailscale → 배터리 → 제한 없음` (절전으로 끊기는 것 방지)

### 포트 노출 (관리자 PowerShell, 각 1회)
```powershell
tailscale serve --bg 8188                  # ComfyUI
tailscale serve --bg --https=8443 8189     # 종료 도우미
```

확인:
```powershell
tailscale serve status
```
```
https://<PC이름>.<테일넷>.ts.net:8443 (tailnet only)   |-- / proxy http://127.0.0.1:8189
https://<PC이름>.<테일넷>.ts.net      (tailnet only)   |-- / proxy http://127.0.0.1:8188
```

> **serve 설정은 재부팅해도 유지**된다. 다시 칠 필요 없음.
> `serve`(내 기기끼리·비공개) ↔ `funnel`(인터넷 전체 공개) — 반드시 **serve**를 쓸 것.
> 실제 주소는 저장소에 적지 않는다(기기명·테일넷 노출 방지). 필요하면 위 명령으로 확인.

---

## 2. 배치파일 (최종본 · 이게 정답)

ComfyUI 포터블 폴더에 저장. **ComfyUI + 종료 도우미를 한 번에** 띄운다.

```bat
@echo off
cd /d "<ComfyUI 포터블 폴더 경로>"

if not exist "python_embeded\python.exe" (echo [X] python_embeded\python.exe 를 못 찾음 & pause & exit /b)
if not exist "shutdown_server.py" (echo [X] shutdown_server.py 를 못 찾음 & pause & exit /b)

start "" "%CD%\python_embeded\python.exe" "%CD%\shutdown_server.py"

"%CD%\python_embeded\python.exe" -s "%CD%\ComfyUI\main.py" --windows-standalone-build --disable-auto-launch --enable-cors-header --listen
echo If you see this and ComfyUI did not start try updating your Nvidia Drivers to the latest. If you get a c10.dll error you need to install vc redist that you can find: https://aka.ms/vc14/vc_redist.x64.exe
pause
```

### 각 요소가 왜 필요한가 (⚠️ 삽질 기록 — 같은 실수 반복 금지)

| 요소 | 이유 |
|---|---|
| `cd /d "<경로>"` | 다른 위치에서 실행하면 동작하지 않음 |
| **`%CD%` (사용자 변수 대신)** | `set "ROOT=..."` 방식은 변수가 비면 경로가 `\python_embeded\...`가 되어 실패. **`cd /d` 직후의 `%CD%`는 절대 비지 않는다** ← 실제로 이것 때문에 계속 실패했음 |
| **`start ""` (빈 제목)** | `start "종료도우미"`처럼 한글 제목을 쓰면 파싱이 깨질 수 있음. 빈 제목이 표준 안전형 |
| **`if not exist` 사전 검사** | `start`는 실행 파일을 못 찾으면 **에러 없이 빈 CMD 창만** 띄운다 → 원인 파악 불가. 미리 검사해 화면에 이유를 띄운다 |
| `--enable-cors-header` | **필수.** 없으면 github.io에서 접근 차단 |
| `--disable-auto-launch` | 실행할 때마다 크롬으로 ComfyUI 창이 뜨는 것 방지 |
| `--listen` | 집 랜에서 `192.168.x.x:8188` 직접 접속용. Tailscale만 쓸 거면 빼도 되고, 빼면 더 안전 |

### 자동 실행
`Win + R` → `shell:startup` → 이 배치파일의 **바로가기** 넣기 (하나로 둘 다 실행됨)

> PowerShell에서 경로를 쓸 땐 **반드시 따옴표**로 감쌀 것 — 경로에 `#`이 있으면 PowerShell이 주석으로 처리해 뒤를 통째로 무시한다.

---

## 3. 원격 PC 종료 · 종료 예약

### 스크립트 받기 (앱이 만들어 준다)
앱 메뉴 → **`PC 종료`**

1. **주소** `https://<PC이름>.<테일넷>.ts.net:8443` · **토큰** 입력(아무 문자열)
2. `종료 도우미 스크립트` 펼치기 → **[shutdown_server.py 받기]**
   → **입력한 토큰이 이미 박힌 파일**이 받아진다. **열어서 고칠 필요 없음** (v9.63.1~)
3. 받은 `shutdown_server.py`를 **ComfyUI 포터블 폴더**에 넣기
4. 배치파일 재실행 → 창 2개(ComfyUI + `종료 도우미 v2 실행 중 — 포트 8189…`)
5. 앱에서 **[연결 확인]** → 초록불

### 기능
- **즉시 종료**
- **예약 종료**: 15분 / 30분 / 1시간 / 2시간 → 상단바에 카운트다운, 거기서 **취소** 가능

### 앱 ↔ 도우미 규약 (개발 참고)
| 호출 | 용도 |
|---|---|
| `GET /ping` | 연결 확인 (종료하지 않음) |
| `POST /shutdown?token=…&delay=<초>` | 즉시/예약 종료 |
| `POST /cancel?token=…` | 예약 취소 |
| `OPTIONS` | CORS 사전 요청 |

- 스크립트 원본: `index.html`의 `_SHUTDOWN_SCRIPT` (v2)
- 토큰 자동 주입 `_shutdownScriptText()` · 파일 다운로드 `downloadShutdownScript()`
- 로컬 수신 포트는 **8189 고정**. 앱 주소가 사설망(192.168 등)이면 그 포트를 반영하고,
  터널 주소면 8189를 유지한다(터널이 `:8443` → `8189`로 전달하므로).

---

## 4. 매일 쓰는 흐름

1. PC 켜두고 나감 (배치파일 실행 상태)
2. 폰: **Tailscale 토글 ON** → 프롬프트 랩 열기 → 생성
3. 끝나면 앱 메뉴 → **PC 종료** (또는 예약)

---

## 5. 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| `tailscale serve`가 인증서 오류 | **admin/dns에서 HTTPS Certificates 미활성화** (가장 흔함) |
| 빈 CMD 창만 뜨고 도우미가 안 켜짐 | `start`가 경로를 못 찾음 → **2장 배치파일(`%CD%` + 빈 제목 + 사전 검사)** 사용 |
| 실행할 때마다 크롬이 열림 | `--disable-auto-launch` 추가 |
| 연결은 되는데 생성 시 CORS 오류 | `--enable-cors-header` 누락 |
| 폰에서 주소를 못 찾음 | Tailscale 토글 OFF 이거나 **다른 계정**으로 로그인 |
| 잘 되다가 자꾸 끊김 | 폰 배터리 최적화 예외 미설정 |
| 종료 도우미가 안 잡힘 | ① 도우미 창이 떠 있는지(**파일을 받아만 두면 안 되고 실행**해야 함) ② 주소에 **`:8443`** 붙였는지 ③ 토큰 일치(파일을 새로 받으면 자동 일치) — v9.166.0부터 **[연결 확인]이 8443·8189를 대신 두드려 보고 주소를 자동으로 고쳐 준다** |
| "구버전 도우미"라고 떴었다 | v9.166.0 이전의 **오진**이다. 아무 서버나 응답만 하면 도우미로 쳤고, **ComfyUI 주소를 넣어 두면 도우미가 없는데도 「연결됨」**으로 보였다. 지금은 `/ping` 본문의 서명(`promptlab-shutdown`)을 확인한다 |
| https 앱에서 `http://` 주소가 안 됨 | 브라우저가 막는다(혼합 콘텐츠). **localhost·127.0.0.1만 예외.** 밖에서 쓰려면 반드시 `tailscale serve --https=8443` 을 거친 **https 주소**를 쓸 것 |
| 도우미 단독 테스트 | PC 브라우저에서 `http://127.0.0.1:8189/ping` → `promptlab-shutdown v2` |

---

## 6. 아이폰 (참고)

- 갤럭시(크롬)는 자물쇠 🔒 → 사이트 설정 → "안전하지 않은 콘텐츠 허용"로 http ComfyUI 직접 연결이 됐다.
- **iOS Safari에는 그 토글이 없다**(iOS는 모든 브라우저가 WebKit 강제) → 아이폰은 **https 터널이 사실상 필수**.
  위 Tailscale 구성이면 자동 해결된다.

---

## 7. 폰에서 직접 생성은 불가능 (조사 결론)

앱이 쓰는 모델 구성:
```
UNET  : Anima-Comradeship-v1T19H   ← Cosmos Predict 2.5 (2B) 계열
CLIP  : qwen_3_06b_base            ← Qwen3 0.6B
VAE   : qwen_image_vae             ← Qwen-Image VAE
핵심  : ApplyCosmosReferenceModelPatch / CosmosReferenceConditioning
```
**세 계열을 섞은 커스텀 파이프라인**이라 모바일 런타임이 지원하지 않는다.

- **ComfyUI는 폰 GPU/NPU를 쓸 수 없다** — ComfyUI = PyTorch, Android PyTorch는 **CPU 전용**.
  PyTorch Vulkan 백엔드는 공식 문서상 "이항 산술 연산자만 GPU, 나머지는 CPU 폴백 → 느릴 것으로 예상".
- Termux로 ComfyUI는 돌지만 **CPU 전용 → 한 장 수십 분** (갤럭시 One UI 8.x는 big 코어 미사용 버그도 보고됨).
- 폰 GPU/NPU를 쓰는 런타임(`stable-diffusion.cpp` Vulkan, Local Dream QNN)은 **SD1.5/SDXL/SD3만** 지원 → Cosmos 미지원.

> 폰 단독으로 가려면 SDXL 계열로 갈아타야 하고, 그러면 **Anima 편집(원본 참조) 기능 자체를 포기**해야 한다. 사실상 새 프로젝트.

### 무료 클라우드도 부적합
- **Colab 무료**: SD WebUI/Gradio 계열 차단. ComfyUI 노트북은 유료 계정 필요.
- **Kaggle**: 주 30시간 + 개인 데이터셋 200GB로 스펙은 좋으나 **커널 터널링이 차단·약관 위반(계정 정지 사유)**.
- **Lightning AI 무료**: 월 15크레딧 + 영구 스토리지 100GB로 무료 중엔 최선이나 **4시간마다 수동 재시작**, 성인 콘텐츠 정책 미확인.

---

## 8. 대안: 클라우드 GPU (PC를 아예 안 쓸 때)

RunPod + **네트워크 볼륨**에 모델을 올려두고 쓸 때만 파드를 켠다. 앱 수정 **0**(https 주소만 입력).

| 항목 | 비용 |
|---|---|
| RTX 4090(커뮤니티) / A5000 | 시간당 $0.34 / $0.27 |
| 네트워크 볼륨 | $0.05/GB·월 |

> ⚠️ 파드를 **"정지(stop)"만 하면 스토리지가 2배($0.20/GB·월)로 계속 청구**된다. 반드시 **terminate** 후 네트워크 볼륨만 남길 것.
> ⚠️ RunPod **서버리스**는 ComfyUI 순정 API(`/prompt`·`/ws`)가 아니라 전용 API(base64)라서 **앱의 실시간 진행률·미리보기·대기열을 전부 고쳐야 한다.**

### 정책(성인 콘텐츠)
- RunPod: 약관에 NSFW 허용/금지 명시 없이 **콘텐츠 책임은 사용자**.
- Vast.ai: 공개된 명시적 정책 확인 안 됨.
- 공통: **ComfyUI를 인증 없이 공개 인터넷에 노출하지 말 것.**

---

## 참고 링크

- [PyTorch Vulkan Backend](https://docs.pytorch.org/tutorials/unstable/vulkan_workflow.html) · [ExecuTorch Vulkan](https://docs.pytorch.org/executorch/1.0/android-vulkan.html)
- [local-dream (Snapdragon NPU)](https://github.com/xororz/local-dream) · [COMFYUI-ANDROID-TERMUX](https://github.com/KintCark/COMFYUI-ANDROID-TERMUX)
- [termux #5035 — One UI 8.x big core 미사용](https://github.com/termux/termux-app/issues/5035)
- [RunPod Network volumes](https://docs.runpod.io/storage/network-volumes) · [RunPod pricing](https://hackceleration.com/labs/runpod-pricing)
- [Colab SD WebUI 차단(HN)](https://news.ycombinator.com/item?id=35653698) · [Kaggle 200GB](https://www.kaggle.com/product-announcements/512322)
- [Lightning AI 무료 플랜](https://aicreditmart.com/ai-credits-providers/lightning-ai-free-plan-22-gpu-hours-month-guide-2026/)
