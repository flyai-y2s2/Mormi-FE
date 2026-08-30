import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = source("app/MoramiApp.tsx");
const names = source("app/CharacterName.tsx");
const talk = source("app/CafeTalkStage.tsx");
const journey = source("app/CafeJourney.tsx");
const park = source("app/amusement-park/AmusementPark.tsx");

test("캐릭터 이름은 로그인한 학습자별 브라우저 키에 저장된다", () => {
  assert.match(names, /CHARACTER_NAME_KEY_PREFIX/);
  assert.match(names, /`\$\{CHARACTER_NAME_KEY_PREFIX\}:\$\{learnerId\}`/);
  assert.match(app, /const storedCharacterName = readCharacterName\(profile\.id\)/);
  assert.match(app, /const restoredCharacterName = readCharacterName\(snapshot\.learner_id\)/);
  assert.match(app, /storeCharacterName\(learner\.id, name\)/);
});

test("첫 화면은 I AM 쌤 로고와 학생 진입 버튼, 선생님 슬로건만 표시한다", () => {
  const welcome = app.slice(app.indexOf('<section className="onboarding-scene onboarding-scene--welcome">'), app.indexOf("function ProfileMenu"));
  assert.match(welcome, /src="\/ui\/iam-sam\.png"/);
  assert.match(welcome, />로그인하기/);
  assert.match(welcome, />처음 왔어요/);
  assert.match(welcome, /onboarding-slogan/);
  assert.match(welcome, /이번에는 내가 선생님/);
  assert.doesNotMatch(welcome, /선생님으로 들어가기/);
  assert.doesNotMatch(welcome, /<Morami|안녕, 나 모르미야|오늘 물어보고 싶은 게 많아/);
});

test("메인 캐릭터 아래에는 저장 이름 또는 이름 지어주기 버튼이 나온다", () => {
  assert.match(app, /characterName\s*\?\s*<button[^>]*className="home-character-name"/);
  assert.match(app, /<small>이름<\/small><strong>\{characterName\}<\/strong>/);
  assert.doesNotMatch(app, /<small>내 친구<\/small>/);
  assert.match(app, /home-character-name--empty/);
  assert.match(app, />이름 지어주기/);
  assert.match(app, /<CharacterNameModal initialName=\{characterName\}/);
});

test("이름이 없는 학습자는 로그인 직후 캐릭터 소개 뒤 이름을 짓는다", () => {
  assert.match(app, /const storedCharacterName = readCharacterName\(profile\.id\)/);
  assert.match(app, /setCharacterNameOpen\(!storedCharacterName\)/);
  assert.match(app, /if \(!restoredCharacterName\) setCharacterNameOpen\(true\)/);
  assert.match(names, /useState<"introduction" \| "name">\(initialName \? "name" : "introduction"\)/);
  assert.match(names, /나 모르는 게 너무 많은데, 도와줄 수 있어\?/);
  assert.match(names, /먼저 내 이름부터 정해주라!/);
  assert.match(names, /src="\/morami\/happy-cutout\.png" alt="반갑게 인사하는 캐릭터"/);
  assert.match(names, />좋아, 이름 지어 줄게/);
  assert.match(names, /onClick=\{\(\) => setStep\("name"\)\}/);
  assert.match(names, />나를 뭐라고 부를까\?</);
});

test("로그인 복원 중에도 저장한 캐릭터 이름을 먼저 표시한다", () => {
  assert.match(app, /const storedLearner = readStoredLearner\(\);/);
  assert.match(app, /const storedCharacterName = readCharacterName\(storedLearner\.id\)/);
  assert.match(app, /requestAnimationFrame\(\(\) => setCharacterName\(storedCharacterName\)\)/);
  assert.match(app, /if \(apiEnabled && storedLearner\)/);
  assert.match(app, /\{characterName && <>\{characterSubjectName\} <\/>\}준비하고 있어!/);
});

test("서버 대사와 카페·놀이동산 학습 화면은 공통 캐릭터 이름을 사용한다", () => {
  assert.match(names, /text\.replaceAll\("모르미", displayName\)/);
  assert.match(talk, /rename\(line \|\| fallbackLine\)/);
  assert.match(talk, /<b>\{displayName\}<\/b>/);
  assert.match(journey, /\{displayName\} 카페/);
  assert.match(park, /\{displayName\} 놀이동산/);
  assert.match(app, /formatTeachingDisplayText\(namedText\(serverMormiText\)\)/);
});
