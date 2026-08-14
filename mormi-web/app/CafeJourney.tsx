"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { api, type StageResult } from "./api-client";
import { cafeStations } from "./journey-config";
import {
  startCafeDialogue,
  submitMormiResponseThroughBe,
  type MormiConversation,
  type MormiResponseType,
} from "./mormi-dialogue";

type CafeStep = "overview" | "queue" | "menu" | "sum" | "change" | "done";

// 시계 읽기는 렌더가 아니라 이벤트 핸들러와 이펙트에서만 일어난다.
const nowMs = () => Date.now();

const menu = [
  { id: "americano", name: "아메리카노", price: 3000, image: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 4500, image: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 5000, image: "/figma/cafe/sandwich.png?v=2" },
] as const;

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

const menuItemsForAi = menu.map(({ id, name, price, image }) => ({
  id,
  name,
  price,
  image_url: image,
}));
type QueueScene = "intro" | "count-both" | "count-left" | "note" | "clear";
type MenuScene = "brief" | "mormey-pick" | "choose" | "thanks";
const budgets = [8000, 9000, 10000] as const;

function randomItem<T>(items: readonly T[], excluded?: T) {
  const candidates = excluded === undefined ? items : items.filter((item) => item !== excluded);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function randomQueueCounts() {
  // queue-v2.png에는 왼쪽 2명·오른쪽 1명이 있다. 이미지와 학습 문제의
  // 인원 수가 어긋나지 않도록 같은 장면을 좌우 반전한 경우만 함께 사용한다.
  return Math.random() < 0.5 ? { left: 2, right: 1 } : { left: 1, right: 2 };
}

function CafeDialogueControls({
  conversation,
  inputText,
  sending,
  onInput,
  onSubmit,
}: {
  conversation: MormiConversation | undefined;
  inputText: string;
  sending: boolean;
  onInput: (value: string) => void;
  onSubmit: (response: {
    type: MormiResponseType;
    text?: string;
    choice_ids?: string[];
    values?: Record<string, string | number | boolean | string[]>;
  }) => void;
}) {
  if (!conversation || conversation.turn.state_version === 0 || conversation.turn.status === "completed") return null;
  const { turn } = conversation;
  const inputKind = turn.input.kind;
  const completionValues = turn.input.config.completion_values;
  const actionValues = completionValues && typeof completionValues === "object" && !Array.isArray(completionValues)
    ? completionValues as Record<string, string | number | boolean | string[]>
    : { completed: true };
  const structuredValues = () => {
    const numbers = inputText.match(/\d[\d,]*/g)?.map((value) => Number(value.replaceAll(",", ""))) ?? [];
    if (inputKind === "count") {
      return Object.fromEntries(
        turn.input.target_slots
          .slice(0, numbers.length)
          .map((slot, index) => [slot, numbers[index]]),
      );
    }
    if (inputKind === "equation" && numbers.length > 0) {
      const resultSlot = turn.input.target_slots.includes("result")
        ? "result"
        : turn.input.target_slots[0];
      return resultSlot ? { [resultSlot]: numbers.at(-1)! } : {};
    }
    return {};
  };

  return <aside className="cafe-ai-followup" aria-live="polite">
    {turn.help_card?.visible && <div className="cafe-help-card"><strong>{turn.help_card.title}</strong><p>{turn.help_card.body}</p></div>}
    {inputKind === "text" && <form onSubmit={(event) => {
      event.preventDefault();
      if (!inputText.trim() || sending) return;
      onSubmit({ type: "text", text: inputText.trim() });
    }}>
      <label>모르미에게 이어서 알려주기
        <input value={inputText} onChange={(event) => onInput(event.target.value)} placeholder={turn.input.placeholder || "짧게 알려줘"} />
      </label>
      <button type="submit" disabled={!inputText.trim() || sending}>{sending ? "전하는 중…" : turn.input.submit_label || "알려주기"}</button>
    </form>}
    {(inputKind === "choices" || inputKind === "fill") && <div className="cafe-ai-choices">
      {turn.input.choices.filter((choice) => !choice.disabled).map((choice) => <button key={choice.id} disabled={sending} onClick={() => onSubmit({ type: inputKind === "fill" ? "fill" : "choice", choice_ids: [choice.id] })}>{choice.label}</button>)}
    </div>}
    {(inputKind === "count" || inputKind === "equation") && <form onSubmit={(event) => {
      event.preventDefault();
      const values = structuredValues();
      if (Object.keys(values).length === 0 || sending) return;
      onSubmit({ type: inputKind, values });
    }}>
      <label>{inputKind === "count" ? "센 숫자를 차례로 적기" : "계산한 값 적기"}
        <input inputMode="numeric" value={inputText} onChange={(event) => onInput(event.target.value)} placeholder={inputKind === "count" ? "예: 3, 5" : "예: 8100"} />
      </label>
      <button type="submit" disabled={!inputText.trim() || sending}>{sending ? "전하는 중…" : turn.input.submit_label || "알려주기"}</button>
    </form>}
    {(inputKind === "joint" || inputKind === "button") && <button className="figma-cafe-action" disabled={sending} onClick={() => onSubmit({ type: "action", values: actionValues })}>{turn.input.submit_label || "도움 카드와 같이 해보기"}</button>}
    {inputKind !== "none" && inputKind !== "joint" && inputKind !== "button" && <button className="cafe-ai-dont-know" disabled={sending} onClick={() => onSubmit({ type: "no_response" })}>잘 모르겠어</button>}
  </aside>;
}

export function CafeJourney({ activeVisitId, onBack, onComplete }: Props) {
  const [step, setStep] = useState<CafeStep>("overview");
  const [journeyProgress, setJourneyProgress] = useState(0);
  const [queueHelp, setQueueHelp] = useState(false);
  const [queueFeedback, setQueueFeedback] = useState("");
  const [queueScene, setQueueScene] = useState<QueueScene>("intro");
  const [queueCountAnswer, setQueueCountAnswer] = useState("");
  const [queueCounts, setQueueCounts] = useState({ left: 3, right: 2 });
  const [menuScene, setMenuScene] = useState<MenuScene>("brief");
  const [menuBudget, setMenuBudget] = useState<number>(10000);
  const [mormeyMenuId, setMormeyMenuId] = useState<string>("strawberry-juice");
  const [selectedMenu, setSelectedMenu] = useState<string[]>([]);
  const [menuFeedback, setMenuFeedback] = useState("");
  const [sumMormeyMenuId, setSumMormeyMenuId] = useState<string>("americano");
  const [sumChildMenuId, setSumChildMenuId] = useState<string>("");
  const [sumAnswer, setSumAnswer] = useState("");
  const [sumFeedback, setSumFeedback] = useState("");
  const [changeMenuId, setChangeMenuId] = useState<string>("americano");
  const [changeCounts, setChangeCounts] = useState<Record<number, number>>({ 500: 0, 1000: 0 });
  const [changeFeedback, setChangeFeedback] = useState("");
  const [dialogueInputs, setDialogueInputs] = useState<Partial<Record<CafeStage, string>>>({});
  const [dialogueError, setDialogueError] = useState("");
  const [dialogueSending, setDialogueSending] = useState(false);
  const dialogueRequestInFlight = useRef(false);

  // 모르미가 건네는 말. Mormi-AI 가 비었거나 실패하면 값이 비고,
  // 화면은 아래의 기본 문구를 그대로 쓴다.
  const [mormiLines, setMormiLines] = useState<Partial<Record<CafeStage, string>>>({});

  // 스테이션마다 독립된 전체 TurnContract를 보관한다.
  const [cafeConversations, setCafeConversations] = useState<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalks = useRef<Partial<Record<CafeStage, MormiConversation>>>({});
  const cafeTalkPromises = useRef<Partial<Record<CafeStage, Promise<MormiConversation | null>>>>({});
  const validatedStages = useRef<Partial<Record<CafeStage, boolean>>>({});
  const finalizedStages = useRef<Partial<Record<CafeStage, boolean>>>({});

  // 서버 방문 id. 스테이지 시도는 전부 여기에 기록된다.
  const visitId = useRef<string | null>(null);
  const visitPromise = useRef<Promise<string> | null>(null);
  // 스테이지별 시도 번호. 틀린 시도도 각각 한 건으로 남는다.
  const attemptNos = useRef<Record<string, number>>({ queue: 0, menu: 0, calculate: 0, change: 0 });
  const stageStartedAt = useRef(0);

  useEffect(() => {
    stageStartedAt.current = nowMs();
    // 방문 생성이 끝나기 전에 답을 눌러도 유실되지 않도록 같은 Promise를 공유한다.
    //
    // 진행 중 방문 id 를 이미 알고 있으면 조회만 한다. POST 는 없을 때 새로 만드는
    // 부수효과가 있어, 단순 복구에는 쓰지 않는다. 조회가 실패하면(만료·소유자 불일치)
    // 그때 POST 로 넘어간다.
    // 이미 끝난 방문 id 가 남아 있을 수 있으므로, 완료된 방문이면 새 방문을 연다.
    const load = activeVisitId
      ? api.getCafeVisit(activeVisitId)
        .then((visit) => (visit.completed_at ? api.startCafeVisit() : visit))
        .catch(() => api.startCafeVisit())
      : api.startCafeVisit();

    const pending = load.then((visit) => {
      visitId.current = visit.cafe_visit_id;
      if (visit.stage === "menu") setJourneyProgress((progress) => Math.max(progress, 1));
      if (visit.stage === "calculate") setJourneyProgress((progress) => Math.max(progress, 2));
      if (visit.stage === "change") setJourneyProgress((progress) => Math.max(progress, 3));
      if (visit.stage === "complete") setJourneyProgress(4);
      if (visit.order_total !== null) setMenuFeedback("");
      setMenuBudget(visit.target_amount);

      // 스테이지별 시도 번호를 이어받는다. 이걸 0 으로 두면 재개 뒤 첫 시도가
      // attempt_no 1 로 나가고, 서버는 (visit, stage, attempt_no) 멱등키로 이미
      // 기록된 시도라 보고 새 답을 저장하지 않는다.
      for (const attempt of visit.attempts) {
        const current = attemptNos.current[attempt.stage] ?? 0;
        attemptNos.current[attempt.stage] = Math.max(current, attempt.attempt_no);
      }
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
      } else if (stage === "calculate") {
        setSumMormeyMenuId(restoredCafe.mormi_menu_id);
      } else if (stage === "change") {
        setChangeMenuId(restoredCafe.mormi_menu_id);
      }
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
  ) {
    setMormiLines((lines) => ({ ...lines, [stage]: undefined }));
    setDialogueError("");
    setDialogueInputs((current) => ({ ...current, [stage]: "" }));
    delete cafeTalks.current[stage];
    validatedStages.current[stage] = false;
    finalizedStages.current[stage] = false;

    const pending = (async () => {
      try {
        const id = visitId.current ?? await visitPromise.current;
        if (!id) throw new Error("카페 방문을 먼저 열어 주세요.");
        return applyCafeConversation(stage, await startCafeDialogue(id, input));
      } catch (error: unknown) {
        setDialogueError(error instanceof Error ? error.message : "모르미 대화를 시작하지 못했어요.");
        return null;
      }
    })();
    cafeTalkPromises.current[stage] = pending;
  }

  async function sendCafeResponse(
    stage: CafeStage,
    response: {
      type: MormiResponseType;
      text?: string;
      choice_ids?: string[];
      values?: Record<string, string | number | boolean | string[]>;
    },
  ) {
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
      setDialogueError(error instanceof Error ? error.message : "답을 보내지 못했어요.");
      return null;
    } finally {
      dialogueRequestInFlight.current = false;
      setDialogueSending(false);
    }
  }

  function sendCafeAnswer(stage: CafeStage, text: string) {
    const answer = text.trim();
    if (!answer) return Promise.resolve(null);
    return sendCafeResponse(stage, { type: "text", text: answer.slice(0, 300) });
  }

  function markStageValidated(stage: CafeStage, result: StageResult) {
    validatedStages.current[stage] = result.is_correct && result.next_stage_unlocked;
    if (validatedStages.current[stage] && cafeTalks.current[stage]?.turn.status === "completed") {
      completeValidatedStage(stage);
    }
  }

  function completeValidatedStage(stage: CafeStage) {
    if (finalizedStages.current[stage]) return;
    finalizedStages.current[stage] = true;
    if (stage === "queue") {
      setQueueFeedback("");
      if (cafeTalks.current.queue?.turn.note_update) {
        setQueueScene("note");
      } else {
        setJourneyProgress((progress) => Math.max(progress, 1));
        setQueueScene("clear");
      }
    } else if (stage === "menu") {
      setMenuFeedback("");
      setMenuScene("thanks");
    } else if (stage === "calculate") {
      setSumFeedback("");
      setJourneyProgress((progress) => Math.max(progress, 3));
      window.setTimeout(returnToMap, 500);
    } else {
      setChangeFeedback("");
      setJourneyProgress(4);
      window.setTimeout(() => setStep("done"), 500);
    }
  }

  function nextAttemptNo(stage: CafeStage) {
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
  const mormeyMenu = menu.find((item) => item.id === mormeyMenuId) ?? menu[0];
  const sumMormeyMenu = menu.find((item) => item.id === sumMormeyMenuId) ?? menu[0];
  const sumChildMenu = menu.find((item) => item.id === sumChildMenuId);
  const sumTarget = sumMormeyMenu.price + (sumChildMenu?.price ?? 0);
  const changeMenu = menu.find((item) => item.id === changeMenuId) ?? menu[0];
  const changeTotal = 1000 * changeCounts[1000] + 500 * changeCounts[500];
  const changeTarget = 10000 - changeMenu.price;
  const stationIndex = step === "overview" ? Math.min(journeyProgress, 3) : step === "queue" ? 0 : step === "menu" ? 1 : step === "sum" ? 2 : 3;

  function returnToMap() {
    setStep("overview");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openStation(index: number) {
    if (index > journeyProgress) return;
    if (index === 0) {
      const counts = randomQueueCounts();
      setQueueCounts(counts);
      setQueueScene("intro");
      setQueueCountAnswer("");
      setQueueFeedback("");
      setQueueHelp(false);
      openCafeDialogue("queue", {
        scenario_id: cafeScenarioByStation[0],
        queue_context: { left_count: counts.left, right_count: counts.right },
      });
    }
    if (index === 1) {
      const nextMormeyMenu = randomItem(menu);
      const nextBudget = randomItem(budgets);
      setMenuBudget(nextBudget);
      setMormeyMenuId(nextMormeyMenu.id);
      setMenuScene("brief");
      setSelectedMenu([]);
      setMenuFeedback("");
      openCafeDialogue("menu", {
        scenario_id: cafeScenarioByStation[1],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextMormeyMenu.id, budget: nextBudget },
      });
    }
    if (index === 2) {
      const nextSumMenu = randomItem(menu);
      setSumMormeyMenuId(nextSumMenu.id);
      setSumChildMenuId("");
      setSumAnswer("");
      setSumFeedback("");
      openCafeDialogue("calculate", {
        scenario_id: cafeScenarioByStation[2],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
      });
    }
    if (index === 3) {
      const nextChangeMenu = randomItem(menu);
      setChangeMenuId(nextChangeMenu.id);
      setChangeCounts({ 500: 0, 1000: 0 });
      setChangeFeedback("");
      openCafeDialogue("change", {
        scenario_id: cafeScenarioByStation[3],
        cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextChangeMenu.id },
      });
    }
    setStep((["queue", "menu", "sum", "change"] as CafeStep[])[index]);
    captureMormeyEvent("cafe_station_started", { station_index: index + 1, station: cafeStations[index] });
  }

  async function submitQueueCounts() {
    if (!queueCountAnswer.trim()) return;
    // 정오와 무관하게 아이 원문을 AI에 먼저 전달한다. 부분 답·창의적 오답은
    // 발화 이해기가 직전 질문과 함께 해석하고, 화면은 그 반응을 그대로 보여 준다.
    await sendCafeAnswer("queue", queueCountAnswer);
    const numbers = queueCountAnswer.match(/[1-5]/g)?.map(Number) ?? [];
    if (numbers.length < 2 || numbers[0] !== queueCounts.left || numbers[1] !== queueCounts.right) {
      setQueueFeedback("모르미가 아직 헷갈리는 부분을 다시 물어보고 있어요.");
      setQueueHelp(true);
      return;
    }
    setQueueFeedback("");
    setQueueScene("count-left");
  }

  async function chooseLeftCount(count: number) {
    const shorterCount = Math.min(queueCounts.left, queueCounts.right);
    const id = visitId.current ?? await visitPromise.current;
    let result: StageResult | null = null;
    if (id) {
      // 좌우 인원과 아이의 답을 함께 보낸다. 정오 판정은 서버가 한다.
      const attemptNo = nextAttemptNo("queue");
      const elapsedMs = stageElapsedMs();
      try {
        result = await api.cafeQueue(id, {
        left_count: queueCounts.left,
        right_count: queueCounts.right,
        chosen_count: count,
        scaffold_used: queueHelp,
        attempt_no: attemptNo,
        elapsed_ms: elapsedMs,
        });
        markStageValidated("queue", result);
      } catch (error: unknown) {
        setQueueFeedback(error instanceof Error ? error.message : "줄 서기 답을 저장하지 못했어요.");
        return;
      }
    }
    const conversation = await sendCafeAnswer("queue", `왼쪽 줄은 ${queueCounts.left}명, 오른쪽 줄은 ${queueCounts.right}명이야. 더 짧은 줄은 ${count}명이야.`);
    if (count === shorterCount && result?.is_correct) {
      setQueueFeedback(conversation?.turn.status === "completed" ? "" : "모르미가 한 가지를 더 궁금해해요.");
      captureMormeyEvent("cafe_queue_answered", { correct: true, scaffold_used: queueHelp, left_count: queueCounts.left, right_count: queueCounts.right, learner_answer: queueCountAnswer });
      return;
    }
    setQueueFeedback("모르미가 아직 헷갈리는 부분을 다시 물어보고 있어요.");
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
      if (id === mormeyMenuId) {
        setMenuFeedback(`${mormeyMenu.name}는 모르미가 먼저 골랐어요. 다른 메뉴 하나를 골라 주세요!`);
        return current;
      }
      if (current.includes(id)) return current.filter((item) => item !== id);
      const item = menu.find((candidate) => candidate.id === id);
      if (!item) return current;
      if (current.length >= 2) {
        setMenuFeedback("메뉴는 두 개까지 고를 수 있어요.");
        return current;
      }
      return [...current, id];
    });
  }

  async function orderMenu() {
    if (selectedMenu.length !== 2) return;
    // 예산 초과도 한 건의 시도로 남긴다. 서버가 예산과 함께 받아 오답으로 기록한다.
    const id = visitId.current ?? await visitPromise.current;
    let result: StageResult | null = null;
    if (id) {
      const attemptNo = nextAttemptNo("menu");
      const elapsedMs = stageElapsedMs();
      try {
        result = await api.cafeMenu(id, selectedMenu, menuBudget, attemptNo, elapsedMs);
        markStageValidated("menu", result);
      } catch (error: unknown) {
        setMenuFeedback(error instanceof Error ? error.message : "메뉴 선택을 저장하지 못했어요.");
        return;
      }
    }
    const childMenu = selectedItems.find((item) => item.id !== mormeyMenuId);
    if (childMenu) {
      await sendCafeAnswer("menu", `${menuBudget.toLocaleString("ko-KR")}원 예산에서 ${childMenu.name}(${childMenu.price.toLocaleString("ko-KR")}원)를 골랐어. 합계는 ${selectedTotal.toLocaleString("ko-KR")}원이야.`);
    }
    if (selectedTotal > menuBudget) {
      setMenuFeedback(`예산을 ${(selectedTotal - menuBudget).toLocaleString("ko-KR")}원 초과했어요. 내가 고른 메뉴를 빼고 다시 골라 봐요.`);
      captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal, budget: menuBudget, over_budget: true });
      return;
    }
    captureMormeyEvent("cafe_menu_selected", { menu_ids: selectedMenu.join(","), total: selectedTotal, budget: menuBudget, over_budget: false });
    if (!result?.is_correct) return;
    if (cafeTalks.current.menu?.turn.status !== "completed") {
      setMenuFeedback("모르미가 한 가지를 더 궁금해해요.");
    }
  }

  function finishMenuStory() {
    // 메뉴 고르기에서 곧장 넘어올 때도 계산 스테이지 대화를 새로 연다.
    // 이걸 빼면 대화가 없어 turn.status 가 "completed" 가 되지 않고,
    // 합계를 맞혀도 스테이지가 끝나지 않는다.
    const nextSumMenu = randomItem(menu);
    setJourneyProgress((progress) => Math.max(progress, 2));
    setSumMormeyMenuId(nextSumMenu.id);
    setSumChildMenuId("");
    setSumAnswer("");
    setSumFeedback("");
    openCafeDialogue("calculate", {
      scenario_id: cafeScenarioByStation[2],
      cafe_context: { menu_items: menuItemsForAi, mormi_menu_id: nextSumMenu.id },
    });
    setStep("sum");
    window.scrollTo({ top: 0, behavior: "smooth" });
    captureMormeyEvent("cafe_station_started", { station_index: 3, station: cafeStations[2] });
  }

  async function checkSum() {
    const answer = Number(sumAnswer.replace(/[^0-9]/g, ""));
    const id = visitId.current ?? await visitPromise.current;
    // 이 단계의 두 메뉴는 메뉴 고르기와 별개로 뽑히므로 함께 보낸다.
    let result: StageResult | null = null;
    if (id && sumChildMenu) {
      const attemptNo = nextAttemptNo("calculate");
      const elapsedMs = stageElapsedMs();
      try {
        result = await api.cafePayment(id, [sumMormeyMenu.id, sumChildMenu.id], answer, attemptNo, elapsedMs);
        markStageValidated("calculate", result);
      } catch (error: unknown) {
        setSumFeedback(error instanceof Error ? error.message : "계산 결과를 저장하지 못했어요.");
        return;
      }
    }
    if (sumChildMenu) {
      await sendCafeAnswer("calculate", `${sumMormeyMenu.name} ${sumMormeyMenu.price.toLocaleString("ko-KR")}원이랑 ${sumChildMenu.name} ${sumChildMenu.price.toLocaleString("ko-KR")}원을 더하면 ${answer.toLocaleString("ko-KR")}원이야.`);
    }
    if (answer === sumTarget) {
      setSumFeedback(cafeTalks.current.calculate?.turn.status === "completed" ? "" : "모르미가 계산 방법도 궁금해해요.");
    } else {
      setSumFeedback("모르미가 아직 헷갈리는 부분을 다시 물어보고 있어요.");
    }
  }

  function changeChangeMoney(value: 500 | 1000, amount: number) {
    setChangeCounts((current) => ({ ...current, [value]: Math.max(0, Math.min(20, current[value] + amount)) }));
    setChangeFeedback("");
  }

  async function checkChange() {
    const id = visitId.current ?? await visitPromise.current;
    let result: StageResult | null = null;
    if (id) {
      const attemptNo = nextAttemptNo("change");
      const elapsedMs = stageElapsedMs();
      try {
        result = await api.cafeChange(id, changeMenu.id, changeCounts, attemptNo, elapsedMs);
        markStageValidated("change", result);
      } catch (error: unknown) {
        setChangeFeedback(error instanceof Error ? error.message : "거스름돈 결과를 저장하지 못했어요.");
        return;
      }
    }
    await sendCafeAnswer("change", `10,000원에서 ${changeMenu.name} ${changeMenu.price.toLocaleString("ko-KR")}원을 빼면 ${changeTotal.toLocaleString("ko-KR")}원이야. 천 원 ${changeCounts[1000]}장, 오백 원 ${changeCounts[500]}개를 담았어.`);
    if (changeTotal === changeTarget) {
      setChangeFeedback(cafeTalks.current.change?.turn.status === "completed" ? "" : "모르미가 계산 방법도 궁금해해요.");
      return;
    }
    setChangeFeedback("모르미가 아직 헷갈리는 부분을 다시 물어보고 있어요.");
  }

  const activeDialogueStage: CafeStage | null = step === "queue"
    ? "queue"
    : step === "menu"
      ? "menu"
      : step === "sum"
        ? "calculate"
        : step === "change"
          ? "change"
          : null;

  return (
    <section className={`figma-cafe figma-cafe--${step}`}>
      <div className="figma-cafe__bar">
        <button onClick={step === "overview" ? onBack : returnToMap}>← {step === "overview" ? "외출 장소" : "돌아가기"}</button>
        <strong className="figma-cafe__place"><span className="cafe-place-icon" aria-hidden="true"><i /></span> 모르미 카페</strong>
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
            {/* 카드 위에 진행도를 한 줄로 보여 줘야 지금 어디쯤인지 바로 안다. */}
            <div className="figma-cafe-map__progress">
              <span aria-hidden="true"><i style={{ width: `${(journeyProgress / stationCopy.length) * 100}%` }} /></span>
              <b>{journeyProgress} / {stationCopy.length} 완료</b>
            </div>
          </header>
          <div className="figma-cafe-map__stones" aria-label="카페 스테이지 선택">
            {stationCopy.map((station, index) => (
              <button key={station.title} className={`${index === journeyProgress ? "is-current" : ""} ${index < journeyProgress ? "is-complete" : ""}`} disabled={index > journeyProgress} onClick={() => { if (index === 0 && journeyProgress === 0) captureMormeyEvent("cafe_started"); openStation(index); }}>
                <span className="figma-cafe-map__image"><Image src={station.image} alt={`${station.title} 스테이지`} width={360} height={270} unoptimized /><i className="figma-cafe-map__no" aria-hidden="true">{index < journeyProgress ? "✓" : index + 1}</i></span>
                <span className="figma-cafe-map__copy"><small>STAGE {index + 1}</small><strong>{station.title}</strong><p>{station.description}</p></span>
                <em>{index < journeyProgress ? "완료" : index > journeyProgress ? "잠김" : "도전하기"}</em>
              </button>
            ))}
          </div>
          <div className="figma-cafe-map__path" aria-hidden="true" />
        </main>
      )}

      {step === "queue" && (
        <main className={`figma-cafe-panel figma-cafe-queue-story is-${queueScene}`} data-figma-node="74:4">
          {queueScene !== "clear" && <button className="queue-star-note" aria-label="별노트"><span aria-hidden="true">★</span> 별노트</button>}

          {queueScene !== "note" && queueScene !== "clear" && (
            <section className="queue-story-scene" aria-label="카페의 두 줄">
              <div className="queue-story-task">
                <figure className="queue-story-visual">
                  <Image className={queueCounts.left === 1 ? "is-mirrored" : ""} src="/cafe-stages/queue-v2.png" alt={`카페 대기줄: 왼쪽 줄 ${queueCounts.left}명, 오른쪽 줄 ${queueCounts.right}명`} width={900} height={675} unoptimized />
                  <figcaption><span>왼쪽 줄</span><span>오른쪽 줄</span></figcaption>
                </figure>
                {queueScene === "count-both" && <form className="queue-story-input" onSubmit={(event) => { event.preventDefault(); submitQueueCounts(); }}><input aria-label="양쪽 줄의 사람 수" value={queueCountAnswer} onChange={(event) => setQueueCountAnswer(event.target.value)} placeholder="답변을 입력해 주세요" /><button type="submit" disabled={!queueCountAnswer.trim()}>완료</button></form>}
                {queueScene === "count-left" && <div className="queue-story-options" aria-label="더 짧은 줄 사람 수 선택">{[1, 2, 3, 4, 5].map((count) => <button key={count} onClick={() => chooseLeftCount(count)}>{count}명</button>)}</div>}
              </div>
            </section>
          )}

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

          {queueScene !== "clear" && <section className="queue-story-dialogue">
            <b>모르미</b>
            {/* 모르미가 방금 한 말이 있으면 그걸 쓴다. 노트 장면은 마무리 문구를 유지한다. */}
            <p>{queueScene === "note"
              ? `${queueCounts.left < queueCounts.right ? "왼쪽" : "오른쪽"} 줄이 더 짧으니까 거기에 서는 게 좋구나! 가르쳐 준 내용은 잊지 않게 노트에 적어 둬야겠다!`
              : mormiLines.queue || (queueScene === "intro" ? "어? 주문하려면 줄을 서야 하나 봐. 그런데 어느 줄에 서면 좋을지 모르겠어..." : queueScene === "count-both" ? "왼쪽 줄이랑 오른쪽 줄에는 각각 사람들이 몇 명씩 있어?" : "더 짧은 줄에는 몇 명이 있어?")}</p>
            {queueFeedback && <small role="status">{queueFeedback}</small>}
            {queueScene === "intro" && <button className="queue-story-next" onClick={() => setQueueScene("count-both")}>다음으로</button>}
            {queueScene === "count-both" && <button onClick={() => { setQueueHelp(true); void sendCafeResponse("queue", { type: "no_response" }); }}>잘 모르겠어</button>}
            {queueScene === "count-left" && <button onClick={() => { setQueueHelp(true); void sendCafeResponse("queue", { type: "no_response" }); }}>잘 모르겠어</button>}
            {queueScene === "note" && <button className="queue-story-next" onClick={finishQueueStory}>다음으로</button>}
          </section>}
        </main>
      )}

      {step === "menu" && (
        <main className="figma-cafe-panel figma-cafe-menu" data-figma-node="74:6">
          {menuScene === "brief" && <section className="cafe-menu-brief"><div><span>TODAY&apos;S MISSION</span><h1>{menuBudget.toLocaleString("ko-KR")}원으로 주문해요</h1><p>모르미와 메뉴를 하나씩 골라 예산 안에서 주문해 봐요.</p><ol><li><b>1</b>모르미가 먹고 싶은 걸 무작위로 골라요</li><li><b>2</b>내가 실제 메뉴판에서 하나를 골라요</li><li><b>3</b>장바구니가 합계를 자동으로 계산해요</li></ol><button onClick={() => { setSelectedMenu([mormeyMenuId]); setMenuScene("mormey-pick"); }}>미션 시작</button></div><Image src="/morami/bright-cutout.png" alt="카페 주문을 기대하는 모르미" width={320} height={360} unoptimized /></section>}
          {menuScene === "mormey-pick" && <section className="cafe-menu-mormey"><Image src="/morami/bright-cutout.png" alt={`${mormeyMenu.name}을 고른 모르미`} width={300} height={340} unoptimized /><div><span>모르미가 먼저 골랐어요</span><h1>“나는 {mormeyMenu.name} 고를래!”</h1><div><Image src={mormeyMenu.image} alt={mormeyMenu.name} width={180} height={120} unoptimized /><strong>{mormeyMenu.name} <b>{mormeyMenu.price.toLocaleString("ko-KR")}원</b></strong></div><p>{mormiLines.menu || `남은 ${(menuBudget - mormeyMenu.price).toLocaleString("ko-KR")}원 안에서 네 메뉴 하나를 골라 줄래?`}</p><button onClick={() => setMenuScene("choose")}>메뉴 골라 주기</button></div></section>}
          {menuScene === "choose" && <><div className="figma-cafe-panel__heading"><div><span>MISSION 2</span><h1>진열대에서 메뉴 고르기</h1><p>모르미가 고른 메뉴와 함께 먹을 메뉴 하나를 골라 봐!</p></div><strong>주어진 예산 <b>{menuBudget.toLocaleString("ko-KR")}원</b></strong></div>
          <div className="figma-cafe-menu__layout">
            <div className="figma-cafe-menu__grid">
              {menu.map((item) => <button key={item.id} aria-label={item.id === mormeyMenuId ? `모르미가 고른 ${item.name}` : `${item.name} 고르기`} className={`${selectedMenu.includes(item.id) ? "is-selected" : ""} ${item.id === mormeyMenuId ? "is-mormey-pick" : ""}`} onClick={() => toggleMenu(item.id)}><i className="menu-check">✓</i><Image src={item.image} alt={item.name} width={190} height={105} unoptimized /><span><b>{item.name}</b><strong>{item.price.toLocaleString("ko-KR")}원</strong>{item.id === mormeyMenuId && <small>모르미가 골랐어요</small>}</span></button>)}
            </div>
            <aside><span className="order-tray-icon">🧺</span><h2>우리 장바구니</h2><ul>{selectedItems.map((item) => <li key={item.id}><span>{item.name}{item.id === mormeyMenuId ? " · 모르미" : " · 나"}</span><b>{item.price.toLocaleString("ko-KR")}원</b></li>)}</ul><div className="order-tray-total"><span>자동 계산 합계</span><strong className={selectedTotal > menuBudget ? "is-over" : ""}>{selectedTotal.toLocaleString("ko-KR")}원</strong><span>{selectedTotal > menuBudget ? "초과 금액" : "남은 돈"}</span><b className={selectedTotal > menuBudget ? "is-over" : ""}>{Math.abs(menuBudget - selectedTotal).toLocaleString("ko-KR")}원</b></div><button disabled={selectedMenu.length !== 2} onClick={orderMenu}>{selectedTotal > menuBudget ? "예산 확인하기" : "장바구니 확인"}</button></aside>
          </div>
          {menuFeedback && <p className="figma-cafe-feedback" role="status">{menuFeedback}</p>}</>}
          {menuScene === "thanks" && <section className="cafe-menu-thanks"><Image src="/morami/celebrate-cutout.png" alt="메뉴를 골라 줘서 기뻐하는 모르미" width={350} height={390} unoptimized /><div><span>주문 준비 완료!</span><h1>내 메뉴 골라 줘서 고마워!</h1><p>{selectedItems.map((item) => item.name).join(" + ")}<br /><strong>합계 {selectedTotal.toLocaleString("ko-KR")}원</strong></p><button onClick={finishMenuStory}>완료!</button></div></section>}
        </main>
      )}

      {step === "sum" && (
        <main className="figma-cafe-panel figma-cafe-sum" data-figma-node="74:8">
          <div className="figma-cafe-mission-title"><span>MISSION 3</span><h1>메뉴 값 계산하기</h1><p>{mormiLines.calculate || "모르미가 하나 골랐어요. 너도 메뉴 하나를 고르고 두 가격을 더해 봐!"}</p></div>
          <section className="cafe-sum-menu-picker" aria-label="내 메뉴 고르기">
            <div><Image src={sumMormeyMenu.image} alt={sumMormeyMenu.name} width={160} height={105} unoptimized /><span>모르미가 고른 메뉴</span><strong>{sumMormeyMenu.name} · {sumMormeyMenu.price.toLocaleString("ko-KR")}원</strong></div>
            <div className="cafe-sum-menu-picker__choices">{menu.filter((item) => item.id !== sumMormeyMenuId).map((item) => <button key={item.id} className={sumChildMenuId === item.id ? "is-selected" : ""} onClick={() => { setSumChildMenuId(item.id); setSumAnswer(""); setSumFeedback(""); }}><Image src={item.image} alt={item.name} width={110} height={75} unoptimized /><span>{item.name}</span><b>{item.price.toLocaleString("ko-KR")}원</b></button>)}</div>
          </section>
          {sumChildMenu && <form onSubmit={(event) => { event.preventDefault(); if (sumAnswer.trim()) checkSum(); }}>
          <div className="figma-cafe-sum__equation">
            {[sumMormeyMenu, sumChildMenu].map((item, index) => <div key={item.id}><article><Image src={item.image} alt={item.name} width={190} height={105} unoptimized /><span>{item.name}</span><strong>{item.price.toLocaleString("ko-KR")}원</strong></article>{index === 0 && <b aria-hidden="true">＋</b>}</div>)}
            <b aria-hidden="true">=</b><label className="figma-cafe-sum__answer"><span>내가 계산한 합계</span><input inputMode="numeric" aria-label="두 메뉴 가격의 합계" value={sumAnswer} onChange={(event) => { setSumAnswer(event.target.value); setSumFeedback(""); }} /><b>원</b></label>
          </div>
          {sumFeedback && <p className="figma-cafe-feedback" role="status">{sumFeedback}</p>}
          <button type="submit" className="figma-cafe-action" disabled={!sumAnswer.trim()}>합계 확인</button></form>}
        </main>
      )}

      {step === "change" && (
        <main className="figma-cafe-panel figma-cafe-change" data-figma-node="74:10">
          <div className="figma-cafe-mission-title"><span>MISSION 4</span><h1>거스름돈 받기</h1><p>{mormiLines.change || "모르미가 메뉴 하나를 골랐어요. 10,000원을 내면 얼마를 받아야 할까요?"}</p></div>
          <section className="cafe-change-order"><Image src="/morami/bright-cutout.png" alt="메뉴를 고른 모르미" width={220} height={240} unoptimized /><div><span>모르미의 주문</span><Image src={changeMenu.image} alt={changeMenu.name} width={170} height={105} unoptimized /><strong>{changeMenu.name} · {changeMenu.price.toLocaleString("ko-KR")}원</strong></div></section>
          <div className="figma-cafe-change__equation">가진 돈 10,000원&nbsp; − &nbsp;{changeMenu.name} {changeMenu.price.toLocaleString("ko-KR")}원&nbsp; = &nbsp;?</div>
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
          <div><span>카페 외출 완료</span><h1>우리 힘으로 주문했어!</h1><p>줄을 고르고, 예산에 맞춰 메뉴를 담고, 메뉴 값을 더하고, 거스름돈까지 확인했어.</p><button onClick={() => { void (async () => {
            try {
              const id = visitId.current ?? await visitPromise.current;
              if (!id) throw new Error("카페 방문 기록을 찾지 못했어요.");
              await api.cafeComplete(id);
              captureMormeyEvent("cafe_journey_completed", { order_total: changeMenu.price, paid: 10000, change: changeTarget });
              onComplete();
            } catch (error: unknown) {
              setDialogueError(error instanceof Error ? error.message : "카페 완료를 저장하지 못했어요.");
            }
          })(); }}>모르미와 집으로</button></div>
        </main>
      )}
      {activeDialogueStage && <CafeDialogueControls
        conversation={cafeConversations[activeDialogueStage]}
        inputText={dialogueInputs[activeDialogueStage] ?? ""}
        sending={dialogueSending}
        onInput={(value) => setDialogueInputs((current) => ({ ...current, [activeDialogueStage]: value }))}
        onSubmit={(response) => { void sendCafeResponse(activeDialogueStage, response).then(() => {
          setDialogueInputs((current) => ({ ...current, [activeDialogueStage]: "" }));
        }); }}
      />}
      {dialogueError && <p className="figma-cafe-feedback is-error" role="alert">{dialogueError}</p>}
    </section>
  );
}
