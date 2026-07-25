# 폰에서 프롬프트 랩 쓰기 — 원격 사용 가이드

> 작성: 2026-07-25 · 상태: 미적용(계획)
> 목적: **PC 앞에 앉지 않고** 폰에서 Anima 편집을 쓰기 위한 방법 정리

---

## 0. 결론 요약

| 방법 | 가능? | 비용 | 앱 수정 |
|---|---|---|---|
| **스마트 플러그로 PC 켜기** ⭐ | ⭕ | 1~2만원(1회) | 없음 |
| 클라우드 GPU (RunPod 등) | ⭕ | 시간당 $0.27~0.34 | 없음 |
| 폰에서 직접 생성 | ❌ | — | — |
| 무료 클라우드(Colab/Kaggle) | ❌/⚠️ | 무료 | — |

**추천: 스마트 플러그 + Tailscale.** 월 유지비 0원, 앱 수정 0.

---

## 1. 왜 폰에서 직접은 안 되는가

앱이 쓰는 모델 구성(코드 확인 결과):

```
UNET  : Anima-Comradeship-v1T19H   ← Cosmos Predict 2.5 (2B) 계열
CLIP  : qwen_3_06b_base            ← Qwen3 0.6B (텍스트 인코더)
VAE   : qwen_image_vae             ← Qwen-Image VAE
핵심  : ApplyCosmosReferenceModelPatch / CosmosReferenceConditioning
```

**서로 다른 세 계열을 섞은 커스텀 파이프라인**이라 모바일 런타임이 지원하지 않는다.

- **ComfyUI는 폰 GPU/NPU를 쓸 수 없다.** ComfyUI = PyTorch이고, Android PyTorch는 **CPU 전용**.
  PyTorch Vulkan 백엔드는 존재하지만 공식 문서상 "이항 산술 연산자만 GPU에서 실행, 나머지는 CPU 폴백 → 느릴 것으로 예상"이라 Diffusion에는 못 쓴다.
- Termux로 ComfyUI를 깔면 돌긴 하나 **CPU 전용 → 한 장에 수십 분**.
  (갤럭시 One UI 8.x는 Termux 워크로드에 big 코어를 붙이지 않는 버그도 보고됨)
- 폰 GPU/NPU를 쓰는 런타임(`stable-diffusion.cpp` Vulkan, Local Dream QNN)은
  **SD1.5 / SDXL / SD3 만 지원** → **Cosmos 아키텍처 미지원 → Anima 못 씀**.

> 폰 단독으로 가려면 모델을 SDXL 계열로 갈아타야 하고, 그러면
> **"원본을 참조해 다시 그리는" Anima 편집 기능 자체를 포기**해야 한다. 사실상 새 프로젝트.

### 무료 클라우드가 안 되는 이유
- **Google Colab 무료**: SD WebUI/Gradio 계열을 무료 티어에서 차단. ComfyUI 노트북은 유료 계정 필요.
- **Kaggle**: 주 30시간 무료 GPU + 개인 데이터셋 200GB로 스펙은 좋으나,
  **커널 터널링이 차단·약관 위반(계정 정지 사유)**. 성인 콘텐츠 모델 업로드도 정책 위반 소지.
- **Lightning AI 무료**: 월 15크레딧 + **영구 스토리지 100GB**로 무료 중엔 가장 현실적.
  단 **4시간마다 수동 재시작**, 중단형(interruptible). 성인 콘텐츠 정책은 미확인.

---

## 2. 왜 스마트 플러그인가

- 우리 공유기는 **iptime + PC가 거실 공유기와 유선 연결 아님 → WoL(Wake-on-LAN) 불가**
- 스마트 플러그는 **네트워크 설정을 전혀 건드리지 않고**, 밖에서도 100% 동작

---

## 3. 1회 세팅

### ① BIOS — AC 전원 복구 시 자동 부팅
부팅 시 `Del` 또는 `F2` → 아래 항목을 **Power On**으로. 보통 `Advanced → APM Configuration`.

| 메인보드 | 항목 이름 |
|---|---|
| ASUS | `Restore AC Power Loss` |
| MSI | `Restore after AC Power Loss` |
| GIGABYTE | `AC BACK` |
| ASRock | `Restore on AC/Power Loss` |

→ **전기가 들어오는 순간 PC가 켜진다.**

### ② 스마트 플러그
⚠️ **정격 16A / 3680W** 제품으로. (10A/2200W는 게이밍 PC엔 위험)

### ③ Windows 자동 로그인
암호가 걸려 있으면 로그인 화면에서 멈춰 ComfyUI가 실행되지 않는다.

`Win+R` → `netplwiz` → **"사용자 이름과 암호를 입력해야 함" 체크 해제** → 암호 입력

> ⚠️ 보안 트레이드오프: 누구든 PC를 켜면 바로 쓸 수 있게 된다.
> 원치 않으면 ③을 건너뛰고, 대신 원격 데스크톱으로 로그인만 해주는 방식을 쓴다.

### ④ ComfyUI + 종료 도우미 자동 실행

`시작.bat`:
```bat
@echo off
cd /d C:\ComfyUI
start "" python main.py --enable-cors-header "https://intionma.github.io"
start "" python 종료도우미.py
```

- `--enable-cors-header` **필수** — 없으면 github.io에서 접근 차단됨
- `--listen`은 **넣지 않는다** — 아래 터널이 처리하며, 안 넣는 게 더 안전

`Win+R` → `shell:startup` → 이 폴더에 **`시작.bat` 바로가기** 넣기

### ⑤ Tailscale — 고정 https 주소 (무료)

[tailscale.com](https://tailscale.com) 설치 → PC·폰 **같은 계정** 로그인 → PC에서 한 번만:

```powershell
tailscale serve --bg 8188
tailscale serve --bg --https=8443 8189
```

생성되는 **고정 주소**(안 바뀜):
- ComfyUI → `https://내PC이름.테일넷.ts.net`
- 종료 도우미 → `https://내PC이름.테일넷.ts.net:8443`

Tailscale은 서비스로 등록되어 **부팅 시 자동 실행**. 앱에 주소는 **한 번만** 입력하면 저장된다.

> 💡 Tailscale을 고른 이유
> 1. 공개 인터넷에 노출되지 않고 **내 기기끼리만** 연결 (성인 콘텐츠라 중요)
> 2. **https**라서 아이폰 혼합 콘텐츠 차단 문제도 동시 해결
> 3. 주소가 고정 (trycloudflare 임시 주소는 매번 바뀜)

---

## 4. 매일 쓰는 흐름

1. 폰에서 **스마트 플러그 ON**
2. **2~3분 대기** (부팅 + ComfyUI 로딩)
3. **Tailscale 앱 ON** → 프롬프트 랩 열기 → 생성
4. 끝나면 앱 메뉴 → **PC 종료** (도우미 스크립트 필요)
5. 몇 초 뒤 **플러그 OFF**

---

## 5. 아이폰 관련 (참고)

- 갤럭시(크롬)는 자물쇠 🔒 → 사이트 설정 → "안전하지 않은 콘텐츠 허용"으로 http ComfyUI 직접 연결이 됐다.
- **iOS Safari에는 그 토글이 없다** (iOS는 모든 브라우저가 WebKit 강제).
  → 아이폰은 **https 터널이 사실상 필수**. 위 Tailscale 세팅이면 자동 해결.

---

## 6. 남은 일

- [ ] 스마트 플러그 구매 (16A/3680W)
- [ ] BIOS `AC 전원 복구 시 부팅` 설정
- [ ] Windows 자동 로그인 여부 결정
- [ ] `시작.bat` + 시작 프로그램 등록
- [ ] Tailscale 설치 및 `serve` 설정
- [ ] **종료 도우미 스크립트 확보** — 앱의 `PC 종료` 기능이 요구하는 주소·토큰 형식에 맞는 스크립트.
      없으면 앱 코드(`openShutdownModal`, 기본 포트 `8189`, 토큰)에 맞춰 새로 작성 필요.

---

## 7. 대안: 클라우드 GPU (PC를 아예 안 쓸 때)

RunPod + **네트워크 볼륨**에 모델을 한 번 올려두고, 쓸 때만 파드를 켠다.

| 항목 | 비용 |
|---|---|
| RTX 4090 (커뮤니티) | $0.34/시간 |
| RTX A5000 | $0.27/시간 |
| 네트워크 볼륨 | $0.05/GB·월 |

- 앱 수정 **0** (https 주소만 넣으면 됨)
- 하루 1시간 사용 시 대략 **월 $10~13 + 스토리지 $1**

> ⚠️ **함정**: 파드를 **"정지(stop)"만 하면 스토리지가 2배($0.20/GB·월)로 계속 청구**된다.
> 200GB 방치 시 월 $40. 반드시 **terminate**하고 **네트워크 볼륨만** 남길 것.

> ⚠️ RunPod 서버리스는 유휴 비용이 0이지만, ComfyUI 순정 API(`/prompt`·`/ws`)가 아니라
> RunPod 전용 API(base64 반환)라서 **앱의 실시간 진행률·미리보기·대기열을 전부 고쳐야 한다.**

### 정책(성인 콘텐츠)
- RunPod: 약관에 NSFW 허용/금지를 명시하지 않고 **콘텐츠 책임은 사용자**에게 둔다.
- Vast.ai: 공개된 명시적 정책 확인 안 됨. 인프라 제공자로 보고 본인 책임.
- 관리형 서비스(RunComfy 등)는 더 엄격한 경향 + 커스텀 모델 업로드 제약.
- 공통: **ComfyUI를 인증 없이 공개 인터넷에 노출하지 말 것.**

---

## 참고 링크

- [PyTorch Vulkan Backend User Workflow](https://docs.pytorch.org/tutorials/unstable/vulkan_workflow.html)
- [ExecuTorch Vulkan Backend](https://docs.pytorch.org/executorch/1.0/android-vulkan.html)
- [local-dream — Snapdragon NPU](https://github.com/xororz/local-dream)
- [COMFYUI-ANDROID-TERMUX](https://github.com/KintCark/COMFYUI-ANDROID-TERMUX)
- [termux #5035 — One UI 8.x big core 미사용](https://github.com/termux/termux-app/issues/5035)
- [RunPod Network volumes](https://docs.runpod.io/storage/network-volumes)
- [RunPod pricing 정리](https://hackceleration.com/labs/runpod-pricing)
- [Google Colab SD WebUI 차단 (HN)](https://news.ycombinator.com/item?id=35653698)
- [Kaggle 개인 데이터셋 200GB](https://www.kaggle.com/product-announcements/512322)
- [Lightning AI 무료 플랜](https://aicreditmart.com/ai-credits-providers/lightning-ai-free-plan-22-gpu-hours-month-guide-2026/)
