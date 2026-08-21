import type {
  DiagnosticDirection,
  DiagnosticDomainStatusDto,
  DiagnosticDomainTrendDto,
  DiagnosticMode,
  DiagnosticReportDto,
  DiagnosticTrendPointDto,
  ReportSummaryDto,
} from "../api-client";
import { ACTIVE_EXPRESSION_LEVELS, canonicalExpressionLevel } from "../expression-ladder";

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
  weeklySummary: {
    completedUnits: number;
    drillAttempts: number;
    teachConversations: number;
    lifeVisits: number;
  };
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

function attemptsToCorrect(points: DiagnosticDomainTrendDto["points"], recentOnly: boolean): string {
  const selected = points.filter((point) => !recentOnly || point.recent);
  const attemptCount = selected.reduce((sum, point) => sum + (point.attempt_count ?? 0), 0);
  const questionCount = selected.reduce((sum, point) => sum + (point.question_count ?? 0), 0);
  return questionCount > 0 ? `${(attemptCount / questionCount).toFixed(1)}회` : "—";
}

function ladderShares(points: DiagnosticDomainTrendDto["points"], recentOnly: boolean): readonly [string, string] {
  const levels = ACTIVE_EXPRESSION_LEVELS;
  const selected = points
    .filter((point) => !recentOnly || point.recent)
    .map((point) => canonicalExpressionLevel(point.expression_level))
    .filter((level): level is typeof levels[number] => Boolean(level));
  if (selected.length === 0) return ["—", "—"];
  const exact = levels.map((level) => selected.filter((item) => item === level).length * 100 / selected.length);
  const shares = exact.map(Math.floor);
  const remainderOrder = exact
    .map((value, index) => ({ index, fraction: value - shares[index] }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  const remainder = 100 - shares.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remainder; index++) {
    shares[remainderOrder[index]!.index] += 1;
  }
  return [`${shares.join("/")}%`, levels[shares.indexOf(Math.max(...shares))]];
}

function pointsWithHistory(
  points: DiagnosticDomainTrendDto["points"],
  historyBySession: ReadonlyMap<string, ReportSummaryDto>,
): DiagnosticTrendPointDto[] {
  return points.map((point) => {
    const history = historyBySession.get(point.evidence_id);
    if (!history) return point;
    const ladder = Number.isInteger(history.ladder) && history.ladder >= 0 && history.ladder <= 4
      ? canonicalExpressionLevel(`L${history.ladder}`)
      : undefined;
    return {
      ...point,
      attempt_count: point.attempt_count ?? (history.repetitions >= 0 ? history.repetitions : undefined),
      question_count: point.question_count ?? (history.mastery_target > 0 ? history.mastery_target : undefined),
      expression_level: point.expression_level ?? ladder,
    };
  });
}

function plainLabel(label: string): string {
  return label.split(" · ")[0]?.trim() || label;
}

function hasHomeMetricLabel(label: string, labels: readonly string[]): boolean {
  const metricLabel = label.split(" · ").at(-1)?.trim() || label;
  return labels.includes(metricLabel);
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
  if (recent === "—" || totalCount < 2 || direction === "INSUFFICIENT_HISTORY") return "비교할 기록이 더 필요해요.";
  if (direction === "DECLINING") return `최근 정답률은 ${recent}로, 이전보다 낮아져 다시 확인이 필요해요.`;
  if (direction === "IMPROVING") return `최근 정답률은 ${recent}로, 이전보다 좋아지고 있어요.`;
  if (direction === "MAINTAINING") return `최근 정답률은 ${recent}로 비슷하게 유지되고 있어요.`;
  return "비교할 기록이 더 필요해요.";
}

function recommendation(status: NumericPreviewStatus, label: string, hasSpeech: boolean) {
  const repeatCount = status === "review" ? 4 : status === "growing" ? 3 : 2;
  return {
    repeatCount,
    ladderStart: hasSpeech ? "L2" : "기록 필요",
    ladderRule: hasSpeech
      ? "두 번 연속 혼자 설명하면 한 단계 높이고, 막히면 L2 선택지부터 제공한 뒤 L0에서 같이 해결합니다."
      : "발화 기록을 먼저 1회 모은 뒤 시작 단계를 추천합니다.",
    nextCheck: `${label} 풀이 방법을 자신의 말로 설명하는지 확인해 주세요.`,
  };
}

function buildMode(
  report: DiagnosticReportDto,
  mode: DiagnosticMode,
  historyBySession: ReadonlyMap<string, ReportSummaryDto>,
): NumericPreviewDomain[] {
  const modeReport = report.modes.find((item) => item.mode === mode);
  const byDomain = new Map<string, DiagnosticDomainTrendDto[]>();
  for (const trend of modeReport?.domains ?? []) {
    const trends = byDomain.get(trend.domain_id) ?? [];
    trends.push(trend);
    byDomain.set(trend.domain_id, trends);
  }

  return [...byDomain.entries()].map(([domainId, trends]) => {
    const accuracy = mode === "LIFE"
      ? trends.find((trend) => !hasHomeMetricLabel(trend.label, ["모르미 가르치기", "혼자 설명하기", "혼자 설명"])) ?? trends[0]
      : trends.find((trend) => hasHomeMetricLabel(trend.label, ["반복학습", "문제 정답률"])) ?? trends[0];
    const speech = trends.find((trend) => hasHomeMetricLabel(trend.label, ["모르미 가르치기", "혼자 설명하기", "혼자 설명"]));
    const statuses = report.domains.filter((item) => item.domain_id === domainId);
    const selectedStatus = statusFor(statuses);
    const status = previewStatus(selectedStatus?.status);
    const label = plainLabel(accuracy?.label ?? trends[0]?.label ?? domainId);
    const accuracyPoints = accuracy ? pointsWithHistory(accuracy.points, historyBySession) : [];
    const speechPoints = speech?.points ?? [];
    const historyLadderPoints = pointsWithHistory(accuracy?.points ?? [], historyBySession);
    const ladderPoints = speechPoints.some((point) => point.expression_level) ? speechPoints : historyLadderPoints;
    const historyAccuracy = accuracy ? average(accuracyPoints, false) : "—";
    const recentAccuracy = accuracy ? average(accuracyPoints, true) : "—";
    const historySpeech = speech ? average(speech.points, false) : "—";
    const recentSpeech = speech ? average(speech.points, true) : "—";
    const historyAttempts = accuracy ? attemptsToCorrect(accuracyPoints, false) : "—";
    const recentAttempts = accuracy ? attemptsToCorrect(accuracyPoints, true) : "—";
    const [historyLadder] = ladderShares(ladderPoints, false);
    const [recentLadder, dominantStage] = ladderShares(ladderPoints, true);
    const advice = recommendation(status, label, Boolean(speech) || dominantStage !== "—");
    const metrics: readonly NumericComparisonRow[] = [
      ["정답률", historyAccuracy, recentAccuracy],
      ["정답까지 평균", historyAttempts, recentAttempts],
      ["모르미 가르치기", historySpeech, recentSpeech],
    ];
    return {
      id: domainId,
      label,
      status,
      metrics,
      sessionRows: [...metrics, ["발화 단계 사용 비율 (L4/L3/L2/L0)", historyLadder, recentLadder]],
      historyCount: accuracy?.total_count ?? 0,
      recentCount: accuracy?.recent_count ?? 0,
      headline: headline(label, status),
      dominantStage,
      changeReason: changeReason(recentAccuracy, accuracy?.points.length ?? 0, selectedStatus?.direction),
      thinkingChange: (mode === "LIFE" ? report.current_summary.life_transfer : report.current_summary.explanation_change).text,
      nextCheck: advice.nextCheck,
      pastUtterance: "비교 가능한 과거 발화 기록이 없습니다.",
      recentUtterance: "비교 가능한 최근 발화 기록이 없습니다.",
      repeatCount: advice.repeatCount,
      ladderStart: advice.ladderStart,
      ladderRule: advice.ladderRule,
    } satisfies NumericPreviewDomain;
  }).sort((left, right) => right.historyCount - left.historyCount || left.id.localeCompare(right.id));
}

export function buildNumericLiveReport(
  report: DiagnosticReportDto,
  history: readonly ReportSummaryDto[] = [],
): NumericLiveReport {
  const historyBySession = new Map(history.map((summary) => [summary.learning_session_id, summary]));
  const completedUnits = new Set(
    (report.modes.find((mode) => mode.mode === "HOME")?.domains ?? []).map((domain) => domain.domain_id),
  ).size;
  return {
    learnerName: report.learner.display_name,
    weeklySummary: {
      completedUnits,
      drillAttempts: report.evidence_counts.drill_attempts,
      teachConversations: report.evidence_counts.teach_conversations,
      lifeVisits: report.evidence_counts.life_visits,
    },
    domains: {
      HOME: buildMode(report, "HOME", historyBySession),
      LIFE: buildMode(report, "LIFE", historyBySession),
    },
  };
}
