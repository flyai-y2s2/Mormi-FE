import type { DiagnosticStatus, DiagnosticTrendPointDto } from "../api-client";

export type DiagnosticChartPoint = DiagnosticTrendPointDto & {
  x: number;
  y: number;
  accessible_label: string;
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
  return Math.min(100, Math.max(0, score));
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
