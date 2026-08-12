"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { api, fireAndForget } from "./api-client";
import { cafeMoney, cafeStations } from "./journey-config";

type CafeStep = "overview" | "queue" | "menu" | "sum" | "change" | "done";

// 시계 읽기는 렌더가 아니라 이벤트 핸들러와 이펙트에서만 일어난다.
const nowMs = () => Date.now();

const menu = [
  { id: "americano", name: "아메리카노", price: 3000, image: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 3000, image: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 4000, image: "/figma/cafe/sandwich.png?v=2" },
] as const;

const stationCopy = [
  { title: "줄 서기", description: ["줄이 짧은 곳에 서야 해요", "다른 사람의 차례를 기다려요."], image: "/figma/cafe/stage-queue.png" },
  { title: "메뉴 고르기", description: ["가진 돈 안에서 메뉴를 골라요", "먹고 싶은 메뉴 두 개를 담아요."], image: "/figma/cafe/stage-menu.png" },
  { title: "계산하기", description: ["메뉴 값을 더해서 합계를 구해요", "돈을 직접 골라 직원에게 내요."], image: "/figma/cafe/stage-calculator.png" },
  { title: "거스름돈 받기", description: ["낸 돈에서 메뉴 값을 빼요", "받을 돈을 직접 골라 담아요."], image: "/figma/cafe/stage-change.png" },
] as const;

type Props = { onBack: () => void; onComplete: () => void };

export function CafeJourney({ onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueHelp, setQueueHelp] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);
  const [menuFeedback, setMenuFeedback] = useState("");
  const [paymentCounts, setPaymentCounts] = useState<Record<number, number>>({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
  const [paymentFeedback, setPaymentFeedback] = useState("");
  const [changeCounts, setChangeCounts] = useState<Record<number, number>>({ 500: 0, 1000: 0 });
  const [changeFeedback, setChangeFeedback] = useState("");

  // 서버 방문 id. 스테이지 시도는 전부 여기에 기록된다.
  const visitId = useRef<string | null>(null);
  // 스테이지별 시도 번호. 틀린 시도도 각각 한 건으로 남는다.
  const attemptNos = useRef<Record<string, number>>({ queue: 0, menu: 0, calculate: 0, change: 0 });
  const stageStartedAt = useRef(0);

  useEffect(() => {
    stageStartedAt.current = nowMs();
    // 방문을 열고, 새로고침으로 돌아온 경우에는 진행 중인 방문을 이어받는다.
    fireAndForget(async () => {
      const visit = await api.startCafeVisit();
      visitId.current = visit.cafe_visit_id;
      if (visit.stage === "menu") setJourneyProgress((progress) => Math.max(progress, 1));
      if (visit.stage === "calculate") setJourneyProgress((progress) => Math.max(progress, 2));
      if (visit.stage === "change") setJourneyProgress((progress) => Math.max(progress, 3));
      if (visit.stage === "complete") setJourneyProgress(4);
      if (visit.order_total !== null) setMenuFeedback("");
    }, "카페 방문 시작");
  }, []);

  function nextAttemptNo(stage: "queue" | "menu" | "calculate" | "change") {
    attemptNos.current[stage] += 1;
    return attemptNos.current[stage];
  }

  function stageElapsedMs() {
    const now = nowMs();
    const elapsed = stageStartedAt.current ? now - stageStartedAt.current : 0;
    stageStartedAt.current = now;
    return Math.min(Math.max(elapsed, 0), 600000);
  }

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
    if (index === 2) {
      setPaymentCounts({ 100: 0, 500: 0, 1000: 0, 5000: 0 });
      setPaymentFeedback("");
    }
    setStep((["queue", "menu", "sum", "change"] as CafeStep[])[index]);
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  function chooseQueue(side: "left" | "right") {
    const id = visitId.current;
    if (id) {
      const attemptNo = nextAttemptNo("queue");
      const elapsedMs = stageElapsedMs();
      fireAndForget(() => api.cafeQueue(id, side, queueHelp, attemptNo, elapsedMs), "카페 줄 서기");
    }
    if (side === "right") {
      setQueueFeedback("맞아. 두 명이 있는 오른쪽 줄이 더 짧아!");
      captureMormeyEvent("cafe_queue_answered", { correct: true, scaffold_used: queueHelp });
      setJourneyProgress((progress) => Math.max(progress, 1));
      window.setTimeout(returnToMap, 700);
      return;
    }
    setQueueFeedback("왼쪽에는 네 명이 있어. 더 적은 쪽을 다시 골라 볼까?");
    setQueueHelp(true);
    captureMormeyEvent("cafe_queue_answered", { correct: false, answer: 4 });
  }

  function toggleMenu(id: string) {
    setMenuFeedback("");
    setSelectedMenu((current) => {
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
    const id = visitId.current;
    if (id) {
      const attemptNo = nextAttemptNo("menu");
      const elapsedMs = stageElapsedMs();
      fireAndForget(() => api.cafeMenu(id, selectedMenu, attemptNo, elapsedMs), "카페 메뉴 선택");
    }
    captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal });
    setJourneyProgress((progress) => Math.max(progress, 2));
    returnToMap();
  }

  function changePaymentMoney(value: number, amount: number) {
    setPaymentCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(20, current[value] + amount)) }));
    setPaymentFeedback("");
  }

  function checkPayment() {
    const id = visitId.current;
    if (id) {
      const attemptNo = nextAttemptNo("calculate");
      const elapsedMs = stageElapsedMs();
      // 맞든 틀리든 화폐별 최종 구성을 그대로 남긴다.
      fireAndForget(() => api.cafePayment(id, paymentCounts, attemptNo, elapsedMs), "카페 결제");
    }
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
    const id = visitId.current;
    if (id) {
      const attemptNo = nextAttemptNo("change");
      const elapsedMs = stageElapsedMs();
      fireAndForget(() => api.cafeChange(id, changeCounts, attemptNo, elapsedMs), "카페 거스름돈");
    }
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
        <main className="figma-cafe-map" data-figma-node="70:303">
          <div className="figma-cafe-map__stones" aria-label="카페 스테이지 선택">
            {stationCopy.map((station, index) => (
              <button key={station.title} className={`${index === journeyProgress ? "is-current" : ""} ${index < journeyProgress ? "is-complete" : ""}`} disabled={index > journeyProgress} onClick={() => { if (index === 0 && journeyProgress === 0) captureMormeyEvent("cafe_started"); openStation(index); }}>
                <strong>{index + 1}. {station.title}</strong>
                <span><Image src={station.image} alt="" width={360} height={250} unoptimized /></span>
                {index > journeyProgress && <em>🔒</em>}
              </button>
            ))}
          </div>
          <div className="figma-cafe-map__path" aria-hidden="true" />
          <div className="figma-cafe-map__guide">
            <span><Image src={stationCopy[Math.min(journeyProgress, 3)].image} alt="" width={150} height={120} unoptimized /></span>
            <div><h1>{stationCopy[Math.min(journeyProgress, 3)].title}</h1>{stationCopy[Math.min(journeyProgress, 3)].description.map((line) => <p key={line}>{line}</p>)}</div>
            <button onClick={() => openStation(Math.min(journeyProgress, 3))}>연습하기</button>
          </div>
        </main>
      )}

      {step === "queue" && (
        <main className="figma-cafe-panel figma-cafe-queue" data-figma-node="74:4">
          <div className="figma-cafe-mission-title"><span>MISSION 1</span><h1>카페에 줄서기</h1><p>사람이 적은 줄을 찾아 주문대로 가요</p></div>
          <div className="figma-cafe-queue__choice">
            {([{"side":"left","label":"왼쪽 줄","count":4},{"side":"right","label":"오른쪽 줄","count":2}] as const).map((lane) => (
              <button key={lane.side} className={`queue-lane queue-lane--${lane.side}`} onClick={() => chooseQueue(lane.side)}>
                <span className="queue-lane__counter"><i aria-hidden="true">☕</i><b>주문대 {lane.side === "left" ? "A" : "B"}</b></span>
                <strong>{lane.label}<small>{lane.count}명이 기다려요</small></strong>
                <span className="queue-lane__people" aria-label={`${lane.count}명`}>
                  {Array.from({ length: lane.count }, (_, index) => <i key={index} style={{ "--person": index } as CSSProperties}><em /><b /></i>)}
                </span>
                <span className="queue-lane__pick">여기에 설래요 <b>→</b></span>
              </button>
            ))}
          </div>
          <div className="figma-cafe-guide"><Image src="/morami/bright-cutout.png" alt="생각하는 모르미" width={90} height={90} unoptimized /><button className="figma-cafe-hint" onClick={() => setQueueHelp(true)}>힌트가 필요해? 사람 수를 하나씩 세어 봐!</button></div>
          {queueHelp && <p className="figma-cafe-help-text">네 명과 두 명 중 어느 쪽이 더 적을까?</p>}
          {queueFeedback && <p className="figma-cafe-feedback" role="status">{queueFeedback}</p>}
        </main>
      )}

      {step === "menu" && (
        <main className="figma-cafe-panel figma-cafe-menu" data-figma-node="74:6">
          <div className="figma-cafe-panel__heading"><div><span>MISSION 2</span><h1>진열대에서 메뉴 고르기</h1><p>먹고 싶은 메뉴를 두 개 골라 봐!</p></div><strong>내 지갑 <b>10,000원</b></strong></div>
          <div className="figma-cafe-menu__layout">
            <div className="figma-cafe-menu__grid">
              {menu.map((item) => <button key={item.id} className={selectedMenu.includes(item.id) ? "is-selected" : ""} onClick={() => toggleMenu(item.id)}><i className="menu-check">✓</i><Image src={item.image} alt={item.name} width={190} height={105} unoptimized /><span><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong></span></button>)}
            </div>
            <aside><span className="order-tray-icon">🧺</span><h2>내 주문 바구니</h2><ul>{selectedItems.length ? selectedItems.map((item) => <li key={item.id}><span>{item.name}</span><b>{item.price.toLocaleString("ko-KR")}원</b></li>) : <li className="is-empty">메뉴를 눌러 담아 봐</li>}</ul><div className="order-tray-total"><span>고른 금액</span><strong>{selectedTotal.toLocaleString("ko-KR")}원</strong><span>남은 돈</span><b>{(10000 - selectedTotal).toLocaleString("ko-KR")}원</b></div><button disabled={selectedMenu.length !== 2} onClick={orderMenu}>이대로 주문하기</button></aside>
          </div>
          {menuFeedback && <p className="figma-cafe-feedback" role="status">{menuFeedback}</p>}
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
          <div><span>카페 외출 완료</span><h1>우리 힘으로 주문했어!</h1><p>줄을 서고, 메뉴를 고르고, 돈을 내고, 거스름돈까지 직접 확인했어.</p><button onClick={() => {
            const id = visitId.current;
            if (id) fireAndForget(() => api.cafeComplete(id), "카페 방문 완료");
            captureMormeyEvent("cafe_journey_completed", { order_total: selectedTotal, paid: 10000, change: changeTarget });
            onComplete();
          }}>모르미와 집으로</button></div>
        </main>
      )}
    </section>
  );
}
