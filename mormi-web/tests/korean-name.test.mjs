import assert from "node:assert/strict";
import test from "node:test";

const { givenNameFromFullName, nameWithSubjectParticle } = await import("../app/korean-name.ts");

test("가입 이름에서 성을 빼고 부를 이름만 사용한다", () => {
  assert.equal(givenNameFromFullName("한정현"), "정현");
  assert.equal(givenNameFromFullName("윤하"), "윤하");
  assert.equal(givenNameFromFullName("남궁민"), "민");
});

test("마지막 글자 받침에 맞춰 이와 가를 고른다", () => {
  assert.equal(nameWithSubjectParticle("정현"), "정현이");
  assert.equal(nameWithSubjectParticle("윤하"), "윤하가");
});
