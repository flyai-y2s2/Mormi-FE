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
 * 새 정적 문제를 FE에서 만들지 않고 BE·AI가 이미 알고 있는 세션만 재사용한다.
 * 놀이동산 해금 자체는 서버가 카페 완료 여부로 판정하므로, 이 목록은 준비 학습
 * 진입점이며 서버의 장소 진행 규칙을 대신하지 않는다.
 */
export const amusementParkRequiredSessionIds = [
  "multiply-groups",
  "divide-share",
  "divide-group",
] as const;

/** 장소 카드에서는 교과서식 세션명보다 다음 미션에서 바로 할 행동을 보여 준다. */
export const cafeRequiredConceptTitles: Record<(typeof cafeRequiredSessionIds)[number], string> = {
  "number-count": "사람 수 차례대로 세기",
  "number-compare": "더 적은 줄 찾기",
  "money-count": "돈의 값 합쳐 세기",
  "money-price": "두 메뉴값 더하기",
  "money-budget": "예산 안에서 고르기",
};

export const amusementParkRequiredConceptTitles: Record<(typeof amusementParkRequiredSessionIds)[number], string> = {
  "multiply-groups": "같은 가격을 사람 수만큼 계산하기",
  "divide-share": "간식값을 똑같이 나누기",
  "divide-group": "몇 번 타면 본전인지 찾기",
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
