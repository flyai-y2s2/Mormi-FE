import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const content = read("app/morami-content.ts");
const curriculum = read("app/math-curriculum.ts");
const app = read("app/MoramiApp.tsx");
const cafe = read("app/CafeTalkStage.tsx");
const client = read("app/api-client.ts");
const dictionary = read("app/DictionaryCard.tsx");

test("궁금해 사전 교육 문구를 세션 데이터에 복제하지 않는다", () => {
  for (const source of [content, curriculum, app, cafe, dictionary]) {
    assert.doesNotMatch(source, /dictionaryLines|dictionaryProblem/);
  }
});

test("집과 카페 모두 동일한 서버 사전 API와 공통 모달을 사용한다", () => {
  assert.match(client, /learning-sessions\/\$\{sessionId\}\/dictionary-card/);
  assert.match(client, /dialogue\/conversations\/\$\{conversationId\}\/dictionary-card/);
  assert.match(app, /<DictionaryModal/);
  assert.match(cafe, /<DictionaryModal/);
});

test("반복학습 완료 뒤 가르치기를 시작하면 사전이 자동으로 열린다", () => {
  assert.match(app, /function beginTeachingWithDictionary\(\) \{\s*setDictionaryOpen\(true\);\s*void beginTeaching\(\);\s*\}/);
  assert.match(app, /onClick=\{beginTeachingWithDictionary\}>모르미 가르치기/);
  assert.doesNotMatch(app, /먼저 사전 보기/);
});

test("카드 ID와 콘텐츠 버전을 검증하고 로컬 대체 문구를 만들지 않는다", () => {
  assert.match(dictionary, /reference\?\.card_id === value\.card\.card_id/);
  assert.match(dictionary, /reference\?\.content_version === value\.card\.content_version/);
  assert.doesNotMatch(dictionary, /learnedLine|hint|dictionaryLines|dictionaryProblem/);
});

test("로딩·빈 결과·오류 상태를 구분한다", () => {
  assert.match(dictionary, /"loading" \| "ready" \| "empty" \| "error"/);
  assert.match(dictionary, /궁금해 사전을 펼치는 중/);
  assert.match(dictionary, /아직 보여 줄 카드가 없어요/);
  assert.match(dictionary, /다시 불러오기/);
});
