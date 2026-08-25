import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const { amusementStageVisuals } = await import("../app/amusement-park-contract.ts");
const component = await readFile(new URL("../app/amusement-park/AmusementPark.tsx", import.meta.url), "utf8");
const talkStage = await readFile(new URL("../app/CafeTalkStage.tsx", import.meta.url), "utf8");
const previewPage = await readFile(new URL("../app/amusement-park-preview/page.tsx", import.meta.url), "utf8");
const app = await readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8");
const contract = await readFile(new URL("../app/amusement-park-contract.ts", import.meta.url), "utf8");
const apiClient = await readFile(new URL("../app/api-client.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("놀이동산 FE에는 교육 콘텐츠 없이 표시 자산만 남는다", () => {
  assert.deepEqual(Object.keys(amusementStageVisuals), ["ticket", "snack_split", "pass_break_even"]);
  assert.doesNotMatch(contract, /amusementParkPreview|amusementAnswerFields|verified_facts|ticket_price|snack_total/);
  assert.match(component, /conversation\?\.turn\.visual\.data\.facts/);
  assert.doesNotMatch(component, /stage\.facts/);
});

test("방문 시작·AI 대화 판정·최신 진행 재조회·완료를 모두 BE에 맡긴다", () => {
  assert.match(component, /api\.startAmusementParkVisit\(\)/);
  assert.match(component, /startAmusementParkDialogue/);
  assert.match(component, /submitMormiResponseThroughBe/);
  assert.match(component, /api\.getAmusementParkVisit/);
  assert.match(component, /if \(allCompleted\) latest = await api\.completeAmusementParkVisit\(visit\.visit_id\);/);
  assert.match(component, /visit\.stage_progress\[stageId\]/);
  assert.match(component, /next\.stage_progress\?\.completed/);
  assert.doesNotMatch(component, /api\.submitAmusementParkStage|amusementAnswerFields\[stage\.stage_id\]/);
  assert.doesNotMatch(apiClient, /submitAmusementParkStage|amusement-park-visits\/\$\{visitId\}\/stages/);
  assert.doesNotMatch(component, /ticket_price|party_count|snack_total|payer_count|single_ride_price|day_pass_price/);
  assert.doesNotMatch(component, /answers:\s*derivedAnswers/);
  assert.doesNotMatch(component, /setCompleted|amusementParkPreview|FE 계약 미리보기|서버 저장 없는/);
  assert.doesNotMatch(component, /allCompleted\s*&&\s*!latest\.completed_at/);
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
  assert.match(component, /<CafeStageComplete/);
  assert.match(component, /noteCount=\{noteText \? 1 : 0\}/);
  assert.doesNotMatch(component, /정답 알려줘/);
  assert.doesNotMatch(component, /help.*=.*["'`]같은 돈|noteText.*=.*["'`]같은 돈/i);
});

test("과거 설명하기 UI처럼 객관식보다 텍스트 설명을 먼저 받는다", () => {
  assert.match(component, /<ParkProblemVisual stage=\{stage\} conversation=\{conversation\} \/>/);
  assert.doesNotMatch(component, /ParkAnswerPanel|showDialogueControls|park-learning-board/);
  assert.doesNotMatch(css, /\.park-answer-panel|\.park-learning-board/);
  assert.match(talkStage, /<aside className="cafe-talk-answer">/);
  assert.match(component, /deferChoices/);
  assert.match(component, /choiceFallbackVisible=\{choiceFallbackVisible\}/);
  assert.match(talkStage, /모르미에게 내 말로 알려주기/);
  assert.match(talkStage, /placeholder="내 생각을 짧게 알려줘"/);
});

test("놀이동산 이전 버튼은 실제 지도 주소로 돌아간다", () => {
  assert.match(talkStage, /<a className="cafe-talk-back" href=\{backHref\}>/);
  assert.match(component, /backHref="\/amusement-park\?screen=map"/);
  assert.match(component, /onBack=\{\(\) => \{ setActiveStageId\(null\); setReplayingStage\(false\); \}\}/);
});

test("완료한 놀이동산 스테이지도 카페처럼 새 회차로 다시 연습한다", () => {
  assert.match(component, /onOpen\(stageId, cleared\)/);
  assert.match(component, /cleared \? "다시 연습"/);
  assert.match(component, /openDialogue\(replay \? "restart" : "resume"\)/);
  assert.doesNotMatch(component, /if \(alreadyCompleted/);
});

test("놀이동산 지도와 완료 장면은 카페 공통 화면 틀을 사용한다", () => {
  assert.match(component, /figma-cafe figma-cafe--overview figma-park/);
  assert.match(component, /figma-cafe__bar/);
  assert.match(component, /figma-cafe-map figma-park-map/);
  assert.match(component, /figma-cafe-map__stones/);
  assert.match(component, /figma-cafe figma-cafe--done figma-park/);
});

test("BE·AI가 놀이동산 계약을 거부해도 홈 반복학습 오류 문구를 노출하지 않는다", async () => {
  const errors = await readFile(new URL("../app/dialogue-errors.ts", import.meta.url), "utf8");
  assert.match(errors, /amusementDialogueErrorMessage/);
  assert.match(errors, /dialogue_invalid_request\.upstream_/);
  assert.match(errors, /놀이동산 대화 준비 정보가 맞지 않아요/);
  assert.match(component, /amusementDialogueErrorMessage/);
});

test("놀이동산 배경과 별도 계산 요소 이미지가 프로젝트에 존재한다", async () => {
  for (const file of [
    "park-map.png",
    "ticket-booth.png",
    "churros-split.png",
    "ride-pass.png",
    "ticket-booth-morami-v2.png",
    "churros-split-morami-v2.png",
    "ride-pass-morami-v2.png",
    "ticket-elements-v2.png",
    "churros-elements-v2.png",
    "pass-elements-v2.png",
  ]) {
    await access(new URL(`../public/amusement-park/${file}`, import.meta.url));
  }
  assert.match(contract, /ticket-booth-morami-v2\.png/);
  assert.match(contract, /churros-split-morami-v2\.png/);
  assert.match(contract, /ride-pass-morami-v2\.png/);
});

test("외출의 놀이동산 카드는 themes 응답의 해금 상태로만 활성화한다", () => {
  assert.match(app, /theme\.theme_id === "amusement_park"/);
  assert.match(app, /amusementParkTheme\?\.unlocked === true/);
  assert.match(app, /href="\/amusement-park"/);
  assert.match(app, /카페 미션을 모두 완료하면 열려요/);
  assert.doesNotMatch(app, /마트 가기/);
});

test("운영 URL은 /amusement-park이고 기존 preview URL은 리다이렉트한다", () => {
  assert.match(previewPage, /redirect\("\/amusement-park"\)/);
  assert.doesNotMatch(app, /amusement-park-preview/);
});

test("카페 완료 뒤와 외출 진입 때 장소 해금 상태를 다시 조회한다", () => {
  assert.match(app, /function completeCafeAndShowHome\(\) \{[\s\S]{0,120}refreshThemes\(\);[\s\S]{0,120}showHome\(\);[\s\S]{0,40}\}/);
  assert.match(app, /onComplete=\{completeCafeAndShowHome\}/);
  assert.match(app, /function showOutside\(\) \{[\s\S]{0,180}refreshThemes\(\);[\s\S]{0,180}setStage\("outside"\)/);
});

test("외출 화면의 카페와 놀이동산 카드는 데스크톱에서 같은 너비를 쓴다", () => {
  assert.match(css, /\.destination-grid\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.destination-grid\s*\{\s*grid-template-columns:1fr/);
});
