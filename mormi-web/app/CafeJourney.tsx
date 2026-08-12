"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { cafeMoney, cafeStations } from "./journey-config";

type CafeStep = "intro" | "order" | "pay" | "done";

const menu = [
  { id: "juice", name: "딸기 주스", price: 6600, image: "/life-missions/juice.webp" },
  { id: "coffee", name: "따뜻한 라테", price: 5100, image: "/life-missions/coffee.webp" },
] as const;

type Props = {
  onBack: () => void;
  onComplete: () => void;
};

export function CafeJourney({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("intro");
  const [selectedId, setSelectedId] = useState<(typeof menu)[number]["id"]>("juice");
  const [counts, setCounts] = useState<Record<number, number>>({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
  const [feedback, setFeedback] = useState("");
  const [paymentAttempts, setPaymentAttempts] = useState(0);
  const selected = menu.find((item) => item.id === selectedId) ?? menu[0];
  const total = useMemo(() => cafeMoney.reduce((sum, money) => sum + money.value * counts[money.value], 0), [counts]);

  function changeMoney(value: number, amount: number) {
    setCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(9, current[value] + amount)) }));
    setFeedback("");
  }

  function checkPayment() {
    const nextAttempt = paymentAttempts + 1;
    setPaymentAttempts(nextAttempt);
    captureMormeyEvent("payment_submitted", {
      menu_id: selected.id,
      target_amount: selected.price,
      paid_amount: total,
      difference: total - selected.price,
      attempt: nextAttempt,
      is_exact: total === selected.price,
      count_100: counts[100],
      count_500: counts[500],
      count_1000: counts[1000],
      count_5000: counts[5000],
    });
    if (total === selected.price) {
      setFeedback("딱 맞게 냈어! 주문 번호를 받아 가자.");
      setStep("done");
      return;
    }
    setFeedback(total < selected.price
      ? `${(selected.price - total).toLocaleString("ko-KR")}원이 더 필요해.`
      : `${(total - selected.price).toLocaleString("ko-KR")}원이 많아. 돈을 조금 넣어 두자.`);
  }

  return (
    <section className="cafe-journey">
      <div className="cafe-journey__backdrop" aria-hidden="true" />
      <div className="cafe-journey__top">
        <button className="journey-back" onClick={onBack}>← 밖으로</button>
        <div className="cafe-station-track" aria-label="카페에서 할 일">
          {cafeStations.map((station, index) => {
            const activeIndex = step === "intro" ? 0 : step === "order" ? 1 : step === "pay" ? 2 : 3;
            return <span key={station} className={index <= activeIndex ? "is-active" : ""}><i>{index + 1}</i>{station}</span>;
          })}
        </div>
      </div>

      {step === "intro" && (
        <div className="cafe-story-card cafe-story-card--intro">
          <div>
            <p className="eyebrow">오늘의 외출 · 카페</p>
            <h1>카페에 가려면?</h1>
            <p>차례를 기다리고, 마실 것을 고른 다음, 가격에 맞게 돈을 내면 돼. 모르미가 옆에서 같이 해 볼게!</p>
            <ol>{cafeStations.map((station, index) => <li key={station}><i>{index + 1}</i><b>{station}</b></li>)}</ol>
            <button className="primary-button" onClick={() => { captureMormeyEvent("cafe_started"); setStep("order"); }}>카페 문 열기 <span className="button-arrow" /></button>
          </div>
          <Image src="/morami/happy-cutout.png" alt="카페에 함께 온 모르미" width={600} height={600} priority unoptimized />
        </div>
      )}

      {step === "order" && (
        <div className="cafe-story-card">
          <div className="cafe-counter-copy">
            <p className="eyebrow">어서 오세요!</p>
            <h1>무엇을 마실까요?</h1>
            <p>마시고 싶은 메뉴 하나를 골라 주문해요.</p>
          </div>
          <div className="cafe-menu-grid">
            {menu.map((item) => (
              <button key={item.id} className={selectedId === item.id ? "is-selected" : ""} onClick={() => { setSelectedId(item.id); setCounts({ 100: 0, 500: 0, 1000: 0, 5000: 0 }); setFeedback(""); setPaymentAttempts(0); captureMormeyEvent("cafe_menu_selected", { menu_id: item.id, price: item.price }); }}>
                <Image src={item.image} alt={item.name} width={320} height={240} unoptimized />
                <span><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong></span>
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={() => setStep("pay")}>“{selected.name} 주세요” <span className="button-arrow" /></button>
        </div>
      )}

      {step === "pay" && (
        <div className="cafe-payment-card">
          <div className="cafe-receipt">
            <span>주문한 메뉴</span>
            <Image src={selected.image} alt="주문한 음료" width={220} height={170} unoptimized />
            <h2>{selected.name}</h2>
            <strong>{selected.price.toLocaleString("ko-KR")}원</strong>
          </div>
          <div className="money-wallet">
            <p className="eyebrow">지갑에서 돈을 꺼내요</p>
            <h1>얼마를 내면 될까?</h1>
            <div className="money-picker">
              {cafeMoney.map((money) => (
                <article key={money.value} className={`money-picker__item money-picker__item--${money.kind}`}>
                  <div><Image src={money.image} alt={money.label} width={420} height={250} unoptimized /></div>
                  <b>{money.label}</b>
                  <div className="money-stepper" aria-label={`${money.label} 개수`}>
                    <button onClick={() => changeMoney(money.value, -1)} disabled={counts[money.value] === 0} aria-label={`${money.label} 한 개 빼기`}>−</button>
                    <output>{counts[money.value]}개</output>
                    <button onClick={() => changeMoney(money.value, 1)} aria-label={`${money.label} 한 개 더하기`}>＋</button>
                  </div>
                </article>
              ))}
            </div>
            <div className="payment-total"><span>내가 꺼낸 돈</span><strong>{total.toLocaleString("ko-KR")}원</strong></div>
            {feedback && <p className="payment-feedback" role="status">{feedback}</p>}
            <button className="primary-button" onClick={checkPayment} disabled={total === 0}>이대로 낼게요 <span className="button-arrow" /></button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="cafe-story-card cafe-story-card--done">
          <Image src="/morami/celebrate-cutout.png" alt="함께 기뻐하는 모르미" width={600} height={600} unoptimized />
          <div>
            <p className="eyebrow">주문 번호 17번</p>
            <h1>주문했어!</h1>
            <p>{feedback} 이제 음료를 받고 모르미와 자리에 앉아요.</p>
            <button className="primary-button" onClick={() => { captureMormeyEvent("cafe_journey_completed", { menu_id: selected.id, payment_attempts: paymentAttempts }); onComplete(); }}>모르미와 집으로 <span className="button-arrow" /></button>
          </div>
        </div>
      )}
    </section>
  );
}
