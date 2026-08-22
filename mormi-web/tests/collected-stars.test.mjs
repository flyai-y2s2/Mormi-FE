import assert from "node:assert/strict";
import test from "node:test";

import { collectedStarConcepts } from "../app/collected-stars.ts";

test("서버가 완료한 세션만 커리큘럼 순서대로 별 개념에 연결한다", () => {
  const concepts = collectedStarConcepts(["money-count", "add-pictures", "missing", "money-count"]);

  assert.deepEqual(concepts.map((concept) => concept.id), ["add-pictures", "money-count"]);
  assert.deepEqual(concepts.map((concept) => concept.stars), [3, 3]);
  assert.equal(concepts[0]?.title, "그림을 모아요");
  assert.equal(concepts[0]?.concept, "더하기는 둘을 한데 모으는 거야.");
});

test("완료한 세션이 없으면 모아보기는 빈 상태가 된다", () => {
  assert.deepEqual(collectedStarConcepts([]), []);
  assert.deepEqual(collectedStarConcepts(["unknown-session"]), []);
});
