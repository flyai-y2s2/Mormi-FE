import assert from "node:assert/strict";
import test from "node:test";

import {
  numericChoiceValue,
  orderedNumericChoicesWithSeededCorrect,
} from "../app/answer-choices.ts";

test("숫자 보기는 오름차순을 유지하면서 정답 위치가 seed마다 달라진다", () => {
  const choices = ["3", "2", "4", "5"];
  const positions = Array.from({ length: 4 }, (_, seed) => {
    const answers = orderedNumericChoicesWithSeededCorrect(choices, "3", seed);
    assert.ok(answers);
    assert.deepEqual(answers.map(numericChoiceValue), answers.map(numericChoiceValue).toSorted((a, b) => a - b));
    return answers.indexOf("3");
  });

  assert.deepEqual(positions, [0, 1, 2, 3]);
});

test("금액 형식과 낮은 수의 음수 방지를 유지한다", () => {
  assert.deepEqual(
    orderedNumericChoicesWithSeededCorrect(["3,000원", "2,900원", "3,100원", "3,200원"], "3,000원", 2),
    ["2,800원", "2,900원", "3,000원", "3,100원"],
  );
  assert.deepEqual(
    orderedNumericChoicesWithSeededCorrect(["1개", "2개", "3개", "4개"], "1개", 3),
    ["0개", "1개", "2개", "3개"],
  );
});

test("숫자가 아닌 보기는 기존 셔플 경로로 넘긴다", () => {
  assert.equal(orderedNumericChoicesWithSeededCorrect(["원", "삼각형", "사각형", "오각형"], "원", 1), null);
});
