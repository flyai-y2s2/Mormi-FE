import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const signup = await readFile(new URL("../app/signup/SignupExperience.tsx", import.meta.url), "utf8");
const teacher = await readFile(new URL("../app/teacher/TeacherPortal.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");

test("첫 가입 화면에서 학생과 선생님 역할을 명확히 고른다", () => {
  assert.match(signup, /나는 학생/);
  assert.match(signup, /나는 선생님/);
  assert.match(signup, /api\.educatorSignup/);
  assert.match(signup, /storeEducatorSession/);
});

test("통합 로그인 응답의 역할에 따라 학생과 교사 화면을 분기한다", () => {
  assert.match(app, /restored\.role === "educator"/);
  assert.match(app, /storeEducatorSession/);
  assert.match(app, /\/teacher\/cohorts/);
});

test("교사 화면은 허용된 학급 API만 사용한다", () => {
  assert.match(teacher, /api\.cohorts\(\)/);
  assert.match(teacher, /api\.cohortLearners/);
  assert.match(teacher, /api\.cohortReport/);
  assert.doesNotMatch(teacher, /api\.diagnosticReport/);
  assert.doesNotMatch(teacher, /api\.reportSummary/);
});
