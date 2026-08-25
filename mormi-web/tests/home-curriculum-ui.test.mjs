import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sessions } from "../app/math-curriculum.ts";

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
  assert.match(journey, /amusementParkRequiredSessionIds = \[\s*"multiply-groups",\s*"multiply-addition",\s*"divide-share",\s*"divide-group",\s*"multiply-easy-tables"/);
  assert.match(journey, /"multiply-groups": "가격과 개수를 곱해 전체 값 구하기"/);
  assert.match(journey, /"multiply-addition": "같은 가격을 이어 더해 확인하기"/);
  assert.match(journey, /"divide-share": "간식값을 사람 수로 똑같이 나누기"/);
  assert.match(journey, /"divide-group": "예산으로 살 수 있는 개수 구하기"/);
  assert.match(journey, /"multiply-easy-tables": "여러 물건값을 계산하고 예산과 비교하기"/);
  assert.match(journey, /amusementParkRequiredConceptImages/);
});

test("놀이동산 준비 문제는 질문과 물건 그림만 남긴 간결한 카드로 연결된다", async () => {
  const [app, curriculum, content] = await Promise.all([
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/math-curriculum.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/morami-content.ts", import.meta.url), "utf8"),
  ]);

  assert.match(content, /type: "money-practice"/);
  assert.match(app, /function MoneyPracticeVisual/);
  const visual = app.slice(app.indexOf("function MoneyPracticeVisual"), app.indexOf("function LearningVisual"));
  assert.match(visual, /<figure className="money-practice-visual"/);
  assert.doesNotMatch(visual, /visual\.badge|visual\.facts|visual\.equation|money-practice-facts/);
  assert.match(app, /amusementParkRequiredConceptImages/);
  assert.match(curriculum, /unit: "돈 계산 곱셈"/);
  assert.match(curriculum, /unit: "돈 계산 나눗셈"/);
  assert.match(curriculum, /unit: "돈 계산 혼합"/);
  assert.match(curriculum, /ticket-party\.png/);
  assert.match(curriculum, /snack-repeat\.png/);
  assert.match(curriculum, /squishy-share\.png/);
  assert.match(curriculum, /keychain-budget\.png/);
  assert.match(curriculum, /mixed-purchase\.png/);
});

test("놀이동산 준비 세션의 각 문제는 서로 다른 물건 사진 구성을 사용한다", () => {
  const requiredSessionIds = [
    "multiply-groups",
    "multiply-addition",
    "divide-share",
    "divide-group",
    "multiply-easy-tables",
  ];

  for (const sessionId of requiredSessionIds) {
    const session = sessions.find((entry) => entry.id === sessionId);
    assert.ok(session, `${sessionId} 세션이 있어야 한다`);

    const signatures = session.drills.map((problem) => {
      assert.equal(problem.visual.type, "money-practice");
      if (problem.visual.type !== "money-practice") return "";
      assert.ok(problem.visual.items?.length, `${sessionId}의 모든 문제에 물건 사진이 있어야 한다`);
      return problem.visual.items?.map((item) => `${item.image}:${item.count}`).join("|") ?? "";
    });

    assert.equal(new Set(signatures).size, signatures.length, `${sessionId} 안에서 같은 사진 구성을 재사용하면 안 된다`);
  }
});

test("반복학습 회차마다 무작위 seed를 만들고 서버 복구용 seed와 동일하게 사용한다", async () => {
  const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

  assert.match(app, /globalThis\.crypto\.getRandomValues\(value\)/);
  assert.match(app, /const nextVariantSeed = randomVariantSeed\(\)/);
  assert.match(app, /setVariantSeed\(nextVariantSeed\)/);
  assert.match(app, /api\.startSession\(sessions\[nextIndex\]\.id, nextVariantSeed\)/);
  assert.match(app, /seededChoiceIndex\(seed, answers\.length \+ 1\)/);
});

test("반복학습의 각 문제는 독립 난수로 정답 위치를 정한다", async () => {
  const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

  assert.match(app, /function randomAnswerChoiceSeeds\(count: number\)/);
  assert.match(app, /globalThis\.crypto\.getRandomValues\(values\)/);
  assert.match(app, /const nextAnswerChoiceSeeds = randomAnswerChoiceSeeds\(masteryTarget\)/);
  assert.match(app, /setAnswerChoiceSeeds\(nextAnswerChoiceSeeds\)/);
  assert.match(app, /const answerChoiceSeed = answerChoiceSeeds\[index\] \?\? seed/);
  assert.match(app, /shuffleProblemAnswers\(varyProblem\(problem, variationSeed\), answerChoiceSeed\)/);
  assert.doesNotMatch(app, /shuffleProblemAnswers\(varyProblem\(problem, variationSeed\), seed\)/);
});
