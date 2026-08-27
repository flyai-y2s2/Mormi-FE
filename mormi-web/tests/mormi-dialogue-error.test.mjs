import assert from "node:assert/strict";
import test from "node:test";

let nextResponse;
globalThis.fetch = async () => nextResponse;

const {
  MormiDialogueError,
  startMormiConversation,
} = await import("../app/mormi-dialogue.ts");

test("AI 직접 테스트 경로가 FastAPI의 중첩 오류를 그대로 보여준다", async () => {
  nextResponse = new Response(JSON.stringify({
    detail: {
      code: "model_output_invalid",
      message: "모델 응답 형식을 확인하지 못했어요.",
      issues: [],
    },
  }), { status: 503, headers: { "content-type": "application/json" } });

  await assert.rejects(
    () => startMormiConversation({ learner_id: 1, scene: "cafe", scenario_id: "cafe_queue" }),
    (error) => {
      assert.ok(error instanceof MormiDialogueError);
      assert.equal(error.status, 503);
      assert.equal(error.code, "model_output_invalid");
      assert.equal(error.message, "모델 응답 형식을 확인하지 못했어요.");
      return true;
    },
  );
});
