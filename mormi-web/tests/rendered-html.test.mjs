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
  assert.match(html, /내 이름 알려주기/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps four official areas and 36 playable sessions in the curriculum", async () => {
  const [curriculum, original, app, cafe, journey, css] = await Promise.all([
    readFile(new URL("../app/math-curriculum.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/morami-content.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/journey-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const dialogueContract = await readFile(new URL("../app/mormi-dialogue.ts", import.meta.url), "utf8");

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
  assert.match(app, /className="drill-choice-prompt">\{currentDrill\.prompt\}/);
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
  assert.match(cafe, /data-figma-node="74:8"/);
  assert.match(cafe, /data-figma-node="74:10"/);
  assert.match(cafe, /id: "milk", name: "우유"[^\n]+milk\.png\?v=2/);
  assert.match(cafe, /id: "strawberry-juice", name: "딸기주스"[^\n]+strawberry-juice\.png\?v=2/);
  assert.match(cafe, /id: "sandwich", name: "샌드위치"[^\n]+sandwich\.png\?v=2/);
  assert.match(cafe, /figma-cafe__place/);
  assert.match(cafe, /sumAnswer/);
  assert.doesNotMatch(cafe, /aria-label="두 메뉴 가격의 합계"[^>]+placeholder="\?"/);
  assert.doesNotMatch(cafe, /천 원짜리/);
  assert.match(cafe, /type QueueScene = "intro" \| "count-both" \| "count-left" \| "note" \| "clear"/);
  assert.match(cafe, /return Math\.random\(\) < 0\.5 \? \{ left: 2, right: 1 \} : \{ left: 1, right: 2 \}/);
  assert.match(cafe, /className=\{queueCounts\.left === 1 \? "is-mirrored" : ""\} src="\/cafe-stages\/queue-v2\.png"/);
  assert.match(cafe, /카페 대기줄: 왼쪽 줄 \$\{queueCounts\.left\}명, 오른쪽 줄 \$\{queueCounts\.right\}명/);
  assert.doesNotMatch(cafe, /className="queue-story-lines"/);
  assert.match(cafe, /어\? 주문하려면 줄을 서야 하나 봐/);
  assert.match(cafe, /왼쪽 줄이랑 오른쪽 줄에는 각각 사람들이 몇 명씩 있어\?/);
  assert.match(cafe, /더 짧은 줄에는 몇 명이 있어\?/);
  assert.match(cafe, /모르미의 공부노트/);
  assert.match(cafe, /가르쳐 준 내용은 잊지 않게 노트에 적어 둬야겠다/);
  assert.doesNotMatch(cafe, /가 알려줌|빠뜨빼똘 손글씨로|다음으로 ▶/);
  assert.match(cafe, /learnerName/);
  assert.match(cafe, /우리 장바구니/);
  assert.match(cafe, /budgets = \[8000, 9000, 10000\]/);
  assert.match(cafe, /randomQueueCounts/);
  assert.match(cafe, /conversation\.scenario_context\?\.queue_context/);
  assert.match(cafe, /randomItem\(menu\)/);
  assert.match(cafe, /예산을 .*원 초과했어요/);
  assert.match(cafe, /내 메뉴 골라 줘서 고마워/);
  assert.match(cafe, /finishMenuStory[\s\S]{0,500}setStep\("sum"\)/);
  assert.match(cafe, />완료!</);
  assert.match(cafe, /← \{step === "overview" \? "외출 장소" : "돌아가기"\}/);
  assert.doesNotMatch(cafe, /changeHintLevel/);
  assert.doesNotMatch(cafe, /모르미가 같이 생각해 볼게/);
  assert.match(cafe, /turn\.help_card\?\.visible/);
  assert.match(cafe, /STAGE 1 CLEAR!/);
  assert.match(cafe, /figma-cafe-sum__equation[\s\S]{0,800}<Image src=\{item\.image\}/);
  assert.match(cafe, /cafe-sum-menu-picker/);
  assert.match(cafe, /두 메뉴 가격의 합계/);
  assert.match(cafe, /checkSum/);
  assert.match(cafe, /changeChangeMoney/);
  assert.match(cafe, /가진 돈 10,000원/);
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
  // 문제 문구는 그림 아래 회수 문구로 내려갔다. 아이가 답할 질문은 그림 위의 모르미 대화라,
  // 둘을 같이 위에 두면 시선이 엉뚱한 질문으로 먼저 간다.
  assert.match(app, /<p className="teaching-problem-recap"><span>모르미가 헷갈린 문제<\/span>\{teachingProblem\.prompt\}<\/p>/);
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
  assert.match(app, /모르미가 헷갈린 문제/);
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
  assert.match(css, /button\.teaching-dont-know[^}]*position:static[^}]*font-size:16px[^}]*font-weight:850/);
  assert.match(css, /button\.teaching-dont-know\.is-loading::before/);
  assert.match(css, /teaching-answer--button[^}]*transform:translateX\(-42px\)/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /\.teaching-dialogue>\.star-note\{width:100%;min-width:0;min-height:0/);
  assert.match(css, /\.today-badges > span \{/);
  assert.match(css, /\.note-content h2 em \{ color: #6256a8/);
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
  assert.match(app, /너의 이름을 알려줄래/);
  assert.doesNotMatch(app, /page.*"tutorial"/);
  assert.doesNotMatch(app, /이 영역에서 배운 길/);
  assert.match(app, /teachingNote\.attribution_label/);
  assert.doesNotMatch(app, />별노트에 적기/);
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
