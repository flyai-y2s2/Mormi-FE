import assert from "node:assert/strict";
import test from "node:test";
import type { DiagnosticReportDto, ReportSummaryDto } from "../app/api-client.ts";
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

test("compares non-overlapping previous and latest five-question sessions", () => {
  const cases = [
    { scores: [80], expected: ["—", "80%"], labels: ["이전 기록 없음", "최신 5문항"] },
    { scores: [20, 80], expected: ["20%", "80%"], labels: ["이전 5문항", "최신 5문항"] },
    { scores: [20, 40, 80], expected: ["30%", "80%"], labels: ["이전 10문항", "최신 5문항"] },
    { scores: [20, 40, 60, 80], expected: ["30%", "70%"], labels: ["이전 10문항", "최신 10문항"] },
    { scores: [100, 20, 40, 60, 80], expected: ["30%", "70%"], labels: ["이전 10문항", "최신 10문항"] },
  ] as const;

  for (const { scores, expected, labels } of cases) {
    const windowReport: DiagnosticReportDto = {
      ...report,
      modes: [{
        mode: "HOME",
        domains: [{
          ...report.modes[0]!.domains[0]!,
          total_count: scores.length,
          recent_count: Math.min(2, scores.length),
          points: scores.map((score, index) => ({
            evidence_id: `window-${scores.length}-${index}`,
            label: "drill",
            occurred_at: `2026-08-${String(10 + index).padStart(2, "0")}T10:00:00Z`,
            independent_score: score,
            supported_score: score,
            attempt_count: 5,
            question_count: 5,
            recent: true,
          })),
        }],
      }, { mode: "LIFE", domains: [] }],
    };

    const money = buildNumericLiveReport(windowReport).domains.HOME[0]!;
    assert.deepEqual(money.metrics[0].slice(1), expected, `${scores.length}회 정답률 구간`);
    assert.deepEqual(money.comparisonLabels, labels, `${scores.length}회 문항 수 라벨`);
    if (scores.length === 4) assert.match(money.changeReason, /좋아지고/, "표시 구간과 변화 설명이 일치해야 한다");
  }
});

test("maps live evidence without inventing attempts or speech metrics", () => {
  const model = buildNumericLiveReport(report);
  assert.equal(model.learnerName, "리포트 검증 아동");
  const money = model.domains.HOME[0];
  assert.equal(money.id, "money-count");
  assert.deepEqual(money.metrics, [
    ["정답률", "70%", "90%"],
    ["정답까지 평균", "—", "—"],
    ["모르미 가르치기", "—", "—"],
  ]);
  assert.equal(money.status, "growing");
  assert.equal(money.headline, "돈 세기, 지금 발달 중이에요");
  assert.doesNotMatch(money.headline, /돈 세기은/);
  assert.equal(money.dominantStage, "—");
  assert.equal(money.repeatCount, 3);
  assert.equal(money.ladderStart, "기록 필요");
  assert.match(money.changeReason, /90%/);
  assert.match(money.thinkingChange, /발화 근거가 부족/);
});

test("maps the selected subunit ladder recommendation without mixing other units", () => {
  const recommendationReport = {
    ...report,
    ladder_recommendations: [
      {
        analysis_id: "analysis-money",
        learner_id: 3,
        skill_id: "money-count",
        trigger_session_id: "session-9",
        session_ids: ["session-8", "session-9"],
        current_level: "L2",
        recommended_level: "L3",
        action: "UPGRADE",
        current_accuracy: 0.94,
        evidence_count: 4,
        reason_code: "upgrade_threshold_met",
        recent_predictions: [{ level: "L3", confidence: 0.91 }, { level: "L4", confidence: 0.88 }],
        model_version: "ladder-v2",
        recommendation_version: 2,
        approved: false,
        analyzed_at: "2026-08-23T10:00:00+09:00",
      },
      {
        analysis_id: "analysis-other",
        learner_id: 3,
        skill_id: "other-unit",
        trigger_session_id: "session-11",
        session_ids: ["session-10", "session-11"],
        current_level: "L3",
        recommended_level: "L2",
        action: "ADJUST_DOWN",
        current_accuracy: 0.5,
        evidence_count: 5,
        reason_code: "lower_prediction_streak",
        recent_predictions: [{ level: "L2", confidence: 0.82 }],
        model_version: "ladder-v2",
        recommendation_version: 1,
        approved: false,
        analyzed_at: "2026-08-23T10:00:00+09:00",
      },
    ],
  } satisfies DiagnosticReportDto;

  const money = buildNumericLiveReport(recommendationReport).domains.HOME[0]!;
  assert.equal(money.ladderAnalysis?.analysisId, "analysis-money");
  assert.equal(money.ladderAnalysis?.currentLevel, "L2");
  assert.equal(money.ladderAnalysis?.recommendedLevel, "L3");
  assert.equal(money.ladderAnalysis?.currentAccuracy, 94);
  assert.deepEqual(money.ladderAnalysis?.recentPrediction, { level: "L4", confidence: 88 });
});

test("recognizes the BE 반복학습 and 모르미 가르치기 labels without dropping teaching evidence", () => {
  const actualLabels: DiagnosticReportDto = {
    ...report,
    modes: [
      {
        mode: "HOME",
        domains: [
          { ...report.modes[0]!.domains[0]!, label: "돈 세기 · 반복학습" },
          {
            ...report.modes[0]!.domains[0]!,
            label: "돈 세기 · 모르미 가르치기",
            total_count: 2,
            recent_count: 2,
            points: [40, 80].map((score, index) => ({
              evidence_id: `teach-${index}`,
              label: "모르미 가르치기",
              occurred_at: `2026-08-18T18:0${index}:00Z`,
              independent_score: score,
              supported_score: score,
              recent: true,
            })),
          },
        ],
      },
      { mode: "LIFE", domains: [] },
    ],
  };

  const model = buildNumericLiveReport(actualLabels);
  const money = model.domains.HOME[0]!;
  assert.deepEqual(money.metrics, [
    ["정답률", "70%", "90%"],
    ["정답까지 평균", "—", "—"],
    ["모르미 가르치기", "40%", "80%"],
  ]);
  assert.equal(money.ladderStart, "L2");
});

test("calculates attempts-to-correct and recent L4-L0 shares from backend evidence", () => {
  const evidenceReport: DiagnosticReportDto = {
    ...report,
    learner: { learner_id: 7, display_name: "이재용" },
    modes: [
      {
        mode: "HOME",
        domains: [
          {
            ...report.modes[0]!.domains[0]!,
            label: "돈 세기 단원 · 반복학습",
            points: [
              { ...report.modes[0]!.domains[0]!.points[0]!, recent: false, attempt_count: 3, question_count: 2 },
              { ...report.modes[0]!.domains[0]!.points[1]!, recent: true, attempt_count: 4, question_count: 2 },
            ],
          },
          {
            ...report.modes[0]!.domains[0]!,
            label: "돈 세기 단원 · 모르미 가르치기",
            points: [
              { ...report.modes[0]!.domains[0]!.points[0]!, recent: true, expression_level: "L4" },
              { ...report.modes[0]!.domains[0]!.points[1]!, recent: true, expression_level: "L4" },
              { ...report.modes[0]!.domains[0]!.points[2]!, recent: true, expression_level: "L2" },
            ],
          },
        ],
      },
      { mode: "LIFE", domains: [] },
    ],
  };

  const model = buildNumericLiveReport(evidenceReport);
  const money = model.domains.HOME[0]!;

  assert.equal(model.learnerName, "이재용");
  assert.deepEqual(money.metrics[1], ["정답까지 평균", "1.5회", "2.0회"]);
  assert.deepEqual(money.sessionRows.at(-1), ["발화 단계 사용 비율 (L4/L3/L2/L0)", "100/0/0/0%", "0/0/100/0%"]);
  assert.equal(money.dominantStage, "L2");
});

test("keeps rounded ladder shares at exactly one hundred percent", () => {
  const equalLevels: DiagnosticReportDto = {
    ...report,
    modes: [{
      mode: "HOME",
      domains: [
        { ...report.modes[0]!.domains[0]!, label: "돈 세기 단원 · 반복학습" },
        {
          ...report.modes[0]!.domains[0]!,
          label: "돈 세기 단원 · 모르미 가르치기",
          points: ["L4", "L3", "L2"].map((expression_level, index) => ({
            ...report.modes[0]!.domains[0]!.points[index]!, recent: true, expression_level,
          })),
        },
      ],
    }, { mode: "LIFE", domains: [] }],
  };

  assert.deepEqual(buildNumericLiveReport(equalLevels).domains.HOME[0]!.sessionRows.at(-1), [
    "발화 단계 사용 비율 (L4/L3/L2/L0)", "50/50/0/0%", "0/0/100/0%",
  ]);
});

test("falls back to deployed session history when diagnostic points lack new metrics", () => {
  const legacyReport: DiagnosticReportDto = {
    ...report,
    modes: [{
      mode: "HOME",
      domains: [{
        ...report.modes[0]!.domains[0]!,
        label: "돈 세기 단원 · 반복학습",
        points: [
          { ...report.modes[0]!.domains[0]!.points[0]!, evidence_id: "session-past", recent: false },
          { ...report.modes[0]!.domains[0]!.points[1]!, evidence_id: "session-recent", recent: true },
        ],
      }],
    }, { mode: "LIFE", domains: [] }],
  };
  const history = [
    { learning_session_id: "session-past", session_id: "money-count", mastery_target: 2, repetitions: 3, ladder: 4 },
    { learning_session_id: "session-recent", session_id: "money-count", mastery_target: 2, repetitions: 4, ladder: 2 },
  ].map((item) => ({
    date: null, synchronized: false, transfer: false, timed_out: false,
    learner_id: 7, learner_name: "이재용", earned_coins: 0, drill_coins: 0, teach_coins: 0,
    wallet_balance: 0, wrong_attempt_count: 0, first_try_correct_count: 0, mastery_seconds: 0,
    ...item,
  })) satisfies ReportSummaryDto[];

  const money = buildNumericLiveReport(legacyReport, history).domains.HOME[0]!;
  assert.deepEqual(money.metrics[1], ["정답까지 평균", "1.5회", "2.0회"]);
  assert.deepEqual(money.sessionRows.at(-1), [
    "발화 단계 사용 비율 (L4/L3/L2/L0)", "100/0/0/0%", "0/0/100/0%",
  ]);
  assert.equal(money.dominantStage, "L2");
});

test("keeps legacy L1 evidence raw while aggregating it into the L2 report bucket", () => {
  const legacyPoint = {
    ...report.modes[0]!.domains[0]!.points[0]!,
    evidence_id: "legacy-l1",
    expression_level: "L1",
    recent: true,
  };
  const l2Point = {
    ...report.modes[0]!.domains[0]!.points[1]!,
    evidence_id: "current-l2",
    expression_level: "L2",
    recent: true,
  };
  const legacyEvidence: DiagnosticReportDto = {
    ...report,
    modes: [{
      mode: "HOME",
      domains: [
        { ...report.modes[0]!.domains[0]!, label: "돈 세기 · 반복학습" },
        { ...report.modes[0]!.domains[0]!, label: "돈 세기 · 모르미 가르치기", points: [legacyPoint, l2Point] },
      ],
    }, { mode: "LIFE", domains: [] }],
  };

  const row = buildNumericLiveReport(legacyEvidence).domains.HOME[0]!.sessionRows.at(-1);
  assert.deepEqual(row, ["발화 단계 사용 비율 (L4/L3/L2/L0)", "0/0/100/0%", "0/0/100/0%"]);
  assert.equal(legacyPoint.expression_level, "L1", "입력 원본은 L1 그대로 보존한다");
});

test("labels static example data as an example learner", () => {
  assert.equal(completeDiagnosticReportExample.learner.display_name, "예시 학습자");
});

test("counts three HOME completions for the same unit as one completed unit", () => {
  const repeatedUnit: DiagnosticReportDto = {
    ...report,
    modes: [
      {
        mode: "HOME",
        domains: [{
          ...report.modes[0]!.domains[0]!,
          label: "돈 세기 · 반복학습",
          total_count: 3,
          recent_count: 3,
          points: report.modes[0]!.domains[0]!.points.slice(0, 3),
        }],
      },
      { mode: "LIFE", domains: [] },
    ],
    evidence_counts: { ...report.evidence_counts, home_sessions: 3 },
  };

  const summary = buildNumericLiveReport(repeatedUnit).weeklySummary;
  assert.equal(summary.completedUnits, 1);
  assert.equal(summary.drillAttempts, 46);
  assert.equal(summary.teachConversations, 0);
  assert.equal(summary.lifeVisits, 1);
});

test("keeps one-record life evidence in collecting state", () => {
  const model = buildNumericLiveReport(report);
  const life = model.domains.LIFE[0];
  assert.equal(life.id, "calculate");
  assert.equal(life.metrics[0][2], "100%");
  assert.equal(life.status, "collecting");
  assert.equal(life.repeatCount, 2);
  assert.equal(life.changeReason, "비교할 기록이 더 필요해요.");
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
  const homeLabels = completeDiagnosticReportExample.modes.find((mode) => mode.mode === "HOME")!.domains.map((domain) => domain.label);
  assert.ok(homeLabels.some((label) => label.endsWith(" · 반복학습")));
  assert.ok(homeLabels.some((label) => label.endsWith(" · 모르미 가르치기")));
});
