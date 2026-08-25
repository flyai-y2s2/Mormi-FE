export const cafeRequiredSessionIds = [
  "number-count",
  "number-compare",
  "money-count",
  "money-price",
  "money-budget",
] as const;

/**
 * 놀이동산의 세 미션 전에 복습할 기존 학습 세션.
 *
 * BE·AI가 이미 알고 있는 세션 ID를 재사용해 진행·저장 계약을 유지한다.
 * 반복 문제와 시각 자료는 놀이동산 돈 관리 흐름에 맞게 FE에서 구성한다.
 * 놀이동산 해금 자체는 서버가 카페 완료 여부로 판정하므로, 이 목록은 준비 학습
 * 진입점이며 서버의 장소 진행 규칙을 대신하지 않는다.
 */
export const amusementParkRequiredSessionIds = [
  "multiply-groups",
  "divide-share",
  "divide-group",
  "multiply-easy-tables",
] as const;

/** 장소 카드에서는 교과서식 세션명보다 다음 미션에서 바로 할 행동을 보여 준다. */
export const cafeRequiredConceptTitles: Record<(typeof cafeRequiredSessionIds)[number], string> = {
  "number-count": "수 세기",
  "number-compare": "수 비교하기",
  "money-count": "돈 세기",
  "money-price": "물건값 더하기",
  "money-budget": "예산 안에서 고르기",
};

export const amusementParkRequiredConceptTitles: Record<(typeof amusementParkRequiredSessionIds)[number], string> = {
  "multiply-groups": "가격과 개수를 곱해요",
  "divide-share": "간식값을 똑같이 나눠요",
  "divide-group": "예산으로 살 수 있는 개수를 찾아요",
  "multiply-easy-tables": "여러 물건값과 예산을 비교해요",
};

export const amusementParkRequiredConceptImages: Record<(typeof amusementParkRequiredSessionIds)[number], string> = {
  "multiply-groups": "/life-missions/money-practice/ticket-party.png",
  "divide-share": "/life-missions/money-practice/squishy-share.png",
  "divide-group": "/life-missions/money-practice/keychain-budget.png",
  "multiply-easy-tables": "/life-missions/money-practice/mixed-purchase.png",
};

export const outsideRequiredSessionIds = [
  ...cafeRequiredSessionIds,
  ...amusementParkRequiredSessionIds,
] as const;

export const cafeStations = ["줄 서기", "메뉴 값 계산하기", "거스름돈 받기"] as const;

export const cafeMoney = [
  { value: 100, label: "100원", image: "/cafe-money/100.png", kind: "coin" },
  { value: 500, label: "500원", image: "/cafe-money/500.png", kind: "coin" },
  { value: 1000, label: "1,000원", image: "/cafe-money/1000.png", kind: "bill" },
  { value: 5000, label: "5,000원", image: "/cafe-money/5000.png", kind: "bill" },
] as const;

export function isCafeUnlocked(completedSessionIds: string[]) {
  return cafeRequiredSessionIds.every((id) => completedSessionIds.includes(id));
}
