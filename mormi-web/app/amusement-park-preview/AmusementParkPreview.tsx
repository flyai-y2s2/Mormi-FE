"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { readStoredLearner } from "../api-client";
import { amusementParkPreview, type AmusementStageContract } from "../amusement-park-contract";
import { givenNameFromFullName, nameWithSubjectParticle } from "../korean-name";

type Phase = "teach" | "quote" | "transfer" | "note" | "clear";
const subscribeToStoredLearner = () => () => undefined;

function SkillBadge({ skill }: { skill: AmusementStageContract["skill"] }) {
  const label = skill === "multiply" ? "곱셈" : skill === "divide" ? "나눗셈" : "혼합 계산";
  return <span className={`park-skill park-skill--${skill}`}>{label}</span>;
}

function ParkMap({ completed, learnerName, onOpen }: { completed: number; learnerName: string; onOpen: (index: number) => void }) {
  return <main className="park-map">
    <Image className="park-map__background" src="/amusement-park/park-map.png" alt="놀이동산 전경" fill priority />
    <div className="park-map__wash" />
    <header className="park-map__header">
      <div><p>놀이동산 돈 관리 미션</p><h1>{learnerName}의 선택이 필요해!</h1><span>입장부터 이용권 결정까지 세 가지 미션을 해결해요.</span></div>
      <div className="park-map__progress"><span><i style={{ width: `${(completed / 3) * 100}%` }} /></span><b>{completed}/3 완료</b></div>
    </header>
    <section className="park-map__missions" aria-label="놀이동산 미션 지도">
      {amusementParkPreview.stages.map((stage, index) => {
        const locked = index > completed;
        const cleared = index < completed;
        return <button key={stage.stage_id} type="button" className={`${index === completed ? "is-current" : ""}${cleared ? " is-cleared" : ""}`} disabled={locked} onClick={() => onOpen(index)}>
          <Image src={stage.image_url} alt={`${stage.title} 미션 배경`} fill />
          <span className="park-map__mission-no">{cleared ? "✓" : locked ? "🔒" : index + 1}</span>
          <div><SkillBadge skill={stage.skill} /><h2>{stage.title}</h2><p>{stage.mission}</p><strong>{cleared ? "다시 보기" : locked ? "앞 미션을 먼저 완료해요" : "미션 시작 →"}</strong></div>
        </button>;
      })}
    </section>
    <Link className="park-exit" href="/">← 집으로</Link>
    <small className="park-preview-label">서버 저장 없는 FE 미리보기</small>
  </main>;
}

function ParkProblemVisual({ stage, phase }: { stage: AmusementStageContract; phase: Exclude<Phase, "clear"> }) {
  if (phase === "transfer") return <div className="park-transfer-visual">
    <Image src={stage.element_image_url} alt={`${stage.title} 계산 요소`} width={760} height={500} priority />
    <strong>{stage.transfer.equation}</strong>
    <p>{stage.transfer.conclusion}</p>
  </div>;

  if (phase === "note") return <div className="park-note-visual" aria-hidden="true">
    <span>★</span>
    <strong>오늘의 가르침을<br />별노트에 기록해요</strong>
  </div>;

  return <div className="park-problem">
    <Image className="park-problem__element" src={stage.element_image_url} alt={`${stage.title} 문제 요소`} width={900} height={600} priority />
    <div className="park-problem__facts">
      {stage.facts.map((fact) => <span key={fact.key} className="park-problem__fact"><small>{fact.label}</small><b>{fact.value.toLocaleString("ko-KR")}{fact.unit}</b></span>)}
    </div>
  </div>;
}

function MissionScene({ stage, stageIndex, learnerName, onBack, onComplete }: { stage: AmusementStageContract; stageIndex: number; learnerName: string; onBack: () => void; onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>("teach");
  const [explanation, setExplanation] = useState("");
  const [helpVisible, setHelpVisible] = useState(false);
  const subjectName = nameWithSubjectParticle(learnerName);
  const factSummary = useMemo(() => stage.facts.map((fact) => `${fact.label} ${fact.value.toLocaleString("ko-KR")}${fact.unit}`).join(" · "), [stage]);

  if (phase === "clear") return <main className="park-clear">
    <div className="park-clear__confetti" aria-hidden="true" />
    <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={410} height={480} priority unoptimized />
    <section><span>미션 {stageIndex + 1} 완료</span><h1>{stage.title} 미션<br /><b>해냈어요!</b></h1><p>{learnerName}의 설명을 듣고 새 문제에도 적용했어요.</p><div><small>배운 전략</small><strong>{stage.strategy}</strong></div><button type="button" onClick={onComplete}>지도에서 확인하기 →</button></section>
  </main>;

  const dialogue = phase === "teach"
    ? `${stage.mormi_misconception} ${subjectName} 결정해 줘!`
    : phase === "quote"
      ? `“${explanation.trim()}”라고? ${learnerName} 말대로라면 다른 숫자에서도 해볼 수 있을 것 같아!`
      : phase === "transfer"
        ? stage.transfer.prompt
        : `${subjectName} 알려준 문장을 잊지 않게 별노트에 적어 둘게!`;

  return <main className="park-cafe-talk">
    <Image className="park-cafe-talk__background" src={stage.image_url} alt="" fill priority />
    <div className="park-cafe-talk__wash" />
    <div className="cafe-talk-toolbar">
      <button className="cafe-talk-back" type="button" onClick={onBack}><span aria-hidden="true">←</span> 이전으로</button>
      <div className="park-talk-status"><small>{stageIndex + 1}/3</small><b>{stage.title}</b><SkillBadge skill={stage.skill} /></div>
    </div>

    <section className="cafe-talk-flow">
      <section className="cafe-talk-bubble">
        <Image className="cafe-talk-morami" src={phase === "transfer" ? "/morami/bright-cutout.png" : "/morami/confused-cutout.png"} alt="생각하고 있는 모르미" width={300} height={360} unoptimized />
        <div className="cafe-talk-bubble__text">
          <b>모르미</b>
          <p>{dialogue}</p>
          {helpVisible && phase === "teach" && <div className="park-help-card" role="status"><strong>먼저 눈에 보이는 수를 찾아보자.</strong><span>{factSummary}</span><em>{stage.strategy}</em></div>}
          {phase === "teach" && <button type="button" className="cafe-talk-dont-know" onClick={() => setHelpVisible(true)}>잘 모르겠어</button>}
        </div>
      </section>

      <div className="cafe-talk-stage"><ParkProblemVisual stage={stage} phase={phase} /></div>

      <aside className="cafe-talk-answer">
        {phase === "teach" && <aside className="cafe-ai-followup">
          <form onSubmit={(event) => { event.preventDefault(); if (explanation.trim().length >= 4) setPhase("quote"); }}>
            <label>모르미에게 내 말로 알려주기
              <input value={explanation} maxLength={160} onChange={(event) => setExplanation(event.target.value)} placeholder="내 생각을 짧게 알려줘" />
            </label>
            <button type="submit" disabled={explanation.trim().length < 4}>알려주기</button>
          </form>
        </aside>}
        {phase === "quote" && <button type="button" className="figma-cafe-action park-phase-action" onClick={() => setPhase("transfer")}>다른 문제에도 해보기 →</button>}
        {phase === "transfer" && <button type="button" className="figma-cafe-action park-phase-action" onClick={() => setPhase("note")}>별노트에 남기기 →</button>}
        {phase === "note" && <div className="park-star-note park-star-note--cafe"><span>★ 별노트</span><blockquote>{explanation.trim()}</blockquote><p>— {subjectName} 알려줌</p><button type="button" onClick={() => setPhase("clear")}>미션 완료 →</button></div>}
      </aside>
    </section>
    <small className="park-preview-label">FE 계약 미리보기 · 판정과 저장은 연결하지 않음</small>
  </main>;
}

export function AmusementParkPreview() {
  const [completed, setCompleted] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const learnerName = useSyncExternalStore(
    subscribeToStoredLearner,
    () => givenNameFromFullName(readStoredLearner()?.name),
    () => "친구",
  );
  const stage = active === null ? null : amusementParkPreview.stages[active];

  if (!stage || active === null) return <ParkMap completed={completed} learnerName={learnerName} onOpen={setActive} />;
  return <MissionScene stage={stage} stageIndex={active} learnerName={learnerName} onBack={() => setActive(null)} onComplete={() => { setCompleted((value) => Math.max(value, active + 1)); setActive(null); }} />;
}
