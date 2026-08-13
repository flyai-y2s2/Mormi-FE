export type MormiScene = "home_teach" | "cafe";
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
  budget?: number;
  child_menu_id?: string;
  paid_amount?: number;
};

export type StartMormiConversation = {
  learner_id: number;
  scene: MormiScene;
  scenario_id: string;
  learning_session_id?: string;
  practice_result_id?: string;
  practice_summary?: MormiPracticeSummary;
  cafe_context?: MormiCafeContext;
  queue_context?: { left_count: number; right_count: number };
  conversation_storage_consent?: boolean;
  retention_policy?: "no_raw" | "30_days" | "90_days";
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
    verified_facts: Record<string, string | number | boolean>;
  } | null;
  pedagogy?: {
    expression_level: "L4" | "L3" | "L2" | "L1" | "L0";
    hint_level: "H0" | "H1" | "H2" | "H3";
    subgoal_id: string;
    verified_slots: Record<string, string | number | boolean>;
    bottleneck?: string | null;
  } | null;
};

export type MormiConversation = {
  conversation_id: string;
  turn: MormiTurn;
  /** Spring BE가 최초 문제와 함께 저장해 새로고침 때 돌려주는 구조 맥락. */
  scenario_context?: {
    queue_context?: { left_count: number; right_count: number };
    cafe_context?: MormiCafeContext;
  };
  /** Spring BE가 AI의 검증 슬롯과 생활수학 단계 기록을 맞춘 결과. */
  stage_progress?: {
    stage: "queue" | "menu" | "calculate" | "change";
    completed: boolean;
    next_stage: "queue" | "menu" | "calculate" | "change" | "complete";
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
  const data = await response.json().catch(() => null) as { error?: string; detail?: unknown } | null;
  if (!response.ok) {
    const detail = typeof data?.detail === "string" ? data.detail : "모르미 대화 서버에 연결하지 못했어요.";
    throw new MormiDialogueError(detail, response.status, data?.error);
  }
  return data as T;
}

export function startMormiConversation(input: StartMormiConversation) {
  return requestMormi<MormiConversation>("/api/mormi/conversations", {
    method: "POST",
    body: JSON.stringify({
      conversation_storage_consent: false,
      retention_policy: "no_raw",
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
export async function startHomeTeaching(learningSessionId: string) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/learning-sessions/${encodeURIComponent(learningSessionId)}/teaching`,
    { method: "POST" },
  );
}

export async function startCafeDialogue(
  visitId: string,
  input: {
    scenario_id: "cafe_queue" | "cafe_budget_menu" | "cafe_menu_total" | "cafe_change";
    queue_context?: { left_count: number; right_count: number };
    cafe_context?: MormiCafeContext;
  },
) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(`/v1/cafe-visits/${encodeURIComponent(visitId)}/dialogues`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitMormiResponseThroughBe(
  conversationId: string,
  input: SubmitMormiResponse,
) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/dialogue/conversations/${encodeURIComponent(conversationId)}/responses`,
    {
      method: "POST",
      body: JSON.stringify({
        choice_ids: [],
        values: {},
        response_id: input.response_id || crypto.randomUUID(),
        ...input,
      }),
    },
  );
}

export async function recoverMormiConversationThroughBe(conversationId: string) {
  const { apiRequest } = await import("./api-client");
  return apiRequest<MormiConversation>(
    `/v1/dialogue/conversations/${encodeURIComponent(conversationId)}`,
  );
}
