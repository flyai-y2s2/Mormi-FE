"use client";

/**
 * Mormi 학습 백엔드(Spring) 클라이언트.
 *
 * 진행도·보상·해금은 서버가 확정한다. 이 파일은 전송과 토큰 보관만 담당하고
 * 정오 판정이나 보상 계산을 다시 하지 않는다.
 *
 * 브라우저는 기본적으로 같은 출처의 /api/be 를 호출한다. Next 서버가 비공개
 * BACKEND_ORIGIN으로 배포된 Spring BE에 프록시한다.
 */

// 일반 학습 화면은 항상 같은 출처의 서버 프록시만 사용한다. 공개 환경변수로
// 직접 BE 주소를 덮어쓰게 두지 않아, 배포 설정에 남은 localhost가 되살아나는
// 문제와 브라우저 혼합 콘텐츠/CORS 문제를 함께 막는다.
const BASE_URL = "/api/be";
const TOKEN_KEY = "mormi-access-token";
const LEARNER_KEY = "mormi-learner";
const REQUEST_TIMEOUT_MS = 20_000;

export const apiEnabled = true;

export type LearnerProfile = {
  id: number;
  name: string;
  researchCode?: string;
  analyticsId?: string;
};

export type ProgressSnapshot = {
  learner_id: number;
  display_name: string;
  analytics_id: string;
  onboarding_complete: boolean;
  completed_session_ids: string[];
  wallet_balance: number;
  level: number;
  stars: number;
  cafe_unlocked: boolean;
  cafe_required_session_ids: string[];
  active_learning_session_id: string | null;
  active_cafe_visit_id: string | null;
};

export type AttemptResult = {
  attempt_id: number;
  duplicate: boolean;
  reward_granted: number;
  session_reward_subtotal: number;
  correct_count: number;
  mastery_target: number;
  drill_completed: boolean;
};

export type CompleteResult = {
  learning_session_id: string;
  practice_result_id: string;
  drill_reward: number;
  teach_reward: number;
  total_reward: number;
  wallet_balance: number;
  teach_reward_eligible: boolean;
  completed_session_ids: string[];
  cafe_unlocked: boolean;
};

export type StageResult = {
  cafe_visit_id: string;
  stage: string;
  is_correct: boolean;
  next_stage: string;
  next_stage_unlocked: boolean;
  attempts: number;
  expected_amount: number | null;
  submitted_amount: number | null;
  difference: number | null;
  feedback_code: string;
};

export type CafeVisitState = {
  cafe_visit_id: string;
  stage: string;
  target_amount: number;
  order_total: number | null;
  paid_amount: number | null;
  change_amount: number | null;
  change_target: number | null;
};

/**
 * GET /v1/reports/summary · /history 의 한 건.
 *
 * 서버는 자기가 가진 값만 돌려준다. sessionTitle·unit·misconception·learnedLine 처럼
 * 커리큘럼 본문에 있는 값은 없으므로, 화면이 session_id 로 정적 커리큘럼에서 채운다.
 */
export type ReportSummaryDto = {
  date: string | null;
  learning_session_id: string;
  session_id: string;
  mastery_target: number;
  repetitions: number;
  mastery_seconds: number;
  /** 오개념에 한 번이라도 동조했는지. BE 가 @JsonProperty 로 이 이름을 고정한다. */
  synchronized: boolean;
  transfer: boolean;
  ladder: number;
  timed_out: boolean;
  learner_id: number | null;
  learner_name: string | null;
  earned_coins: number;
  drill_coins: number;
  teach_coins: number;
  wallet_balance: number;
  wrong_attempt_count: number;
  first_try_correct_count: number;
};

export type AttemptView = {
  attempt_id: number;
  activity: string;
  attempt_no: number;
  item_id: string;
  question_index: number | null;
  is_correct: boolean;
  elapsed_ms: number | null;
  reward_granted: number;
  answer_meta: Record<string, unknown>;
  created_at: string;
};

/** GET /v1/learning-sessions/{id}. 새로고침 뒤 어디까지 풀었는지 복원하는 데 쓴다. */
export type SessionView = {
  learning_session_id: string;
  curriculum_session_id: string;
  variant_seed: number;
  started_at: string;
  completed_at: string | null;
  timed_out: boolean;
  transfer_solved: boolean;
  scaffold_level: number | null;
  conversation_id: string | null;
  correct_count: number;
  mastery_target: number;
  drill_reward_subtotal: number;
  attempts: AttemptView[];
};

export type StageAttemptView = {
  stage: string;
  attempt_no: number;
  is_correct: boolean;
  elapsed_ms: number | null;
  payload: Record<string, unknown>;
  created_at: string;
};

/** GET /v1/cafe-visits/{id}. CafeVisitState 에 시도 이력과 메뉴 가격이 더 붙은 형태다. */
export type CafeVisitView = CafeVisitState & {
  started_at: string;
  completed_at: string | null;
  menu_prices: Record<string, number>;
  attempts: StageAttemptView[];
};

/**
 * GET /v1/themes. 외출 장소 하나의 상태다.
 *
 * 해금 판정은 서버가 확정한다. 프런트도 journey-config 로 같은 규칙을 갖고 있지만,
 * 두 목록이 어긋나면 화면은 열려 보이는데 POST /v1/cafe-visits 가 403 을 준다.
 * 그래서 서버 값이 있으면 그쪽을 쓰고, 로컬 규칙은 오프라인 폴백으로만 남긴다.
 */
export type ThemeView = {
  theme_id: string;
  title: string;
  unlocked: boolean;
  required_session_ids: string[];
  remaining_session_ids: string[];
};

export type RetentionPolicy = "no_raw" | "30_days" | "90_days" | "permanent";

export type LearnerConsent = {
  id: number;
  display_name: string;
  research_code: string;
  analytics_id: string;
  conversation_storage_consent: boolean;
  retention_policy: RetentionPolicy;
  created_at: string;
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

function readToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeSession(token: string, learner: LearnerProfile) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(LEARNER_KEY, JSON.stringify(learner));
}

export function readStoredLearner(): LearnerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    // 새 mormi-* 키를 먼저 읽고, 없으면 기존 mormey-* 값을 한 번만 옮긴다.
    const current = localStorage.getItem(LEARNER_KEY);
    if (current) return JSON.parse(current) as LearnerProfile;
    const legacy = localStorage.getItem("mormey-learner");
    if (legacy) {
      localStorage.setItem(LEARNER_KEY, legacy);
      return JSON.parse(legacy) as LearnerProfile;
    }
  } catch { /* 손상된 값은 무시하고 온보딩부터 다시 */ }
  return null;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEARNER_KEY);
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  if (!apiEnabled) throw new ApiError(0, "api_disabled", "API base URL is not configured");

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) {
    const token = readToken();
    if (!token) throw new ApiError(401, "unauthorized", "학습자 토큰이 없습니다.");
    headers.authorization = `Bearer ${token}`;
  }

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      signal: init.signal ?? timeoutController.signal,
    });
  } catch {
    if (timeoutController.signal.aborted) {
      throw new ApiError(504, "request_timeout", "모르미를 불러오는 데 시간이 걸리고 있어요. 다시 시도해 주세요.");
    }
    throw new ApiError(503, "network_error", "학습 서버에 연결하지 못했어요. 다시 시도해 주세요.");
  } finally {
    window.clearTimeout(timeoutId);
  }
  if (!response.ok) {
    let code = "http_error";
    let message = `요청이 실패했습니다 (${response.status})`;
    try {
      const body = await response.json() as { code?: string; message?: string };
      code = body.code || code;
      message = body.message || message;
    } catch { /* 본문이 없을 수 있다 */ }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export const api = {
  createLearner(displayName: string, researchCode: string) {
    return apiRequest<{
      id: number; display_name: string; research_code: string;
      analytics_id: string; access_token: string;
    }>("/v1/learners", {
      method: "POST",
      body: JSON.stringify({ display_name: displayName, research_code: researchCode }),
    }, false);
  },

  restoreLearner(researchCode: string) {
    return apiRequest<{
      id: number; display_name: string; research_code: string;
      analytics_id: string; access_token: string;
    }>("/v1/learners/auth", {
      method: "POST",
      body: JSON.stringify({ research_code: researchCode }),
    }, false);
  },

  progress() {
    return apiRequest<ProgressSnapshot>("/v1/progress");
  },

  themes() {
    return apiRequest<ThemeView[]>("/v1/themes");
  },

  /** 완료된 세션이 하나도 없으면 서버가 404 를 준다. 화면은 이를 오류로 다루지 않는다. */
  reportSummary() {
    return apiRequest<ReportSummaryDto>("/v1/reports/summary");
  },

  reportHistory(limit = 8) {
    return apiRequest<ReportSummaryDto[]>(`/v1/reports/history?limit=${limit}`);
  },

  /** 새로고침 복구용. 시도 전체가 함께 온다. */
  getSession(sessionId: string) {
    return apiRequest<SessionView>(`/v1/learning-sessions/${sessionId}`);
  },

  getCafeVisit(visitId: string) {
    return apiRequest<CafeVisitView>(`/v1/cafe-visits/${visitId}`);
  },

  /** 본인만 조회할 수 있다. 동의 현황을 읽는 데 쓴다. */
  getLearner(learnerId: number) {
    return apiRequest<LearnerConsent>(`/v1/learners/${learnerId}`);
  },

  updateConversationConsent(consent: boolean, retentionPolicy: RetentionPolicy) {
    return apiRequest<LearnerConsent>("/v1/learners/me/conversation-consent", {
      method: "PATCH",
      body: JSON.stringify({ conversation_storage_consent: consent, retention_policy: retentionPolicy }),
    });
  },

  startSession(curriculumSessionId: string, variantSeed: number) {
    return apiRequest<{ learning_session_id: string; variant_seed: number }>("/v1/learning-sessions", {
      method: "POST",
      body: JSON.stringify({ curriculum_session_id: curriculumSessionId, variant_seed: variantSeed }),
    });
  },

  /**
   * 정답·오답 모두 보낸다. attemptNo 는 세션 안에서 1부터 단조 증가해야 하며,
   * 같은 번호를 다시 보내면 서버가 중복으로 처리해 보상을 두 번 주지 않는다.
   */
  recordAttempt(sessionId: string, body: {
    activity: "drill" | "teach" | "transfer";
    attempt_no: number;
    item_id: string;
    question_index: number;
    is_correct: boolean;
    elapsed_ms?: number;
    answer_meta?: Record<string, unknown>;
  }) {
    return apiRequest<AttemptResult>(`/v1/learning-sessions/${sessionId}/attempts`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  completeSession(sessionId: string, body: {
    conversation_id?: string;
    transfer_solved: boolean;
    timed_out: boolean;
    scaffold_level?: number | null;
    elapsed_seconds?: number;
  }) {
    return apiRequest<CompleteResult>(`/v1/learning-sessions/${sessionId}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /**
   * 진행 중 방문이 있으면 서버가 그것을 그대로 돌려준다(새로 만들지 않는다).
   * 응답은 조회와 같은 CafeVisitView 라 시도 이력까지 함께 온다.
   */
  startCafeVisit() {
    return apiRequest<CafeVisitView>("/v1/cafe-visits", { method: "POST" });
  },

  /**
   * 줄 서기. 좌우 인원이 매번 달라지므로 문제를 함께 보내고 정오는 서버가 판정한다.
   * chosenCount 는 아이가 답한 "더 짧은 줄의 인원수"다.
   */
  cafeQueue(visitId: string, body: {
    left_count: number;
    right_count: number;
    chosen_count: number;
    counting_answer?: string;
    scaffold_used: boolean;
    attempt_no: number;
    elapsed_ms?: number;
  }) {
    return apiRequest<StageResult>(`/v1/cafe-visits/${visitId}/queue`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  /** 메뉴 고르기. 예산도 방문마다 달라지므로 함께 보낸다. 초과 주문도 오답으로 기록된다. */
  cafeMenu(visitId: string, menuIds: string[], budget: number, attemptNo: number, elapsedMs?: number) {
    return apiRequest<StageResult>(`/v1/cafe-visits/${visitId}/menu`, {
      method: "POST",
      body: JSON.stringify({ menu_ids: menuIds, budget, attempt_no: attemptNo, elapsed_ms: elapsedMs }),
    });
  },

  /** 메뉴값 계산. 이 단계의 두 메뉴는 메뉴 고르기와 별개로 다시 뽑히므로 함께 보낸다. */
  cafePayment(visitId: string, menuIds: string[], answerAmount: number, attemptNo: number, elapsedMs?: number) {
    return apiRequest<StageResult>(`/v1/cafe-visits/${visitId}/payments`, {
      method: "POST",
      body: JSON.stringify({ menu_ids: menuIds, answer_amount: answerAmount, attempt_no: attemptNo, elapsed_ms: elapsedMs }),
    });
  },

  /** 거스름돈. 기대값은 서버가 10,000원 − menuId 가격으로 계산한다. */
  cafeChange(visitId: string, menuId: string, counts: Record<number, number>, attemptNo: number, elapsedMs?: number) {
    return apiRequest<StageResult>(`/v1/cafe-visits/${visitId}/change`, {
      method: "POST",
      body: JSON.stringify({ menu_id: menuId, counts, attempt_no: attemptNo, elapsed_ms: elapsedMs }),
    });
  },

  cafeComplete(visitId: string) {
    return apiRequest<CafeVisitState>(`/v1/cafe-visits/${visitId}/complete`, { method: "POST" });
  },
};

/**
 * 화면을 멈추지 않는 전송. 실패해도 아이의 진행은 계속되고 오류만 콘솔에 남는다.
 * 대화 턴처럼 다음 화면이 응답에 의존하는 호출에는 쓰지 않는다.
 */
export function fireAndForget<T>(work: () => Promise<T>, label: string): void {
  if (!apiEnabled) return;
  void work().catch((error: unknown) => {
    console.warn(`[mormi-api] ${label} 실패`, error instanceof Error ? error.message : error);
  });
}
