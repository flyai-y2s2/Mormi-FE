import assert from "node:assert/strict";
import test from "node:test";

import type { DiagnosticReportDto, SpeechEvidenceDto } from "../app/api-client.ts";
import { chartPoints, statusLabel } from "../app/report/diagnostic-report-model.ts";

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
});
