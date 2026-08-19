import assert from "node:assert/strict";
import test from "node:test";
import type { ReportSummaryDto } from "../app/api-client.ts";
import { diagnosticReportFromHistory } from "../app/report/diagnostic-history-fallback.ts";

function summary(overrides: Partial<ReportSummaryDto>): ReportSummaryDto {
  return {
    date: "8월 12일",
    learning_session_id: "learning-current",
    session_id: "money-count",
    mastery_target: 2,
    repetitions: 4,
    mastery_seconds: 90,
    synchronized: false,
    transfer: false,
    ladder: 2,
    timed_out: false,
    learner_id: 7,
    learner_name: "이재용",
    earned_coins: 0,
    drill_coins: 0,
    teach_coins: 1,
    wallet_balance: 0,
    wrong_attempt_count: 1,
    first_try_correct_count: 1,
    ...overrides,
  };
}

test("builds the selected weekly report from deployed completed-session history", () => {
  const report = diagnosticReportFromHistory([
    summary({
      date: "8월 5일",
      learning_session_id: "learning-past",
      repetitions: 3,
      ladder: 4,
      first_try_correct_count: 2,
    }),
    summary({}),
    summary({
      date: "8월 5일",
      learning_session_id: "old-other-unit",
      session_id: "clock-basic",
    }),
  ], { id: 7, name: "이재용" }, "2026-08-10");

  assert.equal(report.learner.display_name, "이재용");
  assert.equal(report.period.week_start, "2026-08-10");
  assert.equal(report.period.week_end, "2026-08-16");
  assert.deepEqual(report.modes.find((mode) => mode.mode === "HOME")?.domains.map((domain) => domain.domain_id), ["money-count"]);
  const points = report.modes.find((mode) => mode.mode === "HOME")!.domains[0]!.points;
  assert.equal(points.length, 2);
  assert.equal(points[0]!.recent, false);
  assert.equal(points[1]!.recent, true);
  assert.equal(points[1]!.attempt_count, 4);
  assert.equal(points[1]!.question_count, 2);
  assert.equal(points[1]!.expression_level, "L2");
  assert.equal(report.evidence_counts.home_sessions, 1);
  assert.equal(report.evidence_counts.drill_attempts, 4);
});
