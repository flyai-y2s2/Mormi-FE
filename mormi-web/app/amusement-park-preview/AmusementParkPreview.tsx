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
  type AmusementStageResult,
  type AmusementStageView,
} from "../api-client";
import { amusementAnswerFields, amusementStageVisuals } from "../amusement-park-contract";
import { givenNameFromFullName } from "../korean-name";

type MissionPhase = "answer" | "transfer" | "clear";
const subscribeToStoredLearner = () => () => undefined;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "로그인 후 놀이동산에 갈 수 있어요.";
    if (error.status === 403) return "카페 미션을 모두 완료하면 놀이동산이 열려요.";
    return error.message || "놀이동산 정보를 불러오지 못했어요.";
  }
  return "서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function feedbackMessage(result: AmusementStageResult): string {
  if (result.is_correct) return "맞았어요! 서버가 다음 미션을 열었어요.";
  if (result.feedback_code.endsWith("_short")) return "조금 더 큰 수인지 다시 계산해 봐요.";
  if (result.feedback_code.endsWith("_over")) return "조금 더 작은 수인지 다시 계산해 봐요.";
  return "아직 맞지 않아요. 보이는 수로 다시 계산해 봐요.";
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

function ParkProblemVisual({ stage, phase }: { stage: AmusementStageView; phase: Exclude<MissionPhase, "clear"> }) {
  const visual = amusementStageVisuals[stage.stage_id];
  if (phase === "transfer") return <div className="park-transfer-visual">
    <Image src={visual.element_image_url} alt={`${stage.title} 계산 요소`} width={760} height={500} priority />
    <strong>{stage.transfer.equation}</strong>
    <p>{stage.transfer.conclusion}</p>
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
  const [phase, setPhase] = useState<MissionPhase>(alreadyCompleted ? "clear" : "answer");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const startedAt = useRef(0);
  const fields = amusementAnswerFields[stage.stage_id];
  const stageIndex = visit.stage_order.indexOf(stage.stage_id);
  const attemptNo = visit.attempts.filter((attempt) => attempt.stage === stage.stage_id).length + 1;
  const visual = amusementStageVisuals[stage.stage_id];
  const allFilled = fields.every((field) => /^\d+$/.test(answers[field.key]?.trim() ?? ""));

  useEffect(() => { startedAt.current = Date.now(); }, []);

  const submit = async () => {
    if (!allFilled || sending) return;
    setSending(true);
    setFeedback("");
    try {
      const derivedAnswers = Object.fromEntries(fields.map((field) => [field.key, Number(answers[field.key])]));
      const result = await api.submitAmusementParkStage(visit.visit_id, stage.stage_id, {
        answers: derivedAnswers,
        attempt_no: attemptNo,
        elapsed_ms: Math.max(0, Date.now() - startedAt.current),
      });
      const latest = await api.getAmusementParkVisit(visit.visit_id);
      onVisitChanged(latest);
      setFeedback(feedbackMessage(result));
      if (result.is_correct) setPhase("transfer");
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const finishStage = async () => {
    if (sending) return;
    setSending(true);
    setFeedback("");
    try {
      let latest = await api.getAmusementParkVisit(visit.visit_id);
      const allCompleted = latest.stage_order.every((stageId) => latest.stage_progress[stageId] === "completed");
      if (allCompleted && !latest.completed_at) latest = await api.completeAmusementParkVisit(visit.visit_id);
      onVisitChanged(latest);
      setPhase("clear");
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  if (phase === "clear") return <main className="park-clear">
    <div className="park-clear__confetti" aria-hidden="true" />
    <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={410} height={480} priority unoptimized />
    <section><span>미션 {stageIndex + 1} 완료</span><h1>{stage.title} 미션<br /><b>해냈어요!</b></h1><p>서버가 확인한 답으로 미션을 완료했어요.</p><div><small>배운 전략</small><strong>{stage.strategy}</strong></div><button type="button" onClick={onBack}>지도에서 확인하기 →</button></section>
  </main>;

  return <main className="park-cafe-talk">
    <Image className="park-cafe-talk__background" src={visual.image_url} alt="" fill priority />
    <div className="park-cafe-talk__wash" />
    <div className="cafe-talk-toolbar">
      <button className="cafe-talk-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 이전으로</button>
      <div className="park-talk-status"><small>{stageIndex + 1}/{visit.stage_order.length}</small><b>{stage.title}</b><SkillBadge skill={stage.skill} /></div>
    </div>

    <section className="cafe-talk-flow">
      <section className="cafe-talk-bubble">
        <Image className="cafe-talk-morami" src={phase === "transfer" ? "/morami/bright-cutout.png" : "/morami/confused-cutout.png"} alt="생각하고 있는 모르미" width={300} height={360} unoptimized />
        <div className="cafe-talk-bubble__text">
          <b>모르미</b>
          <p>{phase === "transfer" ? stage.transfer.prompt : `${stage.mormi_misconception} ${stage.prompt}`}</p>
        </div>
      </section>

      <div className="cafe-talk-stage"><ParkProblemVisual stage={stage} phase={phase} /></div>

      <aside className="cafe-talk-answer">
        {phase === "answer" && <form className="park-answer-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="park-answer-fields">
            {fields.map((field) => <label key={field.key}>{field.label}
              <span><input inputMode="numeric" pattern="[0-9]*" value={answers[field.key] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [field.key]: event.target.value.replace(/[^0-9]/g, "") }))} placeholder="숫자로 입력" /><em>{field.unit}</em></span>
            </label>)}
          </div>
          <button type="submit" disabled={!allFilled || sending}>{sending ? "서버가 확인하고 있어요…" : "모르미에게 알려주기"}</button>
        </form>}
        {phase === "transfer" && <button type="button" className="figma-cafe-action park-phase-action" disabled={sending} onClick={() => { void finishStage(); }}>{sending ? "진행을 저장하고 있어요…" : "미션 완료하기 →"}</button>}
        {feedback && <p className="park-submit-feedback" role="status">{feedback}</p>}
      </aside>
    </section>
  </main>;
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
