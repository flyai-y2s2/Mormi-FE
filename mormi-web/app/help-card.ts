import type { MormiTurn } from "./mormi-dialogue";

type HelpCard = NonNullable<MormiTurn["help_card"]>;

/**
 * joint_reading_card는 읽을 문장을 visual_data.text에도 담는다.
 * AI가 body와 같은 문장을 보낸 경우 한 카드 안에서 두 번 읽히지 않게 한다.
 */
export function helpBodyIsRepeatedByVisual(card: HelpCard) {
  if (card.visual_type !== "joint_reading_card") return false;
  const visualText = card.visual_data?.text;
  return typeof visualText === "string"
    && visualText.trim() !== ""
    && visualText.trim() === card.body.trim();
}
