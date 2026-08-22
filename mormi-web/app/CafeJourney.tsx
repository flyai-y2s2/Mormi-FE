"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { api } from "./api-client";
import { calculationDialogueLine, menu, menuChoiceById, menuItemsForAi, validateMenuSelectionContext } from "./cafe-menu";
import { CafeStageComplete } from "./CafeStageComplete";
import { CafeStageThanks } from "./CafeStageThanks";
import { CafeStageVisual, QueueVisual } from "./CafeStageVisual";
import { CafeTalkStage, type CafeDialogueResponse } from "./CafeTalkStage";
import { cafeStations } from "./journey-config";
import { dialogueErrorMessage } from "./dialogue-errors";
import { createDialogueStartIntent, rememberDialogueId, rememberDialogueScreen, type DialogueStartMode } from "./dialogue-restart";
import {
  startCafeDialogue,
  submitMormiResponseThroughBe,
  type MormiConversation,
} from "./mormi-dialogue";
import { StarNote } from "./StarNote";

type CafeStep = "overview" | "queue" | "menu" | "sum" | "change" | "done";

const stationCopy = [
  { title: "줄 서기", description: "더 짧은 줄을 찾아요", image: "/cafe-stages/queue-v2.png" },
  { title: "메뉴 값 계산하기", description: "두 메뉴 가격을 더해요", image: "/cafe-stages/payment-v3.png" },
  { title: "거스름돈 받기", description: "10,000원에서 메뉴값을 빼요", image: "/cafe-stages/change-v3.png" },
] as const;

type CafeStage = "queue" | "menu" | "calculate" | "change";
type Props = {
  learnerName: string;
  learnerId: number;
  coinBalance: number;
  /** 진행도가 알려 준 진행 중 방문. 있으면 새로 만들지 않고 이 방문을 이어 받는다. */
  activeVisitId?: string | null;
  reloadDialogueStage?: CafeStage | null;
  reloadConversationId?: string | null;
  onReloadRestarted?: () => void;
  onBack: () => void;
  onComplete: () => void;
};

/** 스테이션 순서대로의 AI 시나리오. 화면이 뽑은 문제를 함께 보내야 시작된다. */
const cafeScenarioByStation = ["cafe_queue", "cafe_budget_menu", "cafe_menu_total", "cafe_change"] as const;
type QueueScene = "dialogue" | "note" | "thanks" | "clear";
type CalculationScene = "dialogue" | "thanks" | "clear";
type ChangeScene = "dialogue" | "thanks" | "clear";
const budgets = [7000, 8000] as const;

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

function conversationInputKey(conversation: MormiConversation | undefined) {
  if (!conversation) return "";
  return `${conversation.turn.task_index}:${conversation.turn.input.target_slots.join("|")}`;
}

export function CafeJourney({ learnerName, coinBalance, activeVisitId, reloadDialogueStage, reloadConversationId, onReloadRestarted, onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueScene, setQueueScene] = useState<QueueScene>("dialogue");
  const [queueCounts, setQueueCounts] = useState({ left: 3, right: 2 });
  const [calculationScene, setCalculationScene] = useState<CalculationScene>("dialogue");
  const [changeScene, setChangeScene] = useState<ChangeScene>("dialogue");
  const [, setMenuBudget] = useState<number>(8000);
  const [, setMormeyMenuId] = useState<string>("strawberry-juice");
  // 메뉴 고르기에서 아이가 고른 메뉴. 대화가 검증한 사실에서만 받아 축하 장면에 쓴다.
  // 거스름돈은 완료 화면의 분석 이벤트가 주문 금액을 알아야 해서 화면도 함께 기억한다.
  // 계산 스테이지는 문제 전체를 turn.visual 이 들고 오므로 따로 둘 필요가 없다.
  const [changeMenuId, setChangeMenuId] = useState<string>("americano");
  const [dialogueInputs, setDialogueInputs] = useState<Partial<Record<CafeStage, string>>>({});
  const [dialogueError, setDialogueError] = useState("");
  const [dialogueSending, setDialogueSending] = useState(false);
  const [helpVisibleStages, setHelpVisibleStages] = useState<Partial<Record<CafeStage, boolean>>>({});
  const [helpLoadingStage, setHelpLoadingStage] = useState<CafeStage | null>(null);
  const [queueChoiceFallbackKey, setQueueChoiceFallbackKey] = useState<string | null>(null);
  const [changeChoiceFallbackKey, setChangeChoiceFallbackKey] = useState<string | null>(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [problemContextError, setProblemContextError] = useState<CafeStage | null>(null);
  const dialogueRequestInFlight = useRef(false);
  const reloadDialogueStageRef = useRef<CafeStage | null>(reloadDialogueStage ?? null);
  const reloadDialogueIdRef = useRef<string | null>(reloadConversationId ?? null);

  // 모르미가 건네는 말. Mormi-AI 가 비었거나 실패하면 값이 비고,
  // 화면은 fallbackLines 의 문구를 그대로 쓴다.
  const [mormiLines, setMormiLines] = useState<Partial<Record<CafeStage, string>>>({});

  // 스테이션마다 독립된 전체 TurnContract를 보관한다.
  const [cafeConversations, setCafeConversations] = useState<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalks = useRef<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalkPromises = useRef<Partial<Record<CafeStage, Promise<MormiConversation | null>>>>({});
  const cafeDialogueStartRequests = useRef<Partial<Record<CafeStage, {
    input: {
      scenario_id: (typeof cafeScenarioByStation)[number];
      queue_context?: { left_count: number; right_count: number };
      cafe_context?: { menu_items: typeof menuItemsForAi; mormi_menu_id: string; budget?: number };
    };
    intent: ReturnType<typeof createDialogueStartIntent>;
  }>>>({});
  const validatedStages = useRef<Partial<Record<CafeStage, boolean>>>({});
  const finalizedStages = useRef<Partial<Record<CafeStage, boolean>>>({});
  // 이미 깬 돌다리를 다시 여는 중인지. 재연습은 진행도를 밀지 않고 지도로 돌아온다.
  const replayStages = useRef<Partial<Record<CafeStage, boolean>>>({});

  // 서버 방문 id. 스테이지 시도는 전부 여기에 기록된다.
  const visitId = useRef<string | null>(null);
  const visitPromise = useRef<Promise<string> | null>(null);
  // 화면은 메뉴 선택과 합계 계산을 하나의 2단계로 묶지만, Spring BE는 두 저장
  // 단계를 구분한다. 복구할 때 어느 대화부터 이어야 하는지 서버 단계를 기억한다.
  const visitStage = useRef<CafeStage | "complete">("queue");

  useEffect(() => {
    const screen = step === "queue" && queueScene === "dialogue" ? "cafe-queue"
      : step === "menu" ? "cafe-menu"
        : step === "sum" && calculationScene === "dialogue" ? "cafe-calculate"
          : step === "change" && changeScene === "dialogue" ? "cafe-change"
            : null;
    rememberDialogueScreen(screen);
  }, [calculationScene, changeScene, queueScene, step]);

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
      visitStage.current = visit.stage as CafeStage | "complete";
      if (visit.stage === "menu" || visit.stage === "calculate") setJourneyProgress((progress) => Math.max(progress, 1));
      if (visit.stage === "change") setJourneyProgress((progress) => Math.max(progress, 2));
      if (visit.stage === "complete") setJourneyProgress(3);
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
    cafeTalks.current[stage] = conversation;
    rememberDialogueId(conversation.conversation_id);
    setCafeConversations((current) => ({ ...current, [stage]: conversation }));
    setMormiLines((lines) => ({ ...lines, [stage]: conversation.turn.mormi.text }));
    setDialogueError("");
    setProblemContextError(null);
    if (conversation.stage_progress) {
      visitStage.current = conversation.stage_progress.completed
        ? conversation.stage_progress.next_stage
        : conversation.stage_progress.stage;
    }
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
    startMode: DialogueStartMode,
  ) {
    setMormiLines((lines) => ({ ...lines, [stage]: undefined }));
    setCafeConversations((current) => ({ ...current, [stage]: undefined }));
    setDialogueError("");
    setDialogueInputs((current) => ({ ...current, [stage]: "" }));
    setHelpVisibleStages((current) => ({ ...current, [stage]: false }));
    setHelpLoadingStage(null);
    if (stage === "queue") setQueueChoiceFallbackKey(null);
    if (stage === "calculate") setCalculationScene("dialogue");
    if (stage === "change") {
      setChangeScene("dialogue");
      setChangeChoiceFallbackKey(null);
    }
    delete cafeTalks.current[stage];
    validatedStages.current[stage] = false;
    finalizedStages.current[stage] = false;

    const startRequest = cafeDialogueStartRequests.current[stage] ?? {
      input,
      intent: createDialogueStartIntent(startMode),
    };
    cafeDialogueStartRequests.current[stage] = startRequest;

    const pending = (async () => {
      try {
        const id = visitId.current ?? await visitPromise.current;
        if (!id) throw new Error("카페 방문을 먼저 열어 주세요.");
        const conversation = await startCafeDialogue(id, { ...startRequest.input, ...startRequest.intent });
        if (startRequest.intent.start_mode === "restart"
            && (conversation.turn.task_index !== 0
              || (reloadDialogueIdRef.current && conversation.conversation_id === reloadDialogueIdRef.current))) {
          throw new Error("새 문제의 첫 대화를 불러오지 못했어요.");
        }
        if (cafeDialogueStartRequests.current[stage] === startRequest) {
          delete cafeDialogueStartRequests.current[stage];
        }
        if (reloadDialogueStageRef.current === stage) {
          reloadDialogueStageRef.current = null;
          reloadDialogueIdRef.current = null;
          onReloadRestarted?.();
        }
        return applyCafeConversation(stage, conversation);
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
        setQueueScene("thanks");
      }
    } else if (stage === "menu") {
      const conversation = cafeTalks.current.menu;
      const context = conversation?.scenario_context?.cafe_context;
      const picked = conversation?.turn.completion?.verified_facts?.child_menu_id;
      const mormeyPick = context?.menu_items.find((item) => item.id === context.mormi_menu_id);
      const childMenu = context?.menu_items.find((item) => item.id === picked);
      if (context && typeof context.budget === "number" && mormeyPick && childMenu) {
        captureMormeyEvent("cafe_menu_selected", {
          menu_ids: [mormeyPick.id, childMenu.id].join(","),
          total: mormeyPick.price + childMenu.price,
          budget: context.budget,
          over_budget: false,
        });
      }
      finishMenuStory();
    } else if (stage === "calculate") {
      if (!replaying) setJourneyProgress((progress) => Math.max(progress, 2));
      setCalculationScene("thanks");
    } else {
      if (!replaying) setJourneyProgress(3);
      setChangeScene("thanks");
    }
  }

  const changeMenu = menu.find((item) => item.id === changeMenuId) ?? menu[0];
  const changeTarget = 10000 - changeMenu.price;
  const stationIndex = step === "overview" ? Math.min(journeyProgress, 2) : step === "queue" ? 0 : step === "menu" || step === "sum" ? 1 : 2;
  // 세 스테이지를 다 깬 뒤에는 지도가 연습장이 된다. 어느 스테이지든 골라 다시 푼다.
  const allStationsCleared = journeyProgress >= stationCopy.length;
  // 대화 화면인지. 축하·노트 장면은 입력이 없어 100svh 세로 배분을 쓰지 않는다.
  const isTalk = (step === "queue" && queueScene === "dialogue")
    || step === "menu"
    || (step === "sum" && calculationScene === "dialogue")
    || (step === "change" && changeScene === "dialogue");

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
    if (index === 0) {
      replayStages.current.queue = isReplay;
      const counts = randomQueueCounts();
      setQueueCounts(counts);
      setQueueScene("dialogue");
      openCafeDialogue("queue", {
        scenario_id: cafeScenarioByStation[0],
        queue_context: { left_count: counts.left, right_count: counts.right },
      }, isReplay || reloadDialogueStageRef.current === "queue" ? "restart" : "resume");
      setStep("queue");
    }
    if (index === 1) {
      // 새 방문이 이미 서버의 calculate 단계까지 왔다면 메뉴 선택을 다시 시키지
      // 않고 합계 질문부터 복구한다. 완료된 2단계의 재연습은 두 과정을 모두 푼다.
      if (!isReplay && visitStage.current === "calculate") {
        const nextSumMenu = randomItem(menu);
        replayStages.current.calculate = false;
        openCafeDialogue("calculate", {
          scenario_id: cafeScenarioByStation[2],
          cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
        }, reloadDialogueStageRef.current === "calculate" ? "restart" : "resume");
        setStep("sum");
      } else {
        const nextMormeyMenu = randomItem(menu);
        const nextBudget = randomItem(budgets);
        replayStages.current.menu = isReplay;
        setMenuBudget(nextBudget);
        setMormeyMenuId(nextMormeyMenu.id);
        openCafeDialogue("menu", {
          scenario_id: cafeScenarioByStation[1],
          cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextMormeyMenu.id, budget: nextBudget },
        }, isReplay || reloadDialogueStageRef.current === "menu" ? "restart" : "resume");
        setStep("menu");
      }
    }
    if (index === 2) {
      const nextChangeMenu = randomItem(menu);
      replayStages.current.change = isReplay;
      setChangeMenuId(nextChangeMenu.id);
      openCafeDialogue("change", {
        scenario_id: cafeScenarioByStation[3],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextChangeMenu.id },
      }, isReplay || reloadDialogueStageRef.current === "change" ? "restart" : "resume");
      setStep("change");
    }
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  function finishQueueStory() {
    if (!replayStages.current.queue) setJourneyProgress((progress) => Math.max(progress, 1));
    setQueueScene("thanks");
  }

  function showStageSummary(stage: CafeStage) {
    if (stage === "queue") setQueueScene("clear");
    if (stage === "calculate") setCalculationScene("clear");
    if (stage === "change") setChangeScene("clear");
  }

  function finishMenuStory() {
    // 화면의 2단계는 메뉴 고르기와 값 계산을 한 흐름으로 묶는다. 서버는 두 단계를
    // 따로 저장하므로 메뉴 검증이 끝난 직후 기존 계산 대화를 그대로 연다.
    // 이걸 빼면 대화가 없어 turn.status 가 "completed" 가 되지 않고,
    // 합계를 맞혀도 스테이지가 끝나지 않는다.
    const nextSumMenu = randomItem(menu);
    const calculationReplay = replayStages.current.menu === true;
    replayStages.current.calculate = calculationReplay;
    openCafeDialogue("calculate", {
      scenario_id: cafeScenarioByStation[2],
      cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
    }, calculationReplay ? "restart" : "resume");
    setStep("sum");
    window.scrollTo({ top: 0, behavior: "smooth" });
    captureMormeyEvent("cafe_station_started", { station_index: 2, station: cafeStations[1] });
  }

  function finishCalculationStory() {
    returnToMap();
  }

  function finishChangeStory() {
    if (replayStages.current.change) {
      returnToMap();
      return;
    }
    setStep("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setDialogueInput(stage: CafeStage, value: string) {
    setDialogueInputs((current) => ({ ...current, [stage]: value }));
  }

  /** 답을 보내고 입력칸을 비운다. 네 스테이지가 모두 이 경로 하나만 쓴다. */
  async function answerMormi(stage: CafeStage, response: CafeDialogueResponse) {
    const requestsHelp = response.type === "no_response";
    if (requestsHelp) setHelpLoadingStage(stage);
    const previous = cafeTalks.current[stage];
    const next = await sendCafeResponse(stage, response);
    if (stage === "queue" || stage === "change") {
      const previousKey = conversationInputKey(previous);
      const nextKey = conversationInputKey(next ?? undefined);
      const shouldRevealChoices = Boolean(
        next
        && next.turn.input.kind === "choices"
        && (requestsHelp || (response.type === "choice" && previousKey === nextKey)),
      );
      if (stage === "queue") setQueueChoiceFallbackKey(shouldRevealChoices ? nextKey : null);
      else setChangeChoiceFallbackKey(shouldRevealChoices ? nextKey : null);
    }
    if (requestsHelp) {
      if (next) setHelpVisibleStages((current) => ({ ...current, [stage]: true }));
      setHelpLoadingStage((current) => current === stage ? null : current);
    }
    setDialogueInput(stage, "");
  }

  function noteCount(...stages: CafeStage[]) {
    return new Set(stages.flatMap((stage) => {
      const note = cafeConversations[stage]?.turn.note_update;
      return note ? [note.note_id] : [];
    })).size;
  }

  /** 중앙 사진 카드의 메뉴 ID를 현재 서버 선택지 ID와 직접 연결한다. */
  function answerMenuChoice(stage: "menu" | "calculate", menuId: string) {
    const conversation = cafeTalks.current[stage];
    const choice = conversation && menuChoiceById(menuId, conversation.turn.input.choices);
    if (!choice) {
      setDialogueError("지금 선택할 수 있는 메뉴가 아니에요. 다시 골라 주세요.");
      return;
    }

    if (stage === "menu") {
      const context = conversation.scenario_context?.cafe_context;
      const validation = validateMenuSelectionContext(context, conversation.turn.visual.data, choice.id);
      if (!validation.valid) {
        if (validation.reason === "duplicate") {
          setDialogueError("모르미가 고른 메뉴 말고 다른 메뉴를 골라 주세요.");
        } else {
          setDialogueError("");
          setProblemContextError("menu");
        }
        return;
      }
      if (validation.total > validation.budget) {
        captureMormeyEvent("cafe_menu_selected", {
          menu_ids: [validation.mormiMenuId, validation.childMenuId].join(","),
          total: validation.total,
          budget: validation.budget,
          over_budget: true,
        });
        setBudgetModalOpen(true);
        return;
      }
    }

    void answerMormi(stage, { type: "choice", choice_ids: [choice.id] });
  }

  function retryMenuProblem() {
    const nextMormeyMenu = randomItem(menu);
    const nextBudget = randomItem(budgets);
    setMormeyMenuId(nextMormeyMenu.id);
    setMenuBudget(nextBudget);
    openCafeDialogue("menu", {
      scenario_id: cafeScenarioByStation[1],
      cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextMormeyMenu.id, budget: nextBudget },
    }, "restart");
    setStep("menu");
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
          helpVisible={Boolean(helpVisibleStages.queue)}
          helpLoading={helpLoadingStage === "queue"}
          deferChoices
          choiceFallbackVisible={queueChoiceFallbackKey === conversationInputKey(cafeConversations.queue)}
          onInput={(value) => setDialogueInput("queue", value)}
          onSubmit={(response) => { void answerMormi("queue", response); }}
          onChoiceFallback={() => setQueueChoiceFallbackKey(conversationInputKey(cafeConversations.queue))}
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
              <Image src="/morami/bright-cutout.png" alt="별노트를 쓰는 모르미" width={310} height={340} unoptimized />
              <StarNote text={cafeConversations.queue?.turn.note_update?.text} />
            </section>
          )}
          {queueScene === "thanks" && (
            <CafeStageThanks
              learnerName={learnerName}
              title="줄 서기 완료!"
              onNext={() => showStageSummary("queue")}
            />
          )}
          {queueScene === "clear" && (
            <CafeStageComplete
              stageNumber={1}
              title="줄을 비교하는 방법을"
              highlight="알게 됐어요!"
              noteCount={noteCount("queue")}
              currentMoney={coinBalance}
              actionLabel="지도에서 확인하기"
              onAction={returnToMap}
            />
          )}

          {/* 노트 장면은 그림 대신 별노트를 보여 주므로 마무리 문구를 아래에 그대로 둔다. */}
          {queueScene === "note" && <section className="queue-story-dialogue">
            <b>모르미</b>
            <p>{`${queueCounts.left < queueCounts.right ? "왼쪽" : "오른쪽"} 줄이 더 짧으니까 거기에 서는 게 좋구나! 가르쳐 준 내용은 잊지 않게 별노트에 적어 둬야겠다!`}</p>
            <button className="queue-story-next" onClick={finishQueueStory}>다음으로</button>
          </section>}
        </main>
      )}

      {step === "menu" && (
        <CafeTalkStage
          conversation={cafeConversations.menu}
          line={mormiLines.menu}
          fallbackLine={fallbackLines.menu}
          inputText={dialogueInputs.menu ?? ""}
          sending={dialogueSending}
          helpVisible={Boolean(helpVisibleStages.menu)}
          helpLoading={helpLoadingStage === "menu"}
          onInput={(value) => setDialogueInput("menu", value)}
          onSubmit={(response) => { void answerMormi("menu", response); }}
          onBack={returnToMap}
        >
          <CafeStageVisual
            conversation={cafeConversations.menu}
            sending={dialogueSending}
            onMenuChoice={(choiceId) => answerMenuChoice("menu", choiceId)}
          />
        </CafeTalkStage>
      )}

      {step === "sum" && calculationScene === "dialogue" && (
        <CafeTalkStage
          conversation={cafeConversations.calculate}
          line={calculationDialogueLine(mormiLines.calculate)}
          fallbackLine={fallbackLines.calculate}
          inputText={dialogueInputs.calculate ?? ""}
          sending={dialogueSending}
          helpVisible={Boolean(helpVisibleStages.calculate)}
          helpLoading={helpLoadingStage === "calculate"}
          onInput={(value) => setDialogueInput("calculate", value)}
          onSubmit={(response) => { void answerMormi("calculate", response); }}
          onBack={returnToMap}
        >
          <CafeStageVisual
            conversation={cafeConversations.calculate}
            sending={dialogueSending}
            onMenuChoice={(choiceId) => answerMenuChoice("calculate", choiceId)}
          />
        </CafeTalkStage>
      )}

      {step === "sum" && calculationScene === "clear" && (
        <CafeStageComplete
          stageNumber={2}
          title="두 메뉴의 값을"
          highlight="정확히 더했어요!"
          noteCount={noteCount("menu", "calculate")}
          currentMoney={coinBalance}
          actionLabel="지도에서 확인하기"
          onAction={finishCalculationStory}
        />
      )}

      {step === "sum" && calculationScene === "thanks" && (
        <CafeStageThanks
          learnerName={learnerName}
          title="메뉴 값 계산 완료!"
          onNext={() => showStageSummary("calculate")}
        />
      )}

      {step === "change" && changeScene === "dialogue" && (
        <CafeTalkStage
          conversation={cafeConversations.change}
          line={mormiLines.change}
          fallbackLine={fallbackLines.change}
          inputText={dialogueInputs.change ?? ""}
          sending={dialogueSending}
          helpVisible={Boolean(helpVisibleStages.change)}
          helpLoading={helpLoadingStage === "change"}
          deferChoices
          choiceFallbackVisible={changeChoiceFallbackKey === conversationInputKey(cafeConversations.change)}
          onInput={(value) => setDialogueInput("change", value)}
          onSubmit={(response) => { void answerMormi("change", response); }}
          onChoiceFallback={() => setChangeChoiceFallbackKey(conversationInputKey(cafeConversations.change))}
          onBack={returnToMap}
        >
          <CafeStageVisual conversation={cafeConversations.change} />
        </CafeTalkStage>
      )}

      {step === "change" && changeScene === "clear" && (
        <CafeStageComplete
          stageNumber={3}
          title="거스름돈까지"
          highlight="바르게 계산했어요!"
          noteCount={noteCount("change")}
          currentMoney={coinBalance}
          actionLabel="완료하기"
          onAction={finishChangeStory}
        />
      )}

      {step === "change" && changeScene === "thanks" && (
        <CafeStageThanks
          learnerName={learnerName}
          title="거스름돈 계산 완료!"
          onNext={() => showStageSummary("change")}
        />
      )}

      {step === "done" && (
        <CafeStageComplete
          stageNumber={3}
          eyebrow="카페 외출 완료"
          title="우리 힘으로"
          highlight="주문했어!"
          noteCount={noteCount("queue", "menu", "calculate", "change")}
          currentMoney={coinBalance}
          actionLabel="모르미와 집으로"
          onAction={() => { void goHomeWithMormi(); }}
          secondaryActionLabel="스테이지 더 연습하기"
          onSecondaryAction={returnToMap}
        />
      )}
      {dialogueError && <p className="figma-cafe-feedback is-error" role="alert">{dialogueError}</p>}
      {problemContextError === "menu" && <div className="cafe-problem-recovery" role="alert"><p>메뉴와 예산 정보가 달라졌어요. 새 문제를 불러와 주세요.</p><button type="button" onClick={retryMenuProblem}>문제 다시 불러오기</button></div>}
      {budgetModalOpen && <div className="modal-backdrop cafe-budget-backdrop" role="dialog" aria-modal="true" aria-label="예산 초과 안내">
        <div className="cafe-budget-modal">
          <Image src="/morami/confused-cutout.png" alt="다시 골라 달라고 부탁하는 모르미" width={150} height={150} unoptimized />
          <h2>예산을 넘었어요. 다른 메뉴를 골라 봐!</h2>
          <button type="button" onClick={() => setBudgetModalOpen(false)}>확인</button>
        </div>
      </div>}
    </section>
  );
}
