import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cafeProblemContextMatches, calculationDialogueLine, menu, menuChoiceById, menuChoiceForItem, menuDisplayName, menuPairTotal, validateMenuSelectionContext } from "../app/cafe-menu.ts";
import { choiceIdForTypedAnswer } from "../app/cafe-choice-input.ts";

test("connects the clicked menu to the server choice by exact id", () => {
  const choices = [
    { id: "milk" },
    { id: "americano" },
    { id: "cookie", disabled: true },
  ];

  assert.equal(menuChoiceById("americano", choices)?.id, "americano");
  assert.equal(menuChoiceById("milk", choices)?.id, "milk");
  assert.equal(menuChoiceById("cookie", choices), undefined);
  assert.equal(menuChoiceById("missing", choices), undefined);
});

test("connects V2 menu cards to opaque server choices by exact name and price", () => {
  const choices = [
    { id: "menu.00", label: "커피 3,000원" },
    { id: "menu.01", label: "우유 2,000원" },
    { id: "menu.02", label: "딸기주스 4,000원" },
    { id: "menu.05", label: "샌드위치 5,000원", disabled: true },
  ];

  assert.equal(menuChoiceForItem(menu[0], choices)?.id, "menu.00");
  assert.equal(menuChoiceForItem(menu[1], choices)?.id, "menu.01");
  assert.equal(menuChoiceForItem(menu[2], choices)?.id, "menu.02");
  assert.equal(menuChoiceForItem(menu[5], choices), undefined);
  assert.equal(menuChoiceForItem({ ...menu[0], price: 9999 }, choices), undefined);
});

test("renames americano only on screen and keeps budget math canonical", () => {
  assert.equal(menuDisplayName("americano", "아메리카노"), "커피");
  assert.equal(menuChoiceById("americano", [{ id: "americano" }])?.id, "americano");
  assert.equal(menuPairTotal("americano", "cookie"), 5000);
  assert.equal(menuPairTotal("strawberry-juice", "sandwich"), 9000);
});

test("describes a menu click as a selection before the calculation question", () => {
  assert.equal(
    calculationDialogueLine("네가 알려줘서 알겠어. 나 두 메뉴가 모두 얼마인지랑 어떻게 계산하는지 헷갈려... 알려줄 수 있어?"),
    "메뉴를 골랐구나! 이제 두 메뉴가 모두 얼마인지랑 어떻게 계산하는지 헷갈려... 알려줄 수 있어?",
  );
  assert.equal(calculationDialogueLine("그럼 두 메뉴는 모두 얼마야?"), "그럼 두 메뉴는 모두 얼마야?");
});

function menuProblem(mormiMenuId, budget) {
  const mormiPick = menu.find((item) => item.id === mormiMenuId);
  return {
    context: { menu_items: menu, mormi_menu_id: mormiMenuId, budget },
    visual: { menu_items: menu, mormi_pick: mormiPick, budget },
  };
}

test("uses the displayed server context for 7,000 won budget boundaries", () => {
  const milk = menuProblem("milk", 7000);
  assert.deepEqual(validateMenuSelectionContext(milk.context, milk.visual, "strawberry-juice"), {
    valid: true, mormiMenuId: "milk", childMenuId: "strawberry-juice", budget: 7000, total: 6000,
  });
  assert.equal(validateMenuSelectionContext(milk.context, milk.visual, "sandwich").valid, true);

  const cake = menuProblem("strawberry-cake", 7000);
  const over = validateMenuSelectionContext(cake.context, cake.visual, "americano");
  assert.equal(over.valid && over.total > over.budget, true);
});

test("rejects duplicate or mismatched display context instead of guessing a budget result", () => {
  const problem = menuProblem("milk", 7000);
  assert.deepEqual(validateMenuSelectionContext(problem.context, problem.visual, "milk"), { valid: false, reason: "duplicate" });
  assert.deepEqual(validateMenuSelectionContext(problem.context, { ...problem.visual, budget: 8000 }, "cookie"), { valid: false, reason: "mismatch" });
  assert.deepEqual(validateMenuSelectionContext(undefined, problem.visual, "cookie"), { valid: false, reason: "missing" });
});

test("renders only queue counts represented by the fixed queue image", () => {
  const exact = {
    scenario: { queue_context: { left_count: 2, right_count: 1 } },
    visual: { type: "cafe_queues", data: { left_people: 2, right_people: 1 } },
  };
  assert.equal(cafeProblemContextMatches("queue", exact.scenario, exact.visual), true);
  assert.equal(cafeProblemContextMatches("queue", exact.scenario, {
    ...exact.visual,
    data: { left_people: 1, right_people: 2 },
  }), false);
  assert.equal(cafeProblemContextMatches("queue", {
    queue_context: { left_count: 3, right_count: 1 },
  }, exact.visual), false);
});

test("rejects menu price, duplicate, and visual drift before rendering", () => {
  const exact = menuProblem("milk", 7000);
  const scenario = { cafe_context: exact.context };
  const visual = { type: "cafe_menu", data: exact.visual };
  assert.equal(cafeProblemContextMatches("menu", scenario, visual), true);

  const wrongPrice = exact.context.menu_items.map((item) => item.id === "cookie" ? { ...item, price: 2500 } : item);
  assert.equal(cafeProblemContextMatches("menu", {
    cafe_context: { ...exact.context, menu_items: wrongPrice },
  }, visual), false);
  assert.equal(cafeProblemContextMatches("menu", {
    cafe_context: { ...exact.context, menu_items: [...exact.context.menu_items.slice(0, -1), exact.context.menu_items[0]] },
  }, visual), false);
  assert.equal(cafeProblemContextMatches("menu", scenario, {
    type: "cafe_menu",
    data: { ...exact.visual, budget: 8000 },
  }), false);
});

test("keeps calculation and change visuals on the canonical menu prices", () => {
  const context = { cafe_context: { menu_items: menu, mormi_menu_id: "sandwich", child_menu_id: "cookie" } };
  const exactCalculation = {
    type: "cafe_calculation",
    data: {
      operation: "addition",
      left: 5000,
      right: 2000,
      mormi_menu: menu.find((item) => item.id === "sandwich"),
      child_menu: menu.find((item) => item.id === "cookie"),
    },
  };
  assert.equal(cafeProblemContextMatches("calculate", context, exactCalculation), true);
  assert.equal(cafeProblemContextMatches("calculate", context, {
    ...exactCalculation,
    data: { ...exactCalculation.data, right: 3000 },
  }), false);
  assert.equal(cafeProblemContextMatches("change", context, {
    type: "cafe_calculation",
    data: {
      operation: "subtraction",
      left: 10000,
      right: 4500,
      mormi_menu: menu.find((item) => item.id === "sandwich"),
    },
  }), false);
});

test("lets queue learners answer before revealing server choices", () => {
  const choices = [
    { id: "left", label: "왼쪽" },
    { id: "right", label: "오른쪽" },
    { id: "3", label: "3명" },
  ];

  assert.equal(choiceIdForTypedAnswer("왼쪽 줄", choices), "left");
  assert.equal(choiceIdForTypedAnswer("3", choices), "3");
  assert.equal(choiceIdForTypedAnswer("잘 모르겠어", choices), null);

  const moneyChoices = [
    { id: "9000", label: "9,000원" },
    { id: "10000", label: "10,000원" },
    { id: "11000", label: "11,000원" },
  ];
  assert.equal(choiceIdForTypedAnswer("5,000원씩 2명이니까 모두 10,000원이야", moneyChoices), "10000");
  assert.equal(choiceIdForTypedAnswer("9,000원 아니면 10,000원", moneyChoices), null);
});

test("uses a local child menu pick to construct one server-owned calculation problem", async () => {
  const [journey, visual, talk, home, css] = await Promise.all([
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeStageVisual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeTalkStage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(visual, /menuChoiceForItem\(item, conversation\.turn\.input\.choices\)/);
  assert.match(visual, /onMenuChoice\?\.\(item\.id, choice\.id\)/);
  assert.match(journey, /choice_ids: \[choice\.id\]/);
  assert.match(journey, /setMormeyMenuId\(randomItem\(menu\)\.id\)/);
  assert.match(journey, /menu\.filter\(\(item\) => item\.id !== mormeyMenuId\)/);
  assert.match(journey, /onClick=\{\(\) => setChildMenuId\(item\.id\)\}/);
  assert.match(journey, /scenario_id: cafeScenarioByStation\[1\][\s\S]{0,260}mormi_menu_id: mormeyMenuId,[\s\S]{0,100}child_menu_id: childMenuId/);
  assert.match(journey, /disabled=\{!childMenuId\}>이 메뉴로 계산하기/);
  assert.doesNotMatch(journey, /cafe_budget_menu|validateMenuSelectionContext|setBudgetModalOpen|const budgets/);
  assert.match(journey, /cafeProblemContextMatches\(stage, conversation\.scenario_context, conversation\.turn\.visual\)/);
  assert.match(journey, /isCafeProblemContractError\(error\)/);
  assert.match(journey, /retryCafeProblem\(problemContextError\)/);
  assert.match(journey, /문제 다시 불러오기/);
  assert.match(journey, /cafeScenarioByStation = \["cafe_queue", "cafe_menu_total", "cafe_change"\]/);
  assert.match(journey, /openCafeDialogue\("queue",[\s\S]{0,220}, "restart"\)/);
  assert.match(journey, /openCafeDialogue\("calculate",[\s\S]{0,320}, "restart"\)/);
  assert.match(journey, /openCafeDialogue\("change",[\s\S]{0,220}, "restart"\)/);
  assert.doesNotMatch(journey, /replayStages\.current\.calculate \? "restart" : "resume"/);

  assert.match(talk, /const centralMenuPicker = inputKind === "choices" && turn\.input\.config\.component === "cafe_menu_picker"/);
  assert.doesNotMatch(talk, /delayedChoices|deferChoices|choiceFallbackVisible|choiceIdForTypedAnswer/);
  assert.doesNotMatch(journey, /queueChoiceFallbackKey|changeChoiceFallbackKey|conversationInputKey|onChoiceFallback/);
  assert.match(talk, /\(inputKind === "choices" \|\| inputKind === "fill"\) && !centralMenuPicker/);
  assert.match(talk, /choice_ids: \[choice\.id\]/);
  assert.match(talk, /cafe-talk-bubble__text[\s\S]*onClick=\{\(\) => onSubmit\(\{ type: "no_response" \}\)\}/);
  assert.match(talk, /cafe-talk-bubble__text[\s\S]*helpLoading && <div className="cafe-help-loading"/);
  assert.match(talk, /const helpCard = visibleHelpCard\(conversation\?\.turn\)/);
  assert.match(talk, /<MormiHelpCard card=\{helpCard\}/);
  assert.doesNotMatch(talk, /cafe-ai-dont-know/);
  assert.match(home, /const teachingHelpCard = visibleHelpCard\(teachingTurn\)/);
  assert.match(home, /<MormiHelpCard card=\{teachingHelpCard\}/);
  assert.doesNotMatch(talk, /helpVisible/);
  assert.doesNotMatch(home, /teachHelpVisible/);
  assert.doesNotMatch(talk, /<MormiTaskAnchor/);
  assert.doesNotMatch(home, /<MormiTaskAnchor/);

  assert.match(css, /\.cafe-help-loading\{margin:2px 0 0/);
  assert.match(css, /\.cafe-talk-menu__grid \{ grid-template-columns:repeat\(3,minmax\(140px,1fr\)\)/);
  assert.match(css, /\.cafe-sum-menu-picker\{/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(visual, /disabled=\{mormiSelected \|\| !choice \|\| sending\}/);
});

test("카페 스테이지 선택 화면은 놀이동산과 같은 카드 중심 구조를 사용한다", async () => {
  const [journey, park, css] = await Promise.all([
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/amusement-park/AmusementPark.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(journey, /<main className="figma-cafe-map">/);
  assert.match(park, /<main className="figma-cafe-map figma-park-map">/);
  assert.match(journey, /figma-cafe-map__progress/);
  assert.match(journey, /figma-cafe-map__stones/);
  assert.doesNotMatch(journey, /figma-cafe-map__heading>[\s\S]{0,900}<button className="figma-cafe-action"/);
  assert.doesNotMatch(css, /\.figma-cafe-map__heading>\.figma-cafe-action/);
});
