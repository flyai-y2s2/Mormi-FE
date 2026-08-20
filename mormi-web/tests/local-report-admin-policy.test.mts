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

test("rejects loopback origins that embed credentials", () => {
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://admin:password@127.0.0.1:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), null);
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://admin@localhost:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), null);
});

test("enables an authenticated production HTTPS origin", () => {
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  }, "production"), {
    origin: "https://api.mormi.example",
    key: "server-secret",
    auth: {
      password: "teacher-password",
      sessionSecret: "session-secret-with-at-least-32-characters",
      secureCookie: true,
    },
  });
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "",
    BACKEND_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  }, "production")?.origin, "https://api.mormi.example");
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
    BACKEND_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  }, "production")?.origin, "https://api.mormi.example");
});

test("rejects production access without HTTPS and both teacher secrets", () => {
  const base = {
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  };
  assert.equal(localReportAdminConfig({ ...base, LOCAL_REPORT_ADMIN_ORIGIN: "http://api.mormi.example" }, "production"), null);
  assert.equal(localReportAdminConfig({ ...base, LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example", TEACHER_REPORT_PASSWORD: "" }, "production"), null);
  assert.equal(localReportAdminConfig({ ...base, LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example", TEACHER_REPORT_SESSION_SECRET: "short" }, "production"), null);
  assert.equal(localReportAdminConfig({ ...base, LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example", TEACHER_REPORT_PASSWORD: "too-short" }, "production"), null);
});

test("opens a production http origin only with the explicit insecure opt-in", () => {
  const base = {
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
  };
  assert.deepEqual(localReportAdminConfig({
    ...base,
    LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN: "true",
  }, "production"), {
    origin: "http://api.mormi.example",
    key: "server-secret",
    auth: {
      password: "teacher-password",
      sessionSecret: "session-secret-with-at-least-32-characters",
      secureCookie: true,
    },
  });
  assert.equal(localReportAdminConfig(base, "production"), null);
  assert.equal(localReportAdminConfig({
    ...base,
    LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN: "1",
  }, "production"), null);
});

test("the insecure opt-in relaxes only the protocol", () => {
  const base = {
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
    LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN: "true",
  };
  assert.equal(localReportAdminConfig({ ...base, TEACHER_REPORT_PASSWORD: "too-short" }, "production"), null);
  assert.equal(localReportAdminConfig({ ...base, TEACHER_REPORT_SESSION_SECRET: "short" }, "production"), null);
  assert.equal(localReportAdminConfig({ ...base, LOCAL_REPORT_ADMIN_ORIGIN: "http://admin:password@api.mormi.example" }, "production"), null);
  assert.equal(localReportAdminConfig({
    ...base,
    LOCAL_REPORT_ADMIN_ORIGIN: "",
    BACKEND_ORIGIN: "http://127.0.0.1:8080",
  }, "production"), null);
  assert.equal(localReportAdminConfig({
    ...base,
    LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
    BACKEND_ORIGIN: "",
  }, "production"), null);
});

test("the insecure opt-in does not change development or https behaviour", () => {
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
    LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN: "true",
  }, "production")?.origin, "https://api.mormi.example");
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "secret",
    LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN: "true",
  }, "development"), null);
});
