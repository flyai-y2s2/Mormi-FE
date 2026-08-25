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

test("로그인 상태에서 새로고침해도 진행 중 문제를 복원하지 않고 메인으로 간다", async () => {
  const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");
  const bootEffect = app.slice(
    app.indexOf("const storedLearner = readStoredLearner();"),
    app.indexOf("useEffect(() => {\n    if (stage === \"teach\")"),
  );

  assert.match(bootEffect, /api\.progress\(\)/);
  assert.match(bootEffect, /setStage\("home"\)/);
  assert.doesNotMatch(bootEffect, /restoreLearningSession|api\.getSession|setStage\("drill"\)/);
  assert.match(app, /if \(stage === "home"\) \{[\s\S]*setReloadDialogueScreen\(null\);[\s\S]*setReloadDialogueId\(null\);/);
});
