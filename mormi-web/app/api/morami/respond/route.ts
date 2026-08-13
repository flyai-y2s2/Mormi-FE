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
  learnerName?: string;
  childMessage?: string;
  conversation?: ConversationMessage[];
  // Mormi-AI 대화용. 첫 턴에는 conversationId 가 없고, 서버가 발급해 돌려준다.
  learnerId?: number;
  // 집 가르치기 시작 사다리를 정하는 반복문제 성적.
  drillCount?: number;
  drillFirstTryCorrect?: number;
  drillWrongCount?: number;
  learningSessionId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  elapsedMs?: number;
  // 카페용. 화면이 방문마다 새로 뽑는 문제를 그대로 실어 보낸다.
  // AI 가 스스로 뽑으면 화면과 다른 숫자를 말하게 된다.
  scene?: "home_teach" | "cafe";
  cafeScenarioId?: string;
  queueContext?: { left_count: number; right_count: number };
  cafeContext?: {
    menu_items: Array<{ id: string; name: string; price: number; image_url?: string }>;
    mormi_menu_id: string;
    budget?: number;
  };
};

/** AI 저장소에 실제로 있는 카페 시나리오. 화면이 보낸 값을 그대로 믿지 않는다. */
const cafeScenarioIds = new Set(["cafe_queue", "cafe_budget_menu", "cafe_menu_total", "cafe_change"]);

type TurnResponse = {
  dialogue: string;
  expression: Expression;
  source: "mormi-ai" | "anthropic" | "mock";
  understood?: boolean;
  // 아래 셋은 Mormi-AI 를 거친 턴에만 실린다.
  conversationId?: string;
  turnId?: string;
  teachRewardEligible?: boolean;
};

const allowedExpressions = new Set<Expression>(["calm", "happy", "confused", "surprised", "bright", "celebrate"]);

/**
 * 집 가르치기는 시나리오 하나로 모든 커리큘럼 세션을 처리한다.
 *
 * AI 가 세션별 교육 내용을 home_teaching_catalog 로 갖고 있고, 어느 세션인지는
 * practice_summary.curriculum_session_id 로 고른다. 그래서 세션마다 시나리오를
 * 따로 두지 않는다. 카탈로그에 없는 세션은 AI 가 거절하므로 화면은 기존 경로로 내려간다.
 */
const HOME_TEACH_SCENARIO = "home_teach";

/**
 * 반복문제 성적 요약. AI 는 이걸로 어느 세션인지 고르고 시작 사다리를 정한다.
 *
 * 화면이 성적을 못 보냈어도 세션 id 는 있어야 하므로 0문항으로라도 만들어 보낸다.
 * 그래야 아이가 지금 배우는 내용으로 대화가 열린다.
 */
function practiceSummary(input: TurnRequest) {
  const total = Math.min(Math.max(input.drillCount ?? 0, 0), 50);
  return {
    curriculum_session_id: input.sessionId,
    skill_id: input.sessionId,
    question_count: total,
    first_try_correct_count: Math.min(Math.max(input.drillFirstTryCorrect ?? 0, 0), total),
    wrong_attempt_count: Math.min(Math.max(input.drillWrongCount ?? 0, 0), 200),
    misconception_tags: input.misconception ? [input.misconception].slice(0, 30) : [],
  };
}

// 계약서 12절의 mood → 표정 매핑. 백엔드는 파일 경로가 아니라 의미 단위 mood 를 준다.
const expressionByMood: Record<string, Expression> = {
  curious: "confused",
  listening: "calm",
  thinking: "calm",
  relieved: "happy",
  celebrating: "celebrate",
};

type MormiTurnContract = {
  turn_id: string;
  status: "active" | "completed";
  mormi: { text: string; mood: string };
  completion?: { outcome: string; teach_reward_eligible: boolean } | null;
};

type SessionEnvelope = {
  conversation_id: string;
  turn: MormiTurnContract;
};

function envelopeToTurn(envelope: SessionEnvelope): TurnResponse {
  const { turn } = envelope;
  const completed = turn.status === "completed";
  return {
    dialogue: turn.mormi.text,
    expression: expressionByMood[turn.mormi.mood] ?? "calm",
    source: "mormi-ai",
    // bright_exit 은 오늘 활동을 안전하게 끝낸 것이지 가르치기 성공이 아니다.
    understood: completed && turn.completion?.outcome !== "bright_exit",
    conversationId: envelope.conversation_id,
    turnId: turn.turn_id,
    teachRewardEligible: Boolean(turn.completion?.teach_reward_eligible),
  };
}

async function callMormiAi(input: TurnRequest): Promise<TurnResponse | null> {
  const origin = (process.env.AI_ORIGIN || "").replace(/\/$/, "");
  const serviceKey = process.env.MORMI_DIALOGUE_SERVICE_KEY;
  const cafe = input.scene === "cafe";
  const scenarioId = cafe
    ? (input.cafeScenarioId && cafeScenarioIds.has(input.cafeScenarioId) ? input.cafeScenarioId : undefined)
    : (input.sessionId ? HOME_TEACH_SCENARIO : undefined);

  // 첫 턴이면 대화를 만들고, 이후에는 아이 발화를 그 대화에 붙인다.
  const creating = !input.conversationId;

  // 설정이 없으면 조용히 기존 경로로 넘긴다. 화면은 멈추지 않아야 한다.
  if (!origin || !serviceKey || !input.learnerId) return null;
  // 시나리오는 대화를 새로 열 때만 필요하다. 이어가는 턴은 대화가 이미 알고 있다.
  if (creating && !scenarioId) return null;
  // 집 가르치기는 아이가 설명하는 두 순간에만 AI 를 태운다. 카페는 스테이션을 열 때다.
  if (!cafe && input.event !== "teach_prompt" && input.event !== "teach_message") return null;

  const headers = { "content-type": "application/json", "x-mormi-service-key": serviceKey };

  const url = creating
    ? `${origin}/v1/conversations`
    : `${origin}/v1/conversations/${input.conversationId}/responses`;
  const body = creating
    ? {
      learner_id: input.learnerId,
      scene: cafe ? "cafe" : "home_teach",
      scenario_id: scenarioId,
      learning_session_id: input.learningSessionId ?? null,
      // 줄 서기는 queue_context, 메뉴 세 단계는 cafe_context 를 요구한다.
      ...(input.queueContext ? { queue_context: input.queueContext } : {}),
      ...(input.cafeContext ? { cafe_context: input.cafeContext } : {}),
      // 집 가르치기는 practice_summary 로 어느 세션인지와 반복문제 성적을 함께 넘긴다.
      ...(cafe ? {} : { practice_summary: practiceSummary(input) }),
    }
    : {
      turn_id: input.turnId,
      response_id: crypto.randomUUID(),
      type: "text",
      text: input.childMessage,
      latency_ms: input.elapsedMs,
    };

  if (!creating && (!input.turnId || !input.childMessage?.trim())) return null;

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) {
    console.warn(`Mormi-AI 대화 호출 실패: ${response.status} ${creating ? "create" : "respond"}`);
    return null;
  }
  return envelopeToTurn(await response.json() as SessionEnvelope);
}

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
  const learnerName = input.learnerName?.trim() || "친구";
  if (understood) return `아하! ${learnerName}가 알려 줘서 이제 알겠어. 고마워!`;
  const childMessage = input.childMessage?.trim() || "";
  if (/^(응|엉|그래|맞아|ㅇㅇ|네|예)[.!?~ ]*$/i.test(childMessage)) return `응 말고, ${learnerName}의 생각을 들려줄래?`;
  const childTurns = (input.conversation || []).filter((message) => message.role === "child").length;
  const questions = [
    `${learnerName}는 어떻게 생각했어?`,
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

  // 대화의 교육적 판단은 Mormi-AI 가 한다. 연결되지 않은 세션과 장애 상황에서만
  // 아래의 기존 경로로 내려간다.
  try {
    const aiTurn = await callMormiAi(input);
    if (aiTurn) return Response.json(aiTurn);
  } catch (error) {
    console.warn("Mormi-AI 대화 호출 실패", error instanceof Error ? error.message : "unknown error");
  }

  // 카페는 아래의 집 가르치기 폴백을 쓰면 안 된다. 그 대사는 카페 상황과 무관하다.
  // 대사 없이 돌려주면 화면이 자기 문구를 그대로 쓴다.
  if (input.scene === "cafe") return Response.json({ dialogue: "", expression: "calm", source: "mock" });

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
          "teach_message에서는 아이가 learnedLine의 핵심 방법을 직접 작성했는지 판단한다.",
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
