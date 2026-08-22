// apiRequest 의 401 처리. 인증 요청과 로그인 실패를 auth 인자 하나로 가르는 설계를 지킨다.
import assert from "node:assert/strict";
import test from "node:test";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.window = { setTimeout, clearTimeout };

let nextResponse = null;
let lastRequest = null;
globalThis.fetch = async (input, init) => {
  lastRequest = { input: String(input), init };
  return nextResponse();
};

const {
  api,
  apiRequest,
  setUnauthorizedHandler,
  storeSession,
  storeEducatorSession,
  clearEducatorSession,
  ApiError,
} =
  await import("../app/api-client.ts");

function respond(status, body) {
  return () => new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withSession() {
  store.clear();
  storeSession("test-token", { id: 1, name: "검증" });
}

test("인증 요청이 401 이면 세션을 지우고 화면 되돌리기를 부른다", async () => {
  withSession();
  let called = 0;
  setUnauthorizedHandler(() => { called += 1; });
  nextResponse = respond(401, { code: "unauthorized", message: "학습자 토큰이 필요합니다." });

  await assert.rejects(() => apiRequest("/v1/progress"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 401);
    return true;
  });

  assert.equal(called, 1);
  assert.equal(localStorage.getItem("mormi-access-token"), null);
  assert.equal(localStorage.getItem("mormi-learner"), null);
});

test("로그인 실패 401 은 세션도 입력값도 건드리지 않는다", async () => {
  withSession();
  let called = 0;
  setUnauthorizedHandler(() => { called += 1; });
  nextResponse = respond(401, { code: "unauthorized", message: "아이디 또는 비밀번호가 올바르지 않습니다." });

  // login / signup 은 auth=false 로 부른다. 여기서 화면이 초기화되면 아이가
  // 비밀번호를 한 번 틀렸을 때 적어 둔 아이디까지 사라진다.
  await assert.rejects(() => apiRequest("/v1/auth/login", { method: "POST" }, false));

  assert.equal(called, 0);
  assert.equal(localStorage.getItem("mormi-access-token"), "test-token");
});

test("저장된 토큰이 없으면 서버를 부르지 않고 바로 되돌린다", async () => {
  store.clear();
  let called = 0;
  setUnauthorizedHandler(() => { called += 1; });
  nextResponse = () => { throw new Error("서버를 부르면 안 된다"); };

  await assert.rejects(() => apiRequest("/v1/progress"));
  assert.equal(called, 1);
});

test("401 이 아닌 실패는 세션을 유지한다", async () => {
  withSession();
  let called = 0;
  setUnauthorizedHandler(() => { called += 1; });
  nextResponse = respond(409, { code: "login_id_taken", message: "이미 사용 중인 아이디입니다." });

  await assert.rejects(() => apiRequest("/v1/progress"));
  assert.equal(called, 0);
  assert.equal(localStorage.getItem("mormi-access-token"), "test-token");
});

test("422 의 fields 가 ApiError 에 실려 온다", async () => {
  withSession();
  setUnauthorizedHandler(null);
  nextResponse = respond(422, {
    code: "validation_failed",
    message: "입력값을 확인해 주세요.",
    fields: { loginId: "size must be between 4 and 20" },
  });

  await assert.rejects(() => apiRequest("/v1/auth/signup", { method: "POST" }, false), (error) => {
    assert.equal(error.fields?.loginId, "size must be between 4 and 20");
    return true;
  });
});

test("204 는 본문 없이 통과한다", async () => {
  withSession();
  setUnauthorizedHandler(null);
  nextResponse = respond(204);

  assert.equal(await apiRequest("/v1/auth/logout", { method: "POST" }), undefined);
});

test("별노트 다음 페이지는 서버 cursor를 바꾸지 않고 인증된 BE 경로로 요청한다", async () => {
  withSession();
  setUnauthorizedHandler(null);
  nextResponse = respond(200, { star_notes: [], next_cursor: "note_older/+==" });

  await api.starNotes(42, { limit: 20, cursor: "note_older/+==" });

  assert.equal(lastRequest.input, "/api/be/v1/learners/42/star-notes?limit=20&cursor=note_older%2F%2B%3D%3D");
  assert.equal(lastRequest.init.headers.authorization, "Bearer test-token");
  assert.equal(lastRequest.init.method, undefined);
});

test("교사 세션은 학생 세션과 분리해 저장하고 지운다", () => {
  withSession();
  storeEducatorSession("teacher-token", {
    id: 7,
    displayName: "김교사",
    position: "교사",
    organizationId: 3,
    organizationName: "모르미초",
  });

  assert.equal(localStorage.getItem("mormi-access-token"), "test-token");
  assert.equal(localStorage.getItem("mormi-educator-token"), "teacher-token");

  clearEducatorSession();
  assert.equal(localStorage.getItem("mormi-access-token"), "test-token");
  assert.equal(localStorage.getItem("mormi-educator-token"), null);
  assert.equal(localStorage.getItem("mormi-educator"), null);
});

test("학급 API는 학생 토큰이 아니라 교사 토큰으로 요청한다", async () => {
  withSession();
  storeEducatorSession("teacher-token", {
    id: 7,
    displayName: "김교사",
    position: "교사",
    organizationId: 3,
    organizationName: "모르미초",
  });
  nextResponse = respond(200, []);

  await api.cohorts();

  assert.equal(lastRequest.input, "/api/be/v1/cohorts");
  assert.equal(lastRequest.init.headers.authorization, "Bearer teacher-token");
});
