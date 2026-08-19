import assert from "node:assert/strict";
import test from "node:test";

import { helpBodyIsRepeatedByVisual } from "../app/help-card.ts";

function helpCard(overrides = {}) {
  return {
    visible: true,
    auto_open: true,
    level: "H3",
    title: "도움 카드",
    body: "색칠된 칸을 차례로 세면 모두 3개야.",
    visual_type: "joint_reading_card",
    visual_data: { text: "색칠된 칸을 차례로 세면 모두 3개야." },
    ...overrides,
  };
}

test("같은 joint reading 문장은 도움 카드에서 한 번만 렌더링한다", () => {
  assert.equal(helpBodyIsRepeatedByVisual(helpCard()), true);
});

test("다른 시각 문장이나 다른 시각 유형의 본문은 유지한다", () => {
  assert.equal(helpBodyIsRepeatedByVisual(helpCard({ visual_data: { text: "함께 읽어 보자." } })), false);
  assert.equal(helpBodyIsRepeatedByVisual(helpCard({ visual_type: "number_cards", visual_data: { cards: [1, 2, 3] } })), false);
});
