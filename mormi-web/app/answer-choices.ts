function numericChoiceMatch(choice: string) {
  return choice.trim().match(/^(-?\d[\d,]*)\s*(?:원|개(?:씩)?|명(?:씩)?|묶음)?$/);
}

export function numericChoiceValue(choice: string) {
  const match = numericChoiceMatch(choice);
  if (!match) return null;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

export function orderNumericChoices(choices: string[]) {
  const numberedChoices = choices.map((choice, index) => ({ choice, index, value: numericChoiceValue(choice) }));
  if (numberedChoices.some(({ value }) => value === null)) return null;
  return numberedChoices
    .toSorted((left, right) => left.value! - right.value! || left.index - right.index)
    .map(({ choice }) => choice);
}

function numericChoiceWithValue(template: string, value: number) {
  const match = numericChoiceMatch(template);
  if (!match) return template;
  const formatted = match[1].includes(",") || template.includes("원")
    ? value.toLocaleString("ko-KR")
    : String(value);
  return template.replace(match[1], formatted);
}

/**
 * 수 보기는 작은 값부터 보여 주되 정답의 순위는 문항 seed에 따라 바꾼다.
 * 기존처럼 정답의 양옆 값만 정렬하면 정답이 늘 두 번째가 되는 문제를 막는다.
 */
export function orderedNumericChoicesWithSeededCorrect(
  choices: string[],
  correct: string,
  seed: number,
) {
  const ordered = orderNumericChoices(choices);
  const correctValue = numericChoiceValue(correct);
  if (!ordered || correctValue === null || !ordered.includes(correct)) return null;

  const values = ordered.map(numericChoiceValue).filter((value): value is number => value !== null);
  const distances = values
    .filter((value) => value !== correctValue)
    .map((value) => Math.abs(value - correctValue))
    .filter((value) => Number.isInteger(value) && value > 0);
  const step = distances.length > 0 ? Math.min(...distances) : 1;
  const desiredPosition = Math.abs(seed) % ordered.length;
  const availableLowerPositions = Math.max(0, Math.floor(correctValue / step));
  const correctPosition = Math.min(desiredPosition, availableLowerPositions);

  return Array.from({ length: ordered.length }, (_, index) => {
    const value = correctValue + (index - correctPosition) * step;
    return index === correctPosition ? correct : numericChoiceWithValue(correct, value);
  });
}
