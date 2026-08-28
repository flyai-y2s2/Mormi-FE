"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { menuChoiceForItem, menuDisplayName, menuImage } from "./cafe-menu";
import type { MormiConversation } from "./mormi-dialogue";
import { useCharacterName } from "./CharacterName";

/**
 * 스테이지의 문제 그림. 모르미가 보낸 TurnContract 의 visual 계약을 그대로 그린다.
 *
 * 화면이 문제를 다시 만들지 않는 게 핵심이다. 메뉴값 계산은 대화가 두 단계로
 * 흘러(메뉴 고르기 → 더하기) visual.type 이 cafe_menu 에서 cafe_calculation 으로
 * 바뀌는데, 계약을 따라 그리면 그 전환이 저절로 따라온다.
 */

type MenuLike = { id?: string; name?: string; price?: number; image_url?: string | null };

function asMenu(value: unknown): MenuLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as MenuLike;
  return typeof item.name === "string" ? item : null;
}

function won(value: unknown) {
  return Number(value ?? 0).toLocaleString("ko-KR");
}

const moneyImageByValue: Record<number, string> = {
  100: "/cafe-money/100.png",
  500: "/cafe-money/500.png",
  1000: "/cafe-money/1000.png",
  5000: "/cafe-money/5000.png",
  10000: "/cafe-money/10000.png",
};

function moneyImage(value: unknown) {
  return moneyImageByValue[Number(value)] ?? "/cafe-money/1000.png";
}

function MenuCard({ item, badge }: { item: MenuLike; badge?: string }) {
  const displayName = menuDisplayName(item.id, item.name);
  return (
    <article className="cafe-talk-card">
      <Image src={menuImage(item.id, item.image_url)} alt={displayName} width={190} height={120} unoptimized />
      <b>{displayName}</b>
      <strong>{won(item.price)}원</strong>
      {badge && <small>{badge}</small>}
    </article>
  );
}

export function CafeStageVisual({
  conversation,
  fallback,
  onMenuChoice,
  sending = false,
}: {
  conversation: MormiConversation | undefined;
  /** 첫 턴이 오기 전에 보여 줄 그림. 화면이 이미 뽑아 둔 문제를 그린다. */
  fallback?: ReactNode;
  /** 서버가 내려준 choice.id를 그대로 돌려준다. 메뉴 배열 위치로 추정하지 않는다. */
  onMenuChoice?: (menuId: string, choiceId: string) => void;
  sending?: boolean;
}) {
  const { displayName: characterName } = useCharacterName();
  if (!conversation || conversation.turn.state_version === 0) return <>{fallback ?? null}</>;
  const { type, data } = conversation.turn.visual;

  if (type === "cafe_queues") {
    const left = Number(data.left_people ?? 0);
    const right = Number(data.right_people ?? 0);
    return <QueueVisual left={left} right={right} />;
  }

  if (type === "cafe_menu") {
    const items = Array.isArray(data.menu_items) ? (data.menu_items as MenuLike[]) : [];
    const mormiPick = asMenu(data.mormi_pick);
    const childPick = asMenu(data.child_pick);
    const budget = typeof data.budget === "number" ? data.budget : null;
    return (
      <div className="cafe-talk-menu">
        {budget !== null && <p className="cafe-talk-menu__budget">오늘 쓸 수 있는 돈 <b>{won(budget)}원</b></p>}
        <div className="cafe-talk-menu__grid">
          {items.map((item) => {
            const choice = menuChoiceForItem(item, conversation.turn.input.choices);
            const mormiSelected = item.id === mormiPick?.id;
            const childSelected = item.id === childPick?.id;
            const displayName = menuDisplayName(item.id, item.name);
            return <button
              type="button"
              key={String(item.id)}
              data-choice-id={choice?.id}
              className={["cafe-talk-card", "is-menu-choice", mormiSelected ? "is-mormi" : "", childSelected ? "is-child" : ""].filter(Boolean).join(" ")}
              disabled={mormiSelected || !choice || sending}
              onClick={() => {
                if (choice && !mormiSelected && typeof item.id === "string") {
                  onMenuChoice?.(item.id, choice.id);
                }
              }}
              aria-label={mormiSelected ? `${displayName}, ${characterName}가 고른 메뉴` : `${displayName} ${won(item.price)}원 선택`}
            >
              <Image src={menuImage(item.id, item.image_url)} alt="" width={170} height={105} unoptimized />
              <b>{displayName}</b>
              <strong>{won(item.price)}원</strong>
              {mormiSelected && <small>{characterName}가 골랐어요</small>}
              {childSelected && <small>내가 골랐어요</small>}
            </button>;
          })}
        </div>
      </div>
    );
  }

  if (type === "cafe_calculation" || type === "money_calculation" || type === "vertical_equation") {
    const subtraction = data.operation === "subtraction";
    const leftItem = subtraction ? null : asMenu(data.mormi_menu);
    const rightItem = subtraction ? asMenu(data.mormi_menu) : asMenu(data.child_menu);
    return (
      <div className="cafe-talk-equation">
        {subtraction
          ? <article className="cafe-talk-card is-money">
              <Image src={moneyImage(data.left)} alt={`${won(data.left)}원 지폐`} width={190} height={120} unoptimized />
              <b>낸 돈</b>
              <strong>{won(data.left)}원</strong>
            </article>
          : leftItem
            ? <MenuCard item={leftItem} badge={`${characterName}가 고른 메뉴`} />
            : <PriceCard label={`${characterName} 메뉴`} amount={data.left} />}
        {!subtraction && <b aria-hidden="true">＋</b>}
        {rightItem
          ? <MenuCard item={rightItem} badge={subtraction ? `${characterName}가 주문한 메뉴` : "내가 고른 메뉴"} />
          : <PriceCard label={subtraction ? "메뉴 값" : "내 메뉴"} amount={data.right} />}
        <b aria-hidden="true">=</b>
        <span className="cafe-talk-equation__answer" aria-label="아직 모르는 값">?</span>
      </div>
    );
  }

  if (type === "success") {
    return <p className="cafe-talk-success">★ {characterName}가 다 배웠어요!</p>;
  }

  return <>{fallback ?? null}</>;
}

/** 줄 서기 그림. 원본 사진은 왼쪽 2명·오른쪽 1명이라, 반대 문제는 같은 장면을 좌우로 뒤집어 쓴다. */
export function QueueVisual({ left, right }: { left: number; right: number }) {
  return (
    <figure className="cafe-talk-queue">
      <Image
        className={left < right ? "is-mirrored" : ""}
        src="/cafe-stages/queue-v2.png"
        alt={`카페 대기줄: 왼쪽 줄 ${left}명, 오른쪽 줄 ${right}명`}
        width={900}
        height={675}
        unoptimized
      />
      <figcaption><span>왼쪽 줄</span><span>오른쪽 줄</span></figcaption>
    </figure>
  );
}

function PriceCard({ label, amount }: { label: string; amount: unknown }) {
  return (
    <article className="cafe-talk-card is-plain">
      <b>{label}</b>
      <strong>{won(amount)}원</strong>
    </article>
  );
}
