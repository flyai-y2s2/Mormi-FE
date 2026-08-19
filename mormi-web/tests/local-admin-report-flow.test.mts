import assert from "node:assert/strict";
import test from "node:test";

import { reportRequestFor } from "../app/report/local-admin-report-flow.ts";

test("selects the local-admin diagnostic source for a selected learner", () => {
  assert.deepEqual(reportRequestFor({ selectedLearnerId: 19, weekStart: "2026-08-17" }), {
    source: "local-admin",
    learnerId: 19,
    weekStart: "2026-08-17",
  });
});

test("selects the authenticated diagnostic source without a selected learner", () => {
  assert.deepEqual(reportRequestFor({ selectedLearnerId: null, weekStart: undefined }), {
    source: "authenticated",
    weekStart: undefined,
  });
});
