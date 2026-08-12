type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
type MoramiEvent = "session_start" | "drill_correct" | "drill_retry" | "teach_prompt" | "teach_message" | "teach_correct" | "teach_retry" | "homework_correct" | "session_complete";

type ConversationMessage = {
  role: "morami" | "child";
  text: string;
};

type TurnRequest = {
  sessionId?: string;
  sessionTitle?: string;
  event?: MoramiEvent;
  ladderLevel?: number;
  misconception?: string;
  learnedLine?: string;
  fallbackDialogue?: string;
  teachPrompt?: string;
  childMessage?: string;
  conversation?: ConversationMessage[];
};

type TurnResponse = {
  dialogue: string;
  expression: Expression;
  source: "anthropic" | "mock";
  understood?: boolean;
};

const allowedExpressions = new Set<Expression>(["calm", "happy", "confused", "surprised", "bright", "celebrate"]);

function mockTurn(input: TurnRequest): TurnResponse {
  const turns: Record<MoramiEvent, Omit<TurnResponse, "source">> = {
    session_start: { dialogue: input.fallbackDialogue || "새 문제야. 그림부터 볼까?", expression: "surprised" },
    drill_correct: { dialogue: input.fallbackDialogue || "아하, 이제 알겠어!", expression: "happy" },
    drill_retry: { dialogue: input.fallbackDialogue || "그림을 다시 볼까?", expression: "confused" },
    teach_prompt: { dialogue: input.fallbackDialogue || "어떻게 하는지 알려 줘.", expression: "confused" },
    teach_message: { dialogue: input.fallbackDialogue || "무엇을 먼저 하면 돼?", expression: "confused", understood: false },
    teach_correct: { dialogue: "아하! 알려 줘서 고마워. 이제 알겠어!", expression: "happy", understood: true },
    teach_retry: { dialogue: input.fallbackDialogue || "한 번만 더 쉽게 알려 줘.", expression: "confused", understood: false },
    homework_correct: { dialogue: "우와, 생활 문제도 풀었네!", expression: "celebrate" },
    session_complete: { dialogue: "오늘도 알려 줘서 고마워!", expression: "celebrate" },
  };
  return { ...(turns[input.event || "session_start"]), source: "mock" };
}

function safeTeachDialogue(input: TurnRequest, understood: boolean) {
  if (understood) return "아하! 지우가 알려 줘서 이제 알겠어. 고마워!";
  const childMessage = input.childMessage?.trim() || "";
  if (/^(응|엉|그래|맞아|ㅇㅇ|네|예)[.!?~ ]*$/i.test(childMessage)) return "응 말고, 지우의 생각을 들려줄래?";
  const childTurns = (input.conversation || []).filter((message) => message.role === "child").length;
  const questions = [
    "지우는 어떻게 생각했어?",
    "왜 그렇게 생각했는지 말해 줄래?",
    "어디부터 살펴보면 좋을까?",
  ];
  return questions[Math.max(0, childTurns - 1) % questions.length];
}

function outputText(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const response = data as { content?: Array<{ type?: string; text?: string }> };
  const text = (response.content || [])
    .filter((content) => content.type === "text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("");
  return text || null;
}

function parseClaudeJson(text: string | null) {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as { dialogue?: string; expression?: Expression; understood?: boolean };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let input: TurnRequest;
  try {
    input = await request.json() as TurnRequest;
  } catch {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const fallback = mockTurn(input);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("Morami Claude fallback: ANTHROPIC_API_KEY is missing");
    return Response.json(fallback);
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 220,
        system: [
          "너는 초등 저학년 아이에게 배우는 캐릭터 모르미다.",
          "모르미는 학생이고 아이가 선생님이다. 역할을 절대 바꾸지 않는다.",
          "아이의 띄어쓰기, 오타, 짧은 말투를 자연스럽게 이해한다.",
          "늘 쉽고 익숙한 한국어를 쓰고, 한 번에 질문 하나만 한다.",
          "대답은 짧은 두 문장 이내로 쓴다. 채점, 꾸중, O/X, 어려운 말은 쓰지 않는다.",
          "정답, 계산 과정, 규칙, 방법, 힌트, 예시는 절대 먼저 말하지 않는다.",
          "learnedLine과 correctIdea는 아이의 설명을 판단할 때만 쓰며, 대화에 그대로 쓰거나 바꾸어 말하지 않는다.",
          "‘예를 들어’, ‘~하면 돼’, ‘한번 해봤어?’처럼 선생님이 가르치는 말투를 쓰지 않는다.",
          "teach_message에서는 아이가 learnedLine의 핵심 방법을 자기 말로 설명했는지 판단한다.",
          "단순한 응답(응, 그래, ㅇㅇ), 엉뚱한 말, 답 숫자만 말한 경우에는 understood를 false로 둔다.",
          "설명이 맞으면 understood를 true로 두고 고마워한다.",
          "설명이 부족하면 이전 대화를 되풀이하지 말고, 아이의 마지막 말과 이어지는 아주 짧은 질문 하나를 한다.",
          "반드시 JSON만 출력한다: {\"dialogue\":\"...\",\"expression\":\"calm|happy|confused|surprised|bright|celebrate\",\"understood\":true|false}",
        ].join(" "),
        messages: [{
          role: "user",
          content: JSON.stringify({
            event: input.event,
            lesson: input.sessionTitle,
            correctIdea: input.learnedLine,
            originalQuestion: input.teachPrompt,
            childMessage: input.childMessage,
            conversation: (input.conversation || []).slice(-10),
            fallbackDialogue: input.fallbackDialogue,
          }),
        }],
      }),
    });
    if (!response.ok) {
      console.warn(`Morami Claude fallback: Anthropic returned ${response.status}`);
      return Response.json(fallback);
    }
    const parsed = parseClaudeJson(outputText(await response.json()));
    if (!parsed?.dialogue || !parsed.expression || !allowedExpressions.has(parsed.expression)) {
      console.warn("Morami Claude fallback: response JSON was invalid");
      return Response.json(fallback);
    }
    const understood = Boolean(parsed.understood);
    const guardedDialogue = input.event === "teach_message"
      ? safeTeachDialogue(input, understood)
      : input.event === "teach_correct"
        ? "아하! 알려 줘서 고마워. 이제 알겠어!"
        : parsed.dialogue.slice(0, 110);
    return Response.json({
      dialogue: guardedDialogue,
      expression: input.event === "teach_message" ? (understood ? "happy" : "calm") : parsed.expression,
      source: "anthropic",
      understood,
    } satisfies TurnResponse);
  } catch (error) {
    console.error("Morami Claude fallback: request failed", error instanceof Error ? error.message : "unknown error");
    return Response.json(fallback);
  }
}
