import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  const fetchHandler = typeof worker === "function" ? worker : worker.fetch.bind(worker);
  return fetchHandler(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Morami onboarding", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /안녕,/);
  assert.match(html, /나 모르미야!/);
  // 첫 화면에서 가입과 로그인이 모두 열려 있어야 한다. 기기를 바꾼 아이가
  // 가입 흐름을 끝까지 밟은 뒤에야 로그인을 찾게 되면 새 계정이 만들어진다.
  // 가입은 아이당 한 번뿐이고 그 뒤로는 늘 로그인이므로 기본 버튼은 로그인이 쓴다.
  assert.match(html, /로그인하기/);
  assert.match(html, /처음 왔어요/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps four official areas and 36 playable sessions in the curriculum", async () => {
  const [curriculum, original, app, cafe, journey, css, cafeMenu, talkStage, stageVisual, dialogueUi] = await Promise.all([
    readFile(new URL("../app/math-curriculum.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/morami-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/journey-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/cafe-menu.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeTalkStage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeStageVisual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MormiDialogueUi.tsx", import.meta.url), "utf8"),
  ]);
  const dialogueContract = await readFile(new URL("../app/mormi-dialogue.ts", import.meta.url), "utf8");
  const aiTest = await readFile(new URL("../app/ai-test/AiDialogueTest.tsx", import.meta.url), "utf8");

  assert.equal((curriculum.match(/\blesson\(\{/g) || []).length, 24);
  assert.equal((original.match(/^ {4}id: "/gm) || []).length, 12);
  assert.equal((curriculum.match(/title: "(?:수와 연산|변화와 관계|도형과 측정|자료와 가능성)"/g) || []).length, 4);
  assert.match(curriculum, /export const sessions: Session\[\]/);
  assert.match(curriculum, /\[2수01-05\]/);
  assert.match(curriculum, /\[2수03-07\]/);
  assert.match(curriculum, /\[6수04-04\]/);
  assert.match(curriculum, /curriculumForSession/);
  assert.match(curriculum, /const fillSentence = \[fillBefore, "\(.+\)", fillAfter\]/);
  // 반복학습용 정적 문항에도 대화 API와 같은 카피 품질 계약을 적용한다.
  assert.doesNotMatch(curriculum, /어떤 방법이 맞을까|퍼진 넓이|느낌으로|눈대중|한눈에 대충|색만 보기|크기만 보기/);
  assert.match(app, /useState<Stage>\("onboarding"\)/);
  // 반복 문제의 질문은 카드 머리 한 곳에만 있다. 카드 밖과 안에 같은 문장을 두면
  // 시선이 카드 안에 머물러 위쪽 질문을 지나친다.
  assert.match(app, /<header className="practice-card__head">/);
  assert.equal((app.match(/\{currentDrill\.prompt\}/g) || []).length, 1);
  assert.doesNotMatch(app, /drill-choice-prompt|drill-header/);
  assert.doesNotMatch(app, /onboarding-promise/);
  assert.doesNotMatch(app, /카페에 가려면\?/);
  assert.match(app, /morami-completed-sessions/);
  assert.match(app, /morami-onboarding-complete/);
  assert.match(app, /완료하면 카페에 갈 수 있어요!/);
  assert.match(app, /카페 필수 개념/);
  assert.match(journey, /"money-count"/);
  assert.match(journey, /"money-price"/);
  assert.match(journey, /"money-budget"/);
  assert.match(journey, /"number-count"/);
  assert.match(journey, /"number-compare"/);
  assert.match(cafe, /카페 스테이지 선택/);
  assert.match(cafe, /CAFE QUEST/);
  assert.match(cafe, /cafe-stages\/queue-v2\.png/);
  assert.match(cafe, /cafe-stages\/menu-v3\.png/);
  assert.match(cafe, /cafe-stages\/payment-v3\.png/);
  assert.match(cafe, /cafe-stages\/change-v3\.png/);
  // 스테이지 진입구는 카드의 "도전하기" 하나뿐이다.
  // 지도 아래에 같은 일을 하는 CTA 를 또 두면 어디를 눌러야 하는지 흐려진다.
  assert.match(cafe, /도전하기/);
  assert.doesNotMatch(cafe, /스테이지 시작/);
  assert.match(cafe, /data-figma-node="74:4"/);
  assert.match(cafe, /data-figma-node="74:6"/);
  assert.match(cafeMenu, /id: "milk", name: "우유"[^\n]+milk\.png\?v=2/);
  assert.match(cafeMenu, /id: "strawberry-juice", name: "딸기주스"[^\n]+strawberry-juice\.png\?v=2/);
  assert.match(cafeMenu, /id: "sandwich", name: "샌드위치"[^\n]+sandwich\.png\?v=2/);
  assert.match(cafe, /figma-cafe__place/);
  assert.doesNotMatch(cafe, /천 원짜리/);
  assert.match(cafe, /type QueueScene = "dialogue" \| "note" \| "clear"/);
  assert.match(cafe, /return Math\.random\(\) < 0\.5 \? \{ left: 2, right: 1 \} : \{ left: 1, right: 2 \}/);
  assert.match(stageVisual, /className=\{left < right \? "is-mirrored" : ""\}\s*\n\s*src="\/cafe-stages\/queue-v2\.png"/);
  assert.match(stageVisual, /카페 대기줄: 왼쪽 줄 \$\{left\}명, 오른쪽 줄 \$\{right\}명/);
  assert.doesNotMatch(cafe, /className="queue-story-lines"/);
  // 스테이지 질문은 화면에 적어 두지 않고 모르미가 그때그때 건넨다.
  assert.match(cafe, /queue: "모르미의 질문을 불러오는 중이에요\."/);
  assert.doesNotMatch(cafe, /주문하려면 줄을 서야 하나 봐|각각 사람들이 몇 명씩 있어|더 짧은 줄에는 몇 명이 있어/);
  // 아이는 위에서 아래로 한 줄기로 읽는다: 모르미의 질문 → 문제 그림 → 알려주기.
  // 네 스테이지가 같은 대화 셸을 쓰므로 이 순서는 CafeTalkStage 한 곳에서만 정해진다.
  assert.match(talkStage, /cafe-talk-bubble[\s\S]{0,900}cafe-talk-stage[\s\S]{0,900}cafe-talk-answer/);
  assert.match(talkStage, /궁금해 사전/);
  assert.match(cafe, /queue-note-scene[\s\S]{0,500}<span>별노트<\/span>/);
  assert.doesNotMatch(cafe, /모르미의 공부노트/);
  assert.match(cafe, /가르쳐 준 내용은 잊지 않게 별노트에 적어 둬야겠다/);
  assert.doesNotMatch(cafe, /가 알려줌|빠뜨빼똘 손글씨로|다음으로 ▶/);
  assert.match(cafe, /learnerName/);
  assert.match(cafe, /budgets = \[8000, 9000, 10000\]/);
  assert.match(cafe, /randomQueueCounts/);
  assert.match(cafe, /conversation\.scenario_context\?\.queue_context/);
  assert.match(cafe, /randomItem\(menu\)/);
  assert.match(cafe, /내 메뉴 골라 줘서 고마워/);
  assert.match(cafe, /finishMenuStory[\s\S]{0,900}setStep\("sum"\)/);
  assert.match(cafe, />완료!</);
  assert.match(cafe, /← \{step === "overview" \? "외출 장소" : "돌아가기"\}/);
  assert.doesNotMatch(cafe, /changeHintLevel/);
  assert.doesNotMatch(cafe, /모르미가 같이 생각해 볼게/);
  assert.match(talkStage, /<MormiHelpCard card=\{turn\.help_card\}/);
  assert.match(talkStage, /<MormiTaskAnchor anchor=\{turn\.task_anchor\}/);
  assert.match(app, /<MormiTaskAnchor anchor=\{teachingTurn\?\.task_anchor \?\? null\}/);
  assert.match(dialogueUi, /anchor\.completed_items\.map/);
  assert.match(dialogueContract, /task_anchor\?:/);
  assert.match(css, /\.mormi-task-anchor/);
  assert.match(dialogueUi, /if \(!card\?\.visible\) return null/);
  assert.match(dialogueUi, /card\.visual_type/);
  assert.match(dialogueUi, /choice\.image_url/);
  assert.match(dialogueContract, /dictionary_ref:/);
  // 로컬 계약 테스트도 현재 AI가 받는 공식 시나리오와 필수 화면 맥락을 보낸다.
  assert.match(aiTest, /id: "home_teach"/);
  assert.doesNotMatch(aiTest, /home_addition_teach/);
  assert.match(aiTest, /curriculum_session_id: "money-price"/);
  assert.match(aiTest, /queue_context: \{ left_count: 3, right_count: 5 \}/);
  assert.match(cafe, /STAGE 1 CLEAR!/);
  // 카페의 네 스테이지는 모두 모르미와의 대화로만 답한다.
  // 화면이 따로 채점하는 폼(합계 입력칸·장바구니·지폐 스테퍼)을 되살리지 않는다.
  assert.equal((cafe.match(/<CafeTalkStage\b/g) || []).length, 4);
  assert.doesNotMatch(cafe, /checkSum|checkChange|orderMenu|changeChangeMoney|toggleMenu/);
  assert.doesNotMatch(cafe, /cafe-sum-menu-picker|figma-cafe-sum__|figma-cafe-change__|cafe-change-order|우리 장바구니/);
  assert.doesNotMatch(cafe, /두 메뉴 가격의 합계|가진 돈 10,000원|받을 돈을 눌러 담아요/);
  assert.doesNotMatch(css, /\.cafe-sum-menu-picker|\.figma-cafe-sum__|\.figma-cafe-change__|\.cafe-change-order/);
  // 입력창은 스테이지마다 하나뿐이다. 패널 밖에 같은 컨트롤을 또 붙이면 어디에 답할지 흐려진다.
  assert.doesNotMatch(cafe, /activeDialogueStage/);
  assert.equal((cafe.match(/<CafeDialogueControls\b/g) || []).length, 0);
  assert.equal((talkStage.match(/<CafeDialogueControls\b/g) || []).length, 1);
  // 정오 판정과 시도 기록은 서버가 대화의 verified_facts 로만 한다.
  assert.doesNotMatch(cafe, /api\.cafeQueue|api\.cafeMenu|api\.cafePayment|api\.cafeChange/);
  assert.match(cafe, /conversation\.stage_progress\.completed/);
  // 문제 그림은 화면이 새로 만들지 않고 모르미가 보낸 visual 계약을 그대로 그린다.
  assert.match(stageVisual, /conversation\.turn\.visual/);
  assert.match(stageVisual, /type === "cafe_menu"/);
  assert.match(stageVisual, /type === "cafe_calculation" \|\| type === "money_calculation"/);
  // 모르미 표정은 대화의 mood 를 따라간다. 한 표정으로 굳혀 두지 않는다.
  assert.match(talkStage, /conversation\?\.turn\.mormi\.mood/);
  assert.match(talkStage, /celebrating: "\/morami\/celebrate-cutout\.png"/);
  assert.match(app, /다른 개념 더보기/);
  assert.match(app, /카페에 필요한 개념부터 배워요/);
  assert.match(journey, /cafe-money\/100\.png/);
  assert.match(journey, /cafe-money\/5000\.png/);
  assert.doesNotMatch(cafe, /연습용/);
  assert.match(app, /현장 미션/);
  assert.match(app, /LifeMissionGame/);
  assert.match(app, /scenes\/cafe-bakery-cute-v4\.png/);
  assert.match(app, /scenes\/market-cute-v4\.png/);
  assert.match(app, /life-missions\/stationery\.jpg/);
  assert.match(app, /life-missions\/toyshop\.jpg/);
  assert.match(app, /life-missions\/snackshop\.jpg/);
  assert.match(app, /life-missions\/giftshop\.jpg/);
  assert.match(app, /life-missions\/workshop\.webp/);
  assert.match(app, /life-missions\/fair\.webp/);
  assert.match(app, /products\/notebook\.jpg/);
  assert.match(app, /products\/pencil\.jpg/);
  assert.match(app, /function sceneForProduct/);
  assert.match(app, /problem\.visual\.type === "money" \? <StoreOrder/);
  assert.doesNotMatch(app, /story\.scene === "cafe" \? <CafeOrder/);
  assert.match(app, /selectedAreaId/);
  assert.match(app, /room-area-list/);
  assert.match(app, /개념 영역으로/);
  assert.match(app, /집에서 복습하기/);
  assert.match(curriculum, /gradeBands/);
  assert.match(curriculum, /3~4학년군/);
  assert.match(curriculum, /5~6학년군/);
  assert.match(curriculum, /export const transferTarget = 3/);
  assert.match(app, /varyProblem/);
  assert.match(app, /const isCurrencyVisual = !problem\.visual\.labels\?\.length/);
  assert.match(app, /\? problem\.visual\.amounts\s*:\s*problem\.visual\.amounts\.map/);
  assert.match(app, /shuffleProblemAnswers/);
  assert.match(app, /ensureFourAnswers/);
  assert.match(app, /answers\.length >= 4/);
  assert.match(app, /comparisonChoices = \["왼쪽", "같아", "오른쪽"\]/);
  assert.match(app, /← 왼쪽/);
  assert.match(app, /오른쪽 →/);
  assert.doesNotMatch(app, /판단할 수 없어/);
  assert.match(app, /asksForLess/);
  assert.match(app, /selectedDrillAnswer/);
  assert.match(css, /\.answer-grid button\.is-correct/);
  assert.match(css, /\.answer-grid button\.is-wrong/);
  assert.doesNotMatch(css, /× 다시 생각/);
  assert.match(css, /grid-template-columns: repeat\(4, 1fr\)/);
  assert.match(app, /correctPosition = Math\.abs\(seed\) % \(answers\.length \+ 1\)/);
  assert.match(app, /shuffledCountingValues\(variantSeed \+ sessionIndex \* 59\)/);
  assert.match(app, /const variationSeed = countingValues \? countingValues\[index\] - 1 : seed/);
  assert.match(app, /shuffleProblemAnswers\(varyProblem\(problem, variationSeed\), seed\)/);
  assert.match(app, /Array\.from\(\{ length: masteryTarget \}/);
  assert.match(app, /teachingProblemFromTurn\(teachingTurn, currentDrill\)/);
  assert.match(app, /teachingProblemFromTurn/);
  // 검수된 AI visual 계약이 화면 문제의 단일 출처다. 모르미 대사에서
  // 숫자를 추측해 그림을 다시 만드는 휴리스틱은 사용하지 않는다.
  assert.doesNotMatch(app, /teachingProblemMatchingTurn|numbersMentionedIn|teachingFocusProblem/);
  assert.doesNotMatch(app, /childFriendlyTeachingLine|childFriendlyTeachingChoice|teachingDialogue|teachingInputLabel/);
  assert.match(app, /function teachingProblemFromTurn\(turn: MormiTurn \| null, fallback: Problem\): Problem \| null/);
  // 문제 문구는 모르미 말풍선만 물어본다. 그림 위에 같은 질문을 다시 적지 않는다.
  assert.doesNotMatch(app, /teaching-problem-heading/);
  assert.match(app, /teaching-problem--\$\{teachingProblem\.visual\.type\}/);
  assert.match(app, /function formatTeachingDisplayText\(text: string\)/);
  assert.match(app, /text\.replace\(\/\[□▢\]\/g, teachingBlank\)/);
  assert.match(app, /\{serverMormiText && <div><b>모르미<\/b><p>\{formatTeachingDisplayText\(serverMormiText\)\}<\/p><\/div>\}/);
  assert.match(app, /teachSending \? "확인 중…" : "완료"/);
  assert.match(app, /const serverMormiText = teachingTurn\?\.mormi\.text\?\.trim\(\) \?\? ""/);
  assert.match(app, /const hasServerMessagePanel = Boolean\(serverMormiText\) \|\| Boolean\(teachingTurn\?\.help_card\?\.visible\) \|\| Boolean\(teachError\)/);
  assert.match(app, /\{hasServerMessagePanel && !teachingComplete && \(/);
  assert.match(app, /\{serverMormiText && <div><b>모르미<\/b><p>\{formatTeachingDisplayText\(serverMormiText\)\}<\/p><\/div>\}/);
  assert.match(app, /productImage\(labels\[index\]\)/);
  assert.match(app, /turn\.visual\.data\.problem/);
  assert.doesNotMatch(app, /모르미가 헷갈린 문제/);
  assert.match(app, /<ProblemCard problem=\{teachingProblem\}/);
  assert.match(app, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/);
  assert.match(app, /mark === missing \? "\?" : mark/);
  assert.doesNotMatch(app, /<i \/>\{mark\}<\/span>/);
  assert.match(app, /extraLifeProblem/);
  assert.match(app, /내 생각을 먼저 써 봐요/);
  assert.match(app, /먼저 직접 써서 모르미에게 알려 줘요/);
  assert.match(app, /보기에서 골라 모르미에게 알려 줘요/);
  assert.match(app, /mission-morami/);
  assert.match(app, /● 동그라미/);
  assert.doesNotMatch(app, /className="teaching-levels"/);
  assert.doesNotMatch(app, /<b>L\{ladder\}<\/b>/);
  assert.doesNotMatch(app, /askForTeachHelp|teachingAnswerOptions|teachingScaffoldFor|answerGuidedTeaching|advanceModelTeaching/);
  assert.match(app, /startHomeTeaching/);
  assert.match(app, /submitMormiResponseThroughBe/);
  assert.match(app, /teachRequestInFlight\.current/);
  assert.match(cafe, /dialogueRequestInFlight\.current/);
  assert.match(app, /teachingTurn\.input\.kind/);
  assert.match(app, /teaching-playground--\$\{teachingTurn\?\.input\.kind \?\? "loading"\}/);
  assert.match(app, /teaching-answer--\$\{teachingTurn\.input\.kind\}/);
  assert.match(app, /className=\{`teaching-dont-know \$\{teachHelpLoading \? "is-loading" : ""\}`\}/);
  assert.match(app, /teachHelpLoading \? "도움 준비 중…" : "잘 모르겠어"/);
  assert.match(app, /teachingProblem\?\.visual\.type !== "money"/);
  assert.match(app, /className="teaching-back"/);
  assert.match(app, /aria-label="이전 반복학습 화면으로 돌아가기"/);
  assert.match(app, /teachSending \? "확인 중…" : "완료"/);
  assert.match(app, /stage !== "cafe" && stage !== "teach"/);
  assert.match(css, /\.teaching-playground/);
  assert.match(app, /<div className="mastery-stars" aria-label="별 5개">(?:<UiIcon name="star" size="large" \/>){5}<\/div>/);
  assert.match(css, /button\.teaching-dont-know[^}]*position:static[^}]*font-size:14px[^}]*font-weight:850/);
  assert.match(css, /button\.teaching-dont-know\.is-loading::before/);
  // 질문(말풍선)이 위, 문제와 답이 아래로 한 줄기로 읽히는 세로 배치를 지킨다.
  assert.match(app, /<div className="teaching-talk">\s*<div className="teaching-morami">/);
  assert.match(css, /\.teaching-talk \{[^}]*width:min\(600px,100%\); position:relative/);
  assert.match(css, /\.teaching-stage \{[^}]*flex-direction:column/);
  assert.match(css, /teaching-answer--button \{[^}]*width:min\(600px,100%\)[^}]*transform:none/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /\.teaching-dialogue>\.star-note\{width:100%;min-width:0;min-height:0/);
  assert.match(css, /\.today-badges > span \{/);
  assert.match(css, /\.note-content h2 em \{ color:#4f438f;[^}]*font-weight:700/);
  assert.match(app, /teachingTurn\?\.help_card\?\.visible/);
  // 도움 카드와 입력 문구는 AI 계약을 그대로 사용하며 FE가 별도 질문을 만들지 않는다.
  assert.doesNotMatch(app, /생각과 이유를 직접 알려줘|보기에서 하나를 골라 알려줘|도움 카드와 같이 해보자/);
  assert.match(dialogueContract, /retention_policy\?: "no_raw" \| "30_days" \| "90_days" \| "permanent"/);
  assert.match(dialogueContract, /conversation_storage_consent: true/);
  assert.match(dialogueContract, /retention_policy: "permanent"/);
  assert.match(app, /nextTurn\.note_update/);
  assert.doesNotMatch(app, /drillFeedback \|\| "빈 자리"/);
  assert.match(app, /const childName = learner\.name/);
  assert.match(app, /mormey-learner/);
  assert.match(app, /너를 뭐라고 부를까/);
  // 장소 이동 탭은 앱 전체에 하나만, 상단 줄에 둔다. 화면마다 따로 그리면 장소를
  // 옮길 때 탭이 함께 움직여 흐름이 끊긴다.
  const navClasses = app.match(/className="journey-nav[^"]*"/g) || [];
  assert.equal(navClasses.length, 1);
  assert.match(navClasses[0], /journey-nav--top/);
  // topbar 의 좌우 기준선이 화면마다 다르면 상단에 둔 탭이 옮겨져 보인다.
  assert.match(css, /\.app-shell--outside \.topbar[^{]*\{[^}]*max-width:none/);
  // 반복 중에는 프로필을 띄우지 않는다. 로그아웃이 눌리면 시도 기록이 끊긴 채 세션이 남는다.
  assert.match(app, /learningStage \?[\s\S]{0,400}<ProfileMenu/);
  // 로그인 화면은 형식 검사를 걸지 않는다. 규칙이 바뀌면 예전 기준으로 만든 아이디가
  // 서버에 닿기도 전에 막혀, 멀쩡한 계정으로 못 들어오게 된다.
  assert.match(app, /function submitLogin\(\) \{\n {4}\/\//);
  assert.doesNotMatch(app, /api\.createLearner|api\.restoreLearner/);
  assert.doesNotMatch(app, /page.*"tutorial"/);
  assert.doesNotMatch(app, /이 영역에서 배운 길/);
  assert.doesNotMatch(app, /<span>\{teachingNote\.attribution_label\}<\/span>/);
  assert.doesNotMatch(app, />별노트에 적기/);
  assert.match(app, /note-ring">별<br \/>노<br \/>트/);
  assert.match(app, /<small>별노트<\/small>/);
  assert.match(app, /result\.teach_reward/);
  assert.match(cafe, /figma-cafe-map/);
  assert.match(app, /네 설명이 맞아요/);
  assert.match(app, /네 설명을 기다리고 있어요/);
  assert.doesNotMatch(app, /\$\{childName\}가/);
  assert.match(curriculum, /item: "strawberry"/);
  assert.match(curriculum, /item: "cup"/);
  assert.match(app, /tenFrameItems/);
  assert.doesNotMatch(app, /말로 알려주기/);
  assert.doesNotMatch(app, /말로 설명/);
  assert.doesNotMatch(app, /SpeechRecognition/);
  assert.doesNotMatch(css, /speech-button/);
  assert.doesNotMatch(app, /href="\/report"/);
  assert.doesNotMatch(app, /🪙|💰|💵/);
  assert.doesNotMatch(app, /내 지갑 \{coinBalance\.toLocaleString/);
  assert.match(app, />나가기 <span className="button-arrow" \/><\/button>/);
  assert.doesNotMatch(app, /열린 카페로 나가기|전체 수학 과정/);
  // 모은 돈은 전용 코인 이미지로 보여 준다. 이모지도, 글자 배지(won-mark)도 쓰지 않는다.
  assert.match(app, /<Image src="\/ui\/mormi-coin\.png" alt="모르미 새싹 코인"/);
  assert.doesNotMatch(app, /won-mark/);
  assert.doesNotMatch(css, /report-icon--arrow[^}]*translateY/);
  assert.match(app, /playLearningChime/);
  assert.match(app, /const notes = \[659\.25, 783\.99, 1046\.5\]/);
  assert.match(app, /nextTurn\.status === "completed" && soundOn\) playLearningChime\(\)/);
  assert.doesNotMatch(app, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(curriculum, /export const masteryTarget = 5/);
  assert.match(app, /wrongDrillAnswers/);
  assert.match(app, /wrongDrillAnswers\.length === 0\s*\? 200/);
  assert.match(app, /wrongDrillAnswers\.length === 1\s*\? 150/);
  assert.match(app, /wrongDrillAnswers\.length === 2\s*\? 100/);
  assert.match(app, /:\s*50;/);
  assert.match(app, /disabled=\{drillLocked \|\| isWrong\}/);
  // 반복 진행은 새싹 미터와 N/5 표시로만 보여 준다. 화면 안 코인 누적(drill-wallet)은 걷어냈다.
  assert.match(app, /className="seed-meter"/);
  assert.match(app, /\{Math\.min\(drillCorrect \+ 1, masteryTarget\)\}\/\{masteryTarget\}/);
  assert.doesNotMatch(app, /drill-wallet/);
  assert.match(app, /원을 얻었어!/);
  assert.doesNotMatch(app, /useGameMusic|배경 음악과 효과음/);
  assert.match(app, /aria-label=\{soundOn \? "효과음 끄기" : "효과음 켜기"\}/);
  assert.match(app, /if \(soundOn\) playCoinRewardSound\(reward\)/);
  assert.match(app, /cafe-required-lessons/);
  assert.match(app, /otherConceptSessions/);
  assert.match(app, /const stageLabels = \["혼자 연습"/);
  assert.match(app, /setStage\("drill"\)/);
  assert.match(app, /drill-board drill-board--solo/);
  assert.doesNotMatch(app, /stage === "memory"|morami-side|어느 바늘부터|바늘을 하나씩/);

  const classifyStart = curriculum.indexOf('id: "data-classify"');
  const classifyEnd = curriculum.indexOf('id: "data-chart"');
  const classifyBlock = curriculum.slice(classifyStart, classifyEnd);
  assert.doesNotMatch(classifyBlock, /focus:/);
  assert.doesNotMatch(classifyBlock, /missingIndex: [0-9]/);
  assert.doesNotMatch(original, /focus\?: number/);
  assert.doesNotMatch(app, /visual\.focus|index === focus/);
  assert.doesNotMatch(css, /\.shapes-visual span\.is-focus/);

  const calendarStart = curriculum.indexOf('id: "time-calendar"');
  const calendarEnd = curriculum.indexOf('id: "measure-compare"');
  const calendarBlock = curriculum.slice(calendarStart, calendarEnd);
  assert.match(calendarBlock, /8월 8일에서 사흘 뒤는\?/);
  assert.match(calendarBlock, /12월 24일에서 일주일 뒤는\?/);
  assert.doesNotMatch(calendarBlock, /correct: "8일"|highlight: 31/);
});

test("server-renders the adult mathematics report", async () => {
  const response = await render("/report");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /학습 리포트/);
  assert.match(html, /반복 시도/);
  assert.match(html, /전이 확인/);
});

test("production dialogue flows through deployed Spring BE while the AI BFF stays development-only", async () => {
  const [dialogue, apiClient, backendProxy, upstream, conversations, responses, environment, localStack] = await Promise.all([
    readFile(new URL("../app/mormi-dialogue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/be/[...path]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mormi/_upstream.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mormi/conversations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/mormi/conversations/[conversationId]/responses/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/start-local-stack.sh", import.meta.url), "utf8"),
  ]);

  assert.match(dialogue, /type MormiScene = "home_teach" \| "cafe"/);
  assert.match(dialogue, /startMormiConversation/);
  assert.match(dialogue, /submitMormiResponse/);
  assert.match(dialogue, /recoverMormiConversation/);
  assert.match(dialogue, /startHomeTeaching/);
  assert.match(dialogue, /startCafeDialogue/);
  assert.match(dialogue, /submitMormiResponseThroughBe/);
  assert.match(dialogue, /pendingResponseByTurn/);
  assert.match(dialogue, /stableResponseSignature/);
  assert.match(dialogue, /latest\.turn\.turn_id !== input\.turn_id/);
  assert.match(dialogue, /DIALOGUE_REQUEST_TIMEOUT_MS/);
  assert.match(apiClient, /timeoutMs = REQUEST_TIMEOUT_MS/);
  assert.match(backendProxy, /const REQUEST_TIMEOUT_MS = 55_000/);
  assert.match(dialogue, /scenario_context\?:/);
  assert.match(dialogue, /stage_progress\?:/);
  assert.match(dialogue, /verified_facts:/);
  assert.match(apiClient, /const BASE_URL = "\/api\/be"/);
  assert.match(apiClient, /REQUEST_TIMEOUT_MS = 20_000/);
  assert.match(apiClient, /request_timeout/);
  assert.doesNotMatch(apiClient, /NEXT_PUBLIC_API_BASE_URL/);
  assert.match(backendProxy, /process\.env\.BACKEND_ORIGIN/);
  assert.match(backendProxy, /authorization/);
  assert.match(backendProxy, /backend_not_configured/);
  assert.match(upstream, /process\.env\.MORMI_AI_BASE_URL/);
  assert.match(upstream, /X-Mormi-Service-Key/);
  assert.doesNotMatch(environment, /NEXT_PUBLIC_MORMI_AI_SERVICE_KEY/);
  assert.match(environment, /BACKEND_ORIGIN=https:\/\/YOUR-DEPLOYED-SPRING-BE/);
  assert.match(localStack, /Spring BE는 배포 주소를 사용합니다/);
  assert.doesNotMatch(localStack, /gradlew|bootRun|Mormi-BE/);
  assert.match(conversations, /\/v1\/conversations/);
  assert.match(responses, /\/responses/);
});
