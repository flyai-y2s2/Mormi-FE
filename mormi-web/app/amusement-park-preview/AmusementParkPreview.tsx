"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { amusementParkPreview, type AmusementStageContract } from "../amusement-park-contract";

type Phase = "teach" | "quote" | "transfer" | "note" | "clear";

function SkillBadge({ skill }: { skill: AmusementStageContract["skill"] }) {
  const label = skill === "multiply" ? "곱셈" : skill === "divide" ? "나눗셈" : "혼합 계산";
  return <span className={`park-skill park-skill--${skill}`}>{label}</span>;
}

function ParkMap({ completed, onOpen }: { completed: number; onOpen: (index: number) => void }) {
  return <main className="park-map">
    <Image className="park-map__background" src="/amusement-park/park-map.png" alt="놀이동산 전경" fill priority />
    <div className="park-map__wash" />
    <header className="park-map__header">
      <div><p>FE GAME PREVIEW</p><h1>선배, 우리 돈 관리를 부탁해!</h1><span>입장부터 이용권 결정까지 세 가지 미션을 해결해요.</span></div>
      <div className="park-map__progress"><span><i style={{ width: `${(completed / 3) * 100}%` }} /></span><b>{completed}/3 CLEAR</b></div>
    </header>
    <section className="park-map__missions" aria-label="놀이동산 미션 지도">
      {amusementParkPreview.stages.map((stage, index) => {
        const locked = index > completed;
        const cleared = index < completed;
        return <button key={stage.stage_id} type="button" className={`${index === completed ? "is-current" : ""}${cleared ? " is-cleared" : ""}`} disabled={locked} onClick={() => onOpen(index)}>
          <Image src={stage.image_url} alt={`${stage.title} 미션`} fill />
          <span className="park-map__mission-no">{cleared ? "✓" : locked ? "🔒" : index + 1}</span>
          <div><SkillBadge skill={stage.skill} /><h2>{stage.title}</h2><p>{stage.mission}</p><strong>{cleared ? "다시 보기" : locked ? "앞 미션을 먼저 완료해요" : "미션 시작 →"}</strong></div>
        </button>;
      })}
    </section>
    <div className="park-map__mormi"><Image src="/morami/bright-cutout.png" alt="놀이동산에 온 모르미" width={290} height={340} priority unoptimized /><p>나는 계산이 헷갈려.<br /><b>선배가 결정해 줘!</b></p></div>
    <Link className="park-exit" href="/">← 집으로</Link>
    <small className="park-preview-label">서버 저장 없는 FE 미리보기</small>
  </main>;
}

function MissionScene({ stage, stageIndex, onBack, onComplete }: { stage: AmusementStageContract; stageIndex: number; onBack: () => void; onComplete: () => void }) {
  const [phase, setPhase] = useState<Phase>("teach");
  const [explanation, setExplanation] = useState("");
  const [blockedAnswer, setBlockedAnswer] = useState(false);
  const factSummary = useMemo(() => stage.facts.map((fact) => `${fact.label} ${fact.value.toLocaleString("ko-KR")}${fact.unit}`).join(" · "), [stage]);

  if (phase === "clear") return <main className="park-clear">
    <div className="park-clear__confetti" aria-hidden="true" />
    <Image src="/morami/celebrate-cutout.png" alt="기뻐하는 모르미" width={410} height={480} priority unoptimized />
    <section><span>STAGE {stageIndex + 1} CLEAR</span><h1>{stage.title} 미션<br /><b>완료!</b></h1><p>선배가 알려준 전략으로 새 문제까지 해결했어요.</p><div><small>배운 전략</small><strong>{stage.strategy}</strong></div><button type="button" onClick={onComplete}>지도에서 확인하기 →</button></section>
  </main>;

  return <main className="park-mission">
    <Image className="park-mission__background" src={stage.image_url} alt="" fill priority />
    <div className="park-mission__blur" />
    <header><button type="button" onClick={onBack}>← 지도</button><div><span>STAGE {stageIndex + 1}</span><b>{stage.title}</b></div><SkillBadge skill={stage.skill} /></header>
    <section className="park-mission__board">
      <div className="park-mission__visual"><Image src={stage.image_url} alt={`${stage.title} 상황`} fill /><div><span>오늘의 미션</span><b>{stage.mission}</b></div></div>
      <div className="park-mission__play">
        <div className="park-dialogue">
          <Image src={phase === "transfer" ? "/morami/bright-cutout.png" : "/morami/confused-cutout.png"} alt="배우고 있는 모르미" width={122} height={142} unoptimized />
          <div><span>후배 모르미</span>
            {phase === "teach" && <p>{stage.mormi_misconception}</p>}
            {phase === "quote" && <p>“{explanation.trim()}”라고? 선배 말대로라면 다른 숫자에서도 해볼 수 있을 것 같아!</p>}
            {phase === "transfer" && <><p>{stage.transfer.prompt}</p><strong>{stage.transfer.equation}</strong><em>{stage.transfer.conclusion}</em></>}
            {phase === "note" && <p>선배가 알려준 문장을 잊지 않게 별노트에 적어 둘게!</p>}
          </div>
        </div>

        {phase === "teach" && <div className="park-teach-panel">
          <div className="park-facts">{stage.facts.map((fact) => <span key={fact.key}><small>{fact.label}</small><b>{fact.value.toLocaleString("ko-KR")}{fact.unit}</b></span>)}</div>
          <p>{stage.prompt}</p>
          <label htmlFor="park-explanation">모르미에게 내 말로 가르쳐 주기</label>
          <textarea id="park-explanation" value={explanation} onChange={(event) => { setExplanation(event.target.value.slice(0, 160)); setBlockedAnswer(false); }} placeholder="예: 같은 돈이 여러 번이니까…" />
          {blockedAnswer && <div className="park-answer-block" role="status"><b>정답을 바로 말해 주지는 않을게.</b><span>{factSummary}를 보고 선배 생각부터 알려줘!</span></div>}
          <div className="park-teach-actions"><button type="button" className="is-ghost" onClick={() => setBlockedAnswer(true)}>정답 알려줘</button><button type="button" disabled={explanation.trim().length < 4} onClick={() => setPhase("quote")}>가르쳐 주기 →</button></div>
        </div>}

        {phase === "quote" && <div className="park-next-panel"><span>1 · 원문 인용</span><p>아이의 표현을 그대로 되돌려 물어봅니다.</p><button type="button" onClick={() => setPhase("transfer")}>모르미가 새 문제에 도전 →</button></div>}
        {phase === "transfer" && <div className="park-next-panel is-transfer"><span>2 · 전이 성공</span><p>배운 전략을 새 숫자 문제에 적용했어요.</p><button type="button" onClick={() => setPhase("note")}>별노트에 남기기 →</button></div>}
        {phase === "note" && <div className="park-star-note"><span>★ 별노트</span><blockquote>{explanation.trim()}</blockquote><p>— 선배가 알려줌</p><small>아이의 실제 문장만 기록하는 화면 예시</small><button type="button" onClick={() => setPhase("clear")}>미션 완료 →</button></div>}
      </div>
    </section>
    <small className="park-preview-label">FE 계약 미리보기 · 판정과 저장은 연결하지 않음</small>
  </main>;
}

export function AmusementParkPreview() {
  const [completed, setCompleted] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const stage = active === null ? null : amusementParkPreview.stages[active];

  if (!stage || active === null) return <ParkMap completed={completed} onOpen={setActive} />;
  return <MissionScene stage={stage} stageIndex={active} onBack={() => setActive(null)} onComplete={() => { setCompleted((value) => Math.max(value, active + 1)); setActive(null); }} />;
}
