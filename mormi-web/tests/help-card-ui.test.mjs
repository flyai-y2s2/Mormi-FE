import assert from "node:assert/strict";
import test from "node:test";

import { helpBodyIsRepeatedByVisual, visibleHelpCard } from "../app/help-card.ts";

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

test("일반 오답과 no_response 모두 최신 서버 턴이 도움 카드를 열면 바로 표시한다", () => {
  for (const responseType of ["text", "no_response"]) {
    const card = helpCard({ response_type: responseType });
    assert.equal(visibleHelpCard({ help_card: card }), card);
  }
});

test("다음 서버 턴이 도움 카드를 닫거나 제거하면 이전 카드를 남기지 않는다", () => {
  assert.equal(visibleHelpCard({ help_card: helpCard({ visible: false }) }), null);
  assert.equal(visibleHelpCard({ help_card: null }), null);
  assert.equal(visibleHelpCard(null), null);
});
