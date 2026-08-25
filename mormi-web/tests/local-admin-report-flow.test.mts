import assert from "node:assert/strict";
import test from "node:test";

import { reportLandingFor, reportRequestFor, weekStartAfterLearnerSelection } from "../app/report/local-admin-report-flow.ts";

test("shows local-admin search instead of requiring learner login", () => {
  assert.equal(reportLandingFor({ localAdminEnabled: true, hasStoredLearner: false }), "local-admin-search");
});

test("teacher mode requires its password before showing learner search", () => {
  assert.equal(reportLandingFor({
    localAdminEnabled: true,
    hasStoredLearner: true,
    teacherMode: true,
    teacherAuthRequired: true,
    teacherAuthenticated: false,
  }), "teacher-login");
  assert.equal(reportLandingFor({
    localAdminEnabled: true,
    hasStoredLearner: false,
    teacherMode: true,
    teacherAuthRequired: true,
    teacherAuthenticated: true,
  }), "local-admin-search");
});

test("teacher mode reports missing production configuration instead of falling back to learner login", () => {
  assert.equal(reportLandingFor({
    localAdminEnabled: false,
    hasStoredLearner: false,
    teacherMode: true,
    teacherAuthRequired: false,
    teacherAuthenticated: false,
  }), "teacher-unavailable");
});

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

test("changing learners opens that learner's latest available report week", () => {
  assert.equal(weekStartAfterLearnerSelection({
    previousLearnerId: 19,
    nextLearnerId: 20,
    currentWeekStart: "2026-08-17",
  }), undefined);
  assert.equal(weekStartAfterLearnerSelection({
    previousLearnerId: 19,
    nextLearnerId: 19,
    currentWeekStart: "2026-08-17",
  }), "2026-08-17");
});
