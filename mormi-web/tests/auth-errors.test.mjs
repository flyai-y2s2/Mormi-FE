// 가입·로그인 실패를 화면 문구로 옮기는 규칙.
// 넣는 값은 배포된 Spring BE 가 실제로 준 응답 그대로다.
import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = { setTimeout, clearTimeout };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { ApiError } = await import("../app/api-client.ts");
const { toAuthFailure } = await import("../app/auth-errors.ts");

test("로그인 401 은 아이디 없음과 비밀번호 틀림을 구분하지 않는다", () => {
  const wrongPassword = new ApiError(401, "unauthorized", "아이디 또는 비밀번호가 올바르지 않습니다.");
  const noSuchUser = new ApiError(401, "unauthorized", "아이디 또는 비밀번호가 올바르지 않습니다.");

  const fromWrongPassword = toAuthFailure(wrongPassword, "login");
  const fromNoSuchUser = toAuthFailure(noSuchUser, "login");

  // 화면 결과가 갈리면 가입 여부를 떠볼 수 있게 된다. 서버가 일부러 숨긴 것을 화면이 흘리면 안 된다.
  assert.deepEqual(fromWrongPassword, fromNoSuchUser);
  assert.equal(fromWrongPassword.message, "아이디 또는 비밀번호를 확인해 주세요.");
  assert.equal(fromWrongPassword.fields, undefined);
});

test("아이디 중복 409 는 아이디 입력란에 붙는다", () => {
  const failure = toAuthFailure(new ApiError(409, "login_id_taken", "이미 사용 중인 아이디입니다."), "signup");
  assert.ok(failure.fields?.loginId);
  assert.equal(failure.message, undefined);
});

test("연구 코드 중복 409 는 참여 번호 입력란에 붙고 담당자 문의로 안내한다", () => {
  // 참여 번호는 연구 담당자가 배정한 값이라 아이가 다른 걸로 바꿔 볼 수 없다.
  const failure = toAuthFailure(new ApiError(409, "research_code_taken", "이미 등록된 연구 코드입니다."), "signup");
  assert.match(failure.fields?.researchCode ?? "", /연구 담당자/);
  assert.equal(failure.fields?.loginId, undefined);
});

test("422 의 camelCase 필드명이 화면 입력란으로 옮겨진다", () => {
  // 요청은 login_id 로 보내는데 실패 사유는 loginId 로 돌아온다.
  const failure = toAuthFailure(new ApiError(422, "validation_failed", "입력값을 확인해 주세요.", {
    loginId: "size must be between 4 and 20",
    password: "size must be between 8 and 72",
  }), "signup");

  assert.equal(failure.fields?.loginId, "아이디는 영어와 숫자로 4~20자예요.");
  assert.equal(failure.fields?.password, "비밀번호는 8자 이상이어야 해요.");
  assert.doesNotMatch(JSON.stringify(failure), /size must be/);
});

test("모르는 필드만 온 422 는 폼 전체 문구로 떨어진다", () => {
  const failure = toAuthFailure(new ApiError(422, "validation_failed", "입력값을 확인해 주세요.", {
    somethingNew: "unexpected",
  }), "signup");
  assert.equal(failure.fields, undefined);
  assert.equal(failure.message, "입력값을 확인해 주세요.");
});

test("ApiError 가 아닌 오류의 원문은 아이에게 보이지 않는다", () => {
  const failure = toAuthFailure(new TypeError("Failed to fetch"), "signup");
  assert.match(failure.message, /연결이 잘 되지 않았어요/);
  assert.doesNotMatch(failure.message, /Failed to fetch/);
});

test("가입 중 401 이 로그인 문구로 새지 않는다", () => {
  const failure = toAuthFailure(new ApiError(401, "unauthorized", "학습자 토큰이 필요합니다."), "signup");
  assert.notEqual(failure.message, "아이디 또는 비밀번호를 확인해 주세요.");
});
