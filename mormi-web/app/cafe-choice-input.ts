type ChoiceLike = {
  id: string;
  label: string;
  disabled?: boolean | null;
};

function compact(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * 선택형 서버 턴도 아이가 먼저 직접 답할 수 있도록, 입력한 말을 서버 choice.id에만 연결한다.
 * 채점은 하지 않으며 정확히 하나의 서버 선택지와 연결될 때만 그 ID를 반환한다.
 */
export function choiceIdForTypedAnswer(answer: string, choices: ChoiceLike[]) {
  const typed = compact(answer);
  if (!typed) return null;
  const typedNumber = answer.replace(/\D/g, "");
  const typedNumberParts = answer.match(/\d[\d,]*/g)?.map((value) => value.replaceAll(",", "")) ?? [];
  const matches = choices.filter((choice) => {
    if (choice.disabled) return false;
    const id = compact(choice.id);
    const label = compact(choice.label);
    if (typed === id || typed === label) return true;
    const labelNumber = choice.label.replace(/\D/g, "");
    if (typedNumber && labelNumber && (typedNumber === labelNumber || typedNumberParts.includes(labelNumber))) return true;
    return typed.length >= 2 && label.length >= 2
      && (typed.includes(label) || label.includes(typed));
  });
  return matches.length === 1 ? matches[0]!.id : null;
}
