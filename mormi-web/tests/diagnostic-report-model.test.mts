import assert from "node:assert/strict";
import test from "node:test";

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
