import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

test("AI 가르치기 완료 응답은 다음 화면을 기다리지 않고 BE 완료 기록을 저장한다", () => {
  assert.match(
    source,
    /nextTurn\.status === "completed"[\s\S]*?finish\(false, \{[\s\S]*?navigate: false,[\s\S]*?turn: nextTurn,[\s\S]*?conversationId: nextConversation\.conversation_id/,
  );
});

test("백그라운드 완료 저장은 별노트와 보상 화면을 자동으로 넘기지 않는다", () => {
  assert.match(source, /const navigate = options\.navigate \?\? true/);
  assert.match(source, /if \(finishNavigationRequested\.current\) setStage\(nextStage\)/);
  assert.match(source, /if \(hasTeachingNote\) \{\s*setStage\("wrap"\);\s*return;/);
});

test("개별 문제 기록 실패가 최종 세션 완료를 막지 않는다", () => {
  assert.doesNotMatch(source, /if \(!sessionId \|\| attemptWriteError\.current\)/);
  assert.match(source, /if \(attemptWriteError\.current\) \{[\s\S]*?세션 완료를 계속합니다/);
  assert.match(source, /for \(let attempt = 0; attempt < 3 && !result; attempt \+= 1\)/);
});

test("완료 대화 식별자를 보내고 홈 진입 때 진행도를 다시 동기화한다", () => {
  assert.match(source, /conversation_id: options\.conversationId \?\? mormiConversation\?\.conversation_id/);
  assert.match(source, /conversationId: nextConversation\.conversation_id/);
  assert.match(source, /async function syncHomeProgress\(\)[\s\S]*?await finish\(false, \{ navigate: false, turn: teachingTurn \}\)[\s\S]*?await api\.progress\(\)/);
  assert.match(source, /\[mormi-api\] 홈 진행도 동기화 실패/);
});

test("동시에 들어온 완료 호출은 같은 요청을 기다린 뒤 진행도를 읽는다", () => {
  assert.match(source, /const finishRequest = useRef<Promise<void> \| null>\(null\)/);
  assert.match(source, /if \(finishRequest\.current\) \{\s*await finishRequest\.current/);
  assert.doesNotMatch(source, /if \(finishInProgress\.current\) return/);
});
