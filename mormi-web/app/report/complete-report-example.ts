import type {
  DiagnosticDomainStatusDto,
  DiagnosticDomainTrendDto,
  DiagnosticReportDto,
  SpeechEvidenceDto,
} from "../api-client";

function trend(
  domainId: string,
  label: string,
  values: readonly number[],
  startDay: number,
  evidenceKind?: "drill" | "teach" | "life",
): DiagnosticDomainTrendDto {
  return {
    domain_id: domainId,
    label,
    total_count: values.length,
    recent_count: Math.min(3, values.length),
    points: values.map((score, index) => ({
      evidence_id: `${evidenceKind ?? (label.includes("설명") ? "teach" : "drill")}:${domainId}:${index + 1}`,
      label,
      occurred_at: `2026-08-${String(startDay + index * 2).padStart(2, "0")}T09:00:00+09:00`,
      independent_score: score,
      supported_score: Math.min(100, score + 15),
      recent: index >= values.length - 3,
    })),
  };
}

function status(
  domain_id: string,
  label: string,
  value: DiagnosticDomainStatusDto["status"],
  direction: DiagnosticDomainStatusDto["direction"],
  total_count: number,
): DiagnosticDomainStatusDto {
  return { domain_id, label, status: value, direction, total_count, recent_count: Math.min(3, total_count) };
}

export const completeDiagnosticReportExample: DiagnosticReportDto = {
  learner: { learner_id: 999, display_name: "김민준" },
  period: {
    week_start: "2026-08-10",
    week_end: "2026-08-16",
    timezone: "Asia/Seoul",
    earliest_week_start: "2026-07-13",
    latest_week_start: "2026-08-10",
  },
  data_range: {
    first_at: "2026-07-15T09:00:00+09:00",
    last_at: "2026-08-16T15:30:00+09:00",
    total_home_sessions: 18,
    total_life_visits: 6,
  },
  current_summary: {
    concept_performance: {
      text: "돈 세기 문제 정답률이 최근 88%로 좋아져 안정적으로 유지되고 있습니다.",
      evidence_refs: ["drill:money-count"],
    },
    explanation_change: {
      text: "금액을 말하는 데서 그치지 않고 동전의 단위와 계산 순서를 함께 설명합니다.",
      evidence_refs: ["speech:money-count", "teach:money-count"],
    },
    life_transfer: {
      text: "카페 메뉴 합산과 거스름돈 계산을 도움 없이 생활 문제에 적용했습니다.",
      evidence_refs: ["life:menu-calculate"],
    },
  },
  modes: [
    {
      mode: "HOME",
      domains: [
        trend("money-count", "돈 세기 · 문제 정답률", [42, 55, 61, 74, 82, 88], 1),
        trend("money-count", "돈 세기 · 혼자 설명하기", [25, 40, 58, 72, 86], 2),
        trend("price-add", "가격 합산 · 문제 정답률", [35, 52, 67, 79, 91], 3),
        trend("price-add", "가격 합산 · 혼자 설명하기", [30, 48, 66, 84], 5),
        trend("money-budget", "예산과 거스름돈 · 문제 정답률", [28, 44, 59, 70], 4),
      ],
    },
    {
      mode: "LIFE",
      domains: [
        trend("menu-calculate", "메뉴 값 계산하기", [45, 62, 80, 95], 4, "life"),
        trend("change-receive", "거스름돈 받기", [35, 58, 76, 90], 6, "life"),
        trend("queue", "줄 서기", [70, 85, 100], 8, "life"),
      ],
    },
  ],
  domains: [
    status("money-count", "돈 세기 · 문제 정답률", "STABLE", "IMPROVING", 6),
    status("money-count", "돈 세기 · 혼자 설명하기", "STABLE", "IMPROVING", 5),
    status("price-add", "가격 합산 · 문제 정답률", "STABLE", "IMPROVING", 5),
    status("price-add", "가격 합산 · 혼자 설명하기", "DEVELOPING", "IMPROVING", 4),
    status("money-budget", "예산과 거스름돈 · 문제 정답률", "DEVELOPING", "IMPROVING", 4),
    status("menu-calculate", "메뉴 값 계산하기", "STABLE", "IMPROVING", 4),
    status("change-receive", "거스름돈 받기", "DEVELOPING", "IMPROVING", 4),
    status("queue", "줄 서기", "STABLE", "MAINTAINING", 3),
  ],
  improved_point: {
    text: "돈 세기에서 단위를 짚어 설명하는 비율이 높아졌고, 메뉴 합산까지 혼자 해결했습니다.",
    evidence_refs: ["speech:money-count", "life:menu-calculate"],
  },
  observe_point: {
    text: "두 단계 이상의 거스름돈 문제에서는 계산 순서를 말로 정리하는지 계속 관찰합니다.",
    evidence_refs: ["speech:change-receive", "life:change-receive"],
  },
  evidence_counts: {
    home_sessions: 18,
    drill_attempts: 92,
    teach_conversations: 14,
    life_visits: 6,
    speech_samples: 28,
  },
  narrative_fallback: false,
};

export const completeSpeechEvidenceByDomain: Record<string, SpeechEvidenceDto> = {
  "money-count": {
    available: true,
    domain_id: "money-count",
    verified_elements: ["화폐 단위", "수량 합성", "계산 순서"],
    past: {
      evidence_id: "speech:money-count:past",
      utterance: "동전이 다섯 개라서 500원이에요.",
      hint_level: "그림 선택 도움",
      expression_level: "단답형",
      occurred_at: "2026-07-17T10:00:00+09:00",
    },
    recent: {
      evidence_id: "speech:money-count:recent",
      utterance: "100원짜리 네 개와 500원짜리 한 개를 더하면 900원이에요.",
      hint_level: "도움 없음",
      expression_level: "근거 설명",
      occurred_at: "2026-08-15T10:00:00+09:00",
    },
    change_summary: "동전 개수만 말하던 단계에서 화폐 단위와 덧셈 과정을 연결해 설명하는 단계로 변화했습니다.",
  },
  "price-add": {
    available: true,
    domain_id: "price-add",
    verified_elements: ["가격 합산", "연산 순서"],
    past: {
      evidence_id: "speech:price-add:past",
      utterance: "둘 다 사면 많이 나와요.",
      hint_level: "문장 틀 제공",
      expression_level: "직관 표현",
      occurred_at: "2026-07-20T10:00:00+09:00",
    },
    recent: {
      evidence_id: "speech:price-add:recent",
      utterance: "2,000원과 1,500원을 더해서 모두 3,500원이에요.",
      hint_level: "도움 없음",
      expression_level: "계산 근거 설명",
      occurred_at: "2026-08-14T10:00:00+09:00",
    },
    change_summary: "막연한 크기 표현에서 정확한 수와 연산을 사용한 설명으로 구체화되었습니다.",
  },
  "change-receive": {
    available: true,
    domain_id: "change-receive",
    verified_elements: ["지불액", "구매액", "차 구하기"],
    past: {
      evidence_id: "speech:change-receive:past",
      utterance: "남은 돈은 잘 모르겠어요.",
      hint_level: "식 선택 도움",
      expression_level: "응답 유보",
      occurred_at: "2026-07-24T10:00:00+09:00",
    },
    recent: {
      evidence_id: "speech:change-receive:recent",
      utterance: "5,000원에서 3,200원을 빼면 1,800원을 받아요.",
      hint_level: "단서 제공",
      expression_level: "식과 답 설명",
      occurred_at: "2026-08-16T10:00:00+09:00",
    },
    change_summary: "지불액과 구매액의 차이를 식으로 표현하지만, 복합 문제에서는 한 번의 단서가 필요합니다.",
  },
};
