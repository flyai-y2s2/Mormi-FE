"use client";

import Image from "next/image";
import { helpBodyIsRepeatedByVisual } from "./help-card";
import type { MormiChoice, MormiTurn } from "./mormi-dialogue";

type HelpCard = NonNullable<MormiTurn["help_card"]>;

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function formatValue(value: unknown) {
  const number = finiteNumber(value);
  if (number !== null) return number.toLocaleString("ko-KR");
  return textValue(value) ?? "";
}

function HelpVisual({ card }: { card: HelpCard }) {
  const data = card.visual_data ?? {};
  const type = card.visual_type;

  if (type === "number_cards") {
    const cards = Array.isArray(data.cards) ? data.cards.filter((value) => finiteNumber(value) !== null) : [];
    return cards.length > 0 && <div className="mormi-help-numbers" aria-label="비교할 수">
      {cards.map((value, index) => <strong key={`${value}-${index}`}>{formatValue(value)}</strong>)}
    </div>;
  }

  if (type === "joint_steps") {
    const steps = Array.isArray(data.steps) ? data.steps.filter((value): value is string => typeof value === "string") : [];
    return steps.length > 0 && <ol className="mormi-help-steps">
      {steps.map((step, index) => <li key={`${step}-${index}`}><i>{index + 1}</i><span>{step}</span></li>)}
    </ol>;
  }

  if (["place_value_equation", "money_calculation", "joint_money_calculation"].includes(type ?? "")) {
    const left = formatValue(data.left);
    const right = formatValue(data.right);
    const operation = textValue(data.operation) ?? "+";
    const result = formatValue(data.result);
    if (!left || !right) return null;
    return <div className="mormi-help-equation" aria-label="계산 도움">
      <strong>{left}</strong><span>{operation}</span><strong>{right}</strong>
      {result && <><span>=</span><strong>{result}</strong></>}
    </div>;
  }

  if (type === "budget_meter") {
    const budget = finiteNumber(data.budget);
    const price = finiteNumber(data.mormi_price);
    if (budget === null || price === null) return null;
    const ratio = Math.min(100, Math.max(0, price / Math.max(1, budget) * 100));
    return <div className="mormi-help-budget">
      <div><span>모르미 메뉴</span><strong>{price.toLocaleString("ko-KR")}원</strong></div>
      <div className="mormi-help-budget__track"><i style={{ width: `${ratio}%` }} /></div>
      <small>예산 {budget.toLocaleString("ko-KR")}원</small>
    </div>;
  }

  if (type === "budget_menu_help") {
    const budget = finiteNumber(data.budget);
    const total = finiteNumber(data.total);
    const suggested = textValue(data.suggested_menu);
    if (budget === null && total === null && !suggested) return null;
    return <div className="mormi-help-menu">
      {suggested && <strong>{suggested}</strong>}
      {total !== null && <span>합계 {total.toLocaleString("ko-KR")}원</span>}
      {budget !== null && <small>예산 {budget.toLocaleString("ko-KR")}원 안에서 골라요</small>}
    </div>;
  }

  if (type === "cafe_menu_focus") {
    const menu = textValue(data.mormi_menu);
    return menu && <div className="mormi-help-menu"><strong>{menu}</strong><small>모르미가 고른 메뉴</small></div>;
  }

  if (type === "joint_reading_card") {
    const text = textValue(data.text);
    return text && <blockquote className="mormi-help-reading">{text}</blockquote>;
  }

  return null;
}

export function MormiHelpCard({ card }: { card: MormiTurn["help_card"] }) {
  if (!card?.visible) return null;
  return <details className={`mormi-help-card mormi-help-card--${card.level}`} open={card.auto_open}>
    <summary><span aria-hidden="true">●</span><strong>{card.title}</strong></summary>
    <div className="mormi-help-card__body">
      {!helpBodyIsRepeatedByVisual(card) && <p>{card.body}</p>}
      <HelpVisual card={card} />
    </div>
  </details>;
}

export function MormiTaskAnchor({ anchor }: { anchor: MormiTurn["task_anchor"] }) {
  if (!anchor) return null;
  return <section className="mormi-task-anchor" aria-label={anchor.title}>
    <strong>{anchor.title}</strong>
    <p>{anchor.prompt}</p>
    {anchor.completed_items.length > 0 && <ul aria-label="이미 알려준 내용">
      {anchor.completed_items.map((item) => <li key={item.slot_id}><span aria-hidden="true">✓</span>{item.display_text}</li>)}
    </ul>}
  </section>;
}

export function MormiChoiceContent({ choice }: { choice: MormiChoice }) {
  return <>
    {choice.image_url && <Image className="mormi-choice-image" src={choice.image_url} alt="" width={88} height={88} unoptimized />}
    <span>{choice.label}</span>
  </>;
}
