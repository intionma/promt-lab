# 폰에서 프롬프트 랩 쓰기 — 원격 사용 가이드

> 작성: 2026-07-25 · 상태: 미적용(계획)
> 목표: **PC를 켜두고 나가면 폰에서 어디서든** Anima 편집을 쓸 수 있게 한다.

---

## 0. 결론

**Tailscale 하나만 설치하면 끝.** 스마트 플러그·포트포워딩·BIOS 설정 전부 불필요.

| 방법 | 가능? | 비용 | 앱 수정 |
|---|---|---|---|
| **Tailscale** ⭐ (PC 켜두고 나가기) | ⭕ | **무료** | 없음 |
| Tailscale + WoL (PC 꺼두고 나가기) | ⭕ | 무료 | 없음 |
| 클라우드 GPU (RunPod 등) | ⭕ | 시간당 $0.27~0.34 | 없음 |
| 폰에서 직접 생성 | ❌ | — | — |
| 무료 클라우드(Colab/Kaggle) | ❌/⚠️ | 무료 | — |

---

## 1. 현재 구조와 문제

- **PC: 유선(랜선)으로 공유기에 연결** — 안정적
- 공유기: iptime (거실)
- 지금 접속 방식: 앱에 `http://192.168.0.3:8188` 입력

### 문제
`192.168.0.3`은 **집 공유기 안에서만 통하는 사설 IP**다. 그래서 접속하려면
**폰이 억지로 집 WiFi에 붙어야** 했고, 그 WiFi가 느리고 자주 끊겼다.

```
지금:  폰 → 📶 느린 집 WiFi → 공유기 → 랜선 → PC
              ↑ 병목. 게다가 집 밖에선 아예 불가
```

---

## 2. 최소 세팅 — Tailscale (5분)

### PC에서

1. [tailscale.com](https://tailscale.com) 설치 → 로그인
2. ComfyUI를 **CORS 허용**으로 실행:
   ```
   python main.py --enable-cors-header "https://intionma.github.io"
   ```
   - `--enable-cors-header` **필수** — 없으면 github.io에서 접근이 차단된다
   - `--listen`은 **넣지 않는다** — Tailscale이 대신 처리하며, 안 넣는 게 더 안전
3. 한 번만 실행:
   ```
   tailscale serve --bg 8188
   ```
   → **고정 https 주소**가 생긴다 (재부팅해도 안 바뀜)
   ```
   https://내PC이름.테일넷.ts.net
   ```

Tailscale은 서비스로 등록되어 **부팅 시 자동 실행**된다.

### 폰에서

4. Tailscale 앱 설치 → **PC와 같은 계정** 로그인 → **VPN 토글 ON**
5. 프롬프트 랩 → ComfyUI 주소에 위 `https://...ts.net` 입력 → [연결 확인]

주소는 저장되므로 **다음부터는 Tailscale 토글만 켜면 된다.**

### PC 종료까지 폰에서 하려면 (선택)
앱에 이미 `PC 종료` 기능이 있다(기본 포트 `8189`, 토큰 방식). 종료 도우미를 함께 노출하려면:
```
tailscale serve --bg --https=8443 8189
```
→ 종료 도우미 주소: `https://내PC이름.테일넷.ts.net:8443`

> ⚠️ 종료 도우미 스크립트 자체는 아직 확보 안 됨. 앱이 요구하는 주소·토큰 형식에 맞춰 새로 작성해야 한다.

---

## 3. 왜 지금보다 빠른가

```
Tailscale:  폰(LTE/5G) → 인터넷 → 집 회선 → 공유기 → 랜선 → PC
```

**느린 집 WiFi를 아예 거치지 않는다.** 폰은 LTE/5G, PC는 유선 — 양쪽 다 안정적인 구간만 쓴다.
게다가 Tailscale은 연결이 끊겨도 **자동 재연결**한다(LAN IP 직접 연결은 끊기면 그대로 실패).

### 대역폭도 여유롭다
앱이 이미 최적화되어 있어 실제 전송량이 작다.
- **업로드**: 원본을 생성 크기에 맞춰 축소해서 전송 (5MB 사진 → 100KB 안팎)
- **다운로드**: 결과를 WebP 프리뷰로 수신 (수 MB PNG → 수십~수백 KB). 원본은 크게 볼 때만

→ LTE로도 충분하다.

### Tailscale을 고른 이유
1. **공개 인터넷에 노출되지 않는다** — 내 기기끼리만 연결(성인 콘텐츠라 중요)
2. **https**라서 아이폰 혼합 콘텐츠 차단 문제도 동시 해결 (6장 참고)
3. **주소가 고정** (trycloudflare 임시 주소는 실행마다 바뀜)

### 다른 방법
- **Cloudflare Tunnel**: 폰에 앱 없이 https로 바로 접속. 단 **주소를 아는 누구나 접근 가능**
  → 성인 콘텐츠 환경에선 Tailscale이 안전. (무료 Cloudflare Access로 이메일 인증 추가는 가능)
- **iptime 포트포워딩**: ❌ 비추천. 집 IP를 인터넷에 노출 → ComfyUI가 외부 스캔에 걸린다.

---

## 4. (선택) PC를 꺼두고 나가기 — WoL

**PC가 유선이므로 Wake-on-LAN이 가능하다.** 스마트 플러그를 살 필요 없다.
지금 목표(켜두고 나가기)에는 필요 없고, 나중에 전기료를 아끼고 싶을 때 붙이면 된다.

필요한 것:
- BIOS: `Wake on LAN` / `Power On by PCI-E` 활성화
- Windows: 장치 관리자 → 랜카드 → 전원 관리 → "이 장치가 컴퓨터를 절전 모드에서 깨울 수 있음" 체크
- 외부에서 매직 패킷을 보낼 수단(공유기 WoL 기능 또는 상시 켜진 기기)

> 참고: 무선 연결이면 WoL이 거의 동작하지 않는다. 유선이라 가능한 것.

---

## 5. 왜 폰에서 직접 생성은 안 되는가

앱이 쓰는 모델 구성(코드 확인 결과):

```
UNET  : Anima-Comradeship-v1T19H   ← Cosmos Predict 2.5 (2B) 계열
CLIP  : qwen_3_06b_base            ← Qwen3 0.6B (텍스트 인코더)
VAE   : qwen_image_vae             ← Qwen-Image VAE
핵심  : ApplyCosmosReferenceModelPatch / CosmosReferenceConditioning
```

**서로 다른 세 계열을 섞은 커스텀 파이프라인**이라 모바일 런타임이 지원하지 않는다.

- **ComfyUI는 폰 GPU/NPU를 쓸 수 없다.** ComfyUI = PyTorch이고 Android PyTorch는 **CPU 전용**.
  PyTorch Vulkan 백엔드는 존재하나 공식 문서상 "이항 산술 연산자만 GPU에서 실행, 나머지는 CPU 폴백
  → 느릴 것으로 예상"이라 Diffusion에는 쓸 수 없다.
- Termux로 ComfyUI를 깔면 돌긴 하나 **CPU 전용 → 한 장에 수십 분**.
  (갤럭시 One UI 8.x는 Termux 워크로드에 big 코어를 붙이지 않는 버그도 보고됨)
- 폰 GPU/NPU를 쓰는 런타임(`stable-diffusion.cpp` Vulkan, Local Dream QNN)은
  **SD1.5 / SDXL / SD3 만 지원** → **Cosmos 미지원 → Anima 못 씀**.

> 폰 단독으로 가려면 모델을 SDXL 계열로 갈아타야 하고, 그러면
> **"원본을 참조해 다시 그리는" Anima 편집 기능 자체를 포기**해야 한다. 사실상 새 프로젝트.

### 무료 클라우드가 안 되는 이유
- **Google Colab 무료**: SD WebUI/Gradio 계열을 무료 티어에서 차단. ComfyUI 노트북은 유료 계정 필요.
- **Kaggle**: 주 30시간 무료 GPU + 개인 데이터셋 200GB로 스펙은 좋으나
  **커널 터널링이 차단·약관 위반(계정 정지 사유)**. 성인 콘텐츠 모델 업로드도 정책 위반 소지.
- **Lightning AI 무료**: 월 15크레딧 + **영구 스토리지 100GB**로 무료 중엔 가장 현실적.
  단 **4시간마다 수동 재시작**, 중단형(interruptible). 성인 콘텐츠 정책은 미확인.

---

## 6. 아이폰 관련 (참고)

- 갤럭시(크롬)는 자물쇠 🔒 → 사이트 설정 → "안전하지 않은 콘텐츠 허용"으로 http ComfyUI 직접 연결이 됐다.
- **iOS Safari에는 그 토글이 없다** (iOS는 모든 브라우저가 WebKit 강제).
  → 아이폰은 **https 터널이 사실상 필수**. 위 Tailscale 세팅이면 자동 해결된다.

---

## 7. 남은 일

- [ ] PC에 Tailscale 설치 + `tailscale serve --bg 8188`
- [ ] ComfyUI 실행 옵션에 `--enable-cors-header` 추가 (시작 배치파일로 만들어두면 편함)
- [ ] 폰에 Tailscale 설치 + 앱에 `https://...ts.net` 주소 입력
- [ ] (선택) 종료 도우미 스크립트 작성 + `tailscale serve --https=8443 8189`
- [ ] (나중) WoL 설정 — PC를 꺼두고 나가고 싶을 때

---

## 8. 대안: 클라우드 GPU (PC를 아예 안 쓸 때)

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
