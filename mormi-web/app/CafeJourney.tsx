"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { cafeMoney, cafeStations } from "./journey-config";

type CafeStep = "overview" | "queue" | "menu" | "sum" | "change" | "done";

const menu = [
  { id: "americano", name: "아메리카노", price: 3000, image: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 3000, image: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 4000, image: "/figma/cafe/sandwich.png?v=2" },
] as const;

const stationCopy = [
  { title: "줄 서기", description: "더 짧은 줄을 찾아요", image: "/cafe-stages/queue-v2.png" },
  { title: "메뉴 고르기", description: "먹고 싶은 메뉴를 골라요", image: "/cafe-stages/menu-v3.png" },
  { title: "계산하기", description: "돈을 골라 직접 계산해요", image: "/cafe-stages/payment-v3.png" },
  { title: "거스름돈 받기", description: "받을 돈을 확인해요", image: "/cafe-stages/change-v3.png" },
] as const;

type Props = { learnerName: string; onBack: () => void; onComplete: () => void };
type QueueScene = "intro" | "count-both" | "count-left" | "note" | "clear";
type MenuScene = "brief" | "mormey-pick" | "choose" | "thanks";

export function CafeJourney({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueHelp, setQueueHelp] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState("");
  const [queueScene, setQueueScene] = useState<QueueScene>("intro");
  const [queueCountAnswer, setQueueCountAnswer] = useState("");
  const [menuScene, setMenuScene] = useState<MenuScene>("brief");
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);
  const [menuFeedback, setMenuFeedback] = useState("");
  const [paymentCounts, setPaymentCounts] = useState<Record<number, number>>({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [changeCounts, setChangeCounts] = useState<Record<number, number>>({ 500: 0, 1000: 0 });
  const [changeFeedback, setChangeFeedback] = useState("");

  const selectedItems = menu.filter((item) => selectedMenu.includes(item.id));
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.price, 0);
  const paid = useMemo(() => cafeMoney.reduce((sum, money) => sum + money.value * paymentCounts[money.value], 0), [paymentCounts]);
  const changeTotal = 1000 * changeCounts[1000] + 500 * changeCounts[500];
  const changeTarget = 10000 - selectedTotal;
  const stationIndex = step === "overview" ? Math.min(journeyProgress, 3) : step === "queue" ? 0 : step === "menu" ? 1 : step === "sum" ? 2 : 3;

  function returnToMap() {
    setStep("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openStation(index: number) {
    if (index > journeyProgress) return;
    if (index === 0) {
      setQueueScene("intro");
      setQueueCountAnswer("");
      setQueueFeedback("");
      setQueueHelp(false);
    }
    if (index === 1) {
      setMenuScene("brief");
      setSelectedMenu([]);
      setMenuFeedback("");
    }
    if (index === 2) {
      setPaymentCounts({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
      setPaymentFeedback("");
    }
    setStep((["queue", "menu", "sum", "change"] as CafeStep[])[index]);
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  function submitQueueCounts() {
    if (!queueCountAnswer.trim()) return;
    setQueueFeedback("");
    setQueueScene("count-left");
  }

  function chooseLeftCount(count: number) {
    if (count === 3) {
      setQueueFeedback("");
      setQueueScene("note");
      captureMormeyEvent("cafe_queue_answered", { correct: true, scaffold_used: queueHelp, left_count: 3, learner_answer: queueCountAnswer });
      return;
    }
    setQueueFeedback("사람을 앞에서부터 한 명씩 다시 세어 볼까?");
    setQueueHelp(true);
    captureMormeyEvent("cafe_queue_answered", { correct: false, answer: count });
  }

  function finishQueueStory() {
    setJourneyProgress((progress) => Math.max(progress, 1));
    setQueueScene("clear");
  }

  function toggleMenu(id: string) {
    setMenuFeedback("");
    setSelectedMenu((current) => {
      if (id === "strawberry-juice") {
        setMenuFeedback("딸기주스는 모르미가 먼저 골랐어요. 다른 메뉴 하나를 골라 주세요!");
        return current;
      }
      if (current.includes(id)) return current.filter((item) => item !== id);
      const item = menu.find((candidate) => candidate.id === id);
      if (!item) return current;
      if (current.length >= 2) {
        setMenuFeedback("메뉴는 두 개까지 고를 수 있어요.");
        return current;
      }
      const nextTotal = menu.filter((candidate) => [...current, id].includes(candidate.id)).reduce((sum, candidate) => sum + candidate.price, 0);
      if (nextTotal > 10000) {
        setMenuFeedback("가진 돈 10,000원 안에서 골라 주세요.");
        return current;
      }
      return [...current, id];
    });
  }

  function orderMenu() {
    if (selectedMenu.length !== 2) return;
    captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal });
    setMenuScene("thanks");
  }

  function finishMenuStory() {
    setJourneyProgress((progress) => Math.max(progress, 2));
    returnToMap();
  }

  function changePaymentMoney(value: number, amount: number) {
    setPaymentCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(20, current[value] + amount)) }));
    setPaymentFeedback("");
  }

  function checkPayment() {
    captureMormeyEvent("payment_submitted", {
      target_amount: 10000,
      paid_amount: paid,
      order_total: selectedTotal,
      difference: paid - 10000,
      ...Object.fromEntries(cafeMoney.map((money) => [`count_${money.value}`, paymentCounts[money.value]])),
    });
    if (paid === 10000) {
      setPaymentFeedback("좋아. 직원에게 10,000원을 냈어!");
      setJourneyProgress((progress) => Math.max(progress, 3));
      window.setTimeout(returnToMap, 700);
    } else {
      setPaymentFeedback(paid < 10000 ? `${(10000 - paid).toLocaleString("ko-KR")}원이 더 필요해.` : `${(paid - 10000).toLocaleString("ko-KR")}원을 다시 넣어 두자.`);
    }
  }

  function changeChangeMoney(value: 500 | 1000, amount: number) {
    setChangeCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(20, current[value] + amount)) }));
    setChangeFeedback("");
  }

  function checkChange() {
    if (changeTotal === changeTarget) {
      setChangeFeedback("맞아. 받아야 할 거스름돈을 정확히 담았어!");
      setJourneyProgress(4);
      window.setTimeout(() => setStep("done"), 750);
      return;
    }
    setChangeFeedback(changeTotal < changeTarget ? `${(changeTarget - changeTotal).toLocaleString("ko-KR")}원을 더 담아야 해.` : `${(changeTotal - changeTarget).toLocaleString("ko-KR")}원을 다시 빼 보자.`);
  }

  return (
    <section className={`figma-cafe figma-cafe--${step}`}>
      <div className="figma-cafe__bar">
        <button onClick={step === "overview" ? onBack : returnToMap}>← {step === "overview" ? "외출 장소" : "돌다리"}</button>
        <strong className="figma-cafe__place"><span aria-hidden="true">☕</span> 모르미 카페</strong>
        <div className="figma-cafe__steps" aria-label="카페 진행 단계">
          {cafeStations.map((station, index) => <span key={station} className={index <= stationIndex ? "is-active" : ""}><i>{index < journeyProgress ? "✓" : index + 1}</i>{station}</span>)}
        </div>
      </div>

      {step === "overview" && (
        <main className="figma-cafe-map">
          <header className="figma-cafe-map__heading">
            <span>CAFE QUEST</span>
            <h1>모르미와 카페에 왔어요!</h1>
            <p>스테이지를 하나씩 완료하고 주문에 성공해 봐요.</p>
          </header>
          <div className="figma-cafe-map__stones" aria-label="카페 스테이지 선택">
            {stationCopy.map((station, index) => (
              <button key={station.title} className={`${index === journeyProgress ? "is-current" : ""} ${index < journeyProgress ? "is-complete" : ""}`} disabled={index > journeyProgress} onClick={() => { if (index === 0 && journeyProgress === 0) captureMormeyEvent("cafe_started"); openStation(index); }}>
                <span className="figma-cafe-map__image"><Image src={station.image} alt={`${station.title} 스테이지`} width={360} height={270} unoptimized /></span>
                <span className="figma-cafe-map__copy"><small>STAGE {index + 1}</small><strong>{station.title}</strong><p>{station.description}</p></span>
                <em>{index < journeyProgress ? "완료 ✓" : index > journeyProgress ? "잠김 🔒" : "도전하기"}</em>
              </button>
            ))}
          </div>
          <div className="figma-cafe-map__path" aria-hidden="true" />
          <div className="figma-cafe-map__guide">
            <span>{Math.min(journeyProgress, 3) + 1}</span>
            <div><small>지금 할 미션</small><h2>{stationCopy[Math.min(journeyProgress, 3)].title}</h2><p>{stationCopy[Math.min(journeyProgress, 3)].description}</p></div>
            <button onClick={() => openStation(Math.min(journeyProgress, 3))}>스테이지 시작</button>
          </div>
        </main>
      )}

      {step === "queue" && (
        <main className={`figma-cafe-panel figma-cafe-queue-story is-${queueScene}`} data-figma-node="74:4">
          {queueScene !== "clear" && <button className="queue-star-note" aria-label="별노트"><span aria-hidden="true">★</span> 별노트</button>}

          {queueScene !== "note" && queueScene !== "clear" && (
            <section className="queue-story-scene" aria-label="카페의 두 줄">
              <Image className="queue-story-morami" src={queueScene === "intro" ? "/morami/confused-cutout.png" : "/morami/bright-cutout.png"} alt={queueScene === "intro" ? "어느 줄에 설지 고민하는 모르미" : "질문하는 모르미"} width={320} height={360} unoptimized />
              <div className="queue-story-task">
                <div className="queue-story-lines">
                  <div aria-label="왼쪽 줄 3명"><strong>왼쪽 줄</strong>{Array.from({ length: 3 }, (_, index) => <i key={index}><b /><span /><em /><small /></i>)}</div>
                  <div aria-label="오른쪽 줄 2명"><strong>오른쪽 줄</strong>{Array.from({ length: 2 }, (_, index) => <i key={index}><b /><span /><em /><small /></i>)}</div>
                </div>
                {queueScene === "count-both" && <form className="queue-story-input" onSubmit={(event) => { event.preventDefault(); submitQueueCounts(); }}><input aria-label="양쪽 줄의 사람 수" value={queueCountAnswer} onChange={(event) => setQueueCountAnswer(event.target.value)} placeholder="답변을 입력해 주세요" /><button type="submit" disabled={!queueCountAnswer.trim()}>완료</button></form>}
                {queueScene === "count-left" && <div className="queue-story-options" aria-label="왼쪽 줄 사람 수 선택">{[1, 2, 3].map((count) => <button key={count} onClick={() => chooseLeftCount(count)}>{count}명 있어</button>)}</div>}
              </div>
            </section>
          )}

          {queueScene === "note" && (
            <section className="queue-note-scene">
              <Image src="/morami/bright-cutout.png" alt="공부 노트를 쓰는 모르미" width={310} height={340} unoptimized />
              <article><span>모르미의 공부노트</span><h2>줄 설 때는 사람이 더 적은 줄에 서는 게 좋아</h2></article>
            </section>
          )}

          {queueScene === "clear" && (
            <section className="queue-clear-scene">
              <Image src="/morami/celebrate-cutout.png" alt="별을 들고 기뻐하는 모르미" width={370} height={410} unoptimized />
              <div><span>STAGE 1 CLEAR!</span><h1>얏호~! 덕분에 빠른 줄에<br />서는 방법을 알았어!</h1><button onClick={returnToMap}>나가기</button></div>
            </section>
          )}

          {queueScene !== "clear" && <section className="queue-story-dialogue">
            <b>모르미</b>
            <p>{queueScene === "intro" ? "어? 주문하려면 줄을 서야 하나 봐. 그런데 어느 줄에 서면 좋을지 모르겠어..." : queueScene === "count-both" ? "왼쪽 줄이랑 오른쪽 줄에는 각각 사람들이 몇 명씩 있어?" : queueScene === "count-left" ? "왼쪽 줄에는 사람들이 몇 명 있어?" : "아~! 오른쪽 줄이 더 짧으니까 거기에 서는 게 좋구나! 가르쳐 준 내용은 잊지 않게 노트에 적어 둬야겠다!"}</p>
            {queueFeedback && <small role="status">{queueFeedback}</small>}
            {queueScene === "intro" && <button className="queue-story-next" onClick={() => setQueueScene("count-both")}>다음으로</button>}
            {queueScene === "count-both" && <button onClick={() => { setQueueHelp(true); setQueueScene("count-left"); }}>잘 모르겠어</button>}
            {queueScene === "count-left" && <button onClick={() => { setQueueHelp(true); setQueueFeedback("사람을 앞에서부터 하나씩 세어 봐. 왼쪽 줄은 세 자리야."); }}>잘 모르겠어</button>}
            {queueScene === "note" && <button className="queue-story-next" onClick={finishQueueStory}>다음으로</button>}
          </section>}
        </main>
      )}

      {step === "menu" && (
        <main className="figma-cafe-panel figma-cafe-menu" data-figma-node="74:6">
          {menuScene === "brief" && <section className="cafe-menu-brief"><div><span>TODAY&apos;S MISSION</span><h1>10,000원으로 주문해요</h1><p>모르미와 메뉴를 하나씩 골라 예산 안에서 주문해 봐요.</p><ol><li><b>1</b>모르미가 먹고 싶은 걸 먼저 골라요</li><li><b>2</b>남은 돈을 보고 내 메뉴를 골라요</li><li><b>3</b>장바구니에서 합계를 확인해요</li></ol><button onClick={() => { setSelectedMenu(["strawberry-juice"]); setMenuScene("mormey-pick"); }}>미션 시작</button></div><Image src="/morami/bright-cutout.png" alt="카페 주문을 기대하는 모르미" width={320} height={360} unoptimized /></section>}
          {menuScene === "mormey-pick" && <section className="cafe-menu-mormey"><Image src="/morami/bright-cutout.png" alt="딸기주스를 고른 모르미" width={300} height={340} unoptimized /><div><span>모르미가 먼저 골랐어요</span><h1>“나는 딸기주스가 먹고 싶어!”</h1><div><Image src="/figma/cafe/strawberry-juice.png?v=2" alt="딸기주스" width={180} height={120} unoptimized /><strong>딸기주스 <b>4,000원</b></strong></div><p>남은 6,000원 안에서 네 메뉴 하나를 골라 줄래?</p><button onClick={() => setMenuScene("choose")}>메뉴 골라 주기</button></div></section>}
          {menuScene === "choose" && <><div className="figma-cafe-panel__heading"><div><span>MISSION 2</span><h1>진열대에서 메뉴 고르기</h1><p>모르미의 딸기주스와 함께 먹을 메뉴 하나를 골라 봐!</p></div><strong>남은 예산 <b>{(10000 - selectedTotal).toLocaleString("ko-KR")}원</b></strong></div>
          <div className="figma-cafe-menu__layout">
            <div className="figma-cafe-menu__grid">
              {menu.map((item) => <button key={item.id} aria-label={item.id === "strawberry-juice" ? "모르미가 고른 딸기주스" : `${item.name} 고르기`} className={`${selectedMenu.includes(item.id) ? "is-selected" : ""} ${item.id === "strawberry-juice" ? "is-mormey-pick" : ""}`} onClick={() => toggleMenu(item.id)}><i className="menu-check">✓</i><Image src={item.image} alt={item.name} width={190} height={105} unoptimized /><span><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong>{item.id === "strawberry-juice" && <small>모르미가 골랐어요</small>}</span></button>)}
            </div>
            <aside><span className="order-tray-icon">🧺</span><h2>우리 장바구니</h2><ul>{selectedItems.map((item) => <li key={item.id}><span>{item.name}{item.id === "strawberry-juice" ? " · 모르미" : " · 나"}</span><b>{item.price.toLocaleString("ko-KR")}원</b></li>)}</ul><div className="order-tray-total"><span>현재 합계</span><strong>{selectedTotal.toLocaleString("ko-KR")}원</strong><span>남은 돈</span><b>{(10000 - selectedTotal).toLocaleString("ko-KR")}원</b></div><button disabled={selectedMenu.length !== 2} onClick={orderMenu}>장바구니 확인</button></aside>
          </div>
          {menuFeedback && <p className="figma-cafe-feedback" role="status">{menuFeedback}</p>}</>}
          {menuScene === "thanks" && <section className="cafe-menu-thanks"><Image src="/morami/celebrate-cutout.png" alt="메뉴를 골라 줘서 기뻐하는 모르미" width={350} height={390} unoptimized /><div><span>주문 준비 완료!</span><h1>내 메뉴 골라 줘서 고마워!</h1><p>{selectedItems.map((item) => item.name).join(" + ")}<br /><strong>합계 {selectedTotal.toLocaleString("ko-KR")}원</strong></p><button onClick={finishMenuStory}>돌다리로 돌아가기</button></div></section>}
        </main>
      )}

      {step === "sum" && (
        <main className="figma-cafe-panel figma-cafe-sum" data-figma-node="74:8">
          <div className="figma-cafe-mission-title"><span>MISSION 3</span><h1>주문 금액 계산하고 돈 내기</h1><p>고른 메뉴를 확인하고, 실제 돈을 골라 10,000원을 만들어 봐!</p></div>
          <div className="figma-cafe-sum__equation">
            {selectedItems.map((item, index) => <div key={item.id}><article><Image src={item.image} alt={item.name} width={190} height={105} unoptimized /><span>{item.name}</span><strong>{item.price.toLocaleString("ko-KR")}원</strong></article>{index < selectedItems.length - 1 && <b aria-hidden="true">＋</b>}</div>)}
            <b aria-hidden="true">=</b><article className="figma-cafe-sum__total"><span>주문 합계</span><strong>{selectedTotal.toLocaleString("ko-KR")}원</strong></article>
          </div>
          <section className="figma-cafe-sum-wallet" aria-label="직원에게 낼 돈 고르기">
            <div className="figma-cafe-sum-wallet__heading"><span>내 지갑</span><h2>직원에게 낼 10,000원을 만들어 봐</h2><p>돈마다 −와 ＋를 눌러 개수를 바꿀 수 있어요.</p></div>
            <div className="figma-cafe-wallet">
              {cafeMoney.map((money) => <article key={money.value}><Image src={money.image} alt={money.label} width={220} height={120} unoptimized /><b>{money.label}</b><div><button aria-label={`${money.label} 빼기`} onClick={() => changePaymentMoney(money.value, -1)} disabled={!paymentCounts[money.value]}>−</button><output aria-label={`${money.label} 개수`}>{paymentCounts[money.value]}개</output><button aria-label={`${money.label} 더하기`} onClick={() => changePaymentMoney(money.value, 1)}>＋</button></div></article>)}
            </div>
            <div className="figma-cafe-total"><span>내가 낼 돈</span><strong>{paid.toLocaleString("ko-KR")}원</strong></div>
          </section>
          {paymentFeedback && <p className="figma-cafe-feedback" role="status">{paymentFeedback}</p>}
          <button className="figma-cafe-action" onClick={checkPayment} disabled={!paid}>직원에게 내기</button>
        </main>
      )}

      {step === "change" && (
        <main className="figma-cafe-panel figma-cafe-change" data-figma-node="74:10">
          <div className="figma-cafe-mission-title"><span>MISSION 4</span><h1>거스름돈 챙기기</h1><p>받아야 할 돈을 직접 골라 담아 봐!</p></div>
          <div className="figma-cafe-change__equation">낸 돈 10,000원&nbsp; − &nbsp;메뉴 값 {selectedTotal.toLocaleString("ko-KR")}원&nbsp; = &nbsp;?</div>
          <p>받을 돈을 눌러 담아요</p>
          <div className="figma-cafe-change__builder">
            {([1000, 500] as const).map((value) => <article key={value} className={`is-${value}`}><Image src={`/cafe-money/${value}.png`} alt={`${value.toLocaleString("ko-KR")}원`} width={180} height={100} unoptimized /><strong>{value.toLocaleString("ko-KR")}원</strong><div><button onClick={() => changeChangeMoney(value, -1)} disabled={!changeCounts[value]}>−</button><output>{changeCounts[value]}개</output><button onClick={() => changeChangeMoney(value, 1)}>＋</button></div></article>)}
            <aside><span>내가 만든 거스름돈</span><p>1,000원 × {changeCounts[1000]}</p><p>500원 × {changeCounts[500]}</p><strong>모두 {changeTotal.toLocaleString("ko-KR")}원</strong></aside>
          </div>
          {changeFeedback && <p className="figma-cafe-feedback" role="status">{changeFeedback}</p>}
          <button className="figma-cafe-action" onClick={checkChange} disabled={!changeTotal}>계산 완료</button>
        </main>
      )}

      {step === "done" && (
        <main className="figma-cafe-panel figma-cafe-done">
          <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={420} height={420} unoptimized />
          <div><span>카페 외출 완료</span><h1>우리 힘으로 주문했어!</h1><p>줄을 서고, 메뉴를 고르고, 돈을 내고, 거스름돈까지 직접 확인했어.</p><button onClick={() => { captureMormeyEvent("cafe_journey_completed", { order_total: selectedTotal, paid: 10000, change: changeTarget }); onComplete(); }}>모르미와 집으로</button></div>
        </main>
      )}
    </section>
  );
}
