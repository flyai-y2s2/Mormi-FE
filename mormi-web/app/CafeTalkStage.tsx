"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { DictionaryModal } from "./DictionaryCard";
import type { MormiConversation, MormiMood, MormiResponseType } from "./mormi-dialogue";
import { MormiChoiceContent, MormiHelpCard, MormiTaskAnchor } from "./MormiDialogueUi";

/**
 * 카페의 네 스테이지가 함께 쓰는 대화 화면.
 *
 * 아이는 위에서 아래로 한 줄기로 읽는다: ① 모르미의 질문 → ② 문제 그림 → ③ 내가 알려주기.
 * 세 덩이를 한 화면(100svh) 안에 담아, 답을 쓰려고 아래로 스크롤할 일이 없게 한다.
 * 입력 경로는 언제나 모르미 대화 하나뿐이다. 화면이 따로 채점하는 폼은 두지 않는다.
 */

export type CafeDialogueResponse = {
  type: MormiResponseType;
  text?: string;
  choice_ids?: string[];
  values?: Record<string, string | number | boolean | string[]>;
};

const moodImages: Record<MormiMood, string> = {
  curious: "/morami/bright-cutout.png",
  listening: "/morami/calm-cutout.png",
  thinking: "/morami/confused-cutout.png",
  relieved: "/morami/happy-cutout.png",
  celebrating: "/morami/celebrate-cutout.png",
};

/** 대화가 아직 오지 않았을 때의 표정. 첫 질문을 기다리는 얼굴이다. */
const waitingImage = "/morami/confused-cutout.png";

export function CafeTalkStage({
  conversation,
  line,
  fallbackLine,
  inputText,
  sending,
  onInput,
  onSubmit,
  onBack,
  children,
}: {
  conversation: MormiConversation | undefined;
  line: string | undefined;
  fallbackLine: string;
  inputText: string;
  sending: boolean;
  onInput: (value: string) => void;
  onSubmit: (response: CafeDialogueResponse) => void;
  onBack: () => void;
  /** 스테이지별 문제 그림. 남는 세로 공간을 전부 가져간다. */
  children: ReactNode;
}) {
  const mood = conversation?.turn.mormi.mood;
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  return (
    <main className="figma-cafe-panel cafe-talk">
      <div className="cafe-talk-toolbar">
        <button className="cafe-talk-back" onClick={onBack}><span aria-hidden="true">←</span> 이전으로</button>
        {conversation?.conversation_id && <button type="button" className="cafe-talk-note" aria-label="궁금해 사전 열기" onClick={() => setDictionaryOpen(true)}><span aria-hidden="true">▤</span> 궁금해 사전</button>}
      </div>

      <section className="cafe-talk-flow">
        <section className="cafe-talk-bubble">
          <Image className="cafe-talk-morami" src={mood ? moodImages[mood] : waitingImage} alt="모르미" width={300} height={360} unoptimized />
          <div className="cafe-talk-bubble__text">
            <b>모르미</b>
            <p>{line || fallbackLine}</p>
          </div>
        </section>
        {/* 문제 문구는 모르미 대화에서 이미 물어본다. 그림 위에 같은 질문을 또 두지 않는다. */}
        <div className="cafe-talk-stage">{children}</div>
        <aside className="cafe-talk-answer">
          <CafeDialogueControls
            conversation={conversation}
            inputText={inputText}
            sending={sending}
            onInput={onInput}
            onSubmit={onSubmit}
          />
        </aside>
      </section>
      {dictionaryOpen && conversation?.conversation_id && <DictionaryModal conversationId={conversation.conversation_id} onClose={() => setDictionaryOpen(false)} />}
    </main>
  );
}

export function CafeDialogueControls({
  conversation,
  inputText,
  sending,
  onInput,
  onSubmit,
}: {
  conversation: MormiConversation | undefined;
  inputText: string;
  sending: boolean;
  onInput: (value: string) => void;
  onSubmit: (response: CafeDialogueResponse) => void;
}) {
  if (!conversation || conversation.turn.state_version === 0 || conversation.turn.status === "completed") return null;
  const { turn } = conversation;
  const inputKind = turn.input.kind;
  const completionValues = turn.input.config.completion_values;
  const actionValues = completionValues && typeof completionValues === "object" && !Array.isArray(completionValues)
    ? completionValues as Record<string, string | number | boolean | string[]>
    : { completed: true };
  const structuredValues = () => {
    const numbers = inputText.match(/\d[\d,]*/g)?.map((value) => Number(value.replaceAll(",", ""))) ?? [];
    if (inputKind === "count") {
      return Object.fromEntries(
        turn.input.target_slots
          .slice(0, numbers.length)
          .map((slot, index) => [slot, numbers[index]]),
      );
    }
    if (inputKind === "equation" && numbers.length > 0) {
      const resultSlot = turn.input.target_slots.includes("result")
        ? "result"
        : turn.input.target_slots[0];
      return resultSlot ? { [resultSlot]: numbers.at(-1)! } : {};
    }
    return {};
  };

  return <aside className="cafe-ai-followup" aria-live="polite">
    <MormiTaskAnchor anchor={turn.task_anchor} />
    <MormiHelpCard card={turn.help_card} />
    {inputKind === "text" && <form onSubmit={(event) => {
      event.preventDefault();
      if (!inputText.trim() || sending) return;
      onSubmit({ type: "text", text: inputText.trim() });
    }}>
      <label>모르미에게 이어서 알려주기
        <input value={inputText} onChange={(event) => onInput(event.target.value)} placeholder={turn.input.placeholder || "짧게 알려줘"} />
      </label>
      <button type="submit" disabled={!inputText.trim() || sending}>{sending ? "전하는 중…" : turn.input.submit_label || "알려주기"}</button>
    </form>}
    {(inputKind === "choices" || inputKind === "fill") && <div className="cafe-ai-choices">
      {turn.input.choices.filter((choice) => !choice.disabled).map((choice) => <button key={choice.id} disabled={sending} onClick={() => onSubmit({ type: inputKind === "fill" ? "fill" : "choice", choice_ids: [choice.id] })}><MormiChoiceContent choice={choice} /></button>)}
    </div>}
    {(inputKind === "count" || inputKind === "equation") && <form onSubmit={(event) => {
      event.preventDefault();
      const values = structuredValues();
      if (Object.keys(values).length === 0 || sending) return;
      onSubmit({ type: inputKind, values });
    }}>
      <label>{inputKind === "count" ? "센 숫자를 차례로 적기" : "계산한 값 적기"}
        <input inputMode="numeric" value={inputText} onChange={(event) => onInput(event.target.value)} placeholder={inputKind === "count" ? "예: 3, 5" : "예: 8100"} />
      </label>
      <button type="submit" disabled={!inputText.trim() || sending}>{sending ? "전하는 중…" : turn.input.submit_label || "알려주기"}</button>
    </form>}
    {(inputKind === "joint" || inputKind === "button") && <button className="figma-cafe-action" disabled={sending} onClick={() => onSubmit({ type: "action", values: actionValues })}>{turn.input.submit_label || "도움 카드와 같이 해보기"}</button>}
    {inputKind !== "none" && inputKind !== "joint" && inputKind !== "button" && <button className="cafe-ai-dont-know" disabled={sending} onClick={() => onSubmit({ type: "no_response" })}>잘 모르겠어</button>}
  </aside>;
}
