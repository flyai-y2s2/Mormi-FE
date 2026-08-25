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

export function availableReportWeeks(period: DiagnosticReportPeriodDto): string[] {
  return [...new Set(period.available_week_starts ?? [])].sort();
}

export function adjacentAvailableWeek(
  period: DiagnosticReportPeriodDto,
  delta: -1 | 1,
): string | undefined {
  const weeks = availableReportWeeks(period);
  const currentIndex = weeks.indexOf(period.week_start);
  if (currentIndex < 0) return undefined;
  return weeks[currentIndex + delta];
}

export const canMoveToPreviousWeek = (period: DiagnosticReportPeriodDto) =>
  period.available_week_starts
    ? adjacentAvailableWeek(period, -1) !== undefined
    : period.week_start > period.earliest_week_start;

export const canMoveToNextWeek = (period: DiagnosticReportPeriodDto) =>
  period.available_week_starts
    ? adjacentAvailableWeek(period, 1) !== undefined
    : period.week_start < period.latest_week_start;
