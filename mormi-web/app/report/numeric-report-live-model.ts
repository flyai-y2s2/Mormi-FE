import type { DiagnosticDirection, DiagnosticDomainStatusDto, DiagnosticDomainTrendDto, DiagnosticMode, DiagnosticReportDto } from "../api-client";

export type NumericPreviewStatus = "good" | "growing" | "review" | "collecting";
export type NumericComparisonRow = readonly [label: string, history: string, recent: string];
export type NumericPreviewDomain = {
  id: string;
  label: string;
  status: NumericPreviewStatus;
  metrics: readonly NumericComparisonRow[];
  sessionRows: readonly NumericComparisonRow[];
  historyCount: number;
  recentCount: number;
  headline: string;
  dominantStage: string;
  changeReason: string;
  thinkingChange: string;
  nextCheck: string;
  pastUtterance: string;
  recentUtterance: string;
  repeatCount: number;
  ladderStart: string;
  ladderRule: string;
};

export type NumericLiveReport = {
  learnerName: string;
  domains: Record<DiagnosticMode, readonly NumericPreviewDomain[]>;
};

const statusPriority: Record<DiagnosticDomainStatusDto["status"], number> = {
  SUPPORT_NEEDED: 0,
  DEVELOPING: 1,
  STABLE: 2,
  OBSERVING: 3,
};

function average(points: DiagnosticDomainTrendDto["points"], recentOnly: boolean): string {
  const values = points
    .filter((point) => !recentOnly || point.recent)
    .map((point) => point.independent_score)
    .filter(Number.isFinite);
  if (values.length === 0) return "—";
  const result = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${Math.round(Math.max(0, Math.min(100, result)))}%`;
}

function plainLabel(label: string): string {
  return label.split(" · ")[0]?.trim() || label;
}

function statusFor(records: readonly DiagnosticDomainStatusDto[]): DiagnosticDomainStatusDto | undefined {
  return [...records].sort((left, right) => {
    const statusDifference = statusPriority[left.status] - statusPriority[right.status];
    if (statusDifference !== 0) return statusDifference;
    if (left.direction === right.direction) return right.recent_count - left.recent_count;
    return left.direction === "DECLINING" ? -1 : 1;
  })[0];
}

function previewStatus(status?: DiagnosticDomainStatusDto["status"]): NumericPreviewStatus {
  if (status === "STABLE") return "good";
  if (status === "DEVELOPING") return "growing";
  if (status === "SUPPORT_NEEDED") return "review";
  return "collecting";
}

function headline(label: string, status: NumericPreviewStatus): string {
  if (status === "good") return `${label} 수행이 안정적으로 이어지고 있어요`;
  if (status === "growing") return `${label}, 지금 발달 중이에요`;
  if (status === "review") return `${label}에 도움이 조금 더 필요해요`;
  return `${label} 기록을 더 모으고 있어요`;
}

function changeReason(recent: string, totalCount: number, direction?: DiagnosticDirection): string {
  if (recent === "—") return "비교 가능한 정답 기록을 더 모으고 있어요.";
  if (totalCount < 2) return `최근 정답률은 ${recent}예요. 비교할 기록이 더 필요해요.`;
  if (direction === "DECLINING") return `최근 정답률은 ${recent}로, 이전보다 낮아져 다시 확인이 필요해요.`;
  if (direction === "IMPROVING") return `최근 정답률은 ${recent}로, 이전보다 좋아지고 있어요.`;
  if (direction === "MAINTAINING") return `최근 정답률은 ${recent}로 비슷하게 유지되고 있어요.`;
  return `최근 정답률은 ${recent}이며, 비교할 기록을 더 모으고 있어요.`;
}

function recommendation(status: NumericPreviewStatus, label: string, hasSpeech: boolean) {
  const repeatCount = status === "review" ? 4 : status === "growing" ? 3 : 2;
  return {
    repeatCount,
    ladderStart: hasSpeech ? "L2" : "기록 필요",
    ladderRule: hasSpeech
      ? "두 번 연속 혼자 설명하면 한 단계 높이고, 막히면 한 단계 낮춰 도움을 제공합니다."
      : "발화 기록을 먼저 1회 모은 뒤 시작 단계를 추천합니다.",
    nextCheck: `${label} 풀이 방법을 자신의 말로 설명하는지 확인해 주세요.`,
  };
}

function buildMode(report: DiagnosticReportDto, mode: DiagnosticMode): NumericPreviewDomain[] {
  const modeReport = report.modes.find((item) => item.mode === mode);
  const byDomain = new Map<string, DiagnosticDomainTrendDto[]>();
  for (const trend of modeReport?.domains ?? []) {
    const trends = byDomain.get(trend.domain_id) ?? [];
    trends.push(trend);
    byDomain.set(trend.domain_id, trends);
  }

  return [...byDomain.entries()].map(([domainId, trends]) => {
    const accuracy = mode === "LIFE"
      ? trends[0]
      : trends.find((trend) => trend.label.includes("문제 정답률")) ?? trends[0];
    const speech = mode === "HOME" ? trends.find((trend) => trend.label.includes("혼자 설명")) : undefined;
    const statuses = report.domains.filter((item) => item.domain_id === domainId);
    const selectedStatus = statusFor(statuses);
    const status = previewStatus(selectedStatus?.status);
    const label = plainLabel(accuracy?.label ?? trends[0]?.label ?? domainId);
    const historyAccuracy = accuracy ? average(accuracy.points, false) : "—";
    const recentAccuracy = accuracy ? average(accuracy.points, true) : "—";
    const historySpeech = speech ? average(speech.points, false) : "—";
    const recentSpeech = speech ? average(speech.points, true) : "—";
    const advice = recommendation(status, label, Boolean(speech));
    const metrics: readonly NumericComparisonRow[] = [
      ["정답률", historyAccuracy, recentAccuracy],
      ["정답까지 평균", "—", "—"],
      ["모르미 가르치기", historySpeech, recentSpeech],
    ];
    return {
      id: domainId,
      label,
      status,
      metrics,
      sessionRows: [...metrics, ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "—", "—"]],
      historyCount: accuracy?.total_count ?? 0,
      recentCount: accuracy?.recent_count ?? 0,
      headline: headline(label, status),
      dominantStage: "—",
      changeReason: changeReason(recentAccuracy, accuracy?.points.length ?? 0, selectedStatus?.direction),
      thinkingChange: report.current_summary.explanation_change.text,
      nextCheck: advice.nextCheck,
      pastUtterance: "비교 가능한 과거 발화 기록이 없습니다.",
      recentUtterance: "비교 가능한 최근 발화 기록이 없습니다.",
      repeatCount: advice.repeatCount,
      ladderStart: advice.ladderStart,
      ladderRule: advice.ladderRule,
    } satisfies NumericPreviewDomain;
  }).sort((left, right) => right.historyCount - left.historyCount || left.id.localeCompare(right.id));
}

export function buildNumericLiveReport(report: DiagnosticReportDto): NumericLiveReport {
  return {
    learnerName: report.learner.display_name,
    domains: {
      HOME: buildMode(report, "HOME"),
      LIFE: buildMode(report, "LIFE"),
    },
  };
}
