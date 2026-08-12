"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { cafeMoney, cafeStations } from "./journey-config";

type CafeStep = "overview" | "queue" | "note" | "menu" | "sum" | "pay" | "change" | "done";

const menu = [
  { id: "americano", name: "아메리카노", price: 3000, image: "/life-missions/coffee.webp", category: "음료" },
  { id: "milk", name: "우유", price: 2000, image: "/life-missions/products/milk.jpg", category: "음료" },
  { id: "tea", name: "아이스티", price: 3500, image: "/life-missions/juice.webp", category: "음료" },
  { id: "cookie", name: "쿠키", price: 1500, image: "/life-missions/snackshop.jpg", category: "베이커리" },
  { id: "cake", name: "딸기 케이크", price: 5000, image: "/life-missions/giftshop.jpg", category: "베이커리" },
  { id: "sandwich", name: "샌드위치", price: 4000, image: "/life-missions/bread.webp", category: "베이커리" },
] as const;

const requestedMenu = ["tea", "cookie"];

const stationCopy = [
  ["줄 서기", "차례를 지키며 내 순서를 기다려요."],
  ["메뉴 고르기", "음료와 베이커리 메뉴를 보고 골라요."],
  ["계산하기", "가격을 더하고 알맞은 돈을 내요."],
  ["거스름돈 받기", "받은 돈과 영수증을 천천히 확인해요."],
] as const;

type Props = { onBack: () => void; onComplete: () => void };

export function CafeJourney({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueHelp, setQueueHelp] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);
  const [sumFeedback, setSumFeedback] = useState("");
  const [counts, setCounts] = useState<Record<number, number>>({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [changeFeedback, setChangeFeedback] = useState("");
  const selectedTotal = menu.filter((item) => selectedMenu.includes(item.id)).reduce((sum, item) => sum + item.price, 0);
  const paid = useMemo(() => cafeMoney.reduce((sum, money) => sum + money.value * counts[money.value], 0), [counts]);

  const stationIndex = step === "overview" ? journeyProgress : step === "queue" || step === "note" ? 0 : step === "menu" ? 1 : step === "sum" || step === "pay" ? 2 : 3;
  const earnedStars = step === "done" ? 4 : journeyProgress;

  function openStation(index: number) {
    if (index > journeyProgress) return;
    setStep((["queue", "menu", "sum", "change"] as CafeStep[])[index]);
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  function chooseQueue(answer: number) {
    if (answer === 2) {
      setQueueFeedback("맞아! 사람이 더 적은 오른쪽 줄에 서면 돼.");
      captureMormeyEvent("cafe_queue_answered", { correct: true, scaffold_used: queueHelp });
      setJourneyProgress((progress) => Math.max(progress, 1));
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
      setJourneyProgress((progress) => Math.max(progress, 3));
      window.setTimeout(() => setStep("overview"), 650);
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
      <div className="cafe-game-hud"><span>오늘의 카페 퀘스트</span><div><i style={{ width: `${(earnedStars / 4) * 100}%` }} /></div><strong>⭐ {earnedStars}/4</strong></div>

      {step === "overview" && <div className="cafe-overview-card cafe-stage-map">
        <p className="eyebrow">오늘의 외출 · 카페</p><h1>돌다리를 따라 카페 미션!</h1><p>완료한 돌 다음에 새 미션이 열려요.</p>
        <div className="cafe-water-path" aria-hidden="true"><i /><i /></div>
        <div className="cafe-process-grid">{stationCopy.map(([title, description], index) => <button key={title} className={`${index < journeyProgress ? "is-complete" : ""} ${index === journeyProgress ? "is-current" : ""}`} disabled={index > journeyProgress} onClick={() => { if (index === 0 && journeyProgress === 0) captureMormeyEvent("cafe_started"); openStation(index); }}><i>{index < journeyProgress ? "✓" : index + 1}</i><span>{["👥", "🥤", "🧮", "🧾"][index]}</span><h2>{index + 1}. {title}</h2><p>{description}</p><strong>{index > journeyProgress ? "🔒 아직 잠김" : index < journeyProgress ? "다시 해보기" : "연습하기 →"}</strong></button>)}</div>
        <div className="cafe-stage-guide"><span>{["👥", "🥤", "🧮", "🧾"][journeyProgress]}</span><div><b>{stationCopy[journeyProgress][0]}</b><p>{stationCopy[journeyProgress][1]}</p></div><button onClick={() => openStation(journeyProgress)}>연습하기</button></div>
      </div>}

      {step === "queue" && <div className="cafe-station-scene cafe-station-scene--queue">
        <div className="queue-people" aria-label="왼쪽 줄 세 명, 오른쪽 줄 두 명"><div><span>●</span><span>●</span><span>●</span><b>왼쪽 줄</b></div><div><span>●</span><span>●</span><b>오른쪽 줄</b></div></div>
        <div className="cafe-dialogue"><Image src="/morami/confused-cutout.png" alt="고민하는 모르미" width={360} height={360} unoptimized /><div><b>모르미</b><p>어? 주문하려면 줄을 서야 하나 봐. 어느 줄에 서면 좋을지 모르겠어…</p><strong>왼쪽 줄과 오른쪽 줄에는 각각 사람이 몇 명씩 있어?</strong>{queueHelp && <small>사람이 더 적은 줄을 찾아보자.</small>}<div>{[1, 2, 3].map((answer) => <button key={answer} onClick={() => chooseQueue(answer)}>{answer}명 있어</button>)}</div><button className="cafe-help-link" onClick={() => setQueueHelp(true)}>잘 모르겠어</button>{queueFeedback && <em role="status">{queueFeedback}</em>}</div></div>
      </div>}

      {step === "note" && <div className="star-note-card"><div className="reward-pop">⭐ +1</div><Image src="/morami/bright-cutout.png" alt="별노트를 쓰는 모르미" width={360} height={360} unoptimized /><div><span>⭐ 모르미의 별노트</span><h1>줄 설 때는 사람이 더 적은 줄에 서면 좋아!</h1><p>오른쪽 줄이 더 사람이 적다는 걸 네가 알려줬어. 잊지 않게 적어둘게!</p><button className="primary-button" onClick={() => setStep("overview")}>다음 돌다리 열기 →</button></div></div>}

      {step === "menu" && <div className="cafe-mission-card"><div className="mission-title"><div><p className="eyebrow">오늘의 카페 미션</p><h1>10,000원으로 주문해요</h1><p>모르미가 먹고 싶은 아이스티와 쿠키를 담아줘요.</p></div><strong>받은 돈<br /><b>10,000원</b></strong></div><div className="cafe-menu-grid">{menu.map((item) => <button key={item.id} className={selectedMenu.includes(item.id) ? "is-selected" : ""} onClick={() => toggleMenu(item.id)}><Image src={item.image} alt={item.name} width={360} height={240} unoptimized /><span><small>{item.category}</small><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong></span></button>)}</div><div className="menu-running-total"><span>담은 메뉴</span><strong>{selectedTotal.toLocaleString("ko-KR")}원</strong></div><button className="primary-button" disabled={selectedMenu.length !== requestedMenu.length || !requestedMenu.every((id) => selectedMenu.includes(id))} onClick={() => { captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal }); setJourneyProgress((progress) => Math.max(progress, 2)); setStep("overview"); }}>주문하기 →</button></div>}

      {step === "sum" && <div className="cafe-explain-card"><div className="cafe-dialogue cafe-dialogue--sum"><Image src="/morami/confused-cutout.png" alt="합계가 궁금한 모르미" width={360} height={360} unoptimized /><div><b>모르미</b><h1>왜 5,000원일까요?</h1><p>아이스티랑 쿠키를 담았는데 왜 5,000원이 됐어? 나 궁금해!</p><div className="sum-expression"><span>3,500</span><b>＋</b><span>1,500</span><b>=</b><strong>?</strong></div><div className="sum-choices">{[4500, 5000, 5500].map((answer) => <button key={answer} onClick={() => { if (answer === 5000) { setSumFeedback("맞아! 두 메뉴 값을 더하면 5,000원이야."); window.setTimeout(() => setStep("pay"), 650); } else setSumFeedback("천 원과 백 원 자리끼리 다시 더해 보자."); }}>{answer.toLocaleString("ko-KR")}원</button>)}</div>{sumFeedback && <em role="status">{sumFeedback}</em>}</div></div></div>}

      {step === "pay" && <div className="cafe-payment-card"><div className="cafe-receipt"><span>주문 합계</span>{menu.filter((item) => requestedMenu.includes(item.id)).map((item) => <p key={item.id}>{item.name}<b>{item.price.toLocaleString("ko-KR")}원</b></p>)}<strong>5,000원</strong></div><div className="money-wallet"><p className="eyebrow">계산하기</p><h1>받은 돈 10,000원을 내요</h1><p>돈 아래의 +와 −를 눌러 낼 돈을 직접 만들어요.</p><div className="money-picker">{cafeMoney.map((money) => <article key={money.value} className={`money-picker__item money-picker__item--${money.kind}`}><div><Image src={money.image} alt={money.label} width={420} height={250} unoptimized /></div><b>{money.label}</b><div className="money-stepper"><button onClick={() => changeMoney(money.value, -1)} disabled={!counts[money.value]}>−</button><output>{counts[money.value]}개</output><button onClick={() => changeMoney(money.value, 1)}>＋</button></div></article>)}</div><div className="payment-total"><span>내가 낼 돈</span><strong>{paid.toLocaleString("ko-KR")}원</strong></div>{paymentFeedback && <p className="payment-feedback" role="status">{paymentFeedback}</p>}<button className="primary-button" onClick={checkPayment} disabled={!paid}>직원에게 내기 →</button></div></div>}

      {step === "change" && <div className="change-card"><Image src="/morami/surprised-cutout.png" alt="거스름돈을 확인하는 모르미" width={380} height={380} unoptimized /><div><p className="eyebrow">거스름돈 받기</p><h1>얼마를 돌려받아야 할까?</h1><div className="change-equation"><span>낸 돈 10,000원</span><b>−</b><span>메뉴 5,000원</span><b>=</b><strong>?</strong></div><div className="change-choices">{[4000, 5000, 6000].map((answer) => <button key={answer} onClick={() => { if (answer === 5000) { setChangeFeedback("맞아! 5,000원과 영수증을 받으면 돼."); setJourneyProgress(4); window.setTimeout(() => setStep("done"), 700); } else setChangeFeedback("낸 돈에서 메뉴 값을 빼 보자."); }}>{answer.toLocaleString("ko-KR")}원</button>)}</div>{changeFeedback && <p role="status">{changeFeedback}</p>}</div></div>}

      {step === "done" && <div className="cafe-story-card cafe-story-card--done"><div className="quest-clear">QUEST CLEAR!<b>⭐ +4</b></div><Image src="/morami/celebrate-cutout.png" alt="카페 이용을 마친 모르미" width={600} height={600} unoptimized /><div><p className="eyebrow">카페 미션 완료</p><h1>우리 힘으로 주문했어!</h1><p>줄을 서고, 메뉴를 고르고, 계산하고, 거스름돈까지 확인했어요.</p><button className="primary-button" onClick={() => { captureMormeyEvent("cafe_journey_completed", { order_total: 5000, paid: 10000, change: 5000 }); onComplete(); }}>모르미와 집으로 →</button></div></div>}
    </section>
  );
}
