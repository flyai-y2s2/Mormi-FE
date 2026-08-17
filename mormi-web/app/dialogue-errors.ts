import { ApiError } from "./api-client";

/** BE가 공개한 오류 코드만 아이가 이해할 수 있는 다음 행동으로 바꾼다. */
export function dialogueErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback;

  if (error.code === "dialogue_turn_conflict") {
    return "질문이 바뀌었어요. 같은 답을 한 번만 다시 보내 주세요.";
  }
  if (error.code === "session_completed") {
    return "이미 끝난 연습이에요. 집으로 돌아가 새 연습을 시작해 주세요.";
  }
  if (error.code === "stage_locked") {
    return "앞 단계를 먼저 마치면 이 연습을 열 수 있어요.";
  }
  if (error.code === "change_required") {
    return "거스름돈 연습까지 마친 뒤 완료할 수 있어요.";
  }
  if (["request_timeout", "network_error", "dialogue_rate_limited"].includes(error.code)
    || error.code.startsWith("dialogue_ai_error")
    || error.code === "dialogue_upstream_error"
    || error.code === "dialogue_unavailable") {
    return `${error.message} 입력한 답은 그대로 두었어요.`;
  }
  return error.message || fallback;
}
