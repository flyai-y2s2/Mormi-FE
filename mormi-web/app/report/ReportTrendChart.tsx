import { useId } from "react";
import type { DiagnosticDomainTrendDto, DiagnosticMode, DiagnosticTrendPointDto } from "../api-client";
import { chartPoints } from "./diagnostic-report-model";

type ReportTrendChartProps = {
  mode: DiagnosticMode;
  trend: DiagnosticDomainTrendDto;
};

const WIDTH = 760;
const HEIGHT = 260;
const PLOT_LEFT = 48;
const PLOT_TOP = 28;
const PLOT_WIDTH = 680;
const PLOT_HEIGHT = 180;

function seriesPoints(points: readonly DiagnosticTrendPointDto[], field: "independent_score" | "supported_score") {
  return chartPoints(
    points.map((point) => ({ ...point, independent_score: point[field] })),
    PLOT_WIDTH,
    PLOT_HEIGHT,
  ).map((point) => ({ ...point, x: point.x + PLOT_LEFT, y: point.y + PLOT_TOP }));
}

function pathFor(points: ReturnType<typeof seriesPoints>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function safeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

export function ReportTrendChart({ mode, trend }: ReportTrendChartProps) {
  const titleId = useId().replace(/:/g, "");
  const descriptionId = useId().replace(/:/g, "");
  const primaryLabel = mode === "HOME" ? "반복학습" : "독립 수행";
  const secondaryLabel = mode === "HOME" ? "모르미 가르치기" : "도움 후 완료";
  const primary = seriesPoints(trend.points, "independent_score");
  const secondary = seriesPoints(trend.points, "supported_score");
  const firstRecentIndex = primary.findIndex((point) => point.recent);
  const recentStart = firstRecentIndex < 0
    ? null
    : firstRecentIndex === 0
      ? PLOT_LEFT
      : (primary[firstRecentIndex - 1].x + primary[firstRecentIndex].x) / 2;

  if (trend.points.length === 0) {
    return <p className="diagnostic-chart-empty">이 영역의 시계열 근거가 아직 없습니다.</p>;
  }

  return (
    <div className="diagnostic-chart-wrap">
      <div className="diagnostic-chart-legend" aria-hidden="true">
        <span className="is-primary"><i />{primaryLabel}</span>
        <span className="is-secondary"><i />{secondaryLabel}</span>
        <span className="is-recent"><i />최근 구간</span>
      </div>
      <svg
        className="diagnostic-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{trend.label} 전체 학습 변화</title>
        <desc id={descriptionId}>
          {primaryLabel}은 실선과 원으로, {secondaryLabel}은 점선과 사각형으로 표시하며 최근 기록 구간에는 옅은 음영이 있습니다.
        </desc>
        {recentStart !== null && (
          <rect
            className="diagnostic-chart__recent"
            x={recentStart}
            y={PLOT_TOP}
            width={PLOT_LEFT + PLOT_WIDTH - recentStart}
            height={PLOT_HEIGHT}
            rx="12"
            aria-hidden="true"
          />
        )}
        {[0, 50, 100].map((score) => {
          const y = PLOT_TOP + PLOT_HEIGHT - (PLOT_HEIGHT * score) / 100;
          return (
            <g key={score} aria-hidden="true">
              <line className="diagnostic-chart__grid" x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={y} y2={y} />
              <text className="diagnostic-chart__axis" x="40" y={y + 4} textAnchor="end">{score}</text>
            </g>
          );
        })}
        <g className="diagnostic-chart__series diagnostic-chart__series--primary">
          <title>{primaryLabel} 계열</title>
          {primary.length > 1 && <path d={pathFor(primary)} />}
          {primary.map((point) => (
            <circle key={point.evidence_id} cx={point.x} cy={point.y} r="5">
              <title>{`${point.label}, ${point.occurred_at}, ${primaryLabel} ${safeScore(point.independent_score)}%${point.recent ? ", 최근 기록" : ""}`}</title>
            </circle>
          ))}
        </g>
        <g className="diagnostic-chart__series diagnostic-chart__series--secondary">
          <title>{secondaryLabel} 계열</title>
          {secondary.length > 1 && <path d={pathFor(secondary)} />}
          {secondary.map((point) => (
            <rect key={point.evidence_id} x={point.x - 5} y={point.y - 5} width="10" height="10" rx="1">
              <title>{`${point.label}, ${point.occurred_at}, ${secondaryLabel} ${safeScore(point.independent_score)}%${point.recent ? ", 최근 기록" : ""}`}</title>
            </rect>
          ))}
        </g>
        <text className="diagnostic-chart__date" x={PLOT_LEFT} y="238">
          {primary[0]?.occurred_at.slice(0, 10)}
        </text>
        <text className="diagnostic-chart__date" x={PLOT_LEFT + PLOT_WIDTH} y="238" textAnchor="end">
          {primary.at(-1)?.occurred_at.slice(0, 10)}
        </text>
      </svg>
      <ol className="sr-only">
        {trend.points.map((point) => (
          <li key={point.evidence_id}>
            {point.label}, {point.occurred_at}, {primaryLabel} {safeScore(point.independent_score)}%, {secondaryLabel} {safeScore(point.supported_score)}%
            {point.recent ? ", 최근 기록" : ""}
          </li>
        ))}
      </ol>
    </div>
  );
}
