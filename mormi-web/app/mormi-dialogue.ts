import type { WireExpressionLevel } from "./expression-ladder";

export type MormiScene = "home_teach" | "cafe" | "amusement_park";
export type MormiMood = "curious" | "listening" | "thinking" | "relieved" | "celebrating";
export type MormiInputKind = "text" | "choices" | "fill" | "count" | "equation" | "joint" | "button" | "none";
export type MormiResponseType = "text" | "choice" | "fill" | "count" | "equation" | "action" | "no_response";

export type MormiMenuItem = {
  id: string;
  name: string;
  price: number;
  image_url?: string | null;
};

export type MormiPracticeSummary = {
  curriculum_session_id?: string;
  skill_id: string;
  question_count: number;
  first_try_correct_count: number;
  wrong_attempt_count: number;
  earned_reward: number;
  misconception_tags: string[];
  attempts?: Array<{
    item_id: string;
    correct: boolean;
    response?: string | number | string[] | null;
    misconception_tag?: string | null;
    latency_ms?: number | null;
  }>;
};

export type MormiCafeContext = {
  menu_items: MormiMenuItem[];
  mormi_menu_id: string;
  child_menu_id?: string;
  budget?: number;
};

export type StartMormiConversation = {
  learner_id: number;
  scene: MormiScene;
  scenario_id: string;
  learning_session_id?: string;
  conversation_round?: number;
  practice_result_id?: string;
  practice_summary?: MormiPracticeSummary;
  cafe_context?: MormiCafeContext;
  queue_context?: { left_count: number; right_count: number };
  conversation_storage_consent?: boolean;
  retention_policy?: "no_raw" | "30_days" | "90_days" | "permanent";
};

export type MormiChoice = {
  id: string;
  label: string;
  image_url?: string | null;
  disabled?: boolean | null;
};

export type MormiInput = {
  kind: MormiInputKind;
  placeholder?: string | null;
  choices: MormiChoice[];
  target_slots: string[];
  submit_label?: string | null;
  config: Record<string, unknown>;
};

export type MormiTurn = {
  turn_id: string;
  scene: MormiScene;
  scenario_id: string;
  task_id: string;
  stage_id: string;
  task_index: number;
  mormi: {
    text: string;
    mood: MormiMood;
    max_lines: 1 | 2;
  };
  input: MormiInput;
  visual: { type: string; data: Record<string, unknown> };
  help_card: {
    visible: boolean;
    auto_open: boolean;
    level: "H0" | "H1" | "H2" | "H3";
    title: string;
    body: string;
    visual_type?: string | null;
    visual_data: Record<string, unknown>;
  } | null;
  /**
   * AI가 고정한 궁금해 사전 카드의 신원. 카드 본문은 이 값에 포함되지 않는다.
   * 본문은 대화 스냅샷 API에서 이 참조와 같은 버전으로 조회한다.
   */
  dictionary_ref: {
    card_id: string;
    curriculum_session_id: string;
    schema_version: number;
    content_version: number;
    content_hash: string;
  } | null;
  note_update: {
    note_id: string;
    skill_id: string;
    text: string;
    attribution: "child" | "coauthored";
    evidence: "direct_explanation" | "supported_completion";
    attribution_label: string;
  } | null;
  status: "active" | "completed";
  state_version: number;
  completion: {
    outcome: "taught" | "supported" | "bright_exit";
    teach_reward_eligible: boolean;
    stage_completion_eligible?: boolean;
    verified_facts: Record<string, string | number | boolean>;
  } | null;
  pedagogy?: {
    /** L1은 구버전 대화 복구용 입력 호환 값이며 신규 턴은 L4/L3/L2/L0만 사용한다. */
    expression_level: WireExpressionLevel;
    hint_level: "H0" | "H1" | "H2" | "H3";
    subgoal_id: string;
    verified_slots: Record<string, string | number | boolean>;
    bottleneck?: string | null;
  } | null;
  /**
   * AI가 현재 턴에서 계속 보여 주도록 고정한 답변 목표.
   * 오래 저장된 대화에는 없을 수 있어 선택 필드로 호환한다.
   */
  task_anchor?: {
    anchor_id: string;
    title: string;
    prompt: string;
    completed_items: Array<{
      slot_id: string;
      label: string;
      value: string | number | boolean;
      display_text: string;
    }>;
    target_slots: string[];
  } | null;
};

export type MormiConversation = {
  conversation_id: string;
  turn: MormiTurn;
  /** Spring BE가 방문 연결과 함께 저장해 새로고침 때 돌려주는 구조 맥락. */
  scenario_context?: {
    queue_context?: { left_count: number; right_count: number };
    cafe_context?: MormiCafeContext;
    content_owner?: "mormi_ai";
  };
  /** Spring BE가 AI의 검증 슬롯과 생활수학 단계 기록을 맞춘 결과. */
  stage_progress?: {
    stage: "queue" | "menu" | "calculate" | "change" | "ticket" | "snack_split" | "pass_break_even";
    completed: boolean;
    next_stage: "queue" | "menu" | "calculate" | "change" | "ticket" | "snack_split" | "pass_break_even" | "complete";
    source: "pending" | "stage_attempt" | "dialogue_verified_facts";
  };
};

export type SubmitMormiResponse = {
  turn_id: string;
  response_id?: string;
  type: MormiResponseType;
  text?: string;
  choice_ids?: string[];
  values?: Record<string, string | number | boolean | string[]>;
  asr_confidence?: number | null;
  latency_ms?: number | null;
};

const DIALOGUE_REQUEST_TIMEOUT_MS = 60_000;
const RECOVERY_DELAYS_MS = [0, 600, 1_800] as const;

type PendingDialogueResponse = {
  responseId: string;
  signature: string;
};

// 네트워크 응답만 유실된 경우에도 같은 턴·같은 답은 같은 response_id를 쓴다.
// AI 서버가 이미 처리를 끝냈다면 동일 결과를 돌려주므로 stale-turn 루프가 없다.
const pendingResponseByTurn = new Map<string, PendingDialogueResponse>();

function stableResponseSignature(input: SubmitMormiResponse) {
  const values = Object.fromEntries(
    Object.entries(input.values ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    type: input.type,
    text: input.text ?? null,
    choice_ids: input.choice_ids ?? [],
    values,
    asr_confidence: input.asr_confidence ?? null,
  });
}

function waitForRecovery(delayMs: number) {
  if (delayMs === 0) return Promise.resolve();
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs));
}

export class MormiDialogueError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "MormiDialogueError";
  }
}

async function requestMormi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => null) as {
    error?: string;
    code?: string;
    message?: string;
    detail?: string | { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    const nested = typeof data?.detail === "object" && data.detail !== null ? data.detail : null;
    const message = nested?.message
      || (typeof data?.detail === "string" ? data.detail : null)
      || data?.message
      || "모르미 대화 서버에 연결하지 못했어요.";
    throw new MormiDialogueError(message, response.status, nested?.code || data?.code || data?.error);
  }
  return data as T;
}

export function startMormiConversation(input: StartMormiConversation) {
  return requestMormi<MormiConversation>("/api/mormi/conversations", {
    method: "POST",
    body: JSON.stringify({
      // 파일럿 동의를 전제로 하는 현재 서비스 정책과 동일하게, 개발용
      // 직접 AI 경로도 대화 원문을 암호화해 영구 보존한다. 운영 홈 화면은
      // Spring BE를 거치지만, 이 경로를 쓰는 AI 테스트 화면도 예외가 아니다.
      conversation_storage_consent: true,
      retention_policy: "permanent",
      ...input,
    }),
  });
}

export function submitMormiResponse(conversationId: string, input: SubmitMormiResponse) {
  return requestMormi<MormiConversation>(`/api/mormi/conversations/${encodeURIComponent(conversationId)}/responses`, {
    method: "POST",
    body: JSON.stringify({
      choice_ids: [],
      values: {},
      response_id: input.response_id || crypto.randomUUID(),
      ...input,
    }),
  });
}

export function recoverMormiConversation(conversationId: string) {
  return requestMormi<MormiConversation>(`/api/mormi/conversations/${encodeURIComponent(conversationId)}`);
}

/** 운영 경로: 인증 토큰을 가진 FE → Spring BE → FastAPI AI. */
export async function startHomeTeaching(
  learningSessionId: string,
  intent: { start_mode: "restart" | "resume"; request_id: string },
) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/learning-sessions/${encodeURIComponent(learningSessionId)}/teaching`,
    { method: "POST", body: JSON.stringify(intent) },
  );
}

export async function startCafeDialogue(
  visitId: string,
  input: {
    scenario_id: "cafe_queue" | "cafe_budget_menu" | "cafe_menu_total" | "cafe_change";
    queue_context?: { left_count: number; right_count: number };
    cafe_context?: MormiCafeContext;
    start_mode: "restart" | "resume";
    request_id: string;
  },
) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(`/v1/cafe-visits/${encodeURIComponent(visitId)}/dialogues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type AmusementScenarioId =
  | "amusement_ticket_multiply"
  | "amusement_snack_divide"
  | "amusement_pass_compare";

/** 운영 경로: 놀이동산 문제 사실은 FE가 보내지 않고 Spring BE의 방문 스냅샷을 쓴다. */
export async function startAmusementParkDialogue(
  visitId: string,
  input: {
    scenario_id: AmusementScenarioId;
    start_mode: "restart" | "resume";
    request_id: string;
  },
) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/amusement-park-visits/${encodeURIComponent(visitId)}/dialogues`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function submitMormiResponseThroughBe(
  conversationId: string,
  input: SubmitMormiResponse,
) {
  const { apiRequest, ApiError } = await import("./api-client");
  const pendingKey = `${conversationId}:${input.turn_id}`;
  const signature = stableResponseSignature(input);
  const previousPending = pendingResponseByTurn.get(pendingKey);
  const pending = previousPending?.signature === signature
    ? previousPending
    : {
        responseId: input.response_id || crypto.randomUUID(),
        signature,
      };
  pendingResponseByTurn.set(pendingKey, pending);

  try {
    const conversation = await apiRequest<MormiConversation>(
      `/v1/dialogue/conversations/${encodeURIComponent(conversationId)}/responses`,
      {
        method: "POST",
        body: JSON.stringify({
          choice_ids: [],
          values: {},
          ...input,
          response_id: pending.responseId,
        }),
      },
      true,
      DIALOGUE_REQUEST_TIMEOUT_MS,
    );
    pendingResponseByTurn.delete(pendingKey);
    return conversation;
  } catch (error) {
    const ambiguous = !(error instanceof ApiError)
      || [0, 409, 429, 500, 502, 503, 504].includes(error.status);
    if (!ambiguous) throw error;

    // POST가 AI에서 반영된 뒤 중간 응답만 끊겼을 수 있다. 잠깐 동안 최신 턴을
    // 조회해 진행된 상태를 찾으면 실패로 보이지 않고 그 턴을 그대로 적용한다.
    for (const delayMs of RECOVERY_DELAYS_MS) {
      await waitForRecovery(delayMs);
      try {
        const latest = await recoverMormiConversationThroughBe(conversationId);
        if (latest.turn.turn_id !== input.turn_id) {
          pendingResponseByTurn.delete(pendingKey);
          return latest;
        }
      } catch {
        // 최초 POST 오류를 유지한다. 복구 조회 오류가 아이 원문을 덮지 않는다.
      }
    }
    throw error;
  }
}

export async function recoverMormiConversationThroughBe(conversationId: string) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/dialogue/conversations/${encodeURIComponent(conversationId)}`,
  );
}
