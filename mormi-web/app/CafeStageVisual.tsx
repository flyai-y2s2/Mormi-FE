"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { menuImage } from "./cafe-menu";
import type { MormiConversation } from "./mormi-dialogue";

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

function MenuCard({ item, badge }: { item: MenuLike; badge?: string }) {
  return (
    <article className="cafe-talk-card">
      <Image src={menuImage(item.id, item.image_url)} alt={item.name ?? "메뉴"} width={190} height={120} unoptimized />
      <b>{item.name}</b>
      <strong>{won(item.price)}원</strong>
      {badge && <small>{badge}</small>}
    </article>
  );
}

export function CafeStageVisual({
  conversation,
  fallback,
}: {
  conversation: MormiConversation | undefined;
  /** 첫 턴이 오기 전에 보여 줄 그림. 화면이 이미 뽑아 둔 문제를 그린다. */
  fallback?: ReactNode;
}) {
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
          {items.map((item) => (
            <article
              key={item.id}
              className={["cafe-talk-card", item.id === mormiPick?.id ? "is-mormi" : "", item.id === childPick?.id ? "is-child" : ""].filter(Boolean).join(" ")}
            >
              <Image src={menuImage(item.id, item.image_url)} alt={item.name ?? "메뉴"} width={170} height={105} unoptimized />
              <b>{item.name}</b>
              <strong>{won(item.price)}원</strong>
              {item.id === mormiPick?.id && <small>모르미가 골랐어요</small>}
              {item.id === childPick?.id && <small>내가 골랐어요</small>}
            </article>
          ))}
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
              <Image src="/cafe-money/1000.png" alt="낸 돈" width={190} height={120} unoptimized />
              <b>낸 돈</b>
              <strong>{won(data.left)}원</strong>
            </article>
          : leftItem
            ? <MenuCard item={leftItem} badge="모르미가 고른 메뉴" />
            : <PriceCard label="모르미 메뉴" amount={data.left} />}
        <b aria-hidden="true">{subtraction ? "−" : "＋"}</b>
        {rightItem
          ? <MenuCard item={rightItem} badge={subtraction ? "모르미가 주문한 메뉴" : "내가 고른 메뉴"} />
          : <PriceCard label={subtraction ? "메뉴 값" : "내 메뉴"} amount={data.right} />}
        <b aria-hidden="true">=</b>
        <span className="cafe-talk-equation__answer" aria-label="아직 모르는 값">?</span>
      </div>
    );
  }

  if (type === "success") {
    return <p className="cafe-talk-success">★ 모르미가 다 배웠어요!</p>;
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
