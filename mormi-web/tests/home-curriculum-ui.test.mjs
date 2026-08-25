import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("집 반복학습은 간결한 제목과 장소 미션에 맞는 개념 순서를 사용한다", async () => {
  const [app, journey] = await Promise.all([
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/journey-config.ts", import.meta.url), "utf8"),
  ]);
  const curriculum = app.slice(app.indexOf('{stage === "curriculum"'), app.indexOf('{stage === "drill"'));

  assert.match(curriculum, /room-list-heading room-list-heading--curriculum"><h1>집에서 복습하기<\/h1>/);
  assert.doesNotMatch(curriculum, /생활에 필요한 개념부터 배워요|밖에서도 자연스럽게 사용할 수 있도록 반복학습으로 준비해요/);
  assert.doesNotMatch(curriculum, /줄의 사람을 1~5명까지 정확히 세어요|두 줄 중 사람이 더 적은 쪽을 찾아요|같은 수를 여러 번 더하는 방법을 익혀요/);
  assert.match(journey, /"number-count": "사람 수 차례대로 세기"/);
  assert.match(journey, /"money-budget": "예산 안에서 고르기"/);
  assert.match(journey, /amusementParkRequiredSessionIds = \[\s*"multiply-groups",\s*"divide-share",\s*"divide-group"/);
  assert.match(journey, /"multiply-groups": "같은 가격을 사람 수만큼 계산하기"/);
  assert.match(journey, /"divide-share": "간식값을 똑같이 나누기"/);
  assert.match(journey, /"divide-group": "몇 번 타면 본전인지 찾기"/);
});

test("반복학습 회차마다 무작위 seed를 만들고 서버 복구용 seed와 동일하게 사용한다", async () => {
  const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

  assert.match(app, /globalThis\.crypto\.getRandomValues\(value\)/);
  assert.match(app, /const nextVariantSeed = randomVariantSeed\(\)/);
  assert.match(app, /setVariantSeed\(nextVariantSeed\)/);
  assert.match(app, /api\.startSession\(sessions\[nextIndex\]\.id, nextVariantSeed\)/);
  assert.match(app, /seededChoiceIndex\(seed, answers\.length \+ 1\)/);
});
