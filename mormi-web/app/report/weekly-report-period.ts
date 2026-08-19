import type { DiagnosticReportPeriodDto } from "../api-client";

export function shiftIsoWeek(weekStart: string, delta: -1 | 1): string {
  const [year, month, day] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + delta * 7));
  return date.toISOString().slice(0, 10);
}

export function formatKoreanWeekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-").map(Number);
  return `${month}월 ${Math.ceil(day / 7)}주차`;
}

export const canMoveToPreviousWeek = (period: DiagnosticReportPeriodDto) =>
  period.week_start > period.earliest_week_start;

export const canMoveToNextWeek = (period: DiagnosticReportPeriodDto) =>
  period.week_start < period.latest_week_start;
