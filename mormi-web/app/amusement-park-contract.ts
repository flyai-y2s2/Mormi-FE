import type { AmusementStageId } from "./api-client";

/**
 * 문제 문장·수·정답·힌트는 AI 턴 계약을 사용하고, 진행 상태는 BE 방문 응답을 사용한다.
 * 이 파일에는 교육 내용이 아닌 FE 표시 자산만 둔다.
 */
export const amusementStageVisuals: Record<AmusementStageId, {
  image_url: string;
  element_image_url: string;
}> = {
  ticket: {
    image_url: "/amusement-park/ticket-booth.png",
    element_image_url: "/amusement-park/ticket-elements-v2.png",
  },
  snack_split: {
    image_url: "/amusement-park/churros-split.png",
    element_image_url: "/amusement-park/churros-elements-v2.png",
  },
  pass_break_even: {
    image_url: "/amusement-park/ride-pass.png",
    element_image_url: "/amusement-park/pass-elements-v2.png",
  },
};
