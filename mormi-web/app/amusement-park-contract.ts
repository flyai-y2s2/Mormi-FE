/**
 * 놀이동산 생활수학의 FE 선행 계약.
 *
 * 현재 값은 화면 검수용 fixture이며 학습 판정이나 저장에 사용하지 않는다.
 * BE가 같은 필드로 방문 스냅샷을 제공하면 UI 코드를 바꾸지 않고 data만 교체한다.
 */
export type AmusementStageId = "ticket" | "snack_split" | "pass_break_even";

export type AmusementFact = {
  key: string;
  label: string;
  value: number;
  unit: "원" | "명" | "번";
};

export type AmusementTransfer = {
  prompt: string;
  equation: string;
  conclusion: string;
};

export type AmusementStageContract = {
  stage_id: AmusementStageId;
  scenario_id: string;
  title: string;
  mission: string;
  skill: "multiply" | "divide" | "mixed";
  strategy: string;
  image_url: string;
  element_image_url: string;
  mormi_misconception: string;
  prompt: string;
  facts: AmusementFact[];
  verified_facts: Record<string, number>;
  transfer: AmusementTransfer;
};

export type AmusementVisitContract = {
  theme_id: "amusement_park";
  visit_id: string;
  stage_order: AmusementStageId[];
  stages: AmusementStageContract[];
};

export const amusementParkPreview: AmusementVisitContract = {
  theme_id: "amusement_park",
  visit_id: "fe-preview-only",
  stage_order: ["ticket", "snack_split", "pass_break_even"],
  stages: [
    {
      stage_id: "ticket",
      scenario_id: "amusement_ticket_multiply",
      title: "매표소",
      mission: "우리 일행 표 사기",
      skill: "multiply",
      strategy: "같은 돈이 여러 번이면 곱하면 돼",
      image_url: "/amusement-park/ticket-booth.png",
      element_image_url: "/amusement-park/ticket-elements-v2.png",
      mormi_misconception: "표가 네 장이면 가격도 네 번 봐야 하나? 그냥 3,000원만 내면 되는 줄 알았어.",
      prompt: "표 두 장의 값을 어떻게 구하는지 알려줄래?",
      facts: [
        { key: "ticket_price", label: "1인 입장료", value: 3000, unit: "원" },
        { key: "party_count", label: "우리 일행", value: 2, unit: "명" },
      ],
      verified_facts: { ticket_price: 3000, party_count: 2, total_price: 6000 },
      transfer: {
        prompt: "그럼 1인 3,500원이고 4명이면?",
        equation: "3,500 × 4 = 14,000",
        conclusion: "3,500원을 네 번 더한 것과 같으니까 14,000원이야!",
      },
    },
    {
      stage_id: "snack_split",
      scenario_id: "amusement_snack_divide",
      title: "간식 나눠 내기",
      mission: "츄러스 값을 똑같이 나누기",
      skill: "divide",
      strategy: "똑같이 나누고, 거꾸로 곱해서 확인해",
      image_url: "/amusement-park/churros-split.png",
      element_image_url: "/amusement-park/churros-elements-v2.png",
      mormi_misconception: "먼저 돈 내는 사람이 조금 더 내도 되지 않아? 똑같이 내는 방법은 잘 모르겠어.",
      prompt: "츄러스 값을 똑같이 나누는 방법을 알려줄래?",
      facts: [
        { key: "snack_total", label: "간식 합계", value: 9000, unit: "원" },
        { key: "payer_count", label: "나눠 낼 사람", value: 3, unit: "명" },
      ],
      verified_facts: { snack_total: 9000, payer_count: 3, per_person: 3000 },
      transfer: {
        prompt: "12,000원을 4명이 나누면 한 명은 얼마씩 낼까?",
        equation: "12,000 ÷ 4 = 3,000 · 3,000 × 4 = 12,000",
        conclusion: "한 명에 3,000원이고, 다시 네 번 곱하면 원래 돈이 나와!",
      },
    },
    {
      stage_id: "pass_break_even",
      scenario_id: "amusement_pass_break_even",
      title: "자유이용권의 비밀",
      mission: "몇 번 타야 이득인지 결정하기",
      skill: "mixed",
      strategy: "몇 번이면 같아지는지 먼저 찾아",
      image_url: "/amusement-park/ride-pass.png",
      element_image_url: "/amusement-park/pass-elements-v2.png",
      mormi_misconception: "자유이용권이 더 비싸니까 무조건 더 좋은 거 아니야? 비싼 게 더 이득일 것 같아.",
      prompt: "몇 번 타면 두 가격이 같아지는지 알려줄래?",
      facts: [
        { key: "single_ride_price", label: "놀이기구 1회", value: 2500, unit: "원" },
        { key: "day_pass_price", label: "자유이용권", value: 10000, unit: "원" },
      ],
      verified_facts: { single_ride_price: 2500, day_pass_price: 10000, break_even_rides: 4, benefit_from_rides: 5 },
      transfer: {
        prompt: "범퍼카 1회 2,000원, 이용권 8,000원이면?",
        equation: "8,000 ÷ 2,000 = 4",
        conclusion: "네 번이면 본전이고, 다섯 번부터 이용권이 이득이야!",
      },
    },
  ],
};
