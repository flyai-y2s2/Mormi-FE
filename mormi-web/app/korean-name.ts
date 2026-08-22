const compoundFamilyNames = ["남궁", "황보", "제갈", "선우", "독고", "사공", "서문", "동방"] as const;

/**
 * 가입 이름에서 화면 호칭으로 쓸 이름만 꺼낸다.
 *
 * 세 글자 한국 이름은 첫 글자를 성으로 보고, 두 글자 이름은 그대로 쓴다.
 * 드문 두 글자 성도 함께 처리한다.
 */
export function givenNameFromFullName(fullName: string | null | undefined) {
  const name = fullName?.replace(/\s/g, "").trim() ?? "";
  if (!name) return "친구";

  const compoundFamilyName = compoundFamilyNames.find((familyName) => name.startsWith(familyName));
  if (compoundFamilyName && name.length > compoundFamilyName.length) return name.slice(compoundFamilyName.length);
  return name.length >= 3 ? name.slice(1) : name;
}

/** 주격 조사 '이/가'를 마지막 한글 음절의 받침 유무로 고른다. */
export function nameWithSubjectParticle(name: string) {
  const normalized = name.trim() || "친구";
  const last = normalized.at(-1) ?? "";
  const code = last.charCodeAt(0);
  const hasBatchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${normalized}${hasBatchim ? "이" : "가"}`;
}
