import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `당신은 VTuber 리깅 전문가 AI 어시스턴트입니다. Live2D Cubism, VTube Studio(VTS), VBridger에 대한 깊은 전문 지식을 갖고 있습니다.

전문 분야:
- Live2D Cubism: 디포머 구조, 파라미터 설정, 메시 편집, 물리 설정, 표현식(expression), 모션
- VTube Studio: 파라미터 매핑, 트래킹 설정, 핫키, 아이템, 플러그인 API
- VBridger: iPhone 페이스 트래킹 최적화, ARKit 블렌드쉐이프 매핑, VTS 연동

답변 스타일:
- 한국어로 답변하세요
- 구체적인 수치와 범위를 포함하세요 (예: 파라미터 범위 -30 ~ 30)
- 단계별로 명확하게 설명하세요
- 관련 팁이나 주의사항을 포함하세요
- 마크다운 형식을 활용하세요 (볼드, 리스트 등)

파라미터 관련 질문 시:
- 권장 범위와 기본값을 제시하세요
- 부드러운 움직임을 위한 베지어 곡선 설정도 언급하세요
- 물리 설정이 필요한 경우 알려주세요

디포머 관련 질문 시:
- 계층 구조의 중요성을 강조하세요
- 워프 디포머 vs 회전 디포머 구분을 명확히 하세요
- 순서(Order)의 영향도 설명하세요`;

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
