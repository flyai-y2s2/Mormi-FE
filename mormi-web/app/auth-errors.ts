/**
 * 가입·로그인 실패를 화면 문구로 옮긴다.
 *
 * 화면에서 떼어 둔 이유는 두 가지다. 서버 응답 모양이 바뀌면 여기만 고치면 되고,
 * React 없이 그대로 테스트할 수 있다.
 */
import { ApiError } from "./api-client";

export type AuthField = "name" | "researchCode" | "loginId" | "password";

/** 폼 전체에 띄울 문구와 특정 입력란에 붙일 문구를 나눠 담는다. */
export type AuthFailure = { message?: string; fields?: Partial<Record<AuthField, string>> };

/**
 * 서버 검증 응답은 요청 본문(snake_case)과 달리 camelCase 키를 준다.
 * 예: login_id 로 보냈는데 실패 사유는 fields.loginId 로 돌아온다.
 */
const SERVER_FIELD_TO_AUTH_FIELD: Record<string, AuthField> = {
  displayName: "name",
  researchCode: "researchCode",
  loginId: "loginId",
  password: "password",
};

/** 서버 검증 문구는 "size must be between 4 and 20" 같은 영어라 아이에게 그대로 보일 수 없다. */
const AUTH_FIELD_MESSAGE: Record<AuthField, string> = {
  name: "이름을 적어 주세요.",
  researchCode: "참여 번호를 다시 확인해 주세요.",
  loginId: "아이디는 영어와 숫자로 4~20자예요.",
  password: "비밀번호는 8자 이상이어야 해요.",
};

export function toAuthFailure(error: unknown, mode: "signup" | "login"): AuthFailure {
  if (!(error instanceof ApiError)) {
    return { message: "연결이 잘 되지 않았어요. 잠시 후 다시 시도해 주세요." };
  }

  // 서버는 없는 아이디와 틀린 비밀번호에 같은 401 을 준다. 가입 여부를 떠볼 수 없게
  // 하려는 것이므로, 화면에서도 두 경우를 나눠 안내할 수 없다.
  if (mode === "login" && error.status === 401) {
    return { message: "아이디 또는 비밀번호를 확인해 주세요." };
  }

  if (error.code === "login_id_taken") {
    return { fields: { loginId: "이미 누가 쓰고 있는 아이디예요. 다른 걸로 지어 볼까요?" } };
  }

  // 참여 번호는 연구 담당자가 배정한 값이라 아이가 다른 걸로 바꿔 볼 수 없다.
  if (error.code === "research_code_taken") {
    return { fields: { researchCode: "이미 등록된 참여 번호예요. 연구 담당자에게 문의해 주세요." } };
  }

  if (error.code === "validation_failed" && error.fields) {
    const fields: Partial<Record<AuthField, string>> = {};
    for (const serverField of Object.keys(error.fields)) {
      const field = SERVER_FIELD_TO_AUTH_FIELD[serverField];
      if (field) fields[field] = AUTH_FIELD_MESSAGE[field];
    }
    if (Object.keys(fields).length > 0) return { fields };
  }

  return { message: error.message };
}
