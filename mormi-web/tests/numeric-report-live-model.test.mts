import assert from "node:assert/strict";
import test from "node:test";
import type { DiagnosticReportDto } from "../app/api-client.ts";
import { buildNumericLiveReport } from "../app/report/numeric-report-live-model.ts";
import { completeDiagnosticReportExample } from "../app/report/complete-report-example.ts";

const report: DiagnosticReportDto = {
  learner: { learner_id: 3, display_name: "리포트 검증 아동" },
  period: { week_start: "2026-08-17", week_end: "2026-08-23", timezone: "Asia/Seoul", earliest_week_start: "2026-08-03", latest_week_start: "2026-08-17" },
  data_range: { total_home_sessions: 13, total_life_visits: 1 },
  current_summary: {
    concept_performance: { text: "돈 세기 문제 정답률은 최근 72%입니다.", evidence_refs: ["drill:money-count"] },
    explanation_change: { text: "비교 가능한 발화 근거가 부족합니다.", evidence_refs: [] },
    life_transfer: { text: "메뉴 값 계산하기를 최근 혼자 해결한 비율은 100%입니다.", evidence_refs: ["life:calculate"] },
  },
  modes: [
    { mode: "HOME", domains: [{
      domain_id: "money-count", label: "돈 세기 · 문제 정답률", total_count: 9, recent_count: 5,
      points: [100, 100, 100, 100, 40, 60, 80, 100, 80].map((score, index) => ({
        evidence_id: `session-${index}`, label: "drill", occurred_at: `2026-08-16T18:5${index}:00Z`,
        independent_score: score, supported_score: score, recent: index >= 4,
      })),
    }] },
    { mode: "LIFE", domains: [{
      domain_id: "calculate", label: "메뉴 값 계산하기", total_count: 1, recent_count: 1,
      points: [{ evidence_id: "visit-1", label: "life", occurred_at: "2026-08-16T19:00:00Z", independent_score: 100, supported_score: 100, recent: true }],
    }] },
  ],
  domains: [
    { domain_id: "money-count", label: "돈 세기 · 문제 정답률", status: "DEVELOPING", direction: "DECLINING", total_count: 9, recent_count: 5 },
    { domain_id: "calculate", label: "메뉴 값 계산하기", status: "OBSERVING", direction: "INSUFFICIENT_HISTORY", total_count: 1, recent_count: 1 },
  ],
  improved_point: { text: "장기 근거가 부족합니다.", evidence_refs: [] },
  observe_point: { text: "돈 세기를 계속 관찰합니다.", evidence_refs: ["observe:drill:money-count"] },
  evidence_counts: { home_sessions: 13, drill_attempts: 46, teach_conversations: 0, life_visits: 1, speech_samples: 0 },
  narrative_fallback: true,
};

test("maps live evidence without inventing attempts or speech metrics", () => {
  const model = buildNumericLiveReport(report);
  assert.equal(model.learnerName, "리포트 검증 아동");
  const money = model.domains.HOME[0];
  assert.equal(money.id, "money-count");
  assert.deepEqual(money.metrics, [
    ["정답률", "84%", "72%"],
    ["정답까지 평균", "—", "—"],
    ["모르미 가르치기", "—", "—"],
  ]);
  assert.equal(money.status, "growing");
  assert.equal(money.headline, "돈 세기, 지금 발달 중이에요");
  assert.doesNotMatch(money.headline, /돈 세기은/);
  assert.equal(money.dominantStage, "—");
  assert.equal(money.repeatCount, 3);
  assert.equal(money.ladderStart, "기록 필요");
  assert.match(money.changeReason, /72%/);
  assert.match(money.thinkingChange, /발화 근거가 부족/);
});

test("keeps one-record life evidence in collecting state", () => {
  const model = buildNumericLiveReport(report);
  const life = model.domains.LIFE[0];
  assert.equal(life.id, "calculate");
  assert.equal(life.metrics[0][2], "100%");
  assert.equal(life.status, "collecting");
  assert.equal(life.repeatCount, 2);
  assert.equal(life.changeReason, "최근 정답률은 100%예요. 비교할 기록이 더 필요해요.");
});

test("keeps completed HOME-only evidence in HOME without inventing LIFE domains", () => {
  const homeOnly: DiagnosticReportDto = {
    ...report,
    modes: [report.modes[0]!, { mode: "LIFE", domains: [] }],
    domains: [report.domains[0]!],
  };

  const model = buildNumericLiveReport(homeOnly);
  assert.equal(model.domains.HOME.length, 1);
  assert.equal(model.domains.LIFE.length, 0);
});

test("uses LIFE transfer narrative for LIFE-only weekly evidence", () => {
  const lifeOnly: DiagnosticReportDto = {
    ...report,
    modes: [{ mode: "HOME", domains: [] }, report.modes[1]!],
    domains: [report.domains[1]!],
    current_summary: {
      ...report.current_summary,
      explanation_change: { text: "집 발화 기록입니다.", evidence_refs: [] },
      life_transfer: { text: "카페에서 계산 순서를 적용했습니다.", evidence_refs: ["life:calculate"] },
    },
  };

  assert.equal(buildNumericLiveReport(lifeOnly).domains.LIFE[0]?.thinkingChange, "카페에서 계산 순서를 적용했습니다.");
});

test("complete example evidence stays inside its displayed selected week", () => {
  const { week_start, week_end } = completeDiagnosticReportExample.period;
  for (const mode of completeDiagnosticReportExample.modes) {
    for (const domain of mode.domains) {
      for (const point of domain.points) {
        const day = point.occurred_at.slice(0, 10);
        assert.ok(day >= week_start && day <= week_end, `${point.evidence_id} must be in the selected week`);
      }
    }
  }
});
