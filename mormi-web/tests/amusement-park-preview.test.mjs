import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const { amusementAnswerFields, amusementStageVisuals } = await import("../app/amusement-park-contract.ts");
const component = await readFile(new URL("../app/amusement-park-preview/AmusementParkPreview.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");
const contract = await readFile(new URL("../app/amusement-park-contract.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("놀이동산 FE에는 서버 문제 fixture 대신 표시 자산과 파생값 입력 계약만 남는다", () => {
  assert.deepEqual(Object.keys(amusementStageVisuals), ["ticket", "snack_split", "pass_break_even"]);
  assert.deepEqual(amusementAnswerFields.ticket.map((field) => field.key), ["total_price"]);
  assert.deepEqual(amusementAnswerFields.snack_split.map((field) => field.key), ["per_person"]);
  assert.deepEqual(amusementAnswerFields.pass_break_even.map((field) => field.key), ["break_even_rides", "benefit_from_rides"]);
  assert.doesNotMatch(contract, /amusementParkPreview|verified_facts|ticket_price:\s*3000|snack_total:\s*9000/);
});

test("방문 시작·AI 대화 판정·최신 진행 재조회·완료를 모두 BE에 맡긴다", () => {
  assert.match(component, /api\.startAmusementParkVisit\(\)/);
  assert.match(component, /startAmusementParkDialogue/);
  assert.match(component, /submitMormiResponseThroughBe/);
  assert.match(component, /api\.getAmusementParkVisit/);
  assert.match(component, /api\.completeAmusementParkVisit/);
  assert.match(component, /visit\.stage_progress\[stageId\]/);
  assert.match(component, /next\.stage_progress\?\.completed/);
  assert.doesNotMatch(component, /api\.submitAmusementParkStage|answers:\s*derivedAnswers/);
  assert.doesNotMatch(component, /setCompleted|amusementParkPreview|FE 계약 미리보기|서버 저장 없는/);
});

test("서버 오류 때 로컬 문제를 대신 보여주지 않고 재시도 상태를 제공한다", () => {
  assert.match(component, /로컬 문제로 대신 보여주지 않고/);
  assert.match(component, /다시 시도/);
  assert.match(component, /instanceof ApiError/);
  assert.doesNotMatch(component, /fallback.*stage|fixture/i);
});

test("AI 놀이동산 대화의 도움 요청·전이·별노트를 카페 공통 UI로 렌더링한다", () => {
  assert.match(component, /<CafeTalkStage/);
  assert.match(component, /helpVisible=\{helpVisible\}/);
  assert.match(component, /helpLoading=\{helpLoading\}/);
  assert.match(component, /response\.type === "no_response"/);
  assert.match(component, /amusement_park_transfer/);
  assert.match(component, /<StarNote text=\{noteText\}/);
  assert.doesNotMatch(component, /정답 알려줘/);
  assert.doesNotMatch(component, /help.*=.*["'`]같은 돈|noteText.*=.*["'`]같은 돈/i);
});

test("놀이동산 배경과 별도 계산 요소 이미지가 프로젝트에 존재한다", async () => {
  for (const file of [
    "park-map.png",
    "ticket-booth.png",
    "churros-split.png",
    "ride-pass.png",
    "ticket-elements-v2.png",
    "churros-elements-v2.png",
    "pass-elements-v2.png",
  ]) {
    await access(new URL(`../public/amusement-park/${file}`, import.meta.url));
  }
});

test("외출의 놀이동산 카드는 themes 응답의 해금 상태로만 활성화한다", () => {
  assert.match(app, /theme\.theme_id === "amusement_park"/);
  assert.match(app, /amusementParkTheme\?\.unlocked === true/);
  assert.match(app, /href="\/amusement-park-preview"/);
  assert.match(app, /카페 미션을 모두 완료하면 열려요/);
  assert.doesNotMatch(app, /마트 가기/);
});

test("외출 화면의 카페와 놀이동산 카드는 데스크톱에서 같은 너비를 쓴다", () => {
  assert.match(css, /\.destination-grid\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.destination-grid\s*\{\s*grid-template-columns:1fr/);
});
