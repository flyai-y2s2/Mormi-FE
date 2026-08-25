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

test("server-renders the progress bootstrap before the I AM 쌤 onboarding", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /준비하고 있어!/);
  assert.doesNotMatch(html, /이 친구가/);
  assert.match(html, /메인 화면으로 데려다 줄게\./);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("uses the I AM teacher brand across onboarding and signup", async () => {
  const [app, signup] = await Promise.all([
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signup/SignupExperience.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [app, signup]) {
    assert.match(source, /\/ui\/iam-sam\.png/);
    assert.match(source, /alt="I AM 쌤"/);
    assert.doesNotMatch(source, /\/ui\/igeonaega-logo\.png/);
  }
  assert.doesNotMatch(app, /안녕, 나 모르미야!|오늘 물어보고 싶은 게 많아!/);
  assert.match(app, /로그인하기/);
  assert.match(app, /처음 왔어요/);
  assert.match(app, /onboarding-greeting__actions/);
});

test("keeps four official areas and 36 playable sessions in the curriculum", async () => {
  const [curriculum, original, app, cafe, journey, css, cafeMenu, talkStage, stageVisual, dialogueUi, starNote, stageComplete, layout, moneyVisual, collectedStars] = await Promise.all([
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
    readFile(new URL("../app/StarNote.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeStageComplete.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/money-visual.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/CollectedStarsModal.tsx", import.meta.url), "utf8"),
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
  assert.match(app, /useState<Stage>\("booting"\)/);
  assert.match(app, /onboarding-secondary onboarding-secondary--button[\s\S]{0,200}>처음 시작하는 거예요/);
  assert.match(css, /\.onboarding-greeting \{[^}]*width:min\(650px,100%\)/);
  assert.match(css, /\.onboarding-brand \{[^}]*width:min\(300px,72%\)[^}]*height:auto/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.onboarding-brand \{[^}]*width:min\(210px,76%\)/);
  assert.match(css, /\.onboarding-greeting__actions \{[^}]*grid-template-columns:minmax\(0,1\.35fr\) minmax\(0,\.9fr\)/);
  assert.match(css, /\.onboarding-greeting__actions \.onboarding-secondary \{[^}]*min-height:76px[^}]*font-size:18px/);
  assert.match(css, /\.onboarding-name-card \.onboarding-secondary--button \{[^}]*min-height:64px[^}]*font-size:17px[^}]*text-decoration:none/);
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
  assert.match(app, /놀이동산 필수 개념/);
  assert.match(journey, /"money-count"/);
  assert.match(journey, /"money-price"/);
  assert.match(journey, /"money-budget"/);
  assert.match(journey, /"number-count"/);
  assert.match(journey, /"number-compare"/);
  assert.match(journey, /"multiply-groups"/);
  assert.match(journey, /"divide-share"/);
  assert.match(journey, /"divide-group"/);
  assert.match(cafe, /카페 스테이지 선택/);
  assert.match(cafe, /CAFE QUEST/);
  assert.match(cafe, /cafe-stages\/queue-v2\.png/);
  assert.match(cafe, /cafe-stages\/payment-v3\.png/);
  assert.match(cafe, /cafe-stages\/change-v3\.png/);
  // 스테이지 진입구는 카드의 "도전하기" 하나뿐이다.
  // 지도 아래에 같은 일을 하는 CTA 를 또 두면 어디를 눌러야 하는지 흐려진다.
  assert.match(cafe, /도전하기/);
  assert.doesNotMatch(cafe, /스테이지 시작/);
  assert.match(cafe, /data-figma-node="74:4"/);
  assert.match(cafe, /<CafeStageComplete/);
  assert.match(cafeMenu, /id: "milk", name: "우유"[^\n]+milk\.png\?v=2/);
  assert.match(cafeMenu, /id: "strawberry-juice", name: "딸기주스"[^\n]+strawberry-juice\.png\?v=2/);
  assert.match(cafeMenu, /id: "sandwich", name: "샌드위치"[^\n]+sandwich\.png\?v=2/);
  assert.match(cafe, /figma-cafe__place/);
  assert.doesNotMatch(cafe, /천 원짜리/);
  assert.match(cafe, /type QueueScene = "dialogue" \| "note" \| "thanks" \| "clear"/);
  assert.match(cafe, /return Math\.random\(\) < 0\.5 \? \{ left: 2, right: 1 \} : \{ left: 1, right: 2 \}/);
  assert.match(stageVisual, /className=\{left < right \? "is-mirrored" : ""\}\s*\n\s*src="\/cafe-stages\/queue-v2\.png"/);
  assert.match(stageVisual, /카페 대기줄: 왼쪽 줄 \$\{left\}명, 오른쪽 줄 \$\{right\}명/);
  assert.doesNotMatch(cafe, /className="queue-story-lines"/);
  // 스테이지 질문은 화면에 적어 두지 않고 모르미가 그때그때 건넨다.
  assert.match(cafe, /queue: "모르미의 질문을 불러오는 중이에요\."/);
  assert.doesNotMatch(cafe, /주문하려면 줄을 서야 하나 봐|각각 사람들이 몇 명씩 있어|더 짧은 줄에는 몇 명이 있어/);
  // 아이는 위에서 아래로 한 줄기로 읽는다: 모르미의 질문 → 문제 그림 → 알려주기.
  // 네 스테이지가 같은 대화 셸을 쓰므로 이 순서는 CafeTalkStage 한 곳에서만 정해진다.
  assert.match(talkStage, /cafe-talk-bubble[\s\S]*cafe-talk-dont-know[\s\S]*cafe-talk-stage[\s\S]*cafe-talk-answer/);
  assert.match(talkStage, /궁금해 사전/);
  // 카페 툴바도 집 학습과 같은 시각 언어를 쓴다. 사전은 원형 책 아이콘,
  // 이전 버튼은 흰색 바탕의 초록 테두리 버튼이다.
  assert.match(talkStage, /className="cafe-talk-note"[\s\S]{0,220}ui-icon--book/);
  assert.match(css, /\.cafe-talk-note\{[^}]*width:88px[^}]*height:88px[^}]*border-radius:50%/);
  assert.match(css, /\.cafe-talk-note\{[^}]*white-space:nowrap[^}]*word-break:keep-all/);
  assert.match(css, /\.cafe-talk-back\{[^}]*min-height:48px[^}]*border:3px solid #78cda6/);
  assert.match(css, /\.cafe-talk-toolbar\{\s*width:min\(600px,calc\(100% - 56px\)\)/);
  assert.match(css, /\.cafe-talk-toolbar\{[^}]*left:50%[^}]*transform:translateX\(-50%\)/);
  assert.match(css, /\.cafe-talk-bubble p\{[^}]*font-size:clamp\(17px,1\.55vw,20px\)/);
  // 반복학습과 카페는 서로 다른 별노트 마크업을 만들지 않고 같은 컴포넌트를 쓴다.
  assert.match(app, /<StarNote text=\{teachingNote\.text\} \/>/);
  assert.match(cafe, /queue-note-scene[\s\S]{0,500}<StarNote text=\{cafeConversations\.queue\?\.turn\.note_update\?\.text\} \/>/);
  assert.match(starNote, /className=\{`star-note \$\{className\}`\.trim\(\)\}/);
  assert.match(starNote, /note-ring[^>]*>별<br \/>노<br \/>트/);
  // 별노트 전용 폰트는 첫 화면에서 미리 받고, 로드 전에는 고딕 대체 글꼴을
  // 잠깐 그리지 않는다. 그래야 별노트 진입 시 글꼴이 뒤늦게 바뀌지 않는다.
  assert.match(layout, /rel="preload" href="\/fonts\/nanum-child-hope\.ttf" as="font" type="font\/ttf"/);
  assert.match(css, /font-family: "Mormi Child Hope";[\s\S]{0,240}font-display: block;/);
  assert.doesNotMatch(cafe, /모르미의 공부노트/);
  assert.match(cafe, /가르쳐 준 내용은 잊지 않게 별노트에 적어 둬야겠다/);
  assert.doesNotMatch(cafe, /가 알려줌|빠뜨빼똘 손글씨로|다음으로 ▶/);
  assert.match(cafe, /learnerName/);
  assert.match(cafe, /budgets = \[7000, 8000\]/);
  assert.match(cafe, /randomQueueCounts/);
  assert.match(cafe, /conversation\.scenario_context\?\.queue_context/);
  assert.match(cafe, /randomItem\(menu\)/);
  assert.match(cafe, /예산을 넘었어요\. 다른 메뉴를 골라 봐!/);
  assert.match(cafe, /finishMenuStory[\s\S]{0,900}setStep\("sum"\)/);
  assert.match(cafe, /const calculationReplay = replayStages\.current\.menu === true;[\s\S]{0,400}\}, calculationReplay \? "restart" : "resume"\);/);
  // 지도에는 줄 서기·메뉴 값 계산·거스름돈 세 단계만 보인다. Spring BE의
  // menu → calculate 저장 순서는 2단계 안에서 이어져 기존 계약을 건너뛰지 않는다.
  assert.match(journey, /cafeStations = \["줄 서기", "메뉴 값 계산하기", "거스름돈 받기"\]/);
  assert.doesNotMatch(cafe, /\{ title: "메뉴 고르기"/);
  assert.match(cafe, /cafeScenarioByStation = \["cafe_queue", "cafe_budget_menu", "cafe_menu_total", "cafe_change"\]/);
  assert.match(cafe, /stageNumber=\{1\}[\s\S]*stageNumber=\{2\}[\s\S]*stageNumber=\{3\}/);
  assert.doesNotMatch(cafe, /stageNumber=\{4\}/);
  assert.equal((cafe.match(/<CafeStageComplete\b/g) || []).length, 4);
  assert.match(stageComplete, /별노트/);
  assert.match(stageComplete, /현재 돈/);
  assert.match(stageComplete, /현재 스테이지/);
  assert.match(stageComplete, /currentMoney\.toLocaleString/);
  assert.match(stageComplete, /eyebrow \?\? `STAGE \$\{stageNumber\} CLEAR!`/);
  assert.match(stageComplete, /cafe-stage-complete__actions/);
  assert.match(stageComplete, /secondaryActionLabel/);
  assert.match(cafe, /eyebrow="카페 외출 완료"/);
  assert.match(cafe, /noteCount=\{noteCount\("queue", "menu", "calculate", "change"\)\}/);
  assert.match(cafe, /secondaryActionLabel="스테이지 더 연습하기"/);
  assert.doesNotMatch(cafe, /figma-cafe-done/);
  assert.doesNotMatch(css, /figma-cafe-done/);
  assert.match(app, /coinBalance=\{coinBalance\}/);
  assert.equal((cafe.match(/<CafeStageThanks\b/g) || []).length, 3);
  assert.match(cafe, /← \{step === "overview" \? "외출 장소" : "돌아가기"\}/);
  assert.doesNotMatch(cafe, /changeHintLevel/);
  assert.doesNotMatch(cafe, /모르미가 같이 생각해 볼게/);
  assert.match(talkStage, /<MormiHelpCard card=\{helpVisible \? conversation\?\.turn\.help_card \?\? null : null\}/);
  assert.match(app, /<MormiHelpCard card=\{teachHelpVisible \? teachingTurn\?\.help_card \?\? null : null\}/);
  // 같이 읽기 문장과 다음 버튼은 문제 카드 밖으로 흩어지지 않고 하나의
  // 모델링 카드 안에서 읽힌다. 태블릿에서도 CTA가 화면 전체 폭으로 늘어나지 않는다.
  assert.match(app, /className="model-teaching__reading"/);
  assert.match(css, /\.model-teaching \{[^}]*border:4px solid #e4f1ea[^}]*background:rgba\(255,255,255,\.95\)/);
  assert.match(css, /\.model-teaching \.send-teach-button \{[^}]*width:min\(240px,100%\)/);
  // task_anchor 는 계약과 테스트 도구에는 남기되 실제 학습 화면에서는 질문을
  // 그대로 반복하므로 렌더링하지 않는다. 도움 카드는 no_response 이후에만 연다.
  assert.doesNotMatch(talkStage, /<MormiTaskAnchor/);
  assert.doesNotMatch(app, /<MormiTaskAnchor/);
  assert.match(dialogueUi, /anchor\.completed_items\.map/);
  assert.match(dialogueContract, /task_anchor\?:/);
  assert.match(css, /\.mormi-task-anchor/);
  assert.match(dialogueUi, /if \(!card\?\.visible\) return null/);
  assert.match(dialogueUi, /!helpBodyIsRepeatedByVisual\(card\) && <p>\{card\.body\}<\/p>/);
  assert.match(dialogueUi, /card\.visual_type/);
  assert.match(dialogueUi, /choice\.image_url/);
  assert.match(dialogueContract, /dictionary_ref:/);
  // 로컬 계약 테스트도 현재 AI가 받는 공식 시나리오와 필수 화면 맥락을 보낸다.
  assert.match(aiTest, /id: "home_teach"/);
  assert.doesNotMatch(aiTest, /home_addition_teach/);
  assert.match(aiTest, /curriculum_session_id: "money-price"/);
  assert.match(aiTest, /queue_context: \{ left_count: 3, right_count: 5 \}/);
  assert.match(cafe, /stageNumber=\{1\}/);
  assert.match(cafe, /setCalculationScene\("thanks"\)/);
  assert.match(cafe, /setChangeScene\("thanks"\)/);
  assert.match(cafe, /showStageSummary[\s\S]*setCalculationScene\("clear"\)[\s\S]*setChangeScene\("clear"\)/);
  assert.doesNotMatch(cafe, /setTimeout\(returnToMap, 500\)/);
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
  // 아이와 채팅하는 동안에는 집과 카페 모두 같은 confused PNG를 쓴다.
  // 완료·보상 화면의 축하 표정은 각 화면에 별도로 남아 있다.
  assert.match(talkStage, /const chatImage = "\/morami\/confused-cutout\.png"/);
  assert.match(talkStage, /className="cafe-talk-morami" src=\{chatImage\}/);
  assert.match(app, /className="teaching-morami"><Morami expression="confused"/);
  assert.match(app, /다른 개념 더보기/);
  assert.doesNotMatch(app, /생활에 필요한 개념부터 배워요|밖에서도 자연스럽게 사용할 수 있도록 반복학습으로 준비해요/);
  assert.match(app, /저번에 도와줘서 고마워! 이번에도 또 같이 가주라!/);
  assert.doesNotMatch(app, /카페 가는 거 이제 자신 있어! 또 연습하러 가자!/);
  // 레벨·돈은 하나의 정보 카드로 묶고 별노트만 별도 버튼으로 둔다.
  assert.match(css, /\.player-hud\{[^}]*grid-template-columns:minmax\(0,1fr\) minmax\(170px,.55fr\)[^}]*background:transparent/);
  assert.match(css, /\.player-status-summary\{[^}]*grid-template-columns:minmax\(120px,.8fr\) minmax\(200px,1.35fr\)[^}]*background:rgba\(255,252,244,.9\)/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.home-room-main\{[^}]*grid-template-columns:minmax\(0,440px\) minmax\(150px,180px\)[^}]*\}/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.home-room-copy-column\{[^}]*grid-column:1;grid-row:1[^}]*\}[\s\S]*?\.home-room-character-column\{grid-column:2;grid-row:1;display:grid\}/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.home-room-main\{grid-template-columns:1fr\}[\s\S]*?\.home-room-character-column\{grid-column:1;grid-row:2\}/);
  assert.match(css, /@media\(max-width:430px\)[\s\S]*?\.player-hud\{grid-template-columns:1fr\}[\s\S]*?\.player-hud>\.player-stat--star\{grid-column:1/);
  assert.match(css, /\.home-room-copy-column>\.player-hud\{width:100%;justify-self:stretch\}/);
  assert.match(css, /\.home-room-copy h1\{[^}]*font-size:clamp\(29px,3\.2vw,40px\)/);
  assert.match(journey, /cafe-money\/100\.png/);
  assert.match(journey, /cafe-money\/5000\.png/);
  assert.match(stageVisual, /10000: "\/cafe-money\/10000\.png"/);
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
  assert.match(app, /variedMoneyVisualAmounts\(problem\.visual\.amounts, !isCurrencyVisual, seed\)/);
  assert.match(moneyVisual, /currencyVisualDenominations = \[100, 500, 1000, 5000\]/);
  assert.match(app, /player-stat player-stat--star[^>]*onClick=\{\(\) => setStarsOpen\(true\)\}[^>]*aria-haspopup="dialog"/);
  assert.match(app, /starsOpen && <CollectedStarsModal completedSessionIds=\{completedSessionIds\}/);
  assert.match(collectedStars, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(collectedStars, /concepts\.length === 0/);
  assert.match(collectedStars, /event\.key === "Escape"/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.collected-stars-grid\{[^}]*grid-template-columns:1fr/);
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
  assert.match(app, /orderedNumericChoicesWithSeededCorrect\(ensuredAnswers, problem\.correct, seed\)/);
  assert.match(app, /shuffledCountingValues\(variantSeed \+ sessionIndex \* 59\)/);
  assert.match(app, /const variationSeed = countingValues \? countingValues\[index\] - 1 : seed/);
  assert.match(app, /const answerChoiceSeed = answerChoiceSeeds\[index\] \?\? seed/);
  assert.match(app, /shuffleProblemAnswers\(varyProblem\(problem, variationSeed\), answerChoiceSeed\)/);
  assert.match(app, /randomAnswerChoiceSeeds\(masteryTarget\)/);
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
  assert.match(app, /\{serverMormiText && <div><b>\{characterDisplayName\}<\/b><p>\{formatTeachingDisplayText\(namedText\(serverMormiText\)\)\}<\/p><\/div>\}/);
  assert.match(app, /teachSending \? "확인 중…" : "완료"/);
  assert.match(app, /const serverMormiText = teachingTurn\?\.mormi\.text\?\.trim\(\) \?\? ""/);
  assert.match(app, /const hasServerMessagePanel = Boolean\(serverMormiText\) \|\| Boolean\(teachHelpVisible && teachingTurn\?\.help_card\?\.visible\) \|\| Boolean\(teachError\)/);
  assert.match(app, /\{hasServerMessagePanel && !teachingComplete && \(/);
  assert.match(app, /\{serverMormiText && <div><b>\{characterDisplayName\}<\/b><p>\{formatTeachingDisplayText\(namedText\(serverMormiText\)\)\}<\/p><\/div>\}/);
  assert.match(app, /productImage\(labels\[index\]\)/);
  assert.match(app, /turn\.visual\.data\.problem/);
  assert.doesNotMatch(app, /모르미가 헷갈린 문제/);
  assert.match(app, /<ProblemCard problem=\{teachingProblem\}/);
  assert.match(app, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/);
  assert.match(app, /mark === missing \? "\?" : mark/);
  assert.doesNotMatch(app, /<i \/>\{mark\}<\/span>/);
  assert.match(app, /extraLifeProblem/);
  assert.match(app, /내 생각을 먼저 써 봐요/);
  assert.match(app, /먼저 직접 써서 \$\{displayName\}에게 알려 줘요/);
  assert.match(app, /보기에서 골라 \$\{displayName\}에게 알려 줘요/);
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
  assert.match(app, /teachHelpLoading \? "도움 찾는 중…" : "잘 모르겠어"/);
  assert.match(app, /teachingProblem\?\.visual\.type !== "money"/);
  assert.match(app, /className="teaching-back"/);
  assert.match(app, /aria-label="이전 반복학습 화면으로 돌아가기"/);
  assert.match(app, /teachSending \? "확인 중…" : "완료"/);
  assert.match(app, /stage !== "cafe" && stage !== "amusement" && stage !== "teach"/);
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
  assert.match(css, /\.figma-cafe--queue \.queue-story-next\{min-width:144px;min-height:52px/);
  assert.match(css, /\.figma-cafe--queue \.queue-story-dialogue \.queue-story-next::after\{[^}]*border-left-color:#fff/);
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
  // 외출은 홈의 문에서만 시작한다. 다른 화면의 상단에는 집으로 돌아가는 단일 행동만 둔다.
  assert.doesNotMatch(app, /journey-nav--top/);
  const homeReturnControls = app.match(/className="home-return-control"/g) || [];
  assert.equal(homeReturnControls.length, 1);
  assert.match(app, /className="home-return-control"[\s\S]{0,180}<UiIcon name="home"[\s\S]{0,100}집으로 돌아가기/);
  // topbar 의 좌우 기준선이 화면마다 다르면 상단에 둔 탭이 옮겨져 보인다.
  assert.match(css, /\.app-shell--outside \.topbar[^{]*\{[^}]*max-width:none/);
  // 반복 중에는 프로필을 띄우지 않는다. 로그아웃이 눌리면 시도 기록이 끊긴 채 세션이 남는다.
  assert.match(app, /<div className="top-actions">[\s\S]{0,220}\{!learningStage && <ProfileMenu/);
  // 로그인 화면은 형식 검사를 걸지 않는다. 규칙이 바뀌면 예전 기준으로 만든 아이디가
  // 서버에 닿기도 전에 막혀, 멀쩡한 계정으로 못 들어오게 된다.
  assert.match(app, /function submitLogin\(\) \{\r?\n {4}\/\//);
  assert.doesNotMatch(app, /api\.createLearner|api\.restoreLearner/);
  assert.doesNotMatch(app, /page.*"tutorial"/);
  assert.doesNotMatch(app, /이 영역에서 배운 길/);
  assert.doesNotMatch(app, /<span>\{teachingNote\.attribution_label\}<\/span>/);
  assert.doesNotMatch(app, />별노트에 적기/);
  assert.match(starNote, /note-ring[^>]*>별<br \/>노<br \/>트/);
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
  assert.match(app, /<Image src="\/ui\/mormi-coin\.png" alt="새싹 코인"/);
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
  assert.doesNotMatch(app, /aria-label=\{soundOn \? "효과음 끄기" : "효과음 켜기"\}/);
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

test("server-renders the individual diagnostic report shell", async () => {
  const response = await render("/report");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /현재 상태 요약/);
  assert.match(html, /단원별 결과/);
  assert.match(html, /현재 영역별 상태/);
  assert.match(html, /집 · 개념/);
  assert.match(html, /실생활 · 응용/);
  assert.match(html, /마지막 학습 기록/);
  assert.doesNotMatch(html, /지갑 잔액|이번 세션 보상|우선순위 높음/);
});

test("renders the complete example as a numeric diagnostic preview without a chart", async () => {
  const response = await render("/report?example=complete");
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /학습자<\/span><strong>예시 학습자/);
  assert.match(html, /개인 진단 리포트/);
  assert.match(html, /완료 단원/);
  assert.match(html, /이번 주 완료/);
  assert.match(html, /반복학습/);
  assert.match(html, /92/);
  assert.match(html, /모르미 가르치기/);
  assert.match(html, /14/);
  assert.match(html, /실생활 수행/);
  assert.match(html, /8월 2주차/);
  assert.match(html, /단원별 결과/);
  assert.match(html, /AI가 본 변화/);
  assert.match(html, /과거·최근 발화 보기/);
  assert.match(html, /AI 다음 학습 제안/);
  assert.match(html, /다음 단원 계획 확인/);
  assert.doesNotMatch(html, /<svg\b/);
  assert.doesNotMatch(html, /diagnostic-chart/);
});

test("numeric weekly preview keeps its compact control outside the report paper", async () => {
  const [preview, css] = await Promise.all([
    readFile(new URL("../app/report/NumericReportPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(preview, /className="weekly-report-nav"/);
  assert.match(preview, /aria-label="이전 주 리포트"/);
  assert.match(preview, /aria-label="다음 주 리포트"/);
  assert.match(preview, /반복학습/);
  assert.match(preview, /모르미 가르치기/);
  assert.doesNotMatch(preview, />세션별 변화</);
  assert.match(css, /\.weekly-report-nav \.weekly-report-nav__retry\{[^}]*min-width:44px[^}]*height:44px/);
});

test("ready numeric report wires selected-week speech evidence into its existing detail panel", async () => {
  const [dashboard, preview] = await Promise.all([
    readFile(new URL("../app/report/ReportDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/NumericReportPreview.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /speechByDomain=\{speechByDomain\}/);
  assert.match(dashboard, /onRequestSpeech=\{\(domainId\) =>/);
  assert.match(preview, /onRequestSpeech\?\.\(selectedDomain\.id\)/);
  assert.match(preview, /speech\.evidence\.recent\.utterance/);
});

test("diagnostic report renders as one compact Korean A4 document", async () => {
  const [response, css, dashboard, example] = await Promise.all([
    render("/report"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/report/ReportDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/complete-report-example.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /<article[^>]+data-report-format="a4"/);
  assert.match(html, /현재 상태 요약/);
  assert.match(html, /단원별 결과/);
  assert.match(html, /현재 영역별 상태/);
  assert.doesNotMatch(html, /INDIVIDUAL LEARNING REPORT|AT A GLANCE|CHANGE OVER TIME|CURRENT EVIDENCE/);
  assert.match(css, /\.report-paper\{[\s\S]*?width:min\(794px,[\s\S]*?min-height:1123px/);
  assert.match(css, /\.domain-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /className="diagnostic-learner-name"[\s\S]*?report\.learner\.display_name/);
  assert.match(dashboard, /<h1 id="report-title">개인 진단 리포트<\/h1>/);
  assert.match(dashboard, /NumericReportPreview/);
  assert.match(dashboard, /completeExample/);
  assert.doesNotMatch(example, /"(?:메뉴 값 계산하기|거스름돈 받기|줄 서기) · 실생활 수행"/);
});

test("diagnostic report uses the approved interactive data contract", async () => {
  const [dashboard, interactions, trendChart, domainDetail, example, css] = await Promise.all([
    readFile(new URL("../app/report/ReportDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/diagnostic-report-interactions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/report/ReportTrendChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/DomainDetail.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/report/complete-report-example.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(dashboard, /api\.diagnosticReport\(\{ weekStart, signal: controller\.signal \}\)/);
  assert.match(dashboard, /role="tablist"/);
  assert.match(dashboard, /role="tab"/);
  assert.match(dashboard, /api\.diagnosticSpeechEvidence\(domainId, \{/);
  assert.match(dashboard, /weekStart: reportRef\.current!\.period\.week_start/);
  assert.match(dashboard, /새로 계산/);
  assert.match(dashboard, /마지막 학습 기록/);
  assert.doesNotMatch(dashboard, /최근 갱신/);
  assert.match(dashboard, /tabIndex=\{mode === item \? 0 : -1\}/);
  assert.match(dashboard, /onKeyDown=\{handleTabKeyDown\}/);
  assert.match(dashboard, /aria-labelledby=\{`diagnostic-tab-\$\{panelMode\.toLowerCase\(\)\}`\}/);
  assert.match(dashboard, /AbortController/);
  assert.match(dashboard, /isEmptyDiagnosticReport/);
  assert.doesNotMatch(dashboard, /teacher-note|교사 메모|textarea/);
  assert.match(dashboard, /\["문제 풀기", report\.current_summary\.concept_performance\]/);
  assert.match(dashboard, /\["혼자 설명하기", report\.current_summary\.explanation_change\]/);
  assert.match(dashboard, /\["생활 속 문제 해결", report\.current_summary\.life_transfer\]/);
  assert.match(domainDetail, /같은 문제를 어떻게 설명했는지/);
  assert.doesNotMatch(`${dashboard}\n${domainDetail}\n${example}`, /독립 수행률|설명 독립성/);
  assert.match(dashboard, /IMPROVING: "좋아지는 중"/);
  assert.match(domainDetail, /INSUFFICIENT_HISTORY: "기록 더 필요"/);
  assert.doesNotMatch(`${dashboard}\n${domainDetail}`, /장기 향상|최근 하락|장기 유지|최근 근거 추가/);
  assert.match(trendChart, /recentWindowLayout\.description/);
  assert.match(trendChart, /diagnostic-chart__recent--shared/);
  const chartSvg = trendChart.slice(trendChart.indexOf("<svg"), trendChart.indexOf("</svg>"));
  assert.doesNotMatch(chartSvg, /diagnostic-chart__recent-ribbon/);
  assert.doesNotMatch(chartSvg, /\{window\.label\} 최근 구간/);
  assert.doesNotMatch(trendChart, /<pattern|recent-(?:primary|secondary)-pattern/);
  assert.doesNotMatch(css, /\.diagnostic-chart-legend \.is-recent\.is-per-series i\{[^}]*repeating-linear-gradient/);
  assert.doesNotMatch(css, /\.diagnostic-chart__recent-ribbon/);
  assert.match(trendChart, /최근 구간/);
  assert.match(dashboard, /chooseDiagnosticSelection\(groupedDomains, nextMode, selectedDomainId\)/);
  assert.match(dashboard, /className="domain-category-bar"/);
  assert.match(dashboard, /const categoryStatus = diagnosticCategoryStatus\(domain\)/);
  assert.match(dashboard, /domain-category-button--\$\{categoryStatus\.toLowerCase\(\)\}/);
  assert.match(dashboard, /<small>\{statusLabel\(categoryStatus\)\}<\/small>/);
  assert.match(dashboard, /aria-pressed=\{expandedDomainId === domain\.domain_id\}/);
  assert.match(dashboard, /className="domain-category-panel"/);
  assert.match(dashboard, /<DomainDetail domain=\{expandedDomain\}/);
  assert.match(dashboard, /className="domain-list domain-print-list"/);
  assert.match(css, /\.domain-category-bar\{[^}]*display:flex[^}]*flex-wrap:nowrap[^}]*overflow-x:auto/);
  assert.match(css, /\.domain-category-button--stable\{[^}]*background:#e7f4ed/);
  assert.match(css, /\.domain-category-button--developing\{[^}]*background:#fff3cf/);
  assert.match(css, /\.domain-category-button--support_needed\{[^}]*background:#fbe7e3/);
  assert.match(css, /\.domain-category-button--observing\{[^}]*background:#edf1ef/);
  assert.match(dashboard, /className="diagnostic-evidence-link"/);
  assert.match(dashboard, /<p>\{summary\.text\}<\/p><EvidenceLinks refs=\{summary\.evidence_refs\}/);
  assert.match(dashboard, /<p>\{report\.improved_point\.text\}<\/p><EvidenceLinks refs=\{report\.improved_point\.evidence_refs\}/);
  assert.match(dashboard, /onClick=\{\(\) => onActivate\(link\)\}/);
  assert.match(dashboard, /activateEvidenceLink/);
  assert.match(dashboard, /scrollIntoView/);
  assert.match(dashboard, /expand_speech/);
  assert.match(dashboard, /speechLoadDecision/);
  assert.match(dashboard, /reportRequestAccepted/);
  assert.match(interactions, /export function evidenceLinksForRefs/);
  assert.doesNotMatch(dashboard, /evidence_refs\.length\}건/);
  assert.match(css, /\.diagnostic-evidence-link\{[^}]*min-height:44px/);

  const printStyles = css.slice(css.indexOf("@media print"), css.indexOf("/* 툴바", css.indexOf("@media print")));
  assert.match(printStyles, /@page\{size:A4 portrait;margin:8mm\}/);
  assert.match(printStyles, /\.domain-print-list\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(printStyles, /\.diagnostic-chart\{height:150px;max-height:150px/);
  assert.match(printStyles, /\.diagnostic-refresh,\.diagnostic-tabs,\.diagnostic-domain-selector\{display:none!important\}/);
  assert.match(printStyles, /\.domain-category-bar,\.domain-category-panel\{display:none!important\}/);
  assert.match(printStyles, /overflow:visible!important/);
  assert.doesNotMatch(printStyles, /overflow:hidden|zoom\s*:/);
  const readablePrintRules = [...printStyles.matchAll(/\.(?:summary-strips|domain-status|diagnostic-highlights|diagnostic-evidence)[^{]*\{[^}]*\}/g)]
    .map(([rule]) => rule)
    .join("\n");
  assert.doesNotMatch(readablePrintRules, /font-size:[5-8]px/);
  assert.match(printStyles, /\.report-paper\{[^}]*font-size:12px/);
  assert.match(printStyles, /\.summary-strips p\{font-size:12px/);
  assert.match(printStyles, /\.domain-status\{[^}]*font-size:11px/);
  assert.match(printStyles, /\.diagnostic-highlights p\{[^}]*font-size:12px/);
  assert.match(printStyles, /\.diagnostic-evidence-link\{[^}]*min-height:0[^}]*font-size:11px/);
  assert.match(printStyles, /\.diagnostic-evidence span\{[^}]*font-size:11px/);
  assert.doesNotMatch(printStyles, /\.diagnostic-chart__recent-ribbon/);
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

  assert.match(dialogue, /type MormiScene = "home_teach" \| "cafe" \| "amusement_park"/);
  assert.match(dialogue, /startMormiConversation/);
  assert.match(dialogue, /submitMormiResponse/);
  assert.match(dialogue, /recoverMormiConversation/);
  assert.match(dialogue, /startHomeTeaching/);
  assert.match(dialogue, /startCafeDialogue/);
  assert.match(dialogue, /startAmusementParkDialogue/);
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
