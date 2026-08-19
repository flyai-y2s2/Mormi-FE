import assert from "node:assert/strict";
import test from "node:test";

import { localReportAdminConfig } from "../app/local-report-admin-policy.ts";

test("enables only a non-production loopback origin with a key", () => {
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), { origin: "http://127.0.0.1:8080", key: "secret" });
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "https://example.com",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), null);
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://localhost:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "production"), null);
});
