import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

test("AI 가르치기 완료 응답은 다음 화면을 기다리지 않고 BE 완료 기록을 저장한다", () => {
  assert.match(
    source,
    /nextTurn\.status === "completed"[\s\S]*?finish\(false, \{ navigate: false, turn: nextTurn \}\)/,
  );
});

test("백그라운드 완료 저장은 별노트와 보상 화면을 자동으로 넘기지 않는다", () => {
  assert.match(source, /const navigate = options\.navigate \?\? true/);
  assert.match(source, /if \(finishNavigationRequested\.current\) setStage\(nextStage\)/);
  assert.match(source, /if \(hasTeachingNote\) \{\s*setStage\("wrap"\);\s*return;/);
});
