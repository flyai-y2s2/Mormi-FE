"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ApiError,
  api,
  readStoredLearner,
  type AmusementParkVisitView,
  type AmusementStageId,
  type AmusementStageView,
} from "../api-client";
import { amusementStageVisuals } from "../amusement-park-contract";
import { CafeStageComplete } from "../CafeStageComplete";
import { CafeTalkStage, type CafeDialogueResponse } from "../CafeTalkStage";
import { amusementDialogueErrorMessage } from "../dialogue-errors";
import { givenNameFromFullName } from "../korean-name";
import {
  startAmusementParkDialogue,
  submitMormiResponseThroughBe,
  type AmusementScenarioId,
  type MormiConversation,
} from "../mormi-dialogue";

const subscribeToStoredLearner = () => () => undefined;

const amusementScenarioByStage: Record<AmusementStageId, AmusementScenarioId> = {
  ticket: "amusement_ticket_multiply",
  snack_split: "amusement_snack_divide",
  pass_break_even: "amusement_pass_compare",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "로그인 후 놀이동산에 갈 수 있어요.";
    if (error.status === 403) return "카페 미션을 모두 완료하면 놀이동산이 열려요.";
    return error.message || "놀이동산 정보를 불러오지 못했어요.";
  }
  return "서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function ParkMap({ visit, learnerName, onOpen }: {
  visit: AmusementParkVisitView;
  learnerName: string;
  onOpen: (stageId: AmusementStageId, replay: boolean) => void;
}) {
  const stagesById = useMemo(() => new Map(visit.stages.map((stage) => [stage.stage_id, stage])), [visit.stages]);
  const completed = visit.stage_order.filter((stageId) => visit.stage_progress[stageId] === "completed").length;

  const allCompleted = completed === visit.stage_order.length;

  return <section className="figma-cafe figma-cafe--overview figma-park">
    <div className="figma-cafe__bar">
      <Link className="figma-park__back" href="/">← 외출 장소</Link>
      <strong className="figma-cafe__place">
        <Image className="figma-cafe__place-image" src="/amusement-park/ticket-elements-v2.png" alt="" width={56} height={56} aria-hidden="true" />
        모르미 놀이동산
      </strong>
      <div className="figma-cafe__steps" aria-label="놀이동산 진행 단계">
        {visit.stage_order.map((stageId, index) => <span key={stageId} className={visit.stage_progress[stageId] !== "locked" ? "is-active" : ""}><i>{visit.stage_progress[stageId] === "completed" ? "✓" : index + 1}</i>{stagesById.get(stageId)?.title}</span>)}
      </div>
    </div>
    <main className="figma-cafe-map figma-park-map">
      <header className="figma-cafe-map__heading">
        <span>{allCompleted ? "PARK PRACTICE" : "PARK QUEST"}</span>
        <h1>{allCompleted ? "놀이동산 돈 관리를 다 배웠어요!" : `${learnerName}와 모르미의 돈 관리 미션`}</h1>
        <p>{allCompleted ? "연습하고 싶은 스테이지를 골라 몇 번이든 다시 해 봐요." : "스테이지를 하나씩 완료하며 돈을 관리해 봐요."}</p>
        <div className="figma-cafe-map__progress"><span aria-hidden="true"><i style={{ width: `${(completed / visit.stage_order.length) * 100}%` }} /></span><b>{completed} / {visit.stage_order.length} 완료</b></div>
      </header>
      <div className="figma-cafe-map__stones" aria-label="놀이동산 스테이지 선택">
      {visit.stage_order.map((stageId, index) => {
        const stage = stagesById.get(stageId);
        if (!stage) return null;
        const progress = visit.stage_progress[stageId];
        const locked = progress === "locked";
        const cleared = progress === "completed";
        const visual = amusementStageVisuals[stageId];
        return <button key={stageId} type="button" className={`${progress === "available" ? "is-current" : ""}${cleared ? " is-complete" : ""}`} disabled={locked} onClick={() => onOpen(stageId, cleared)}>
          <span className="figma-cafe-map__image"><Image src={visual.image_url} alt={`${stage.title} 스테이지`} width={360} height={270} unoptimized /><i className="figma-cafe-map__no" aria-hidden="true">{cleared ? "✓" : index + 1}</i></span>
          <span className="figma-cafe-map__copy"><small>STAGE {index + 1}</small><strong>{stage.title}</strong><p>{stage.mission}</p></span>
          <em>{cleared ? "다시 연습" : locked ? "잠김" : "도전하기"}</em>
        </button>;
      })}
      </div>
      <div className="figma-cafe-map__path" aria-hidden="true" />
    </main>
  </section>;
}

function ParkProblemVisual({ stage, conversation }: {
  stage: AmusementStageView;
  conversation: MormiConversation | undefined;
}) {
  const visual = amusementStageVisuals[stage.stage_id];
  const isTransfer = conversation?.turn.visual.type === "amusement_park_transfer"
    || conversation?.turn.stage_id.endsWith("_transfer") === true;
  const transferData = conversation?.turn.visual.data ?? {};
  const transferLeft = typeof transferData.left === "number" ? transferData.left.toLocaleString("ko-KR") : "";
  const transferRight = typeof transferData.right === "number" ? transferData.right.toLocaleString("ko-KR") : "";
  const transferSymbol = transferData.operation === "multiplication" ? "×"
    : transferData.operation === "division" ? "÷"
      : transferData.operation === "subtraction" ? "−" : "+";
  if (isTransfer) return <div className="park-transfer-visual">
    <Image src={visual.element_image_url} alt={`${stage.title} 계산 요소`} width={760} height={500} priority />
    {transferLeft && transferRight && <strong>{transferLeft} {transferSymbol} {transferRight} = □</strong>}
  </div>;

  return <div className="park-problem">
    <Image className="park-problem__element" src={visual.element_image_url} alt={`${stage.title} 문제 요소`} width={900} height={600} priority />
    <div className="park-problem__facts">
      {stage.facts.map((fact) => <span key={fact.key} className="park-problem__fact"><small>{fact.label}</small><b>{fact.value.toLocaleString("ko-KR")}{fact.unit}</b></span>)}
    </div>
  </div>;
}

function MissionScene({ visit, stage, replay, onBack, onVisitChanged }: {
  visit: AmusementParkVisitView;
  stage: AmusementStageView;
  replay: boolean;
  onBack: () => void;
  onVisitChanged: (visit: AmusementParkVisitView) => void;
}) {
  const [complete, setComplete] = useState(false);
  const [conversation, setConversation] = useState<MormiConversation>();
  const [inputText, setInputText] = useState("");
  const [dialogueError, setDialogueError] = useState("");
  const [sending, setSending] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [noteText, setNoteText] = useState<string>();
  const requestInFlight = useRef(false);
  const stageIndex = visit.stage_order.indexOf(stage.stage_id);
  const visual = amusementStageVisuals[stage.stage_id];

  const finishDialogue = useCallback(async () => {
    try {
      let latest = await api.getAmusementParkVisit(visit.visit_id);
      const allCompleted = latest.stage_order.every((stageId) => latest.stage_progress[stageId] === "completed");
      if (allCompleted && !latest.completed_at) latest = await api.completeAmusementParkVisit(visit.visit_id);
      onVisitChanged(latest);
      setComplete(true);
    } catch (error) {
      setDialogueError(errorMessage(error));
    }
  }, [onVisitChanged, visit.visit_id]);

  const applyConversation = useCallback((next: MormiConversation) => {
    setConversation(next);
    if (next.turn.note_update?.text) setNoteText(next.turn.note_update.text);
    if (next.stage_progress?.completed) void finishDialogue();
  }, [finishDialogue]);

  const openDialogue = useCallback(async (startMode: "restart" | "resume") => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setSending(true);
    setDialogueError("");
    setHelpVisible(false);
    try {
      const request = (mode: "restart" | "resume") => startAmusementParkDialogue(visit.visit_id, {
        scenario_id: amusementScenarioByStage[stage.stage_id],
        start_mode: mode,
        request_id: crypto.randomUUID(),
      });
      let next = await request(startMode);
      // 이전 회차가 정답 요구 등으로 종료됐으면, 다시 들어온 아이에게 빈 화면 대신 새 회차를 연다.
      if (startMode === "resume" && next.turn.status === "completed" && !next.stage_progress?.completed) {
        next = await request("restart");
      }
      applyConversation(next);
    } catch (error) {
      setDialogueError(amusementDialogueErrorMessage(error, "모르미 대화를 시작하지 못했어요."));
    } finally {
      requestInFlight.current = false;
      setSending(false);
    }
  }, [applyConversation, stage.stage_id, visit.visit_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void openDialogue(replay ? "restart" : "resume"); }, 0);
    return () => window.clearTimeout(timer);
  }, [openDialogue, replay]);

  const answerMormi = async (response: CafeDialogueResponse) => {
    if (!conversation || requestInFlight.current) return;
    const requestsHelp = response.type === "no_response";
    requestInFlight.current = true;
    setSending(true);
    setDialogueError("");
    if (requestsHelp) setHelpLoading(true);
    try {
      const next = await submitMormiResponseThroughBe(conversation.conversation_id, {
        turn_id: conversation.turn.turn_id,
        ...response,
      });
      applyConversation(next);
      if (requestsHelp) setHelpVisible(true);
      setInputText("");
    } catch (error) {
      setDialogueError(amusementDialogueErrorMessage(error, "답을 보내지 못했어요. 같은 답으로 다시 시도해 주세요."));
    } finally {
      requestInFlight.current = false;
      setHelpLoading(false);
      setSending(false);
    }
  };

  if (complete) return <section className="figma-cafe figma-cafe--done figma-park">
    <CafeStageComplete
      stageNumber={stageIndex + 1}
      title={`${stage.title} 미션을`}
      highlight="해냈어요!"
      noteCount={noteText ? 1 : 0}
      currentMoney={0}
      statusItems={[
        { label: "별노트", value: `${noteText ? 1 : 0}개`, image: "/ui/mormi-star.png" },
        { label: "배운 개념", value: stage.skill === "multiply" ? "곱셈" : stage.skill === "divide" ? "나눗셈" : "본전", image: "/ui/mormi-sprout.png" },
        { label: "현재 스테이지", value: `${stageIndex + 1}/3`, image: "/ui/mormi-cafe.png" },
      ]}
      actionLabel="지도에서 확인하기"
      onAction={onBack}
    />
  </section>;

  return <div className="park-cafe-talk">
    <Image className="park-cafe-talk__background" src={visual.image_url} alt="" fill priority />
    <div className="park-cafe-talk__wash" />
    <CafeTalkStage
      conversation={conversation}
      line={conversation?.turn.mormi.text}
      fallbackLine={sending ? "모르미가 문제를 살펴보고 있어요…" : "문제를 불러오지 못했어요. 다시 시작해 주세요."}
      inputText={inputText}
      sending={sending}
      helpVisible={helpVisible}
      helpLoading={helpLoading}
      onInput={setInputText}
      onSubmit={(response) => { void answerMormi(response); }}
      onBack={onBack}
    >
      <ParkProblemVisual stage={stage} conversation={conversation} />
    </CafeTalkStage>
    {dialogueError && <div className="park-dialogue-error" role="alert"><span>{dialogueError}</span><button type="button" disabled={sending} onClick={() => { void openDialogue("restart"); }}>대화 다시 시작</button></div>}
  </div>;
}

function ParkConnectionState({ message, retrying, onRetry }: { message: string; retrying: boolean; onRetry: () => void }) {
  return <main className="park-connection-state">
    <Image src="/amusement-park/park-map.png" alt="놀이동산" fill priority />
    <section><Image src="/morami/confused-cutout.png" alt="기다리는 모르미" width={190} height={220} unoptimized /><h1>{message}</h1><p>로컬 문제로 대신 보여주지 않고 서버의 놀이동산 상태를 다시 확인할게요.</p><div><button type="button" disabled={retrying} onClick={onRetry}>{retrying ? "다시 연결하고 있어요…" : "다시 시도"}</button><Link href="/">집으로 돌아가기</Link></div></section>
  </main>;
}

export function AmusementParkPreview() {
  const [visit, setVisit] = useState<AmusementParkVisitView | null>(null);
  const [activeStageId, setActiveStageId] = useState<AmusementStageId | null>(null);
  const [replayingStage, setReplayingStage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const learnerName = useSyncExternalStore(
    subscribeToStoredLearner,
    () => givenNameFromFullName(readStoredLearner()?.name),
    () => "친구",
  );

  const loadVisit = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setVisit(await api.startAmusementParkVisit());
    } catch (loadError) {
      setVisit(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.startAmusementParkVisit()
      .then((nextVisit) => { if (!cancelled) setVisit(nextVisit); })
      .catch((loadError: unknown) => { if (!cancelled) setError(errorMessage(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (!visit) return <ParkConnectionState message={loading ? "놀이동산 미션을 불러오고 있어요…" : error} retrying={loading} onRetry={() => { void loadVisit(); }} />;

  const stage = activeStageId === null ? null : visit.stages.find((item) => item.stage_id === activeStageId) ?? null;
  if (!stage) return <ParkMap visit={visit} learnerName={learnerName} onOpen={(stageId, replay) => { setReplayingStage(replay); setActiveStageId(stageId); }} />;
  return <MissionScene key={`${visit.visit_id}:${stage.stage_id}:${replayingStage ? "replay" : "progress"}`} visit={visit} stage={stage} replay={replayingStage} onBack={() => { setActiveStageId(null); setReplayingStage(false); }} onVisitChanged={setVisit} />;
}
