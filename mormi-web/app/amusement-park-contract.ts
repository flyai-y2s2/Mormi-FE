import type { AmusementStageId } from "./api-client";

/**
 * 학습 문장·수·정답·진행 상태는 모두 BE 방문 응답을 사용한다.
 * 이 파일에는 서버 계약에 포함되지 않는 FE 표시 자산과 입력 필드 모양만 둔다.
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

/**
 * 직접 제출 UI가 BE에 보낼 파생 정답 키만 정의한다.
 * 문제 사실과 기대 정답은 방문 응답에 있으며, FE는 여기 있는 필드 이름으로 아이의 답만 수집한다.
 */
export const amusementAnswerFields: Record<AmusementStageId, ReadonlyArray<{
  key: string;
  label: string;
  unit: "원" | "번";
}>> = {
  ticket: [{ key: "total_price", label: "표 전체 값", unit: "원" }],
  snack_split: [{ key: "per_person", label: "한 사람이 낼 돈", unit: "원" }],
  pass_break_even: [
    { key: "break_even_rides", label: "본전이 되는 횟수", unit: "번" },
    { key: "benefit_from_rides", label: "이득이 시작되는 횟수", unit: "번" },
  ],
};
