import assert from "node:assert/strict";
import test from "node:test";

import type {
  AvailableSpeechEvidenceDto,
  DiagnosticDomainStatusDto,
  DiagnosticDomainTrendDto,
  DiagnosticReportDto,
  SpeechEvidenceDto,
} from "../app/api-client.ts";
import {
  chartPoints,
  chooseDiagnosticSelection,
  diagnosticSeriesForDomain,
  groupDiagnosticDomains,
  isEmptyDiagnosticReport,
  recentWindowsForSeries,
  statusLabel,
} from "../app/report/diagnostic-report-model.ts";

function trend(
  occurred_at: string,
  independent_score: number,
  recent: boolean,
  overrides: Partial<{
    evidence_id: string;
    label: string;
    supported_score: number;
  }> = {},
) {
  return {
    evidence_id: overrides.evidence_id ?? `evidence:${occurred_at}`,
    label: overrides.label ?? "수 세기 · 반복학습",
    occurred_at,
    independent_score,
    supported_score: overrides.supported_score ?? independent_score,
    recent,
  };
}

test("chartPoints keeps chronology and maps scores into the SVG plot", () => {
  const points = chartPoints([
    trend("2026-08-01", 20, false),
    trend("2026-08-08", 80, true),
  ], 400, 120);
  assert.deepEqual(points.map((point) => point.x), [0, 400]);
  assert.deepEqual(points.map((point) => point.y), [96, 24]);
  assert.equal(points[1].recent, true);
});

test("statusLabel uses teacher-facing Korean labels", () => {
  assert.equal(statusLabel("STABLE"), "안정");
  assert.equal(statusLabel("DEVELOPING"), "발달 중");
  assert.equal(statusLabel("SUPPORT_NEEDED"), "지원 필요");
  assert.equal(statusLabel("OBSERVING"), "관찰 중");
});

test("chartPoints orders ties deterministically and preserves point metadata for accessible series", () => {
  const points = chartPoints([
    trend("2026-08-08T09:00:00Z", 80, true, { evidence_id: "z" }),
    trend("2026-08-01T09:00:00Z", 20, false, { evidence_id: "b", supported_score: 100 }),
    trend("2026-08-08T09:00:00Z", 60, true, { evidence_id: "a" }),
  ], 200, 100);

  assert.deepEqual(points.map((point) => point.evidence_id), ["b", "a", "z"]);
  assert.deepEqual(points.map((point) => point.x), [0, 100, 200]);
  assert.equal(points[0].label, "수 세기 · 반복학습");
  assert.equal(points[0].supported_score, 100);
});

test("chartPoints safely handles empty, single-point, and out-of-range scores", () => {
  assert.deepEqual(chartPoints([], 400, 120), []);

  const [point] = chartPoints([trend("2026-08-01", 120, true)], 400, 120);
  assert.deepEqual(point && { x: point.x, y: point.y }, { x: 200, y: 0 });

  const [low] = chartPoints([trend("2026-08-01", -10, false)], 400, 120);
  assert.equal(low?.y, 120);
});

test("chartPoints gives non-finite server scores a deterministic safe fallback", () => {
  const points = chartPoints([
    trend("2026-08-01", Number.NaN, false),
    trend("2026-08-02", Number.POSITIVE_INFINITY, true),
    trend("2026-08-03", Number.NEGATIVE_INFINITY, true),
  ], 400, 120);

  assert.deepEqual(points.map((point) => point.y), [120, 120, 120]);
  for (const point of points) {
    assert.match(point.accessible_label, /독립 수행 0%, 도움 후 완료 0%/);
    assert.doesNotMatch(point.accessible_label, /NaN|Infinity/);
  }
});

test("diagnostic fixtures mirror Spring's empty and speech-evidence JSON shapes", () => {
  const emptyReport: DiagnosticReportDto = {
    learner: { learner_id: 7, display_name: "학습자" },
    data_range: { total_home_sessions: 0, total_life_visits: 0 },
    current_summary: {
      concept_performance: { text: "집 학습 근거가 없습니다.", evidence_refs: [] },
      explanation_change: { text: "발화 근거가 없습니다.", evidence_refs: [] },
      life_transfer: { text: "실생활 근거가 없습니다.", evidence_refs: [] },
    },
    modes: [{ mode: "HOME", domains: [] }, { mode: "LIFE", domains: [] }],
    domains: [],
    improved_point: { text: "관찰이 필요합니다.", evidence_refs: [] },
    observe_point: { text: "새 기록을 기다립니다.", evidence_refs: [] },
    evidence_counts: {
      home_sessions: 0,
      drill_attempts: 0,
      teach_conversations: 0,
      life_visits: 0,
      speech_samples: 0,
    },
    narrative_fallback: true,
  };
  const unavailable: SpeechEvidenceDto = {
    domain_id: "money-count",
    available: false,
    message: "비교 가능한 발화 근거가 부족합니다.",
    verified_elements: [],
  };
  const available: SpeechEvidenceDto = {
    domain_id: "money-count",
    available: true,
    past: {
      evidence_id: "conversation:1:turn:1",
      utterance: "동전 세 개예요.",
      occurred_at: "2026-08-01T09:00:00Z",
    },
    recent: {
      evidence_id: "conversation:2:turn:2",
      utterance: "동전을 세 개 더해서 여섯 개예요.",
      occurred_at: "2026-08-08T09:00:00Z",
    },
    verified_elements: ["count"],
    change_summary: "도움 수준이 H1에서 H0로 바뀌었습니다.",
  };

  const speechText = (evidence: SpeechEvidenceDto): string => (
    evidence.available ? evidence.recent.utterance : evidence.message
  );

  assert.equal(emptyReport.data_range.first_at, undefined);
  assert.deepEqual(Object.keys(unavailable).sort(), ["available", "domain_id", "message", "verified_elements"]);
  assert.equal(speechText(unavailable), "비교 가능한 발화 근거가 부족합니다.");
  assert.equal(speechText(available), "동전을 세 개 더해서 여섯 개예요.");
  assert.equal(available.past.hint_level, undefined);
  assert.equal(available.recent.expression_level, undefined);

  const impossibleAvailableMessage: AvailableSpeechEvidenceDto = {
    ...available,
    // @ts-expect-error Spring omits the available branch's null message.
    message: null,
  };
  assert.equal("message" in impossibleAvailableMessage, true);
});

function domainTrend(
  domain_id: string,
  label: string,
  points: ReturnType<typeof trend>[],
): DiagnosticDomainTrendDto {
  return { domain_id, label, points, total_count: points.length, recent_count: points.filter((point) => point.recent).length };
}

function domainStatus(
  domain_id: string,
  label: string,
  status: DiagnosticDomainStatusDto["status"],
): DiagnosticDomainStatusDto {
  return { domain_id, label, status, direction: "IMPROVING", total_count: 2, recent_count: 1 };
}

test("groups duplicate HOME records into one domain and sources drill and teach independently", () => {
  const drill = domainTrend("money-count", "돈 세기 · 반복학습", [
    trend("2026-08-01", 30, false, { evidence_id: "drill:1", supported_score: 99 }),
  ]);
  const teach = domainTrend("money-count", "돈 세기 · 설명 독립성", [
    trend("2026-08-08", 70, true, { evidence_id: "teach:1", supported_score: 5 }),
  ]);
  const life = domainTrend("calculate", "메뉴 값 계산하기", [
    trend("2026-08-09", 60, true, { evidence_id: "life:1", supported_score: 100 }),
  ]);
  const report: DiagnosticReportDto = {
    learner: { learner_id: 7, display_name: "학습자" },
    data_range: { total_home_sessions: 2, total_life_visits: 1 },
    current_summary: {
      concept_performance: { text: "개념 근거", evidence_refs: ["drill:1"] },
      explanation_change: { text: "설명 근거", evidence_refs: ["teach:1"] },
      life_transfer: { text: "생활 근거", evidence_refs: ["life:1"] },
    },
    modes: [{ mode: "HOME", domains: [drill, teach] }, { mode: "LIFE", domains: [life] }],
    domains: [
      domainStatus("money-count", "돈 세기 · 반복학습", "DEVELOPING"),
      domainStatus("money-count", "돈 세기 · 설명 독립성", "STABLE"),
      domainStatus("calculate", "메뉴 값 계산하기", "OBSERVING"),
    ],
    improved_point: { text: "좋아진 근거", evidence_refs: ["teach:1"] },
    observe_point: { text: "관찰 근거", evidence_refs: ["life:1"] },
    evidence_counts: { home_sessions: 2, drill_attempts: 1, teach_conversations: 1, life_visits: 1, speech_samples: 0 },
    narrative_fallback: false,
  };
  const before = JSON.stringify(report);

  const groups = groupDiagnosticDomains(report);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.domain_id), ["money-count", "calculate"]);
  assert.equal(groups[0]?.label, "돈 세기");
  assert.deepEqual(groups[0]?.statuses.map((item) => item.kind), ["drill", "teach"]);
  assert.deepEqual(groups[1]?.statuses.map((item) => item.kind), ["life"]);

  const homeSeries = diagnosticSeriesForDomain(groups[0]!);
  assert.deepEqual(homeSeries.map((series) => series.id), ["home-drill", "home-teach"]);
  assert.deepEqual(homeSeries.map((series) => series.points[0]?.score), [30, 70]);
  assert.deepEqual(homeSeries.map((series) => series.points[0]?.evidence_id), ["drill:1", "teach:1"]);
  assert.deepEqual(homeSeries.map((series) => series.points[0]?.recent), [false, true]);

  const lifeSeries = diagnosticSeriesForDomain(groups[1]!);
  assert.deepEqual(lifeSeries.map((series) => series.id), ["life-independent", "life-supported"]);
  assert.deepEqual(lifeSeries.map((series) => series.points[0]?.score), [60, 100]);
  assert.equal(JSON.stringify(report), before, "grouping must not mutate the server response");

  assert.equal(chooseDiagnosticSelection(groups, "HOME", "money-count")?.domain_id, "money-count");
  assert.equal(chooseDiagnosticSelection(groups, "LIFE", "missing")?.domain_id, "calculate");
});

test("selects the richest comparable history while preserving a valid current domain", () => {
  const moneyBudget = {
    domain_id: "money-budget",
    label: "예산 세우기",
    mode: "HOME" as const,
    drill_trend: domainTrend("money-budget", "예산 세우기 · 반복학습", [
      trend("2026-08-01", 40, true, { evidence_id: "budget:1" }),
    ]),
    statuses: [],
  };
  const moneyCount = {
    domain_id: "money-count",
    label: "돈 세기",
    mode: "HOME" as const,
    drill_trend: domainTrend("money-count", "돈 세기 · 반복학습", Array.from({ length: 5 }, (_, index) => (
      trend(`2026-08-${String(index + 1).padStart(2, "0")}`, 40 + index, index >= 3, { evidence_id: `count:drill:${index}` })
    ))),
    teach_trend: domainTrend("money-count", "돈 세기 · 설명 독립성", Array.from({ length: 4 }, (_, index) => (
      trend(`2026-08-${String(index + 10).padStart(2, "0")}`, 50 + index, index >= 2, { evidence_id: `count:teach:${index}` })
    ))),
    statuses: [],
  };

  assert.equal(chooseDiagnosticSelection([moneyBudget, moneyCount], "HOME", "")?.domain_id, "money-count");
  assert.equal(chooseDiagnosticSelection([moneyCount, moneyBudget], "HOME", "missing")?.domain_id, "money-count");
  assert.equal(chooseDiagnosticSelection([moneyCount, moneyBudget], "HOME", "money-budget")?.domain_id, "money-budget");
});

test("breaks equal-history selection ties by recent points and then domain id", () => {
  const candidate = (domain_id: string, recent: boolean[]) => ({
    domain_id,
    label: domain_id,
    mode: "HOME" as const,
    drill_trend: domainTrend(domain_id, `${domain_id} · 반복학습`, recent.map((isRecent, index) => (
      trend(`2026-08-${String(index + 1).padStart(2, "0")}`, 50, isRecent, { evidence_id: `${domain_id}:${index}` })
    ))),
    statuses: [],
  });
  const lessRecent = candidate("money-alpha", [false, true]);
  const moreRecentZ = candidate("money-zeta", [true, true]);
  const moreRecentA = candidate("money-beta", [true, true]);

  assert.equal(chooseDiagnosticSelection([lessRecent, moreRecentZ], "HOME", "")?.domain_id, "money-zeta");
  assert.equal(chooseDiagnosticSelection([moreRecentZ, moreRecentA], "HOME", "")?.domain_id, "money-beta");
});

test("keeps different HOME recent boundaries on their own series without mutating evidence", () => {
  const series = [
    {
      id: "home-drill" as const,
      label: "반복학습",
      points: [
        { evidence_id: "drill:1", label: "첫 연습", occurred_at: "2026-08-01", score: 30, recent: false },
        { evidence_id: "drill:2", label: "둘째 연습", occurred_at: "2026-08-08", score: 55, recent: true },
        { evidence_id: "drill:3", label: "셋째 연습", occurred_at: "2026-08-22", score: 75, recent: true },
      ],
      total_count: 3,
      recent_count: 2,
    },
    {
      id: "home-teach" as const,
      label: "모르미 가르치기",
      points: [
        { evidence_id: "teach:1", label: "첫 설명", occurred_at: "2026-08-08", score: 35, recent: false },
        { evidence_id: "teach:2", label: "둘째 설명", occurred_at: "2026-08-15", score: 60, recent: true },
        { evidence_id: "teach:3", label: "셋째 설명", occurred_at: "2026-08-29", score: 80, recent: true },
      ],
      total_count: 3,
      recent_count: 2,
    },
  ];
  const before = JSON.stringify(series);

  const layout = recentWindowsForSeries(series);

  assert.equal(layout.kind, "per-series");
  assert.deepEqual(layout.windows.map((window) => ({
    series_id: window.series_id,
    start_at: window.start_at,
    end_at: window.end_at,
  })), [
    { series_id: "home-drill", start_at: "2026-08-08", end_at: "2026-08-22" },
    { series_id: "home-teach", start_at: "2026-08-15", end_at: "2026-08-29" },
  ]);
  assert.match(layout.description, /반복학습은 2026-08-08부터 2026-08-22까지/);
  assert.match(layout.description, /모르미 가르치기는 2026-08-15부터 2026-08-29까지/);
  assert.equal(JSON.stringify(series), before, "recent-window calculation must not mutate series evidence");
});

test("keeps equal-start HOME windows separate when their series end at different times", () => {
  const layout = recentWindowsForSeries([
    {
      id: "home-drill",
      label: "반복학습",
      points: [
        { evidence_id: "drill:1", label: "첫 연습", occurred_at: "2026-08-08", score: 55, recent: true },
        { evidence_id: "drill:2", label: "둘째 연습", occurred_at: "2026-08-22", score: 75, recent: true },
      ],
      total_count: 2,
      recent_count: 2,
    },
    {
      id: "home-teach",
      label: "모르미 가르치기",
      points: [
        { evidence_id: "teach:1", label: "첫 설명", occurred_at: "2026-08-08", score: 60, recent: true },
        { evidence_id: "teach:2", label: "둘째 설명", occurred_at: "2026-08-29", score: 80, recent: true },
      ],
      total_count: 2,
      recent_count: 2,
    },
  ]);

  assert.equal(layout.kind, "per-series");
  assert.deepEqual(layout.windows.map((window) => window.end_at), ["2026-08-22", "2026-08-29"]);
});

test("uses one shared recent band when all active LIFE series have the same boundary", () => {
  const sharedPoints = [
    { evidence_id: "life:1", label: "첫 방문", occurred_at: "2026-08-01", score: 40, recent: false },
    { evidence_id: "life:2", label: "둘째 방문", occurred_at: "2026-08-15", score: 70, recent: true },
  ];
  const layout = recentWindowsForSeries([
    { id: "life-independent", label: "독립 수행", points: sharedPoints, total_count: 2, recent_count: 1 },
    { id: "life-supported", label: "도움 후 완료", points: sharedPoints, total_count: 2, recent_count: 1 },
  ]);

  assert.equal(layout.kind, "shared");
  assert.deepEqual(layout.windows.map((window) => window.start_at), ["2026-08-15", "2026-08-15"]);
  assert.match(layout.description, /2026-08-15부터 2026-08-15까지 같은 구간/);
});

test("empty diagnostic report requires zero completed counts and no trend points", () => {
  const empty: DiagnosticReportDto = {
    learner: { learner_id: 7, display_name: "학습자" },
    data_range: { total_home_sessions: 0, total_life_visits: 0 },
    current_summary: {
      concept_performance: { text: "근거 없음", evidence_refs: [] },
      explanation_change: { text: "근거 없음", evidence_refs: [] },
      life_transfer: { text: "근거 없음", evidence_refs: [] },
    },
    modes: [{ mode: "HOME", domains: [] }, { mode: "LIFE", domains: [] }],
    domains: [],
    improved_point: { text: "근거 없음", evidence_refs: [] },
    observe_point: { text: "근거 없음", evidence_refs: [] },
    evidence_counts: { home_sessions: 0, drill_attempts: 0, teach_conversations: 0, life_visits: 0, speech_samples: 0 },
    narrative_fallback: true,
  };

  assert.equal(isEmptyDiagnosticReport(empty), true);
  assert.equal(isEmptyDiagnosticReport({ ...empty, data_range: { total_home_sessions: 1, total_life_visits: 0 } }), false);
  assert.equal(isEmptyDiagnosticReport({
    ...empty,
    modes: [{ mode: "HOME", domains: [domainTrend("money-count", "돈 세기 · 반복학습", [trend("2026-08-01", 50, true)])] }, { mode: "LIFE", domains: [] }],
  }), false);
});
