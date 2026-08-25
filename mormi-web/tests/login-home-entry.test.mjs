import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("학생 로그인 뒤에는 이전 문제를 자동 복구하지 않고 집에서 시작한다", async () => {
  const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");
  const enterApp = app.slice(
    app.indexOf("async function enterApp"),
    app.indexOf("async function handleSignup"),
  );

  assert.match(enterApp, /setStage\("home"\)/);
  assert.match(enterApp, /api\.progress\(\)/);
  assert.match(enterApp, /setCompletedSessionIds\(snapshot\.completed_session_ids\)/);
  assert.doesNotMatch(enterApp, /restoreLearningSession/);
  assert.doesNotMatch(enterApp, /setStage\("drill"\)/);
});
