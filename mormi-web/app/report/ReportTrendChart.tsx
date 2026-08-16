import { useId } from "react";
import {
  chartSeriesPoints,
  recentWindowsForSeries,
  type DiagnosticChartSeries,
} from "./diagnostic-report-model";

type ReportTrendChartProps = {
  label: string;
  series: DiagnosticChartSeries[];
};

const WIDTH = 760;
const HEIGHT = 260;
const PLOT_LEFT = 48;
const PLOT_TOP = 28;
const PLOT_WIDTH = 680;
const PLOT_HEIGHT = 180;

function pathFor(points: ReturnType<typeof chartSeriesPoints>): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function safeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, score));
}

function xForTime(time: number, range: { start: number; end: number } | undefined): number {
  if (!range || range.end === range.start) return PLOT_LEFT;
  return PLOT_LEFT + ((time - range.start) / (range.end - range.start)) * PLOT_WIDTH;
}

export function ReportTrendChart({ label, series }: ReportTrendChartProps) {
  const titleId = useId().replace(/:/g, "");
  const descriptionId = useId().replace(/:/g, "");
  const allPoints = series.flatMap((item) => item.points);
  const datedPoints = allPoints
    .map((point) => ({ point, time: Date.parse(point.occurred_at) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time || left.point.evidence_id.localeCompare(right.point.evidence_id));
  const timeRange = datedPoints.length > 0
    ? { start: datedPoints[0].time, end: datedPoints.at(-1)!.time }
    : undefined;
  const plottedSeries = series.map((item) => ({
    ...item,
    points: chartSeriesPoints(item.points, PLOT_WIDTH, PLOT_HEIGHT, timeRange)
      .map((point) => ({ ...point, x: point.x + PLOT_LEFT, y: point.y + PLOT_TOP })),
  }));
  const recentWindowLayout = recentWindowsForSeries(series);

  if (allPoints.length === 0) {
    return <p className="diagnostic-chart-empty">이 영역의 시계열 근거가 아직 없습니다.</p>;
  }

  return (
    <div className="diagnostic-chart-wrap">
      <div className="diagnostic-chart-legend" aria-hidden="true">
        {series.map((item) => {
          const secondary = item.id === "home-teach" || item.id === "life-supported";
          return <span key={item.id} className={secondary ? "is-secondary" : "is-primary"}><i />{item.label}</span>;
        })}
        {recentWindowLayout.kind !== "none" && (
          <span className={`is-recent ${recentWindowLayout.kind === "per-series" ? "is-per-series" : ""}`}>
            <i />{recentWindowLayout.kind === "per-series" ? "계열별 최근 구간" : "최근 구간"}
          </span>
        )}
      </div>
      <svg
        className="diagnostic-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>{label} 전체 학습 변화</title>
        <desc id={descriptionId}>
          {series.map((item) => `${item.label}은 ${item.id === "home-teach" || item.id === "life-supported" ? "점선과 사각형" : "실선과 원"}`).join(", ")}으로 표시합니다. {recentWindowLayout.description}
        </desc>
        <defs aria-hidden="true">
          <pattern id={`${titleId}-recent-primary-pattern`} width="8" height="8" patternUnits="userSpaceOnUse">
            <path className="diagnostic-chart__recent-pattern-primary" d="M -2 8 L 8 -2 M 4 10 L 10 4" />
          </pattern>
          <pattern id={`${titleId}-recent-secondary-pattern`} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle className="diagnostic-chart__recent-pattern-secondary" cx="2" cy="2" r="1.4" />
            <circle className="diagnostic-chart__recent-pattern-secondary" cx="6" cy="6" r="1.4" />
          </pattern>
        </defs>
        {recentWindowLayout.kind === "shared" && (
          <rect
            className="diagnostic-chart__recent diagnostic-chart__recent--shared"
            x={xForTime(recentWindowLayout.windows[0]!.start, timeRange)}
            y={PLOT_TOP}
            width={PLOT_LEFT + PLOT_WIDTH - xForTime(recentWindowLayout.windows[0]!.start, timeRange)}
            height={PLOT_HEIGHT}
            rx="12"
            aria-hidden="true"
          />
        )}
        {recentWindowLayout.kind === "per-series" && recentWindowLayout.windows.map((window, index) => {
          const secondary = window.series_id === "home-teach" || window.series_id === "life-supported";
          const startX = xForTime(window.start, timeRange);
          const endX = xForTime(window.end, timeRange);
          const ribbonClass = secondary
            ? "diagnostic-chart__recent-ribbon diagnostic-chart__recent-ribbon--secondary"
            : "diagnostic-chart__recent-ribbon diagnostic-chart__recent-ribbon--primary";
          return (
            <g key={window.series_id} className={ribbonClass}>
              <title>{`${window.label} 최근 구간, ${window.start_at}부터 ${window.end_at}까지`}</title>
              <rect
                x={startX}
                y={PLOT_TOP + 7 + index * 21}
                width={Math.max(4, endX - startX)}
                height="13"
                rx="4"
                fill={`url(#${titleId}-recent-${secondary ? "secondary" : "primary"}-pattern)`}
              />
              <text x={startX + 4} y={PLOT_TOP + 18 + index * 21}>
                {window.label} 최근 구간
              </text>
            </g>
          );
        })}
        {[0, 50, 100].map((score) => {
          const y = PLOT_TOP + PLOT_HEIGHT - (PLOT_HEIGHT * score) / 100;
          return (
            <g key={score} aria-hidden="true">
              <line className="diagnostic-chart__grid" x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1={y} y2={y} />
              <text className="diagnostic-chart__axis" x="40" y={y + 4} textAnchor="end">{score}</text>
            </g>
          );
        })}
        {plottedSeries.map((item) => {
          const secondary = item.id === "home-teach" || item.id === "life-supported";
          return (
          <g key={item.id} className={`diagnostic-chart__series diagnostic-chart__series--${secondary ? "secondary" : "primary"}`}>
            <title>{item.label} 계열</title>
            {item.points.length > 1 && <path d={pathFor(item.points)} />}
            {item.points.map((point) => !secondary ? (
              <circle key={point.evidence_id} cx={point.x} cy={point.y} r="5">
                <title>{`${point.label}, ${point.occurred_at}, ${item.label} ${safeScore(point.score)}%${point.recent ? ", 최근 기록" : ""}`}</title>
              </circle>
            ) : (
              <rect key={point.evidence_id} x={point.x - 5} y={point.y - 5} width="10" height="10" rx="1">
                <title>{`${point.label}, ${point.occurred_at}, ${item.label} ${safeScore(point.score)}%${point.recent ? ", 최근 기록" : ""}`}</title>
              </rect>
            ))}
          </g>
          );
        })}
        <text className="diagnostic-chart__date" x={PLOT_LEFT} y="238">
          {datedPoints[0]?.point.occurred_at.slice(0, 10)}
        </text>
        <text className="diagnostic-chart__date" x={PLOT_LEFT + PLOT_WIDTH} y="238" textAnchor="end">
          {datedPoints.at(-1)?.point.occurred_at.slice(0, 10)}
        </text>
      </svg>
      <div className="sr-only">
        <p>{recentWindowLayout.description}</p>
        {series.map((item) => (
          <section key={item.id} aria-label={`${item.label} 기록`}>
            <h3>{item.label}</h3>
            <ol>
              {item.points.map((point) => (
                <li key={point.evidence_id}>
                  {point.label}, {point.occurred_at}, {safeScore(point.score)}%{point.recent ? ", 최근 기록" : ""}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
