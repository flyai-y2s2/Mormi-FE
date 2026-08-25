import type { MormiTurn } from "./mormi-dialogue";

type HelpCard = NonNullable<MormiTurn["help_card"]>;

/**
 * 도움 카드가 화면에 존재하는지는 최신 서버 턴만 결정한다.
 *
 * FE가 no_response 여부를 따로 기억하면 일반 텍스트 오답으로 AI가 카드를
 * 공개한 턴, 대화 복구 턴, 멱등 응답 재생 턴에서 화면과 대사가 어긋난다.
 */
export function visibleHelpCard(turn: Pick<MormiTurn, "help_card"> | null | undefined): MormiTurn["help_card"] {
  return turn?.help_card?.visible === true ? turn.help_card : null;
}

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
