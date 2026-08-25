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
  assert.match(app, /setCharacterName\(readCharacterName\(profile\.id\)\)/);
  assert.match(app, /setCharacterName\(readCharacterName\(snapshot\.learner_id\)\)/);
  assert.match(app, /storeCharacterName\(learner\.id, name\)/);
});

test("첫 화면은 I AM 쌤 로고와 두 진입 버튼만 표시한다", () => {
  const welcome = app.slice(app.indexOf('<section className="onboarding-scene onboarding-scene--welcome">'), app.indexOf("function ProfileMenu"));
  assert.match(welcome, /src="\/ui\/iam-sam\.png"/);
  assert.match(welcome, />로그인하기/);
  assert.match(welcome, />처음 왔어요/);
  assert.doesNotMatch(welcome, /<Morami|안녕, 나 모르미야|오늘 물어보고 싶은 게 많아/);
});

test("메인 캐릭터 아래에는 저장 이름 또는 이름 지어주기 버튼이 나온다", () => {
  assert.match(app, /characterName\s*\?\s*<button[^>]*className="home-character-name"/);
  assert.match(app, /home-character-name--empty/);
  assert.match(app, />이름 지어주기/);
  assert.match(app, /<CharacterNameModal initialName=\{characterName\}/);
});

test("서버 대사와 카페·놀이동산 화면은 공통 캐릭터 이름을 사용한다", () => {
  assert.match(names, /text\.replaceAll\("모르미", displayName\)/);
  assert.match(talk, /rename\(line \|\| fallbackLine\)/);
  assert.match(talk, /<b>\{displayName\}<\/b>/);
  assert.match(journey, /\{displayName\} 카페/);
  assert.match(park, /\{displayName\} 놀이동산/);
  assert.match(app, /formatTeachingDisplayText\(namedText\(serverMormiText\)\)/);
});
