// pixi-live2d-display 0.4 는 Cubism 셰이더(CubismShader_WebGL)를 "모듈 전역 싱글턴"으로 둔다.
// 캔버스(=WebGL 컨텍스트)가 2개인 두 모델 비교에서, 나중에 로드된 모델이 이 싱글턴을 자기
// 컨텍스트로 묶어버리면 먼저 로드된 모델은 다른 컨텍스트의 셰이더 프로그램을 참조하게 되어
// 아무것도 그려지지 않는다(각 뷰어가 자기 glContextID 가 바뀔 때만 재바인딩하기 때문).
//
// 해결: getInstance() 를 "현재 그릴 컨텍스트별 인스턴스"로 바꿔, 컨텍스트마다 셰이더를 따로
// 컴파일·보관한다. 렌더 직전에 bindLive2DContext(gl) 로 현재 컨텍스트를 지정한다(프레임당 재컴파일 없음).

/* eslint-disable @typescript-eslint/no-explicit-any */
let installed = false;
let curGl: object | null = null;
const byGl = new Map<object, any>();
let fallback: any = null;

export function installLive2DMultiContext(ShaderClass: any): void {
  if (installed || !ShaderClass || typeof ShaderClass.getInstance !== "function") return;
  installed = true;
  ShaderClass.getInstance = function () {
    if (!curGl) {
      if (!fallback) fallback = new ShaderClass();
      return fallback;
    }
    let inst = byGl.get(curGl);
    if (!inst) { inst = new ShaderClass(); byGl.set(curGl, inst); }
    return inst;
  };
}

// 이 뷰어가 렌더할 컨텍스트를 지정 (해당 PIXI ticker 콜백 시작부에서 호출)
export function bindLive2DContext(gl: object | null): void {
  curGl = gl;
}
