import type {
  DiagnosticDomainStatusDto,
  DiagnosticDomainTrendDto,
  DiagnosticMode,
  DiagnosticReportDto,
  DiagnosticStatus,
  DiagnosticTrendPointDto,
} from "../api-client";

export type DiagnosticChartPoint = DiagnosticTrendPointDto & {
  x: number;
  y: number;
  accessible_label: string;
};

export type DiagnosticEvidenceKind = "drill" | "teach" | "life";

export type DiagnosticGroupedStatus = DiagnosticDomainStatusDto & {
  kind: DiagnosticEvidenceKind;
};

export type DiagnosticDomainGroup = {
  domain_id: string;
  label: string;
  mode: DiagnosticMode;
  drill_trend?: DiagnosticDomainTrendDto;
  teach_trend?: DiagnosticDomainTrendDto;
  life_trend?: DiagnosticDomainTrendDto;
  statuses: DiagnosticGroupedStatus[];
};

export type DiagnosticSeriesPoint = {
  evidence_id: string;
  label: string;
  occurred_at: string;
  score: number;
  recent: boolean;
};

export type DiagnosticChartSeries = {
  id: "home-drill" | "home-teach" | "life-independent" | "life-supported";
  label: string;
  points: DiagnosticSeriesPoint[];
  total_count: number;
  recent_count: number;
};

export type DiagnosticSeriesChartPoint = DiagnosticSeriesPoint & {
  x: number;
  y: number;
};

export type DiagnosticRecentWindow = {
  series_id: DiagnosticChartSeries["id"];
  label: string;
  start: number;
  end: number;
  start_at: string;
  end_at: string;
};

export type DiagnosticRecentWindowLayout = {
  kind: "none" | "shared" | "per-series";
  windows: DiagnosticRecentWindow[];
  description: string;
};

const statusLabels: Record<DiagnosticStatus, string> = {
  STABLE: "안정",
  DEVELOPING: "발달 중",
  SUPPORT_NEEDED: "지원 필요",
  OBSERVING: "관찰 중",
};

export function statusLabel(status: DiagnosticStatus): string {
  return statusLabels[status];
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

function baseDomainLabel(label: string): string {
  return label.replace(/ · (?:반복학습|설명 독립성)$/u, "");
}

function homeKind(label: string): "drill" | "teach" | null {
  if (label.endsWith(" · 반복학습")) return "drill";
  if (label.endsWith(" · 설명 독립성")) return "teach";
  return null;
}

/** Groups Spring's drill/teach rows into the single domain unit used by the report UI. */
export function groupDiagnosticDomains(report: DiagnosticReportDto): DiagnosticDomainGroup[] {
  const groups = new Map<string, DiagnosticDomainGroup>();

  for (const modeReport of report.modes) {
    for (const trend of modeReport.domains) {
      const existing = groups.get(trend.domain_id);
      const group = existing ?? {
        domain_id: trend.domain_id,
        label: baseDomainLabel(trend.label),
        mode: modeReport.mode,
        statuses: [],
      };
      if (modeReport.mode === "LIFE") group.life_trend = trend;
      else if (homeKind(trend.label) === "drill") group.drill_trend = trend;
      else if (homeKind(trend.label) === "teach") group.teach_trend = trend;
      groups.set(trend.domain_id, group);
    }
  }

  for (const status of report.domains) {
    const kind = homeKind(status.label) ?? "life";
    const existing = groups.get(status.domain_id);
    const group = existing ?? {
      domain_id: status.domain_id,
      label: baseDomainLabel(status.label),
      mode: kind === "life" ? "LIFE" : "HOME",
      statuses: [],
    };
    group.statuses.push({ ...status, kind });
    groups.set(status.domain_id, group);
  }

  return [...groups.values()].map((group) => ({ ...group, statuses: [...group.statuses] }));
}

export function chooseDiagnosticSelection(
  groups: readonly DiagnosticDomainGroup[],
  preferredMode: DiagnosticMode,
  preferredDomainId: string,
): DiagnosticDomainGroup | undefined {
  const modeGroups = groups.filter((group) => group.mode === preferredMode);
  const current = modeGroups.find((group) => group.domain_id === preferredDomainId);
  if (current) return current;

  // Comparable history is the sum of actual plotted points across each grouped
  // drill, teach, and life trend. LIFE is counted once rather than once per score series.
  const evidenceCounts = (group: DiagnosticDomainGroup) => {
    const trends = [group.drill_trend, group.teach_trend, group.life_trend].filter((trend) => trend !== undefined);
    return {
      total: trends.reduce((sum, trend) => sum + trend.points.length, 0),
      recent: trends.reduce((sum, trend) => sum + trend.points.filter((point) => point.recent).length, 0),
    };
  };
  const candidates = modeGroups.length > 0 ? modeGroups : groups;
  return [...candidates].sort((left, right) => {
    const leftCounts = evidenceCounts(left);
    const rightCounts = evidenceCounts(right);
    if (leftCounts.total !== rightCounts.total) return rightCounts.total - leftCounts.total;
    if (leftCounts.recent !== rightCounts.recent) return rightCounts.recent - leftCounts.recent;
    if (left.domain_id === right.domain_id) return 0;
    return left.domain_id < right.domain_id ? -1 : 1;
  })[0];
}

function seriesFromTrend(
  id: DiagnosticChartSeries["id"],
  label: string,
  trend: DiagnosticDomainTrendDto,
  score: "independent_score" | "supported_score",
): DiagnosticChartSeries {
  return {
    id,
    label,
    points: trend.points.map((point) => ({
      evidence_id: point.evidence_id,
      label: point.label,
      occurred_at: point.occurred_at,
      score: point[score],
      recent: point.recent,
    })),
    total_count: trend.total_count,
    recent_count: trend.recent_count,
  };
}

/** Preserves each server trend's own timeline instead of deriving one mode from another. */
export function diagnosticSeriesForDomain(group: DiagnosticDomainGroup): DiagnosticChartSeries[] {
  if (group.mode === "HOME") {
    const series: DiagnosticChartSeries[] = [];
    if (group.drill_trend) series.push(seriesFromTrend("home-drill", "반복학습", group.drill_trend, "independent_score"));
    if (group.teach_trend) series.push(seriesFromTrend("home-teach", "모르미 가르치기", group.teach_trend, "independent_score"));
    return series;
  }
  if (!group.life_trend) return [];
  return [
    seriesFromTrend("life-independent", "독립 수행", group.life_trend, "independent_score"),
    seriesFromTrend("life-supported", "도움 후 완료", group.life_trend, "supported_score"),
  ];
}

function topicLabel(label: string): string {
  const finalCharacter = label.at(-1);
  if (!finalCharacter) return label;
  const codePoint = finalCharacter.charCodeAt(0);
  const hasFinalConsonant = codePoint >= 0xac00 && codePoint <= 0xd7a3 && (codePoint - 0xac00) % 28 !== 0;
  return `${label}${hasFinalConsonant ? "은" : "는"}`;
}

function shortDate(value: string): string {
  return value.slice(0, 10);
}

/** Keeps each server trend's recent flags attached to that trend's own time boundary. */
export function recentWindowsForSeries(
  series: readonly DiagnosticChartSeries[],
): DiagnosticRecentWindowLayout {
  const activeSeries = series.map((item) => {
    const datedPoints = item.points
      .map((point) => ({ point, time: Date.parse(point.occurred_at) }))
      .filter((entry) => Number.isFinite(entry.time))
      .sort((left, right) => left.time - right.time || left.point.evidence_id.localeCompare(right.point.evidence_id));
    return { item, datedPoints };
  }).filter(({ datedPoints }) => datedPoints.length > 0);

  const windows = activeSeries.flatMap(({ item, datedPoints }) => {
    const firstRecent = datedPoints.find(({ point }) => point.recent);
    if (!firstRecent) return [];
    const lastPoint = datedPoints.at(-1)!;
    return [{
      series_id: item.id,
      label: item.label,
      start: firstRecent.time,
      end: lastPoint.time,
      start_at: firstRecent.point.occurred_at,
      end_at: lastPoint.point.occurred_at,
    }];
  });

  if (windows.length === 0) {
    return { kind: "none", windows, description: "최근 기록으로 표시된 구간이 없습니다." };
  }

  const sharedInterval = windows.length === activeSeries.length
    && windows.every((window) => (
      window.start === windows[0]!.start && window.end === windows[0]!.end
    ));
  if (sharedInterval) {
    return {
      kind: "shared",
      windows,
      description: `${windows.map((window) => window.label).join(", ")} 최근 구간은 ${shortDate(windows[0]!.start_at)}부터 ${shortDate(windows[0]!.end_at)}까지 같은 구간입니다.`,
    };
  }

  const windowDescriptions = windows.map((window) => (
    `${topicLabel(window.label)} ${shortDate(window.start_at)}부터 ${shortDate(window.end_at)}까지`
  ));
  const missingDescriptions = activeSeries
    .filter(({ item }) => !windows.some((window) => window.series_id === item.id))
    .map(({ item }) => `${topicLabel(item.label)} 최근 구간 표시 없음`);
  return {
    kind: "per-series",
    windows,
    description: `계열별 최근 구간: ${[...windowDescriptions, ...missingDescriptions].join(", ")}입니다.`,
  };
}

export function isEmptyDiagnosticReport(report: DiagnosticReportDto): boolean {
  const noCompletedRecords = report.data_range.total_home_sessions === 0 && report.data_range.total_life_visits === 0;
  const noTrendPoints = report.modes.every((mode) => mode.domains.every((domain) => domain.points.length === 0));
  return noCompletedRecords && noTrendPoints;
}

export function chartSeriesPoints(
  points: readonly DiagnosticSeriesPoint[],
  width: number,
  height: number,
  range?: { start: number; end: number },
): DiagnosticSeriesChartPoint[] {
  const chronological = [...points].sort((left, right) => {
    const timeDifference = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    const dateDifference = left.occurred_at.localeCompare(right.occurred_at);
    return dateDifference || left.evidence_id.localeCompare(right.evidence_id);
  });
  if (chronological.length === 0) return [];
  const fallbackDenominator = chronological.length - 1;
  const timeSpan = range ? range.end - range.start : 0;
  return chronological.map((point, index) => {
    const occurredAt = Date.parse(point.occurred_at);
    const rangedX = range && timeSpan > 0 && Number.isFinite(occurredAt)
      ? ((occurredAt - range.start) / timeSpan) * width
      : fallbackDenominator === 0 ? width / 2 : (index / fallbackDenominator) * width;
    return {
      ...point,
      x: rangedX,
      y: height - (height * clampScore(point.score)) / 100,
    };
  });
}

function chronologicalPoints(points: readonly DiagnosticTrendPointDto[]): DiagnosticTrendPointDto[] {
  return [...points].sort((left, right) => {
    const timeDifference = Date.parse(left.occurred_at) - Date.parse(right.occurred_at);
    if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
    const dateDifference = left.occurred_at.localeCompare(right.occurred_at);
    if (dateDifference !== 0) return dateDifference;
    return left.evidence_id.localeCompare(right.evidence_id);
  });
}

function accessibleLabel(point: DiagnosticTrendPointDto): string {
  return `${point.label}, ${point.occurred_at}, 독립 수행 ${clampScore(point.independent_score)}%, 도움 후 완료 ${clampScore(point.supported_score)}%${point.recent ? ", 최근 기록" : ""}`;
}

/** Prepares server-owned trend records for an SVG without changing their educational meaning. */
export function chartPoints(
  points: readonly DiagnosticTrendPointDto[],
  width: number,
  height: number,
): DiagnosticChartPoint[] {
  const chronological = chronologicalPoints(points);
  if (chronological.length === 0) return [];

  const denominator = chronological.length - 1;
  return chronological.map((point, index) => ({
    ...point,
    x: denominator === 0 ? width / 2 : (index / denominator) * width,
    y: height - (height * clampScore(point.independent_score)) / 100,
    accessible_label: accessibleLabel(point),
  }));
}
