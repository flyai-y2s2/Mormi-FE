"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { api } from "./api-client";
import { menu, menuItemsForAi } from "./cafe-menu";
import { CafeStageVisual, QueueVisual } from "./CafeStageVisual";
import { CafeTalkStage, type CafeDialogueResponse } from "./CafeTalkStage";
import { cafeStations } from "./journey-config";
import { dialogueErrorMessage } from "./dialogue-errors";
import {
  startCafeDialogue,
  submitMormiResponseThroughBe,
  type MormiConversation,
} from "./mormi-dialogue";

type CafeStep = "overview" | "queue" | "menu" | "sum" | "change" | "done";

const stationCopy = [
  { title: "줄 서기", description: "더 짧은 줄을 찾아요", image: "/cafe-stages/queue-v2.png" },
  { title: "메뉴 고르기", description: "예산 안에서 메뉴를 골라요", image: "/cafe-stages/menu-v3.png" },
  { title: "메뉴 값 계산하기", description: "두 메뉴 가격을 더해요", image: "/cafe-stages/payment-v3.png" },
  { title: "거스름돈 받기", description: "10,000원에서 메뉴값을 빼요", image: "/cafe-stages/change-v3.png" },
] as const;

type Props = {
  learnerName: string;
  learnerId: number;
  /** 진행도가 알려 준 진행 중 방문. 있으면 새로 만들지 않고 이 방문을 이어 받는다. */
  activeVisitId?: string | null;
  onBack: () => void;
  onComplete: () => void;
};
type CafeStage = "queue" | "menu" | "calculate" | "change";

/** 스테이션 순서대로의 AI 시나리오. 화면이 뽑은 문제를 함께 보내야 시작된다. */
const cafeScenarioByStation = ["cafe_queue", "cafe_budget_menu", "cafe_menu_total", "cafe_change"] as const;
/** 스테이션 번호 → 서버 스테이지 이름. */
const stageByStation = ["queue", "menu", "calculate", "change"] as const satisfies readonly CafeStage[];

type QueueScene = "dialogue" | "note" | "clear";
type MenuScene = "dialogue" | "thanks";
const budgets = [8000, 9000, 10000] as const;

/** 모르미 대화가 아직 첫 줄을 보내기 전에 쓰는 기본 문구. */
const fallbackLines: Record<CafeStage, string> = {
  queue: "모르미의 질문을 불러오는 중이에요.",
  menu: "모르미가 메뉴를 고르는 중이에요.",
  calculate: "모르미가 계산할 메뉴를 고르는 중이에요.",
  change: "모르미가 주문을 마무리하는 중이에요.",
};

function randomItem<T>(items: readonly T[], excluded?: T) {
  const candidates = excluded === undefined ? items : items.filter((item) => item !== excluded);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function randomQueueCounts() {
  // queue-v2.png에는 왼쪽 2명·오른쪽 1명이 있다. 이미지와 학습 문제의
  // 인원 수가 어긋나지 않도록 같은 장면을 좌우 반전한 경우만 함께 사용한다.
  return Math.random() < 0.5 ? { left: 2, right: 1 } : { left: 1, right: 2 };
}

export function CafeJourney({ activeVisitId, onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueScene, setQueueScene] = useState<QueueScene>("dialogue");
  const [queueCounts, setQueueCounts] = useState({ left: 3, right: 2 });
  const [menuScene, setMenuScene] = useState<MenuScene>("dialogue");
  const [menuBudget, setMenuBudget] = useState<number>(10000);
  const [mormeyMenuId, setMormeyMenuId] = useState<string>("strawberry-juice");
  // 메뉴 고르기에서 아이가 고른 메뉴. 대화가 검증한 사실에서만 받아 축하 장면에 쓴다.
  const [menuChildMenuId, setMenuChildMenuId] = useState<string>("");
  // 거스름돈은 완료 화면의 분석 이벤트가 주문 금액을 알아야 해서 화면도 함께 기억한다.
  // 계산 스테이지는 문제 전체를 turn.visual 이 들고 오므로 따로 둘 필요가 없다.
  const [changeMenuId, setChangeMenuId] = useState<string>("americano");
  const [dialogueInputs, setDialogueInputs] = useState<Partial<Record<CafeStage, string>>>({});
  const [dialogueError, setDialogueError] = useState("");
  const [dialogueSending, setDialogueSending] = useState(false);
  const dialogueRequestInFlight = useRef(false);

  // 모르미가 건네는 말. Mormi-AI 가 비었거나 실패하면 값이 비고,
  // 화면은 fallbackLines 의 문구를 그대로 쓴다.
  const [mormiLines, setMormiLines] = useState<Partial<Record<CafeStage, string>>>({});

  // 스테이션마다 독립된 전체 TurnContract를 보관한다.
  const [cafeConversations, setCafeConversations] = useState<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalks = useRef<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalkPromises = useRef<Partial<Record<CafeStage, Promise<MormiConversation | null>>>>({});
  const validatedStages = useRef<Partial<Record<CafeStage, boolean>>>({});
  const finalizedStages = useRef<Partial<Record<CafeStage, boolean>>>({});
  // 이미 깬 돌다리를 다시 여는 중인지. 재연습은 진행도를 밀지 않고 지도로 돌아온다.
  const replayStages = useRef<Partial<Record<CafeStage, boolean>>>({});

  // 서버 방문 id. 스테이지 시도는 전부 여기에 기록된다.
  const visitId = useRef<string | null>(null);
  const visitPromise = useRef<Promise<string> | null>(null);

  useEffect(() => {
    // 방문 생성이 끝나기 전에 답을 눌러도 유실되지 않도록 같은 Promise를 공유한다.
    //
    // 진행 중 방문 id 를 이미 알고 있으면 조회만 한다. POST 는 없을 때 새로 만드는
    // 부수효과가 있어, 단순 복구에는 쓰지 않는다. 조회가 실패하면(만료·소유자 불일치)
    // 그때 POST 로 넘어간다.
    // 완료된 방문도 버리지 않고 그대로 이어받는다. 네 돌다리가 모두 열린 연습 모드가
    // 되어, 아이가 원하는 스테이지를 골라 몇 번이든 다시 풀 수 있다.
    const load = activeVisitId
      ? api.getCafeVisit(activeVisitId).catch(() => api.startCafeVisit())
      : api.startCafeVisit();

    const pending = load.then((visit) => {
      visitId.current = visit.cafe_visit_id;
      if (visit.stage === "menu") setJourneyProgress((progress) => Math.max(progress, 1));
      if (visit.stage === "calculate") setJourneyProgress((progress) => Math.max(progress, 2));
      if (visit.stage === "change") setJourneyProgress((progress) => Math.max(progress, 3));
      if (visit.stage === "complete") setJourneyProgress(4);
      setMenuBudget(visit.target_amount);
      return visit.cafe_visit_id;
    }).catch((error: unknown) => {
      setDialogueError(error instanceof Error ? error.message : "카페를 불러오지 못했어요.");
      throw error;
    });
    visitPromise.current = pending;
  }, [activeVisitId]);

  function applyCafeConversation(stage: CafeStage, conversation: MormiConversation) {
    const restoredQueue = conversation.scenario_context?.queue_context;
    if (stage === "queue" && restoredQueue
        && Number.isInteger(restoredQueue.left_count)
        && Number.isInteger(restoredQueue.right_count)) {
      setQueueCounts({ left: restoredQueue.left_count, right: restoredQueue.right_count });
    }
    const restoredCafe = conversation.scenario_context?.cafe_context;
    if (restoredCafe && menu.some((item) => item.id === restoredCafe.mormi_menu_id)) {
      if (stage === "menu") {
        setMormeyMenuId(restoredCafe.mormi_menu_id);
        if (typeof restoredCafe.budget === "number") setMenuBudget(restoredCafe.budget);
      } else if (stage === "change") {
        setChangeMenuId(restoredCafe.mormi_menu_id);
      }
    }
    // 아이가 고른 메뉴는 대화가 검증한 사실에서만 읽는다. 화면이 따로 기억하면
    // 새로고침이나 재연습 뒤에 서버가 채점한 답과 어긋난다.
    if (stage === "menu") {
      const picked = conversation.turn.completion?.verified_facts?.child_menu_id;
      if (typeof picked === "string" && menu.some((item) => item.id === picked)) setMenuChildMenuId(picked);
    }
    cafeTalks.current[stage] = conversation;
    setCafeConversations((current) => ({ ...current, [stage]: conversation }));
    setMormiLines((lines) => ({ ...lines, [stage]: conversation.turn.mormi.text }));
    setDialogueError("");
    if (conversation.stage_progress?.stage === stage && conversation.stage_progress.completed) {
      validatedStages.current[stage] = true;
    }
    if (conversation.turn.status === "completed" && validatedStages.current[stage]) {
      completeValidatedStage(stage);
    }
    return conversation;
  }

  /** 화면이 뽑은 문제를 Spring BE가 인증된 AI 대화로 고정한다. */
  function openCafeDialogue(
    stage: CafeStage,
    input: {
      scenario_id: (typeof cafeScenarioByStation)[number];
      queue_context?: { left_count: number; right_count: number };
      cafe_context?: { menu_items: typeof menuItemsForAi; mormi_menu_id: string; budget?: number };
    },
    /** true 면 서버가 새 회차 대화를 연다. 이미 끝낸 스테이지를 새 문제로 다시 풀 때 쓴다. */
    restart: boolean,
  ) {
    setMormiLines((lines) => ({ ...lines, [stage]: undefined }));
    setCafeConversations((current) => ({ ...current, [stage]: undefined }));
    setDialogueError("");
    setDialogueInputs((current) => ({ ...current, [stage]: "" }));
    delete cafeTalks.current[stage];
    validatedStages.current[stage] = false;
    finalizedStages.current[stage] = false;

    const pending = (async () => {
      try {
        const id = visitId.current ?? await visitPromise.current;
        if (!id) throw new Error("카페 방문을 먼저 열어 주세요.");
        return applyCafeConversation(stage, await startCafeDialogue(id, { ...input, restart }));
      } catch (error: unknown) {
        setDialogueError(dialogueErrorMessage(error, "모르미 대화를 시작하지 못했어요."));
        return null;
      }
    })();
    cafeTalkPromises.current[stage] = pending;
  }

  async function sendCafeResponse(stage: CafeStage, response: CafeDialogueResponse) {
    if (dialogueRequestInFlight.current) return null;
    dialogueRequestInFlight.current = true;
    setDialogueSending(true);
    try {
      const conversation = cafeTalks.current[stage] ?? await cafeTalkPromises.current[stage];
      if (!conversation) throw new Error("모르미의 첫 질문을 불러오는 중이에요.");
      const next = await submitMormiResponseThroughBe(conversation.conversation_id, {
        turn_id: conversation.turn.turn_id,
        ...response,
      });
      return applyCafeConversation(stage, next);
    } catch (error: unknown) {
      setDialogueError(dialogueErrorMessage(error, "답을 보내지 못했어요."));
      return null;
    } finally {
      dialogueRequestInFlight.current = false;
      setDialogueSending(false);
    }
  }

  /**
   * 스테이지 통과. 정오 판정과 시도 기록은 전부 서버가 한다.
   * Spring BE 가 대화의 verified_facts 로 cafe 스테이지 제출까지 대신 부르고,
   * 그 결과를 stage_progress 로 돌려준다. 화면은 그 신호만 보고 다음으로 넘어간다.
   */
  function completeValidatedStage(stage: CafeStage) {
    if (finalizedStages.current[stage]) return;
    finalizedStages.current[stage] = true;
    // 재연습은 이미 열린 진행도를 그대로 두고, 끝나면 지도로 돌아간다.
    const replaying = replayStages.current[stage] === true;
    if (stage === "queue") {
      if (cafeTalks.current.queue?.turn.note_update) {
        setQueueScene("note");
      } else {
        if (!replaying) setJourneyProgress((progress) => Math.max(progress, 1));
        setQueueScene("clear");
      }
    } else if (stage === "menu") {
      const picked = cafeTalks.current.menu?.turn.completion?.verified_facts?.child_menu_id;
      const childMenu = menu.find((item) => item.id === picked);
      const mormeyPick = menu.find((item) => item.id === mormeyMenuId) ?? menu[0];
      captureMormeyEvent("cafe_menu_selected", {
        menu_ids: [mormeyPick.id, childMenu?.id ?? ""].join(","),
        total: mormeyPick.price + (childMenu?.price ?? 0),
        budget: menuBudget,
        over_budget: false,
      });
      setMenuScene("thanks");
    } else if (stage === "calculate") {
      if (!replaying) setJourneyProgress((progress) => Math.max(progress, 3));
      window.setTimeout(returnToMap, 500);
    } else {
      if (replaying) {
        window.setTimeout(returnToMap, 500);
      } else {
        setJourneyProgress(4);
        window.setTimeout(() => setStep("done"), 500);
      }
    }
  }

  const mormeyMenu = menu.find((item) => item.id === mormeyMenuId) ?? menu[0];
  const menuChildMenu = menu.find((item) => item.id === menuChildMenuId);
  const changeMenu = menu.find((item) => item.id === changeMenuId) ?? menu[0];
  const changeTarget = 10000 - changeMenu.price;
  const stationIndex = step === "overview" ? Math.min(journeyProgress, 3) : step === "queue" ? 0 : step === "menu" ? 1 : step === "sum" ? 2 : 3;
  // 네 돌다리를 다 깬 뒤에는 지도가 연습장이 된다. 어느 스테이지든 골라 다시 푼다.
  const allStationsCleared = journeyProgress >= stationCopy.length;
  // 대화 화면인지. 축하·노트 장면은 입력이 없어 100svh 세로 배분을 쓰지 않는다.
  const isTalk = (step === "queue" && queueScene === "dialogue")
    || (step === "menu" && menuScene === "dialogue")
    || step === "sum"
    || step === "change";

  function returnToMap() {
    setStep("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 카페를 마치고 집으로. 이미 완료된 방문에 다시 눌러도 서버가 멱등으로 받는다. */
  async function goHomeWithMormi() {
    try {
      const id = visitId.current ?? await visitPromise.current;
      if (!id) throw new Error("카페 방문 기록을 찾지 못했어요.");
      await api.cafeComplete(id);
      captureMormeyEvent("cafe_journey_completed", { order_total: changeMenu.price, paid: 10000, change: changeTarget });
      onComplete();
    } catch (error: unknown) {
      setDialogueError(error instanceof Error ? error.message : "카페 완료를 저장하지 못했어요.");
    }
  }

  function openStation(index: number) {
    if (index > journeyProgress) return;
    // 이미 깬 돌다리를 다시 눌렀으면 새 회차다. 서버가 새 대화를 열어 주어야
    // 이번에 뽑은 문제로 다시 풀 수 있다. 진행 중인 스테이지는 이어받는다.
    const isReplay = index < journeyProgress;
    replayStages.current[stageByStation[index]] = isReplay;
    if (index === 0) {
      const counts = randomQueueCounts();
      setQueueCounts(counts);
      setQueueScene("dialogue");
      openCafeDialogue("queue", {
        scenario_id: cafeScenarioByStation[0],
        queue_context: { left_count: counts.left, right_count: counts.right },
      }, isReplay);
    }
    if (index === 1) {
      const nextMormeyMenu = randomItem(menu);
      const nextBudget = randomItem(budgets);
      setMenuBudget(nextBudget);
      setMormeyMenuId(nextMormeyMenu.id);
      setMenuChildMenuId("");
      setMenuScene("dialogue");
      openCafeDialogue("menu", {
        scenario_id: cafeScenarioByStation[1],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextMormeyMenu.id, budget: nextBudget },
      }, isReplay);
    }
    if (index === 2) {
      const nextSumMenu = randomItem(menu);
      openCafeDialogue("calculate", {
        scenario_id: cafeScenarioByStation[2],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
      }, isReplay);
    }
    if (index === 3) {
      const nextChangeMenu = randomItem(menu);
      setChangeMenuId(nextChangeMenu.id);
      openCafeDialogue("change", {
        scenario_id: cafeScenarioByStation[3],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextChangeMenu.id },
      }, isReplay);
    }
    setStep((["queue", "menu", "sum", "change"] as CafeStep[])[index]);
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  function finishQueueStory() {
    if (!replayStages.current.queue) setJourneyProgress((progress) => Math.max(progress, 1));
    setQueueScene("clear");
  }

  function finishMenuStory() {
    // 메뉴 고르기만 다시 연습한 거라면 계산 단계로 끌고 가지 않고 지도로 돌아간다.
    if (replayStages.current.menu) {
      returnToMap();
      return;
    }
    // 메뉴 고르기에서 곧장 넘어올 때도 계산 스테이지 대화를 새로 연다.
    // 이걸 빼면 대화가 없어 turn.status 가 "completed" 가 되지 않고,
    // 합계를 맞혀도 스테이지가 끝나지 않는다.
    const nextSumMenu = randomItem(menu);
    setJourneyProgress((progress) => Math.max(progress, 2));
    replayStages.current.calculate = false;
    openCafeDialogue("calculate", {
      scenario_id: cafeScenarioByStation[2],
      cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
    }, false);
    setStep("sum");
    window.scrollTo({ top: 0, behavior: "smooth" });
    captureMormeyEvent("cafe_station_started", { station_index: 3, station: cafeStations[2] });
  }

  function setDialogueInput(stage: CafeStage, value: string) {
    setDialogueInputs((current) => ({ ...current, [stage]: value }));
  }

  /** 답을 보내고 입력칸을 비운다. 네 스테이지가 모두 이 경로 하나만 쓴다. */
  function answerMormi(stage: CafeStage, response: CafeDialogueResponse) {
    void sendCafeResponse(stage, response).then(() => setDialogueInput(stage, ""));
  }

  return (
    <section className={`figma-cafe figma-cafe--${step}${isTalk ? " is-talk" : ""}`}>
      <div className="figma-cafe__bar">
        <button onClick={step === "overview" ? onBack : returnToMap}>← {step === "overview" ? "외출 장소" : "돌아가기"}</button>
        <strong className="figma-cafe__place">
          <Image
            className="figma-cafe__place-image"
            src="/ui/mormi-cafe.png"
            alt=""
            width={56}
            height={56}
            aria-hidden="true"
          />
          모르미 카페
        </strong>
        <div className="figma-cafe__steps" aria-label="카페 진행 단계">
          {cafeStations.map((station, index) => <span key={station} className={index <= stationIndex ? "is-active" : ""}><i>{index < journeyProgress ? "✓" : index + 1}</i>{station}</span>)}
        </div>
      </div>

      {step === "overview" && (
        <main className="figma-cafe-map">
          <header className="figma-cafe-map__heading">
            <span>{allStationsCleared ? "CAFE PRACTICE" : "CAFE QUEST"}</span>
            <h1>{allStationsCleared ? "카페를 다 배웠어요!" : "모르미와 카페에 왔어요!"}</h1>
            <p>{allStationsCleared
              ? "연습하고 싶은 스테이지를 골라 몇 번이든 다시 해 봐요."
              : "스테이지를 하나씩 완료하고 주문에 성공해 봐요."}</p>
            {/* 카드 위에 진행도를 한 줄로 보여 줘야 지금 어디쯤인지 바로 안다. */}
            <div className="figma-cafe-map__progress">
              <span aria-hidden="true"><i style={{ width: `${(journeyProgress / stationCopy.length) * 100}%` }} /></span>
              <b>{journeyProgress} / {stationCopy.length} 완료</b>
            </div>
            {allStationsCleared && <button className="figma-cafe-action" onClick={() => { void goHomeWithMormi(); }}>모르미와 집으로</button>}
          </header>
          <div className="figma-cafe-map__stones" aria-label="카페 스테이지 선택">
            {stationCopy.map((station, index) => (
              <button key={station.title} className={`${index === journeyProgress ? "is-current" : ""} ${index < journeyProgress ? "is-complete" : ""}`} disabled={index > journeyProgress} onClick={() => { if (index === 0 && journeyProgress === 0) captureMormeyEvent("cafe_started"); openStation(index); }}>
                <span className="figma-cafe-map__image"><Image src={station.image} alt={`${station.title} 스테이지`} width={360} height={270} unoptimized /><i className="figma-cafe-map__no" aria-hidden="true">{index < journeyProgress ? "✓" : index + 1}</i></span>
                <span className="figma-cafe-map__copy"><small>STAGE {index + 1}</small><strong>{station.title}</strong><p>{station.description}</p></span>
                <em>{index < journeyProgress ? "다시 연습" : index > journeyProgress ? "잠김" : "도전하기"}</em>
              </button>
            ))}
          </div>
          <div className="figma-cafe-map__path" aria-hidden="true" />
        </main>
      )}

      {step === "queue" && queueScene === "dialogue" && (
        <CafeTalkStage
          conversation={cafeConversations.queue}
          line={mormiLines.queue}
          fallbackLine={fallbackLines.queue}
          inputText={dialogueInputs.queue ?? ""}
          sending={dialogueSending}
          onInput={(value) => setDialogueInput("queue", value)}
          onSubmit={(response) => answerMormi("queue", response)}
          onBack={returnToMap}
        >
          <CafeStageVisual
            conversation={cafeConversations.queue}
            fallback={<QueueVisual left={queueCounts.left} right={queueCounts.right} />}
          />
        </CafeTalkStage>
      )}

      {step === "queue" && queueScene !== "dialogue" && (
        <main className="figma-cafe-panel figma-cafe-queue-story" data-figma-node="74:4">
          {queueScene === "note" && (
            <section className="queue-note-scene">
              <Image src="/morami/bright-cutout.png" alt="공부 노트를 쓰는 모르미" width={310} height={340} unoptimized />
              <article><span>모르미의 공부노트</span><h2>{cafeConversations.queue?.turn.note_update?.text}</h2><small>{cafeConversations.queue?.turn.note_update?.attribution_label}</small></article>
            </section>
          )}
          {queueScene === "clear" && (
            <section className="queue-clear-scene">
              <Image src="/morami/celebrate-cutout.png" alt="별을 들고 기뻐하는 모르미" width={370} height={410} unoptimized />
              <div><span>STAGE 1 CLEAR!</span><h1>얏호~! 덕분에 빠른 줄에<br />서는 방법을 알았어!</h1><button onClick={returnToMap}>나가기</button></div>
            </section>
          )}

          {/* 노트 장면은 그림 대신 공부노트를 보여 주므로 마무리 문구를 아래에 그대로 둔다. */}
          {queueScene === "note" && <section className="queue-story-dialogue">
            <b>모르미</b>
            <p>{`${queueCounts.left < queueCounts.right ? "왼쪽" : "오른쪽"} 줄이 더 짧으니까 거기에 서는 게 좋구나! 가르쳐 준 내용은 잊지 않게 노트에 적어 둬야겠다!`}</p>
            <button className="queue-story-next" onClick={finishQueueStory}>다음으로</button>
          </section>}
        </main>
      )}

      {step === "menu" && menuScene === "dialogue" && (
        <CafeTalkStage
          conversation={cafeConversations.menu}
          line={mormiLines.menu}
          fallbackLine={fallbackLines.menu}
          inputText={dialogueInputs.menu ?? ""}
          sending={dialogueSending}
          onInput={(value) => setDialogueInput("menu", value)}
          onSubmit={(response) => answerMormi("menu", response)}
          onBack={returnToMap}
        >
          <CafeStageVisual conversation={cafeConversations.menu} />
        </CafeTalkStage>
      )}

      {step === "menu" && menuScene === "thanks" && (
        <main className="figma-cafe-panel figma-cafe-menu" data-figma-node="74:6">
          <section className="cafe-menu-thanks">
            <Image src="/morami/celebrate-cutout.png" alt="메뉴를 골라 줘서 기뻐하는 모르미" width={350} height={390} unoptimized />
            <div><span>주문 준비 완료!</span><h1>내 메뉴 골라 줘서 고마워!</h1>
              <p>{[mormeyMenu.name, menuChildMenu?.name].filter(Boolean).join(" + ")}<br />
                <strong>합계 {(mormeyMenu.price + (menuChildMenu?.price ?? 0)).toLocaleString("ko-KR")}원</strong></p>
              <button onClick={finishMenuStory}>완료!</button></div>
          </section>
        </main>
      )}

      {step === "sum" && (
        <CafeTalkStage
          conversation={cafeConversations.calculate}
          line={mormiLines.calculate}
          fallbackLine={fallbackLines.calculate}
          inputText={dialogueInputs.calculate ?? ""}
          sending={dialogueSending}
          onInput={(value) => setDialogueInput("calculate", value)}
          onSubmit={(response) => answerMormi("calculate", response)}
          onBack={returnToMap}
        >
          <CafeStageVisual conversation={cafeConversations.calculate} />
        </CafeTalkStage>
      )}

      {step === "change" && (
        <CafeTalkStage
          conversation={cafeConversations.change}
          line={mormiLines.change}
          fallbackLine={fallbackLines.change}
          inputText={dialogueInputs.change ?? ""}
          sending={dialogueSending}
          onInput={(value) => setDialogueInput("change", value)}
          onSubmit={(response) => answerMormi("change", response)}
          onBack={returnToMap}
        >
          <CafeStageVisual conversation={cafeConversations.change} />
        </CafeTalkStage>
      )}

      {step === "done" && (
        <main className="figma-cafe-panel figma-cafe-done">
          <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={420} height={420} unoptimized />
          <div><span>카페 외출 완료</span><h1>우리 힘으로 주문했어!</h1><p>줄을 고르고, 예산에 맞춰 메뉴를 담고, 메뉴 값을 더하고, 거스름돈까지 확인했어.</p>
            <button onClick={() => { void goHomeWithMormi(); }}>모르미와 집으로</button>
            <button className="figma-cafe-done__practice" onClick={returnToMap}>스테이지 더 연습하기</button></div>
        </main>
      )}
      {dialogueError && <p className="figma-cafe-feedback is-error" role="alert">{dialogueError}</p>}
    </section>
  );
}
