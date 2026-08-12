export const cafeRequiredSessionIds = [
  "money-count",
  "money-price",
  "money-budget",
  "money-mission",
] as const;

export const cafeStations = ["줄 서기", "음료 선택하기", "음료 계산하기", "거스름돈 받기"] as const;

export const cafeMoney = [
  { value: 100, label: "100원", image: "/cafe-money/100.png", kind: "coin" },
  { value: 500, label: "500원", image: "/cafe-money/500.png", kind: "coin" },
  { value: 1000, label: "1,000원", image: "/cafe-money/1000.png", kind: "bill" },
  { value: 5000, label: "5,000원", image: "/cafe-money/5000.png", kind: "bill" },
] as const;

export function isCafeUnlocked(completedSessionIds: string[]) {
  return cafeRequiredSessionIds.every((id) => completedSessionIds.includes(id));
}
