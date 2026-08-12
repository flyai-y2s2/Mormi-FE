"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { cafeMoney, cafeStations } from "./journey-config";

type CafeStep = "overview" | "queue" | "note" | "menu" | "sum" | "pay" | "change" | "done";

const menu = [
  { id: "tea", name: "아이스티", price: 3500, image: "/life-missions/juice.webp" },
  { id: "cookie", name: "쿠키", price: 1500, image: "/life-missions/snackshop.jpg" },
] as const;

const stationCopy = [
  ["줄 서기", "차례를 지키며 내 순서를 기다려요."],
  ["음료 선택하기", "메뉴를 보고 마시고 싶은 음료를 골라요."],
  ["음료 계산하기", "가격을 확인하고 알맞은 돈을 내요."],
  ["거스름돈 받기", "받은 돈과 영수증을 천천히 확인해요."],
] as const;

type Props = { onBack: () => void; onComplete: () => void };

export function CafeJourney({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [queueHelp, setQueueHelp] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);
  const [sumFeedback, setSumFeedback] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [changeFeedback, setChangeFeedback] = useState("");
  const selectedTotal = menu.filter((item) => selectedMenu.includes(item.id)).reduce((sum, item) => sum + item.price, 0);
  const paid = useMemo(() => cafeMoney.reduce((sum, money) => sum + money.value * counts[money.value], 0), [counts]);

  const stationIndex = step === "overview" || step === "queue" || step === "note" ? 0 : step === "menu" ? 1 : step === "sum" || step === "pay" ? 2 : 3;

  function chooseQueue(answer: number) {
    if (answer === 2) {
      setQueueFeedback("맞아! 사람이 더 적은 오른쪽 줄에 서면 돼.");
      captureMormeyEvent("cafe_queue_answered", { correct: true, scaffold_used: queueHelp });
      window.setTimeout(() => setStep("note"), 650);
    } else {
      setQueueFeedback("사람 수를 한 명씩 다시 세어 볼까?");
      setQueueHelp(true);
      captureMormeyEvent("cafe_queue_answered", { correct: false, answer });
    }
  }

  function toggleMenu(id: string) {
    setSelectedMenu((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function changeMoney(value: number, amount: number) {
    setCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(10, current[value] + amount)) }));
    setPaymentFeedback("");
  }

  function checkPayment() {
    captureMormeyEvent("payment_submitted", { target_amount: 10000, paid_amount: paid, order_total: 5000, difference: paid - 10000, ...Object.fromEntries(cafeMoney.map((money) => [`count_${money.value}`, counts[money.value]])) });
    if (paid === 10000) {
      setPaymentFeedback("좋아! 직원에게 10,000원을 냈어.");
      window.setTimeout(() => setStep("change"), 650);
    } else {
      setPaymentFeedback(paid < 10000 ? `${(10000 - paid).toLocaleString("ko-KR")}원이 더 필요해.` : `${(paid - 10000).toLocaleString("ko-KR")}원을 다시 넣어 두자.`);
    }
  }

  return (
    <section className={`cafe-journey cafe-journey--${step}`}>
      <div className="cafe-journey__top">
        <button className="journey-back" onClick={onBack}>← 외출 장소</button>
        <div className="cafe-station-track" aria-label="카페에서 할 일">{cafeStations.map((station, index) => <span key={station} className={index <= stationIndex ? "is-active" : ""}><i>{index + 1}</i>{station}</span>)}</div>
      </div>

      {step === "overview" && <div className="cafe-overview-card">
        <p className="eyebrow">오늘의 외출 · 카페</p><h1>카페에서는 이렇게 해요</h1><p>차례대로 따라가면 카페 이용이 어렵지 않아요.</p>
        <div className="cafe-process-grid">{stationCopy.map(([title, description], index) => <article key={title}><i>{index + 1}</i><span>{["👥", "🥤", "🪙", "🧾"][index]}</span><h2>{title}</h2><p>{description}</p></article>)}</div>
        <div className="cafe-help-banner">💡 모르는 순간에는 천천히 다시 보고, 직원에게 도움을 요청해도 괜찮아요!</div>
        <button className="primary-button" onClick={() => { captureMormeyEvent("cafe_started"); setStep("queue"); }}>카페 들어가기 <span className="button-arrow" /></button>
      </div>}

      {step === "queue" && <div className="cafe-station-scene cafe-station-scene--queue">
        <div className="queue-people" aria-label="왼쪽 줄 세 명, 오른쪽 줄 두 명"><div><span>●</span><span>●</span><span>●</span><b>왼쪽 줄</b></div><div><span>●</span><span>●</span><b>오른쪽 줄</b></div></div>
        <div className="cafe-dialogue"><Image src="/morami/confused-cutout.png" alt="고민하는 모르미" width={360} height={360} unoptimized /><div><b>모르미</b><p>어? 주문하려면 줄을 서야 하나 봐. 어느 줄에 서면 좋을지 모르겠어…</p><strong>왼쪽 줄과 오른쪽 줄에는 각각 사람이 몇 명씩 있어?</strong>{queueHelp && <small>사람이 더 적은 줄을 찾아보자.</small>}<div>{[1, 2, 3].map((answer) => <button key={answer} onClick={() => chooseQueue(answer)}>{answer}명 있어</button>)}</div><button className="cafe-help-link" onClick={() => setQueueHelp(true)}>잘 모르겠어</button>{queueFeedback && <em role="status">{queueFeedback}</em>}</div></div>
      </div>}

      {step === "note" && <div className="star-note-card"><Image src="/morami/bright-cutout.png" alt="별노트를 쓰는 모르미" width={360} height={360} unoptimized /><div><span>⭐ 모르미의 별노트</span><h1>줄 설 때는 사람이 더 적은 줄에 서면 좋아!</h1><p>오른쪽 줄이 더 사람이 적다는 걸 네가 알려줬어. 잊지 않게 적어둘게!</p><button className="primary-button" onClick={() => setStep("menu")}>메뉴 고르기 →</button></div></div>}

      {step === "menu" && <div className="cafe-mission-card"><div className="mission-title"><div><p className="eyebrow">오늘의 카페 미션</p><h1>10,000원으로 주문해요</h1><p>모르미가 먹고 싶은 아이스티와 쿠키를 담아줘요.</p></div><strong>받은 돈<br /><b>10,000원</b></strong></div><div className="cafe-menu-grid">{menu.map((item) => <button key={item.id} className={selectedMenu.includes(item.id) ? "is-selected" : ""} onClick={() => toggleMenu(item.id)}><Image src={item.image} alt={item.name} width={360} height={240} unoptimized /><span><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong></span></button>)}</div><div className="menu-running-total"><span>담은 메뉴</span><strong>{selectedTotal.toLocaleString("ko-KR")}원</strong></div><button className="primary-button" disabled={selectedMenu.length !== menu.length} onClick={() => { captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal }); setStep("sum"); }}>주문하기 →</button></div>}

      {step === "sum" && <div className="cafe-explain-card"><div className="cafe-dialogue cafe-dialogue--sum"><Image src="/morami/confused-cutout.png" alt="합계가 궁금한 모르미" width={360} height={360} unoptimized /><div><b>모르미</b><h1>왜 5,000원일까요?</h1><p>아이스티랑 쿠키를 담았는데 왜 5,000원이 됐어? 나 궁금해!</p><div className="sum-expression"><span>3,500</span><b>＋</b><span>1,500</span><b>=</b><strong>?</strong></div><div className="sum-choices">{[4500, 5000, 5500].map((answer) => <button key={answer} onClick={() => { if (answer === 5000) { setSumFeedback("맞아! 두 메뉴 값을 더하면 5,000원이야."); window.setTimeout(() => setStep("pay"), 650); } else setSumFeedback("천 원과 백 원 자리끼리 다시 더해 보자."); }}>{answer.toLocaleString("ko-KR")}원</button>)}</div>{sumFeedback && <em role="status">{sumFeedback}</em>}</div></div></div>}

      {step === "pay" && <div className="cafe-payment-card"><div className="cafe-receipt"><span>주문 합계</span>{menu.map((item) => <p key={item.id}>{item.name}<b>{item.price.toLocaleString("ko-KR")}원</b></p>)}<strong>5,000원</strong></div><div className="money-wallet"><p className="eyebrow">음료 계산하기</p><h1>받은 돈 10,000원을 내요</h1><p>돈 아래의 +와 −를 눌러 낼 돈을 직접 만들어요.</p><div className="money-picker">{cafeMoney.map((money) => <article key={money.value} className={`money-picker__item money-picker__item--${money.kind}`}><div><Image src={money.image} alt={money.label} width={420} height={250} unoptimized /></div><b>{money.label}</b><div className="money-stepper"><button onClick={() => changeMoney(money.value, -1)} disabled={!counts[money.value]}>−</button><output>{counts[money.value]}개</output><button onClick={() => changeMoney(money.value, 1)}>＋</button></div></article>)}</div><div className="payment-total"><span>내가 낼 돈</span><strong>{paid.toLocaleString("ko-KR")}원</strong></div>{paymentFeedback && <p className="payment-feedback" role="status">{paymentFeedback}</p>}<button className="primary-button" onClick={checkPayment} disabled={!paid}>직원에게 내기 →</button></div></div>}

      {step === "change" && <div className="change-card"><Image src="/morami/surprised-cutout.png" alt="거스름돈을 확인하는 모르미" width={380} height={380} unoptimized /><div><p className="eyebrow">거스름돈 받기</p><h1>얼마를 돌려받아야 할까?</h1><div className="change-equation"><span>낸 돈 10,000원</span><b>−</b><span>메뉴 5,000원</span><b>=</b><strong>?</strong></div><div className="change-choices">{[4000, 5000, 6000].map((answer) => <button key={answer} onClick={() => { if (answer === 5000) { setChangeFeedback("맞아! 5,000원과 영수증을 받으면 돼."); window.setTimeout(() => setStep("done"), 700); } else setChangeFeedback("낸 돈에서 메뉴 값을 빼 보자."); }}>{answer.toLocaleString("ko-KR")}원</button>)}</div>{changeFeedback && <p role="status">{changeFeedback}</p>}</div></div>}

      {step === "done" && <div className="cafe-story-card cafe-story-card--done"><Image src="/morami/celebrate-cutout.png" alt="카페 이용을 마친 모르미" width={600} height={600} unoptimized /><div><p className="eyebrow">카페 미션 완료</p><h1>우리 힘으로 주문했어!</h1><p>줄을 서고, 메뉴를 고르고, 계산하고, 거스름돈까지 확인했어요.</p><button className="primary-button" onClick={() => { captureMormeyEvent("cafe_journey_completed", { order_total: 5000, paid: 10000, change: 5000 }); onComplete(); }}>모르미와 집으로 →</button></div></div>}
    </section>
  );
}
