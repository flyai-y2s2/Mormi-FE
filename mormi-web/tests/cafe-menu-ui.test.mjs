import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculationDialogueLine, menuChoiceById, menuDisplayName, menuPairTotal } from "../app/cafe-menu.ts";
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

test("lets queue learners answer before revealing server choices", () => {
  const choices = [
    { id: "left", label: "왼쪽" },
    { id: "right", label: "오른쪽" },
    { id: "3", label: "3명" },
  ];

  assert.equal(choiceIdForTypedAnswer("왼쪽 줄", choices), "left");
  assert.equal(choiceIdForTypedAnswer("3", choices), "3");
  assert.equal(choiceIdForTypedAnswer("잘 모르겠어", choices), null);
});

test("keeps help gated and central menu cards as the only menu choice UI", async () => {
  const [journey, visual, talk, home, css] = await Promise.all([
    readFile(new URL("../app/CafeJourney.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeStageVisual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CafeTalkStage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(visual, /menuChoiceById\(item\.id, conversation\.turn\.input\.choices\)/);
  assert.match(visual, /onMenuChoice\?\.\(choice\.id\)/);
  assert.match(journey, /choice_ids: \[choice\.id\]/);
  assert.match(journey, /if \(total === null\)[\s\S]{0,250}return;[\s\S]{0,100}if \(total > budget\)[\s\S]{0,500}setBudgetModalOpen\(true\)[\s\S]{0,100}return;/);
  assert.match(journey, /예산을 넘었어요\. 다른 메뉴를 골라 봐!/);
  assert.match(journey, /const budgets = \[7000, 8000\] as const/);

  assert.match(talk, /const centralMenuPicker = inputKind === "choices" && turn\.input\.config\.component === "cafe_menu_picker"/);
  assert.match(talk, /const delayedChoices = deferChoices && inputKind === "choices" && !centralMenuPicker/);
  assert.match(talk, /choiceIdForTypedAnswer\(inputText, turn\.input\.choices\)/);
  assert.match(talk, /\(!delayedChoices \|\| choiceFallbackVisible\)/);
  assert.match(journey, /deferChoices[\s\S]{0,300}choiceFallbackVisible=\{queueChoiceFallbackKey === conversationInputKey\(cafeConversations\.queue\)\}/);
  assert.match(journey, /conversation=\{cafeConversations\.change\}[\s\S]{0,350}deferChoices[\s\S]{0,200}changeChoiceFallbackKey/);
  assert.match(talk, /onHelpRequest=\{\(\) => onSubmit\(\{ type: "no_response" \}\)\}/);
  assert.match(talk, /helpLoading && <div className="cafe-help-loading"/);
  assert.match(talk, /<MormiHelpCard card=\{helpVisible \? turn\.help_card : null\}/);
  assert.match(home, /<MormiHelpCard card=\{teachHelpVisible \? teachingTurn\?\.help_card \?\? null : null\}/);
  assert.doesNotMatch(talk, /<MormiTaskAnchor/);
  assert.doesNotMatch(home, /<MormiTaskAnchor/);

  assert.match(css, /\.cafe-help-loading\{margin:0 0 12px/);
  assert.match(css, /\.cafe-talk-menu__grid \{ grid-template-columns:repeat\(3,minmax\(140px,1fr\)\)/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
