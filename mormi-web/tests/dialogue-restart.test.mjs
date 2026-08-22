import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  cafeStageFromRememberedScreen,
  createDialogueStartIntent,
  readReloadDialogueId,
  readReloadDialogueScreen,
  rememberDialogueId,
  rememberDialogueScreen,
} from "../app/dialogue-restart.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("실제 새로고침일 때만 직전 대화 화면을 restart 대상으로 복구한다", () => {
  const storage = memoryStorage();
  rememberDialogueScreen("cafe-calculate", storage);
  rememberDialogueId("conversation-before-reload", storage);

  assert.equal(readReloadDialogueScreen(storage, [{ type: "navigate" }]), null);
  assert.equal(readReloadDialogueScreen(storage, [{ type: "reload" }]), "cafe-calculate");
  assert.equal(readReloadDialogueId(storage, [{ type: "reload" }]), "conversation-before-reload");
  assert.equal(cafeStageFromRememberedScreen("cafe-calculate"), "calculate");
  assert.equal(cafeStageFromRememberedScreen("home-teach"), null);
});

test("한 restart 요청은 고정된 request_id와 명시적 start_mode를 사용한다", () => {
  assert.deepEqual(createDialogueStartIntent("restart", "reload-request-1"), {
    start_mode: "restart",
    request_id: "reload-request-1",
  });
});

test("홈과 카페는 이전 UI를 비운 뒤 BE restart 계약으로 첫 턴을 연다", async () => {
  const [journey, app, dialogue] = await Promise.all([
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mormi-dialogue.ts", import.meta.url), "utf8"),
  ]);

  assert.match(journey, /setCafeConversations\(\(current\) => \(\{ \.\.\.current, \[stage\]: undefined \}\)\)/);
  assert.match(journey, /createDialogueStartIntent\(startMode\)/);
  assert.match(journey, /conversation\.conversation_id === reloadDialogueIdRef\.current/);
  assert.match(journey, /cafeDialogueStartRequests\.current\[stage\] \?\?/);
  assert.match(app, /previousTeachingConversationId\.current[\s\S]{0,500}nextConversation\.conversation_id === previousTeachingConversationId\.current/);
  assert.match(dialogue, /start_mode: "restart" \| "resume";[\s\S]{0,100}request_id: string/);
  assert.doesNotMatch(dialogue, /restart\?: boolean/);
});
