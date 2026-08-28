import assert from "node:assert/strict";
import test from "node:test";

import { sessions } from "../app/morami-content.ts";
import {
  currencyVisualDenominations,
  isCurrencyVisualDenomination,
  moneyPracticeItemPrices,
  variedMoneyVisualAmounts,
} from "../app/money-visual.ts";

test("화폐 그림 문제의 원본 금액은 실제 통용 단위만 사용한다", () => {
  const currencyVisualAmounts = sessions.flatMap((session) => (
    [...session.drills, ...session.homework]
      .filter((problem) => problem.visual.type === "money" && !problem.visual.labels?.length)
      .flatMap((problem) => problem.visual.type === "money" ? problem.visual.amounts : [])
  ));

  assert.ok(currencyVisualAmounts.length > 0);
  assert.ok(currencyVisualAmounts.every(isCurrencyVisualDenomination));
  assert.deepEqual(currencyVisualDenominations, [100, 500, 1000, 5000]);
});

test("문제를 변형해도 화폐 그림은 실제 단위에서 벗어나지 않는다", () => {
  for (let seed = -12; seed <= 12; seed += 1) {
    const amounts = variedMoneyVisualAmounts([100, 500, 1000, 5000], false, seed);
    assert.ok(amounts.every(isCurrencyVisualDenomination));
  }

  assert.deepEqual(variedMoneyVisualAmounts([1200, 4800], false, 3), [1000, 5000]);
});

test("상품 사진에 표시되는 가격은 화폐 단위와 별도로 변형할 수 있다", () => {
  assert.deepEqual(variedMoneyVisualAmounts([1200, 800], true, 1), [1300, 1000]);
  assert.equal(isCurrencyVisualDenomination(1200), false);
});

test("가격과 개수가 번갈아 오는 가르치기 문제도 모든 상품 가격을 순서대로 표시한다", () => {
  const facts = [
    { label: "표 한 장 가격", value: "2,500원" },
    { label: "표 개수", value: "2장" },
    { label: "주스 한 잔 가격", value: "1,500원" },
    { label: "주스 개수", value: "2잔" },
    { label: "스티커 한 장 가격", value: "3,000원" },
    { label: "스티커 개수", value: "1장" },
    { label: "예산", value: "10,000원" },
  ];

  assert.deepEqual(moneyPracticeItemPrices(facts, 3), ["2,500원", "1,500원", "3,000원"]);
});
