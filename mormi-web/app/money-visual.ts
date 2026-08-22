export const currencyVisualDenominations = [100, 500, 1000, 5000] as const;

export type CurrencyVisualDenomination = (typeof currencyVisualDenominations)[number];

export function isCurrencyVisualDenomination(value: number): value is CurrencyVisualDenomination {
  return currencyVisualDenominations.some((denomination) => denomination === value);
}

function nearestCurrencyVisualDenomination(value: number): CurrencyVisualDenomination {
  return currencyVisualDenominations.reduce((nearest, denomination) => (
    Math.abs(denomination - value) < Math.abs(nearest - value) ? denomination : nearest
  ));
}

/**
 * 상품 사진이 없는 금액 카드는 실제 동전·지폐를 뜻하므로 통용 단위만 유지한다.
 * 상품 사진이 있는 카드는 상품 가격이므로 1,200원 같은 값도 문제 변형에 사용할 수 있다.
 */
export function variedMoneyVisualAmounts(
  amounts: number[],
  hasProductLabels: boolean,
  seed: number,
) {
  if (!hasProductLabels) {
    return amounts.map((amount) => (
      isCurrencyVisualDenomination(amount) ? amount : nearestCurrencyVisualDenomination(amount)
    ));
  }

  return amounts.map((amount, index) => amount + 100 * (((seed + index) % 3 + 3) % 3));
}
