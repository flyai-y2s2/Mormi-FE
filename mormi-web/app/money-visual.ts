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

type MoneyPracticeFact = { label: string; value: string };

/**
 * AI 문제는 물건마다 가격·개수를 각각 fact로 보낼 수 있다. 가격 카드가 fact의
 * 단순 배열 위치를 쓰면 두 번째 물건부터 개수와 가격이 어긋나므로, 가격 fact만
 * 먼저 골라 물건 순서대로 대응한다. 예산은 상품 가격이 아니어서 제외한다.
 */
export function moneyPracticeItemPrices(facts: MoneyPracticeFact[], itemCount: number) {
  return facts
    .filter((fact) => !/예산|가진 돈|준비한 돈|가지고 있는 돈/.test(fact.label))
    .map((fact) => fact.value.match(/\d[\d,]*원/)?.[0])
    .filter((amount): amount is string => Boolean(amount))
    .slice(0, itemCount);
}
