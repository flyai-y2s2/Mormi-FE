import assert from "node:assert/strict";
import test from "node:test";

const { sessionById } = await import("../app/math-curriculum.ts");

test("수 비교 4·5번째 문제는 더 많은 쪽을 묻고 정답도 일치한다", () => {
  const session = sessionById("number-compare");

  assert.ok(session);

  const fourth = session.drills[3];
  const fifth = session.drills[4];

  assert.equal(fourth.prompt, "뭐가 더 많을까?");
  assert.equal(fourth.correct, "오른쪽");
  assert.equal(fifth.prompt, "뭐가 더 많을까?");
  assert.equal(fifth.correct, "왼쪽");
});
