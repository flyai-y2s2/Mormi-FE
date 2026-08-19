import { sessions } from "../math-curriculum";
import type {
  DiagnosticDirection,
  DiagnosticDomainStatusDto,
  DiagnosticDomainTrendDto,
  DiagnosticReportDto,
  DiagnosticStatus,
  LearnerProfile,
  ReportSummaryDto,
} from "../api-client";

const sessionById = new Map(sessions.map((session) => [session.id, session]));

function isoDay(value: string | null, referenceDay: string): string | null {
  const day = value?.slice(0, 10);
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const match = value?.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) return null;
  const [, referenceMonth] = referenceDay.split("-").map(Number);
  const month = Number(match[1]);
  const date = Number(match[2]);
  let year = Number(referenceDay.slice(0, 4));
  if (month - referenceMonth > 6) year -= 1;
  if (referenceMonth - month > 6) year += 1;
  const parsed = new Date(Date.UTC(year, month - 1, date));
  if (parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== date) return null;
  return parsed.toISOString().slice(0, 10);
}

function mondayFor(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, date));
  const distance = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - distance);
  return value.toISOString().slice(0, 10);
}

function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function score(summary: ReportSummaryDto): number {
  if (summary.mastery_target <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, summary.first_try_correct_count * 100 / summary.mastery_target)));
}

function directionFor(history: readonly ReportSummaryDto[], recent: readonly ReportSummaryDto[]): DiagnosticDirection {
  const past = history.filter((item) => !recent.includes(item));
  if (past.length === 0 || recent.length === 0) return "INSUFFICIENT_HISTORY";
  const difference = average(recent.map(score)) - average(past.map(score));
  if (difference >= 5) return "IMPROVING";
  if (difference <= -5) return "DECLINING";
  return "MAINTAINING";
}

function statusFor(recent: readonly ReportSummaryDto[]): DiagnosticStatus {
  if (recent.length === 0) return "OBSERVING";
  const value = average(recent.map(score));
  if (value >= 80) return "STABLE";
  if (value >= 60) return "DEVELOPING";
  return "SUPPORT_NEEDED";
}

export function diagnosticReportFromHistory(
  history: readonly ReportSummaryDto[],
  learner: LearnerProfile,
  requestedWeekStart?: string,
): DiagnosticReportDto {
  const todayInKorea = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const referenceDay = requestedWeekStart ?? todayInKorea;
  const dated = history
    .map((summary) => ({ summary, day: isoDay(summary.date, referenceDay) }))
    .filter((item): item is { summary: ReportSummaryDto; day: string } => Boolean(item.day))
    .sort((left, right) => left.day.localeCompare(right.day));
  const availableWeeks = dated.map((item) => mondayFor(item.day));
  const latestWeekStart = availableWeeks.at(-1) ?? mondayFor(new Date().toISOString().slice(0, 10));
  const earliestWeekStart = availableWeeks[0] ?? latestWeekStart;
  const weekStart = requestedWeekStart ?? latestWeekStart;
  const weekEnd = addDays(weekStart, 6);
  const recentRows = dated.filter((item) => item.day >= weekStart && item.day <= weekEnd);
  const recentDomainIds = new Set(recentRows.map((item) => item.summary.session_id));
  const relevantRows = dated.filter((item) => item.day <= weekEnd && recentDomainIds.has(item.summary.session_id));
  const domains: DiagnosticDomainTrendDto[] = [];
  const statuses: DiagnosticDomainStatusDto[] = [];

  for (const domainId of recentDomainIds) {
    const rows = relevantRows.filter((item) => item.summary.session_id === domainId);
    const recent = rows.filter((item) => item.day >= weekStart);
    const session = sessionById.get(domainId);
    const label = session?.title ?? domainId;
    domains.push({
      domain_id: domainId,
      label: `${label} · 반복학습`,
      total_count: rows.length,
      recent_count: recent.length,
      points: rows.map(({ summary, day }) => ({
        evidence_id: summary.learning_session_id,
        label,
        occurred_at: summary.date?.startsWith(day) ? summary.date : `${day}T00:00:00+09:00`,
        independent_score: score(summary),
        supported_score: score(summary),
        attempt_count: Math.max(0, summary.repetitions),
        question_count: Math.max(0, summary.mastery_target),
        expression_level: Number.isInteger(summary.ladder) && summary.ladder >= 0 && summary.ladder <= 4
          ? `L${summary.ladder}`
          : undefined,
        recent: day >= weekStart,
      })),
    });
    statuses.push({
      domain_id: domainId,
      label,
      status: statusFor(recent.map((item) => item.summary)),
      direction: directionFor(rows.map((item) => item.summary), recent.map((item) => item.summary)),
      total_count: rows.length,
      recent_count: recent.length,
    });
  }

  const recentSummaries = recentRows.map((item) => item.summary);
  const firstRecentLabel = domains[0]?.label.split(" · ")[0] ?? "학습";
  return {
    learner: {
      learner_id: learner.id,
      display_name: learner.name || recentSummaries[0]?.learner_name || "학습자",
    },
    period: {
      week_start: weekStart,
      week_end: weekEnd,
      timezone: "Asia/Seoul",
      earliest_week_start: earliestWeekStart,
      latest_week_start: latestWeekStart,
    },
    data_range: {
      first_at: relevantRows[0] ? `${relevantRows[0].day}T00:00:00+09:00` : undefined,
      last_at: relevantRows.at(-1) ? `${relevantRows.at(-1)!.day}T00:00:00+09:00` : undefined,
      total_home_sessions: relevantRows.length,
      total_life_visits: 0,
    },
    current_summary: {
      concept_performance: {
        text: recentRows.length > 0 ? `${firstRecentLabel}을 포함해 이번 주 완료한 학습 기록을 확인했습니다.` : "이번 주 완료한 학습 기록이 없습니다.",
        evidence_refs: domains.map((domain) => `drill:${domain.domain_id}`),
      },
      explanation_change: { text: "완료된 모르미 가르치기 기록을 기준으로 발화 단계를 표시합니다.", evidence_refs: [] },
      life_transfer: { text: "이번 주 실생활 학습 기록은 별도로 확인합니다.", evidence_refs: [] },
    },
    modes: [{ mode: "HOME", domains }, { mode: "LIFE", domains: [] }],
    domains: statuses,
    improved_point: { text: recentRows.length > 0 ? `${firstRecentLabel} 학습을 완료했습니다.` : "완료 기록을 기다리고 있습니다.", evidence_refs: [] },
    observe_point: { text: "다음 완료 기록에서 정답률과 필요한 시도 횟수를 이어서 비교합니다.", evidence_refs: [] },
    evidence_counts: {
      home_sessions: recentRows.length,
      drill_attempts: recentSummaries.reduce((sum, item) => sum + Math.max(0, item.repetitions), 0),
      teach_conversations: recentSummaries.filter((item) => item.teach_coins > 0).length,
      life_visits: 0,
      speech_samples: recentSummaries.filter((item) => item.teach_coins > 0).length,
    },
    narrative_fallback: true,
  };
}
