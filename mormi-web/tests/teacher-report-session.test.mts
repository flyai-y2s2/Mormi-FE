import assert from "node:assert/strict";
import test from "node:test";

const sessionModule = await import("../app/teacher-report-session.ts").catch(() => null);

test("accepts a valid eight-hour teacher session and rejects tampering or expiry", () => {
  assert.ok(sessionModule, "teacher report session support must exist");
  const now = Date.UTC(2026, 7, 20, 0, 0, 0);
  const secret = "session-secret-with-at-least-32-characters";
  const token = sessionModule.createTeacherReportSession(secret, now);

  assert.equal(sessionModule.verifyTeacherReportSession(token, secret, now + 1_000), true);
  assert.equal(sessionModule.verifyTeacherReportSession(`${token}x`, secret, now + 1_000), false);
  assert.equal(sessionModule.verifyTeacherReportSession(token, secret, now + 8 * 60 * 60 * 1_000), false);
});

test("reads only the named teacher session cookie", () => {
  assert.ok(sessionModule, "teacher report session support must exist");
  assert.equal(
    sessionModule.readTeacherReportSession("other=one; mormi_teacher_report=expected; ignored=two"),
    "expected",
  );
  assert.equal(sessionModule.readTeacherReportSession("other=one"), null);
});
