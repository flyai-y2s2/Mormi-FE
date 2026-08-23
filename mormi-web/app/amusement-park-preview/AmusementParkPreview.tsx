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
import { CafeTalkStage, type CafeDialogueResponse } from "../CafeTalkStage";
import { dialogueErrorMessage } from "../dialogue-errors";
import { givenNameFromFullName } from "../korean-name";
import {
  startAmusementParkDialogue,
  submitMormiResponseThroughBe,
  type AmusementScenarioId,
  type MormiConversation,
} from "../mormi-dialogue";
import { StarNote } from "../StarNote";

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

function SkillBadge({ skill }: { skill: AmusementStageView["skill"] }) {
  const label = skill === "multiply" ? "곱셈" : skill === "divide" ? "나눗셈" : "비교";
  return <span className={`park-skill park-skill--${skill}`}>{label}</span>;
}

function ParkMap({ visit, learnerName, onOpen }: {
  visit: AmusementParkVisitView;
  learnerName: string;
  onOpen: (stageId: AmusementStageId) => void;
}) {
  const stagesById = useMemo(() => new Map(visit.stages.map((stage) => [stage.stage_id, stage])), [visit.stages]);
  const completed = visit.stage_order.filter((stageId) => visit.stage_progress[stageId] === "completed").length;

  return <main className="park-map">
    <Image className="park-map__background" src="/amusement-park/park-map.png" alt="놀이동산 전경" fill priority />
    <div className="park-map__wash" />
    <header className="park-map__header">
      <div><p>놀이동산 돈 관리 미션</p><h1>{learnerName}의 선택이 필요해!</h1><span>입장부터 이용권 결정까지 세 가지 미션을 해결해요.</span></div>
      <div className="park-map__progress"><span><i style={{ width: `${(completed / visit.stage_order.length) * 100}%` }} /></span><b>{completed}/{visit.stage_order.length} 완료</b></div>
    </header>
    <section className="park-map__missions" aria-label="놀이동산 미션 지도">
      {visit.stage_order.map((stageId, index) => {
        const stage = stagesById.get(stageId);
        if (!stage) return null;
        const progress = visit.stage_progress[stageId];
        const locked = progress === "locked";
        const cleared = progress === "completed";
        const visual = amusementStageVisuals[stageId];
        return <button key={stageId} type="button" className={`${progress === "available" ? "is-current" : ""}${cleared ? " is-cleared" : ""}`} disabled={locked} onClick={() => onOpen(stageId)}>
          <Image src={visual.image_url} alt={`${stage.title} 미션 배경`} fill />
          <span className="park-map__mission-no">{cleared ? "✓" : locked ? "🔒" : index + 1}</span>
          <div><SkillBadge skill={stage.skill} /><h2>{stage.title}</h2><p>{stage.mission}</p><strong>{cleared ? "완료 내용 보기" : locked ? "앞 미션을 먼저 완료해요" : "미션 시작 →"}</strong></div>
        </button>;
      })}
    </section>
    <Link className="park-exit" href="/">← 집으로</Link>
    <small className="park-server-label">진행과 판정은 서버에 안전하게 저장돼요</small>
  </main>;
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

function MissionScene({ visit, stage, onBack, onVisitChanged }: {
  visit: AmusementParkVisitView;
  stage: AmusementStageView;
  onBack: () => void;
  onVisitChanged: (visit: AmusementParkVisitView) => void;
}) {
  const alreadyCompleted = visit.stage_progress[stage.stage_id] === "completed";
  const [complete, setComplete] = useState(alreadyCompleted);
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
    if (alreadyCompleted || requestInFlight.current) return;
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
      setDialogueError(dialogueErrorMessage(error, "모르미 대화를 시작하지 못했어요."));
    } finally {
      requestInFlight.current = false;
      setSending(false);
    }
  }, [alreadyCompleted, applyConversation, stage.stage_id, visit.visit_id]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void openDialogue("resume"); }, 0);
    return () => window.clearTimeout(timer);
  }, [openDialogue]);

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
      setDialogueError(dialogueErrorMessage(error, "답을 보내지 못했어요. 같은 답으로 다시 시도해 주세요."));
    } finally {
      requestInFlight.current = false;
      setHelpLoading(false);
      setSending(false);
    }
  };

  if (complete) return <main className="park-clear">
    <div className="park-clear__confetti" aria-hidden="true" />
    <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={410} height={480} priority unoptimized />
    <section><span>미션 {stageIndex + 1} 완료</span><h1>{stage.title} 미션<br /><b>해냈어요!</b></h1><p>모르미가 배운 방법으로 새로운 문제까지 해결했어요.</p>{noteText ? <StarNote text={noteText} className="park-clear__star-note" /> : <div><small>배운 전략</small><strong>{stage.strategy}</strong></div>}<button type="button" onClick={onBack}>지도에서 확인하기 →</button></section>
  </main>;

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
  if (!stage) return <ParkMap visit={visit} learnerName={learnerName} onOpen={setActiveStageId} />;
  return <MissionScene key={`${visit.visit_id}:${stage.stage_id}`} visit={visit} stage={stage} onBack={() => setActiveStageId(null)} onVisitChanged={setVisit} />;
}
