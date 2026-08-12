"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureMormeyEvent } from "./analytics";
import { CafeJourney } from "./CafeJourney";
import { cafeRequiredSessionIds, isCafeUnlocked } from "./journey-config";
import { areaForSession, curriculumForSession, masteryTarget, mathAreas, sessions, transferTarget } from "./math-curriculum";
import type { Problem, Session, Visual } from "./morami-content";

type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
type Stage = "onboarding" | "home" | "outside" | "cafe" | "curriculum" | "drill" | "teach" | "wrap" | "homework" | "complete";

const expressions: Record<Expression, string> = {
  calm: "/morami/calm-cutout.png",
  happy: "/morami/happy-cutout.png",
  confused: "/morami/confused-cutout.png",
  surprised: "/morami/surprised-cutout.png",
  bright: "/morami/bright-cutout.png",
  celebrate: "/morami/celebrate-cutout.png",
};

const stageLabels = ["혼자 연습", "가르치기", "별노트", "생활 게임"];
const childName = "지우";

type TeachMessage = {
  id: number;
  role: "morami" | "child";
  text: string;
};

type MoramiEvent = "session_start" | "drill_correct" | "drill_retry" | "teach_prompt" | "teach_message" | "teach_correct" | "teach_retry" | "homework_correct" | "session_complete";

type MoramiTurnOptions = {
  childMessage?: string;
  teachPrompt?: string;
  conversation?: Array<{ role: "morami" | "child"; text: string }>;
};

type MoramiTurn = {
  dialogue: string;
  expression: Expression;
  source: "anthropic" | "mock";
  understood?: boolean;
};

const simpleLearnedLines: Record<string, string> = {
  "add-pictures": "더하기는 둘을 한데 모으는 거야.",
  "add-place": "같은 자리끼리 더해.",
  "add-make-ten": "10을 먼저 만들고, 남은 수를 더해.",
  "sub-pictures": "빼고 남은 수를 세어.",
  "sub-place": "같은 자리끼리 빼.",
  "sub-borrow": "십 하나를 낱개 10개로 바꿔.",
  "money-count": "돈에 적힌 수를 모두 더해.",
  "money-price": "두 물건값을 더해.",
  "money-budget": "낸 돈에서 물건값을 빼.",
  "money-mission": "두 물건값을 더해. 그다음 낸 돈에서 빼.",
  "clock-basic": "긴 바늘이 12면 정각, 6이면 30분이야.",
  "clock-quarter": "긴 바늘은 숫자 한 칸에 5분이야.",
};

function simpleLearnedLine(session: Session) {
  return simpleLearnedLines[session.id] ?? session.learnedLine;
}

function simpleTeachPrompt(session: Session) {
  return `‘${session.title}’가 헷갈려. 어떻게 하는지 쉽게 알려 줘.`;
}

async function requestMoramiTurn(session: Session, event: MoramiEvent, fallbackDialogue: string, ladderLevel = 3, options: MoramiTurnOptions = {}) {
  try {
    const response = await fetch("/api/morami/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        sessionTitle: session.title,
        event,
        ladderLevel,
        misconception: session.misconception,
        learnedLine: simpleLearnedLine(session),
        fallbackDialogue,
        ...options,
      }),
    });
    if (!response.ok) return null;
    return await response.json() as MoramiTurn;
  } catch {
    return null;
  }
}

function playLearningChime() {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const notes = [659.25, 783.99, 1046.5];
  const now = context.currentTime;

  notes.forEach((frequency, index) => {
    const start = now + index * 0.11;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index === notes.length - 1 ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.045, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
  });

  window.setTimeout(() => void context.close(), 750);
}

function playCoinRewardSound(reward: number) {
  if (typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const notes = reward === 200 ? [783.99, 1046.5, 1318.51] : reward === 100 ? [659.25, 880] : [523.25, 659.25];
  notes.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.09;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.11, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.26);
  });
  window.setTimeout(() => void context.close(), 700);
}

function useGameMusic(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const loopRef = useRef<number | null>(null);

  const stopMusic = useCallback(() => {
    if (loopRef.current !== null) window.clearInterval(loopRef.current);
    loopRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context) void context.close();
  }, []);

  const startMusic = useCallback((force = false) => {
    if ((!enabled && !force) || contextRef.current || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const master = context.createGain();
    master.gain.setValueAtTime(0.038, context.currentTime);
    master.connect(context.destination);
    contextRef.current = context;

    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 698.46];
    const bass = [130.81, 164.81, 146.83, 174.61];
    const scheduleBar = () => {
      const now = context.currentTime + 0.06;
      melody.forEach((frequency, index) => {
        const start = now + index * 0.36;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(index % 2 === 0 ? 0.2 : 0.13, start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.31);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + 0.34);
      });
      bass.forEach((frequency, index) => {
        const start = now + index * 0.72;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + 0.66);
      });
    };

    scheduleBar();
    loopRef.current = window.setInterval(scheduleBar, 2880);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      stopMusic();
      return;
    }
    const beginAfterInteraction = () => startMusic();
    document.addEventListener("pointerdown", beginAfterInteraction, { once: true });
    document.addEventListener("keydown", beginAfterInteraction, { once: true });
    return () => {
      document.removeEventListener("pointerdown", beginAfterInteraction);
      document.removeEventListener("keydown", beginAfterInteraction);
    };
  }, [enabled, startMusic, stopMusic]);

  useEffect(() => () => stopMusic(), [stopMusic]);
  return { startMusic, stopMusic };
}

type UiIconName = "sound" | "mute" | "book" | "star" | "sprout" | "bulb" | "sun" | "clip" | "bag" | "refresh";

function UiIcon({ name, size = "medium" }: { name: UiIconName; size?: "small" | "medium" | "large" }) {
  return <span className={`ui-icon ui-icon--${name} ui-icon--${size}`} aria-hidden="true"><i /></span>;
}

function Clock({ hour, minute, small = false }: { hour: number; minute: number; small?: boolean }) {
  const hourDegrees = hour * 30 + minute * 0.5;
  const minuteDegrees = minute * 6;
  return (
    <div className={`clock ${small ? "clock--small" : ""}`} aria-label={`${hour}시 ${minute}분 시계`}>
      {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((number, index) => (
        <span
          className="clock-number"
          key={number}
          style={{ "--angle": `${index * 30}deg` } as React.CSSProperties}
        >
          <b style={{ transform: `rotate(-${index * 30}deg)` }}>{number}</b>
        </span>
      ))}
      <i className="clock-hand clock-hand--hour" style={{ transform: `rotate(${hourDegrees}deg)` }} />
      <i className="clock-hand clock-hand--minute" style={{ transform: `rotate(${minuteDegrees}deg)` }} />
      <i className="clock-center" />
    </div>
  );
}

function PointingClock({ onPick, marker }: { onPick: (number: number) => void; marker: number }) {
  return (
    <div className={`point-clock point-clock--${marker}`} aria-label={`시계에서 숫자 ${marker}을 눌러 보세요`}>
      {[12, 3, 6, 9].map((number) => (
        <button key={number} className={`point-number point-number--${number}`} onClick={() => onPick(number)}>
          {number}
        </button>
      ))}
      <i className="point-hand" />
      <i className="clock-center" />
    </div>
  );
}

function ObjectGroup({ count, crossed = false }: { count: number; crossed?: boolean }) {
  return (
    <div className={`object-group ${crossed ? "is-crossed" : ""}`} aria-label={`${count}개`}>
      {Array.from({ length: count }, (_, index) => <i key={index} />)}
    </div>
  );
}

function MoneyVisual({ amounts, paid, labels = [] }: { amounts: number[]; paid?: number; labels?: string[] }) {
  return (
    <div className="money-visual">
      {paid && <div className="paid-card"><span>낸 돈</span><strong>{paid.toLocaleString("ko-KR")}원</strong></div>}
      <div className="price-row">
        {amounts.map((amount, index) => (
          <div className="price-card" key={`${amount}-${index}`}>
            <i className={amount >= 1000 ? "bill-shape" : "coin-shape"} />
            <span>{labels[index] || "돈"}</span>
            <strong>{amount.toLocaleString("ko-KR")}원</strong>
          </div>
        ))}
      </div>
      {paid && <div className="money-operation"><span>{paid.toLocaleString("ko-KR")}</span><b>−</b><span>{amounts.reduce((sum, value) => sum + value, 0).toLocaleString("ko-KR")}</span></div>}
    </div>
  );
}

const tenFrameItems = {
  strawberry: "🍓",
  cup: "🥤",
  apple: "🍎",
} as const;

function TenFrame({ count, item = "dot" }: { count: number; item?: "dot" | "strawberry" | "cup" | "apple" }) {
  return (
    <div className={`ten-frame ten-frame--${item}`} aria-label={`${count}개`}>
      {Array.from({ length: 10 }, (_, index) => (
        <i key={index} className={index < count ? "is-filled" : ""}>
          {index < count && item !== "dot" ? <span aria-hidden="true">{tenFrameItems[item]}</span> : null}
        </i>
      ))}
    </div>
  );
}

function GroupsVisual({ groups, each, mode }: { groups: number; each: number; mode: "multiply" | "share" }) {
  return <div className={`groups-visual groups-visual--${mode}`} aria-label={`${each}개씩 ${groups}묶음`}>{Array.from({ length: groups }, (_, group) => <span key={group}>{Array.from({ length: each }, (_, dot) => <i key={dot} />)}</span>)}</div>;
}

function NumberLineVisual({ start, end, marks, missing }: { start: number; end: number; marks: number[]; missing?: number }) {
  return <div className="number-line-visual" aria-label={`${start}부터 ${end}까지 수직선`}><div className="number-line-track" /><div className="number-line-marks">{marks.map((mark, index) => <span key={`${mark}-${index}`} className={mark === missing ? "is-focus" : ""}><i />{mark === missing ? "?" : mark}</span>)}</div></div>;
}

function MeasurementVisual({ kind, left, right, unit }: { kind: "length" | "weight" | "capacity"; left: number; right?: number; unit: string }) {
  const max = Math.max(left, right || left, 1);
  return <div className={`measurement-visual measurement-visual--${kind}`}>{[left, right].filter((value): value is number => typeof value === "number").map((value, index) => <div key={`${value}-${index}`}><span style={{ "--measure": `${Math.max(18, (value / max) * 100)}%` } as React.CSSProperties}><i /></span><strong>{value.toLocaleString("ko-KR")}{unit}</strong></div>)}</div>;
}

function ShapesVisual({ shapes }: { shapes: Array<"circle" | "triangle" | "square" | "rectangle"> }) {
  return <div className="shapes-visual">{shapes.map((shape, index) => <span key={`${shape}-${index}`} className={shape}><i /></span>)}</div>;
}

function PatternVisual({ items, missingIndex }: { items: string[]; missingIndex: number }) {
  return <div className="pattern-visual">{items.map((entry, index) => <span key={`${entry}-${index}`} className={index === missingIndex ? "is-missing" : ""}>{entry}</span>)}</div>;
}

function ChartVisual({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);
  return <div className="chart-visual">{values.map((value, index) => <div key={`${labels[index]}-${index}`}><span><i style={{ height: `${(value / max) * 100}%` }} /></span><b>{value}</b><small>{labels[index]}</small></div>)}</div>;
}

function CalendarVisual({ month, highlight, note }: { month: number; highlight: number; note?: string }) {
  const days = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return <div className="calendar-visual"><strong>{month}월</strong><div>{Array.from({ length: days }, (_, index) => <i key={index} className={index + 1 === highlight ? "is-highlight" : ""}>{index + 1}</i>)}</div>{note && <small>{note}</small>}</div>;
}

function LearningVisual({ visual, small = false }: { visual: Visual; small?: boolean }) {
  if (visual.type === "clock") return <Clock hour={visual.hour} minute={visual.minute} small={small} />;
  if (visual.type === "money") return <MoneyVisual amounts={visual.amounts} paid={visual.paid} labels={visual.labels} />;
  if (visual.type === "ten-frame") return <div className="ten-frame-pair"><TenFrame count={visual.count} item={visual.item} />{typeof visual.secondCount === "number" && <TenFrame count={visual.secondCount} item={visual.item} />}</div>;
  if (visual.type === "groups") return <GroupsVisual groups={visual.groups} each={visual.each} mode={visual.mode} />;
  if (visual.type === "number-line") return <NumberLineVisual start={visual.start} end={visual.end} marks={visual.marks} missing={visual.missing} />;
  if (visual.type === "measurement") return <MeasurementVisual kind={visual.kind} left={visual.left} right={visual.right} unit={visual.unit} />;
  if (visual.type === "shapes") return <ShapesVisual shapes={visual.shapes} />;
  if (visual.type === "pattern") return <PatternVisual items={visual.items} missingIndex={visual.missingIndex} />;
  if (visual.type === "chart") return <ChartVisual labels={visual.labels} values={visual.values} />;
  if (visual.type === "calendar") return <CalendarVisual month={visual.month} highlight={visual.highlight} note={visual.note} />;
  return (
    <div className={`math-visual ${small ? "math-visual--small" : ""}`}>
      {visual.type === "objects" ? <ObjectGroup count={visual.left} /> : <strong>{visual.left}</strong>}
      <b className="math-symbol">{visual.operation}</b>
      {visual.type === "objects" ? <ObjectGroup count={visual.right} crossed={visual.operation === "-"} /> : <strong>{visual.right}</strong>}
      <b className="math-symbol">=</b><span className="answer-cloud">?</span>
    </div>
  );
}

function ProblemCard({ problem, small = false }: { problem: Problem; small?: boolean }) {
  return <div className={`problem-visual ${small ? "problem-visual--small" : ""}`}><LearningVisual visual={problem.visual} small={small} /></div>;
}

function rotateAnswers(answers: string[], seed: number) {
  const offset = Math.abs(seed) % answers.length;
  return [...answers.slice(offset), ...answers.slice(0, offset)];
}

function shuffleWords(words: string[], seed: number) {
  const shuffled = [...words];
  let state = Math.abs(seed) + 1;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  if (shuffled.every((word, index) => word === words[index]) && shuffled.length > 1) shuffled.push(shuffled.shift()!);
  return shuffled;
}

function fourAnswerCandidates(problem: Problem) {
  const candidates: string[] = [];
  const numberParts = problem.correct.match(/\d[\d,]*/g) ?? [];
  if (numberParts.length === 1) {
    const numberText = numberParts[0];
    const value = Number(numberText.replaceAll(",", ""));
    const step = value >= 1000 ? 500 : value >= 100 ? 100 : value >= 20 ? 5 : 2;
    [value + step, Math.max(0, value - step), value + step * 2].forEach((candidate) => {
      const formatted = numberText.includes(",") || problem.correct.includes("원")
        ? candidate.toLocaleString("ko-KR")
        : String(candidate);
      candidates.push(problem.correct.replace(numberText, formatted));
    });
  }

  if (problem.answers.some((answer) => ["왼쪽", "오른쪽", "같아"].includes(answer))) candidates.push("판단할 수 없어");
  if (problem.answers.some((answer) => ["첫째", "둘째", "셋째"].includes(answer))) candidates.push("넷째");
  if (problem.visual.type === "shapes") candidates.push("오각형", "반원");
  if (problem.visual.type === "pattern") candidates.push("◆", "★", "↗");
  if (problem.visual.type === "chart") candidates.push(...problem.visual.labels, "표가 같아");
  candidates.push("모두 아니야", "알 수 없어", "조건이 부족해");
  return candidates;
}

function ensureFourAnswers(problem: Problem) {
  const answers = Array.from(new Set([problem.correct, ...problem.answers]));
  for (const candidate of fourAnswerCandidates(problem)) {
    if (answers.length >= 4) break;
    if (!answers.includes(candidate)) answers.push(candidate);
  }
  return answers.slice(0, 4);
}

function varyProblem(problem: Problem, seed: number): Problem {
  const step = Math.abs(seed % 4) + 1;
  if (problem.visual.type === "objects" || problem.visual.type === "equation") {
    const visual = problem.visual;
    const left = Math.max(2, visual.left + step);
    const right = visual.operation === "-" ? Math.max(1, Math.min(left - 1, visual.right + (step % 2))) : visual.right + (step % 3);
    const result = visual.operation === "+" ? left + right : left - right;
    return { ...problem, correct: String(result), answers: rotateAnswers([String(result), String(Math.max(0, result - 1)), String(result + 1)], seed), visual: { ...visual, left, right } };
  }
  if (problem.visual.type === "ten-frame") {
    if (problem.visual.secondCount !== undefined) {
      const relation = problem.correct;
      const low = 2 + (step % 3);
      const high = Math.min(10, low + 2 + (step % 2));
      const count = relation === "왼쪽" ? high : relation === "오른쪽" ? low : 4 + step;
      const secondCount = relation === "오른쪽" ? high : relation === "왼쪽" ? low : count;
      return { ...problem, visual: { ...problem.visual, count, secondCount } };
    }
    const count = (Math.abs(seed) % 10) + 1;
    const suffix = problem.correct.replace(/[\d,\s-]/g, "");
    if (problem.prompt.includes("10")) {
      const result = 10 - count;
      const display = (value: number) => `${value}${suffix}`;
      const prompt = problem.prompt.includes("모으면") ? `${count}과 몇을 모으면 10일까?` : problem.prompt.includes("달걀판") ? `달걀판 10칸 중 ${count}칸을 채웠어. 몇 개가 더 필요할까?` : `10명 모둠에 ${count}명이 왔어. 몇 명이 더 와야 할까?`;
      return { ...problem, prompt, correct: display(result), answers: rotateAnswers([display(result), display(Math.max(0, result - 1)), display(result + 1)], seed), visual: { ...problem.visual, count } };
    }
    const display = (value: number) => `${value}${suffix}`;
    return { ...problem, correct: display(count), answers: rotateAnswers([display(count), display(Math.max(1, count - 1)), display(Math.min(10, count + 1))], seed), visual: { ...problem.visual, count } };
  }
  if (problem.visual.type === "money") {
    const amounts = problem.visual.amounts.map((amount, index) => amount + 100 * (((seed + index) % 3 + 3) % 3));
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const paid = problem.visual.paid ? Math.max(total + 500, problem.visual.paid + step * 500) : undefined;
    const result = paid ? paid - total : total;
    const money = (value: number) => `${Math.max(0, value).toLocaleString("ko-KR")}원`;
    return {
      ...problem,
      prompt: paid ? `${paid.toLocaleString("ko-KR")}원을 냈어. 얼마를 돌려받을까?` : "모두 얼마일까?",
      correct: money(result),
      answers: rotateAnswers([money(result), money(result + 100), money(result >= 100 ? result - 100 : result + 200)], seed),
      visual: { ...problem.visual, amounts, paid },
    };
  }
  if (problem.visual.type === "clock") {
    const hour = ((problem.visual.hour + step - 1) % 12) + 1;
    const minute = problem.visual.minute;
    const correct = minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`;
    const nextHour = hour === 12 ? 1 : hour + 1;
    return { ...problem, correct, answers: rotateAnswers([correct, minute === 0 ? `${hour}시 30분` : `${hour}시`, minute === 0 ? `${nextHour}시` : `${nextHour}시 ${minute}분`], seed), visual: { ...problem.visual, hour } };
  }
  if (problem.visual.type === "groups" && !problem.correct.includes("원")) {
    const groups = Math.max(2, Math.min(8, problem.visual.groups + (step % 2)));
    const each = Math.max(2, Math.min(10, problem.visual.each + (step % 3 === 0 ? 1 : 0)));
    const total = groups * each;
    const suffix = problem.correct.match(/^\d[\d,]*(.*)$/)?.[1] ?? "";
    if (problem.prompt.includes("덧셈으로") || problem.correct.includes("+")) {
      const correct = Array.from({ length: groups }, () => String(each)).join("+");
      return { ...problem, prompt: `${each}개씩 ${groups}묶음을 덧셈으로 나타내면?`, correct, answers: [correct, `${each}+${groups}`, Array.from({ length: each }, () => String(groups)).join("+")], visual: { ...problem.visual, groups, each } };
    }
    if (problem.prompt.includes("몇 묶음") || suffix.includes("묶음")) {
      const correct = `${groups}묶음`;
      return { ...problem, prompt: `${total}개를 ${each}개씩 묶으면 몇 묶음?`, correct, answers: [correct, `${each}묶음`, `${groups + 1}묶음`], visual: { ...problem.visual, groups, each } };
    }
    if (problem.visual.mode === "share") {
      const unit = suffix || "개";
      const correct = `${each}${unit}`;
      return { ...problem, prompt: `${total}개를 ${groups}명에게 똑같이 나누면 한 명당?`, correct, answers: [correct, `${Math.max(1, each - 1)}${unit}`, `${each + 1}${unit}`], visual: { ...problem.visual, groups, each } };
    }
    const correct = `${total}${suffix}`;
    const prompt = problem.prompt.includes("×") ? `${each}×${groups}은?` : `${each}개씩 ${groups}묶음은 모두 몇 개일까?`;
    return { ...problem, prompt, correct, answers: [correct, `${Math.max(0, total - each)}${suffix}`, `${total + each}${suffix}`], visual: { ...problem.visual, groups, each } };
  }
  if (problem.visual.type === "number-line") {
    const sequence = problem.prompt.match(/^([\d, ]+) 다음 수는\?$/);
    if (sequence) {
      const values = sequence[1].split(",").map((value) => Number(value.trim()));
      const shifted = values.map((value) => value + step);
      const interval = values.length > 1 ? values[1] - values[0] : step;
      const result = shifted.at(-1)! + interval;
      const marks = [...shifted, result].toSorted((a, b) => a - b);
      return { ...problem, prompt: `${shifted.join(", ")} 다음 수는?`, correct: String(result), answers: [String(result), String(result + Math.abs(interval)), String(result - Math.abs(interval))], visual: { ...problem.visual, start: marks[0], end: marks.at(-1)!, marks, missing: result } };
    }
    if (typeof problem.visual.missing === "number" && (problem.prompt.includes("십의 자리") || problem.prompt.includes("일의 자리") || problem.prompt.includes("낱개") || problem.prompt.includes("십 "))) {
      const tens = 2 + ((Math.floor(problem.visual.missing / 10) + step) % 7);
      const ones = 1 + ((problem.visual.missing + step) % 8);
      const value = tens * 10 + ones;
      const asksTens = problem.prompt.includes("십의 자리");
      const asksOnes = problem.prompt.includes("일의 자리") || problem.prompt.includes("낱개");
      const correct = asksTens ? String(tens) : asksOnes ? (problem.correct.includes("개") ? `${ones}개` : String(ones)) : String(value);
      const prompt = asksTens ? `${value}에서 십의 자리 수는?` : asksOnes ? `${value}에서 ${problem.prompt.includes("낱개") ? "낱개는 몇 개일까" : "일의 자리 수는"}?` : `${tens}십 ${ones}는 어떤 수일까?`;
      const end = Math.ceil(value / 10) * 10;
      const marks = Array.from({ length: Math.floor(end / 10) + 1 }, (_, index) => index * 10).concat(value).toSorted((a, b) => a - b);
      return { ...problem, prompt, correct, answers: [correct, asksTens ? String(ones) : String(tens), String(value)], visual: { ...problem.visual, start: 0, end, marks, missing: value } };
    }
  }
  if (problem.visual.type === "measurement") {
    if (typeof problem.visual.right === "number" && ["왼쪽", "오른쪽", "같아"].includes(problem.correct)) {
      const delta = problem.visual.unit === "g" || problem.visual.unit === "mL" ? step * 50 : step;
      return { ...problem, visual: { ...problem.visual, left: problem.visual.left + delta, right: problem.visual.right + delta } };
    }
    if (typeof problem.visual.right !== "number") {
      const previous = problem.visual.left;
      const next = previous + step;
      const correct = problem.correct.replace(String(previous), String(next));
      const prompt = problem.prompt.replaceAll(String(previous), String(next));
      return { ...problem, prompt, correct, answers: problem.answers.map((answer) => answer.replace(String(previous), String(next))), visual: { ...problem.visual, left: next } };
    }
  }
  if (problem.visual.type === "shapes") {
    const offset = step % problem.visual.shapes.length;
    const shapes = [...problem.visual.shapes.slice(offset), ...problem.visual.shapes.slice(0, offset)];
    let correct = problem.correct;
    const target = problem.prompt.includes("삼각형") ? "triangle" : problem.prompt.includes("원은") ? "circle" : null;
    if (target && ["첫째", "둘째", "셋째"].includes(correct)) correct = ["첫째", "둘째", "셋째"][shapes.indexOf(target)];
    return { ...problem, correct, visual: { ...problem.visual, shapes } };
  }
  if (problem.visual.type === "pattern") {
    const items = [...problem.visual.items];
    if (problem.visual.missingIndex === -1) {
      const offset = step % items.length;
      const shiftedItems = [...items.slice(offset), ...items.slice(0, offset)];
      let correct = problem.correct;
      if (["왼쪽", "오른쪽"].includes(correct) && problem.prompt.includes("어느 쪽")) correct = correct === "왼쪽" ? "오른쪽" : "왼쪽";
      return { ...problem, correct, visual: { ...problem.visual, items: shiftedItems } };
    }
    const symbolMaps: Array<Record<string, string>> = [
      { "●": "◆", "▲": "■", "■": "●", "◆": "▲" },
      { "큰 원": "큰 별", "작은 원": "작은 별", "세모": "네모" },
    ];
    const symbolMap = symbolMaps.find((candidate) => candidate[problem.correct]);
    if (symbolMap) {
      const missingIndex = problem.visual.missingIndex;
      const mappedItems = items.map((item) => symbolMap[item] ?? item);
      const correct = symbolMap[problem.correct];
      const visiblePattern = mappedItems.filter((_, index) => index !== missingIndex).join(" ");
      return { ...problem, prompt: `${visiblePattern} 다음은?`, correct, answers: problem.answers.map((answer) => symbolMap[answer] ?? answer), visual: { ...problem.visual, items: mappedItems } };
    }
  }
  if (problem.visual.type === "chart") {
    const values = problem.visual.values.map((value) => value + step);
    if (problem.prompt.includes("전체")) {
      const result = values.reduce((sum, value) => sum + value, 0);
      const unit = problem.correct.replace(/[\d,]/g, "");
      const correct = `${result}${unit}`;
      return { ...problem, correct, answers: [correct, `${Math.max(0, result - step)}${unit}`, `${result + step}${unit}`], visual: { ...problem.visual, values } };
    }
    if (values.length === 1 && problem.correct.match(/\d/)) {
      const unit = problem.correct.replace(/[\d,]/g, "");
      const correct = `${values[0]}${unit}`;
      return { ...problem, correct, answers: [correct, `${Math.max(0, values[0] - 1)}${unit}`, `${values[0] + 1}${unit}`], visual: { ...problem.visual, values } };
    }
    return { ...problem, visual: { ...problem.visual, values } };
  }
  if (problem.visual.type === "calendar") {
    const originalMonth = problem.visual.month;
    const safeMonths = [1, 3, 5, 7, 8, 10, 12];
    const month = safeMonths[(safeMonths.indexOf(originalMonth) + step + safeMonths.length) % safeMonths.length] ?? safeMonths[step % safeMonths.length];
    const replaceMonth = (value: string) => value.replaceAll(`${originalMonth}월`, `${month}월`);
    return { ...problem, prompt: replaceMonth(problem.prompt), correct: replaceMonth(problem.correct), answers: problem.answers.map(replaceMonth), visual: { ...problem.visual, month } };
  }
  return problem;
}

function shuffleProblemAnswers(problem: Problem, seed: number): Problem {
  const otherAnswers = ensureFourAnswers(problem).filter((answer) => answer !== problem.correct);
  const answers = shuffleWords(otherAnswers, seed + 101);
  const correctPosition = Math.abs(seed) % (answers.length + 1);
  answers.splice(correctPosition, 0, problem.correct);
  return { ...problem, answers };
}

function extraLifeProblem(session: Session, seed: number): Problem {
  const n = Math.abs(seed % 4) + 2;
  if (session.subject === "number") return { prompt: "과일 바구니에 담긴 사과는 모두 몇 개일까?", answers: [String(n + 3), String(n + 2), String(n + 4)], correct: String(n + 3), visual: { type: "ten-frame", count: n + 3, item: "apple" } };
  if (session.subject === "addition") return { prompt: `오전에 ${n}개, 오후에 ${n + 2}개를 진열했어. 모두 몇 개일까?`, answers: [String(n * 2 + 2), String(n * 2 + 1), String(n * 2 + 3)], correct: String(n * 2 + 2), visual: { type: "objects", left: n, right: n + 2, operation: "+" } };
  if (session.subject === "subtraction") return { prompt: `빵 ${n + 6}개 중 ${n}개가 팔렸어. 몇 개 남았을까?`, answers: ["6", "5", "7"], correct: "6", visual: { type: "objects", left: n + 6, right: n, operation: "-" } };
  if (session.subject === "multiplication") return { prompt: `${n}개씩 든 상자가 3개야. 상품은 모두 몇 개일까?`, answers: [`${n * 3}개`, `${n + 3}개`, `${n * 2}개`], correct: `${n * 3}개`, visual: { type: "groups", groups: 3, each: n, mode: "multiply" } };
  if (session.subject === "division") return { prompt: `${n * 3}개를 3명에게 똑같이 포장해 줘. 한 명당 몇 개일까?`, answers: [`${n}개씩`, `${n + 1}개씩`, `${Math.max(1, n - 1)}개씩`], correct: `${n}개씩`, visual: { type: "groups", groups: 3, each: n, mode: "share" } };
  if (session.subject === "money") return { prompt: "카페에서 주스와 빵을 샀어. 모두 얼마일까?", answers: ["3,000원", "2,900원", "3,100원"], correct: "3,000원", visual: { type: "money", amounts: [1800, 1200], labels: ["주스", "빵"] } };
  if (session.subject === "clock") { const hour = n + 1; return { prompt: "공방 수업이 시작하는 시각은?", answers: [`${hour}시 30분`, `${hour}시`, `${hour + 1}시 30분`], correct: `${hour}시 30분`, visual: { type: "clock", hour, minute: 30 } }; }
  if (session.subject === "measurement") return { prompt: "공방에서 더 긴 리본을 골라 줘.", answers: ["A 리본", "B 리본", "길이가 같아"], correct: "A 리본", visual: { type: "measurement", kind: "length", left: n + 5, right: n + 2, unit: "cm" } };
  if (session.subject === "geometry") return { prompt: "축제 표지판에서 동그란 모양은 무엇일까?", answers: ["원", "삼각형", "사각형"], correct: "원", visual: { type: "shapes", shapes: ["circle", "triangle", "square"] } };
  if (session.subject === "pattern") return { prompt: "팔찌 장식의 다음 모양을 놓아 줘.", answers: ["●", "▲", "■"], correct: "●", visual: { type: "pattern", items: ["●", "▲", "●", "▲", "?"], missingIndex: 4 } };
  return { prompt: "축제 투표에서 가장 많은 표를 받은 간식은?", answers: ["주스", "빵", "과일"], correct: "주스", visual: { type: "chart", labels: ["주스", "빵", "과일"], values: [n + 5, n + 2, n + 3] } };
}

function answersMatch(input: string, correct: string) {
  const clean = (value: string) => value.replace(/[\s,._!?]/g, "").toLowerCase();
  if (clean(input) === clean(correct)) return true;
  const spokenShapes: Record<string, string[]> = {
    "●": ["동그라미", "원"],
    "▲": ["세모", "삼각형"],
    "■": ["네모", "사각형", "정사각형"],
    "◆": ["마름모"],
    "↑": ["위", "위쪽"],
    "↓": ["아래", "아래쪽"],
    "←": ["왼쪽"],
    "→": ["오른쪽"],
  };
  if (spokenShapes[correct]?.some((answer) => clean(answer) === clean(input))) return true;
  const inputNumbers = input.match(/\d+/g)?.join("");
  const correctNumbers = correct.match(/\d+/g)?.join("");
  return Boolean(inputNumbers && correctNumbers && inputNumbers === correctNumbers);
}

function readableChoice(answer: string) {
  const labels: Record<string, string> = {
    "●": "● 동그라미",
    "▲": "▲ 세모",
    "■": "■ 네모",
    "◆": "◆ 마름모",
    "↑": "↑ 위쪽",
    "↓": "↓ 아래쪽",
    "←": "← 왼쪽",
    "→": "→ 오른쪽",
  };
  return labels[answer] ?? answer;
}

const genericTeachWords = new Set(["거야", "해야", "답을", "수를", "말해", "찾아", "세어", "먼저", "같은"]);

function teachResponseMatches(response: string, session: Session) {
  const clean = (value: string) => value.replace(/[\s,._!?]/g, "").toLowerCase();
  const normalized = clean(response);
  if (!normalized) return false;
  if ([session.fillCorrect, session.oneWordCorrect].some((word) => clean(word) === normalized)) return true;
  const concepts = Array.from(new Set([session.fillCorrect, session.oneWordCorrect, ...session.targetSentence]))
    .filter((word) => clean(word).length >= 2 && !genericTeachWords.has(word));
  return concepts.filter((word) => normalized.includes(clean(word))).length >= 2;
}

type RecognitionResultLike = { results: { 0: { 0: { transcript: string } } } };
type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};
type RecognitionConstructor = new () => RecognitionLike;

type MissionScene = "cafe" | "market" | "stationery" | "toyshop" | "snackshop" | "giftshop" | "workshop" | "fair";
type ProductScene = Extract<MissionScene, "cafe" | "market" | "stationery" | "toyshop" | "snackshop" | "giftshop">;

const missionBackgrounds: Record<MissionScene, string> = {
  cafe: "/scenes/cafe-bakery-cute-v4.png",
  market: "/scenes/market-cute-v4.png",
  stationery: "/life-missions/stationery.jpg",
  toyshop: "/life-missions/toyshop.jpg",
  snackshop: "/life-missions/snackshop.jpg",
  giftshop: "/life-missions/giftshop.jpg",
  workshop: "/life-missions/workshop.webp",
  fair: "/life-missions/fair.webp",
};

const productScenes: Record<string, ProductScene> = {
  공책: "stationery", 색연필: "stationery", 연필: "stationery", 지우개: "stationery", 스티커: "stationery", 책: "stationery", 자: "stationery", 풀: "stationery",
  장난감: "toyshop", 퍼즐: "toyshop", 인형: "toyshop", 공: "toyshop",
  가방: "giftshop", 운동화: "giftshop", 선물: "giftshop", 카드: "giftshop",
  빵: "snackshop", 우유: "snackshop", 간식: "snackshop", 주스: "snackshop", 과자: "snackshop", 과일: "snackshop", 물: "snackshop", 김밥: "snackshop",
  커피: "cafe", "커피 세트": "cafe", "카페 선물세트": "cafe",
};

function sceneForProduct(label: string): ProductScene {
  return productScenes[label] ?? "market";
}

const moneySceneCopy: Record<ProductScene, { place: string }> = {
  cafe: { place: "동네 카페" },
  market: { place: "동네 계산대" },
  stationery: { place: "동네 문구점" },
  toyshop: { place: "장난감 가게" },
  snackshop: { place: "동네 간식 가게" },
  giftshop: { place: "선물 가게" },
};

function missionStory(session: Session, problem: Problem): { scene: MissionScene; place: string; title: string; action: string } {
  if (problem.visual.type === "money") {
    const firstProduct = problem.visual.labels?.[0];
    const scene = firstProduct ? sceneForProduct(firstProduct) : session.subject === "money" ? "cafe" : "market";
    const title = problem.visual.paid
      ? "손님에게 줄 거스름돈을 계산해요"
      : problem.visual.amounts.length > 1
        ? "두 물건값을 합쳐 계산해요"
        : "물건값을 계산해요";
    return { scene, place: moneySceneCopy[scene].place, title, action: "계산대에 답 쓰기" };
  }
  if (session.subject === "number") return { scene: "market", place: "과일 가게", title: "진열할 물건을 정확히 세어요", action: "바구니 답 고르기" };
  if (session.subject === "addition") return { scene: "market", place: "동네 가게", title: "두 장바구니를 합쳐 계산해요", action: "합계표 고르기" };
  if (session.subject === "subtraction") return { scene: "market", place: "동네 가게", title: "팔고 남은 물건을 확인해요", action: "남은 수 고르기" };
  if (session.subject === "multiplication") return { scene: "market", place: "상품 진열대", title: "같은 묶음을 빠르게 진열해요", action: "묶음표 고르기" };
  if (session.subject === "division") return { scene: "market", place: "포장 코너", title: "물건을 똑같이 나누어 포장해요", action: "포장 수 고르기" };
  if (session.subject === "clock") return session.id === "time-calendar"
    ? { scene: "workshop", place: "오늘의 일정판", title: "약속 날짜를 달력에서 찾아요", action: "일정 카드 고르기" }
    : { scene: "workshop", place: "공방 약속", title: "시계를 보고 시작 시간을 맞춰요", action: "시간표 고르기" };
  if (session.subject === "measurement") return { scene: "workshop", place: "만들기 공방", title: "재료를 직접 재서 골라요", action: "재료표 고르기" };
  if (session.subject === "geometry") return { scene: "workshop", place: "블록 공방", title: "모양과 위치를 보고 작품을 완성해요", action: "도면 조각 고르기" };
  if (session.subject === "pattern") return { scene: "fair", place: "축제 팔찌 부스", title: "규칙에 맞게 다음 장식을 놓아요", action: "다음 장식 고르기" };
  return session.id === "data-chance"
    ? { scene: "fair", place: "축제 뽑기 부스", title: "통 속 자료를 보고 결과를 예상해요", action: "예상표 고르기" }
    : { scene: "fair", place: "축제 투표 부스", title: "친구들의 표를 정리해 결과를 알려요", action: "결과판 고르기" };
}

const productImages: Record<string, string> = {
  공책: "/life-missions/products/notebook.jpg",
  색연필: "/life-missions/products/colored-pencils.jpg",
  연필: "/life-missions/products/pencil.jpg",
  지우개: "/life-missions/products/eraser.jpg",
  스티커: "/life-missions/products/stickers.jpg",
  책: "/life-missions/products/book.jpg",
  자: "/life-missions/products/ruler.jpg",
  풀: "/life-missions/products/glue.jpg",
  장난감: "/life-missions/products/toy.jpg",
  퍼즐: "/life-missions/products/puzzle.jpg",
  인형: "/life-missions/products/doll.jpg",
  공: "/life-missions/products/ball.jpg",
  가방: "/life-missions/products/bag.jpg",
  운동화: "/life-missions/products/sneakers.jpg",
  선물: "/life-missions/products/gift.jpg",
  카드: "/life-missions/products/card.jpg",
  우유: "/life-missions/products/milk.jpg",
  간식: "/life-missions/products/snack.jpg",
  과자: "/life-missions/products/snack.jpg",
  과일: "/life-missions/products/fruit.jpg",
  물: "/life-missions/products/water.jpg",
  주스: "/life-missions/juice.webp",
  빵: "/life-missions/bread.webp",
  김밥: "/life-missions/bread.webp",
  커피: "/life-missions/coffee.webp",
  "커피 세트": "/life-missions/coffee.webp",
  "카페 선물세트": "/life-missions/coffee.webp",
};

function productImage(label: string) {
  return productImages[label] ?? "/life-missions/products/gift.jpg";
}

function StoreOrder({ problem }: { problem: Problem }) {
  if (problem.visual.type !== "money" || !problem.visual.labels?.length) return <div className="mission-prop mission-prop--register"><ProblemCard problem={problem} /></div>;
  const cardCount = problem.visual.amounts.length + (problem.visual.paid ? 1 : 0);
  return (
    <div className={`cafe-order${cardCount >= 3 ? " cafe-order--crowded" : ""}`} aria-label="가게 상품과 가격">
      {problem.visual.amounts.map((amount, index) => {
        const label = problem.visual.type === "money" ? problem.visual.labels?.[index] ?? `상품 ${index + 1}` : `상품 ${index + 1}`;
        return <div className="cafe-product" key={`${label}-${amount}`}><Image src={productImage(label)} alt={`${label} 상품 사진`} width={720} height={720} unoptimized /><span><b>{label}</b><strong>{amount.toLocaleString("ko-KR")}원</strong></span></div>;
      })}
      {problem.visual.paid && <div className="customer-money"><small>손님이 낸 돈</small><b>{problem.visual.paid.toLocaleString("ko-KR")}원</b></div>}
    </div>
  );
}

function LifeMissionGame({ session, problem, progress, solved, expression, dialogue, onAnswer, onFinish }: { session: Session; problem: Problem; progress: string; solved: boolean; expression: Expression; dialogue: string; onAnswer: (answer: string) => void; onFinish: () => void }) {
  const story = missionStory(session, problem);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [showChoices, setShowChoices] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<"correct" | "wrong" | null>(null);
  const [answerLocked, setAnswerLocked] = useState(false);

  function submitMissionAnswer(answer: string, fromChoice = false) {
    if (answerLocked) return;
    const isCorrect = answersMatch(answer, problem.correct);
    setSelectedAnswer(fromChoice ? answer : null);
    setAnswerFeedback(isCorrect ? "correct" : "wrong");
    if (isCorrect) {
      setAnswerLocked(true);
      window.setTimeout(() => onAnswer(answer), 900);
    } else {
      if (!fromChoice) setShowChoices(true);
      onAnswer(answer);
    }
  }

  return (
    <div className={`life-game life-game--${story.scene}`} style={{ "--mission-bg": `url(${missionBackgrounds[story.scene]})` } as React.CSSProperties}>
      <div className="life-game-shade" />
      <div className="mission-hud"><span>{story.place}</span><b>현장 미션 {progress}</b></div>
      <div className="mission-order"><small>오늘 할 일</small><h1>{solved ? "현장 미션 성공!" : story.title}</h1><p>{solved ? "배운 수학을 진짜 장면에서 써냈어요." : problem.prompt}</p></div>
      <div className="mission-playfield">
        {problem.visual.type === "money" ? <StoreOrder problem={problem} /> : <div className={`mission-prop mission-prop--${story.scene}`}><ProblemCard problem={problem} /></div>}
      </div>
      {!solved ? <div className="mission-controls">
        <div className="mission-morami">
          <Morami expression={answerFeedback === "correct" ? "happy" : answerFeedback === "wrong" ? "confused" : expression} size="small" />
          <div><b>{showChoices ? "보기에서 한 번만 더 알려 줄래?" : `${childName}의 생각을 먼저 써서 알려 줘!`}</b><span>{answerFeedback ? (answerFeedback === "correct" ? `아, 이제 알겠어! ${childName}가 알려 줘서 이해했어.` : dialogue) : dialogue}</span></div>
        </div>
        <p>{showChoices ? `${story.action} · 보기에서 골라 모르미에게 알려 줘요` : `${story.action} · 먼저 직접 써서 모르미에게 알려 줘요`}</p>
        {!showChoices ? <form className="mission-write" onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) submitMissionAnswer(typedAnswer); }}>
          <input value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="내 생각을 먼저 써 봐요" aria-label="모르미에게 알려 줄 생활 미션 답" autoComplete="off" />
          <button type="submit" disabled={!typedAnswer.trim() || answerLocked}>알려주기</button>
        </form> : <>
          <div className="mission-choice-list">{problem.answers.map((answer) => {
            const result = selectedAnswer === answer ? (answersMatch(answer, problem.correct) ? "is-correct" : "is-wrong") : "";
            return <button key={answer} className={result} onClick={() => submitMissionAnswer(answer, true)} aria-pressed={selectedAnswer === answer} disabled={answerLocked}>{readableChoice(answer)}</button>;
          })}</div>
          <button type="button" className="mission-rewrite" onClick={() => { setShowChoices(false); setSelectedAnswer(null); setAnswerFeedback(null); }}>내 답 다시 써 보기</button>
        </>}
        <div className={`mission-answer-feedback ${answerFeedback ? `is-${answerFeedback}` : ""}`} role="status" aria-live="polite">
          {answerFeedback === "correct" ? `모르미가 이해했어요! ${childName}의 설명이 맞아요.` : answerFeedback === "wrong" ? (showChoices ? "괜찮아요. 그림을 보고 보기에서 한 번 더 알려 줘요." : "괜찮아요. 그림을 보고 한 번 더 써 봐요.") : `모르미가 ${childName}의 설명을 기다리고 있어요.`}
        </div>
      </div>
        : <button className="mission-finish" onClick={onFinish}>오늘 여행 마치기 <span className="button-arrow" /></button>}
    </div>
  );
}

function Morami({ expression, size = "large" }: { expression: Expression; size?: "large" | "small" }) {
  return (
    <div className={`morami-frame morami-frame--${size} morami-frame--${expression} ${expression === "happy" || expression === "celebrate" ? "is-bouncing" : ""}`}>
      <div className="morami-cutout">
        <Image key={expression} src={expressions[expression]} alt={`모르미 ${expression} 표정`} width={1254} height={1254} unoptimized priority={size === "large" || expression === "bright"} />
      </div>
      <span className="morami-shadow" />
    </div>
  );
}

function CurriculumCourseButton({ session, index, completed, cafeRequired = false, onOpen }: { session: Session; index: number; completed: boolean; cafeRequired?: boolean; onOpen: (index: number) => void }) {
  const alignment = curriculumForSession(session);
  return (
    <button className={completed ? "is-complete" : ""} onClick={() => onOpen(index)}>
      <i>{completed ? "완료" : cafeRequired ? "🔑" : session.level}</i>
      <span><b>{session.title}</b><small>{alignment.gradeBand} · {alignment.code} · {session.unit} {session.level}단계</small>{cafeRequired && <mark className="cafe-course-mark">완료하면 카페에 갈 수 있어요!</mark>}</span>
      <em>{completed ? "★ 다시 보기" : cafeRequired ? "열쇠 얻기" : "시작"}</em>
    </button>
  );
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="speech-bubble">
      <div>{children}</div>
    </div>
  );
}

function Dictionary({ onClose, session }: { onClose: () => void; session: Session }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="궁금해 사전">
      <div className="dictionary-card">
        <div className="dictionary-tab"><UiIcon name="book" size="small" /> 궁금해 사전</div>
        <div className="dictionary-visual">
          <ProblemCard problem={session.dictionaryProblem} small />
          <div className="dictionary-lines">
            {session.dictionaryLines.map((line, index) => <p key={line}><i>{index + 1}</i>{line}</p>)}
          </div>
        </div>
        <button className="primary-button primary-button--purple" onClick={onClose}>다 읽었어!</button>
      </div>
    </div>
  );
}

function Onboarding({ onStart }: { onStart: () => void }) {
  const [page, setPage] = useState<"hello" | "promise">("hello");

  if (page === "promise") {
    const steps = [
      ["1", "집에서 연습해요", "카페에 가려고 돈 계산을 여러 번 해봐요"],
      ["2", "모르미에게 알려줘요", "내가 아는 방법을 모르미에게 말로 설명해요"],
      ["3", "카페에 가요", "직접 주문하고 내 손으로 계산해요"],
    ];
    return (
      <section className="onboarding-promise">
        <div className="scene-balance">🪙 6,000원</div>
        <div className="promise-panel">
          <p className="eyebrow">오늘의 약속</p>
          <h1>카페에 가려면?</h1>
          <p>순서대로 하면 카페에 갈 수 있어요</p>
          <div className="promise-steps">
            {steps.map(([number, title, description]) => <article key={number}><i>{number}</i><div><h2>{title}</h2><p>{description}</p></div></article>)}
          </div>
          <button className="promise-cta" onClick={onStart}><span>모르미가 이해하면 카페에 가요!</span><b>집으로 가기 →</b></button>
        </div>
      </section>
    );
  }

  return (
    <section className="onboarding-scene">
      <div className="onboarding-morami"><Morami expression="happy" /></div>
      <div className="onboarding-greeting">
        <span>모르미</span>
        <h1>안녕, 나 모르미야!</h1>
        <p>우리 집에서 준비하고 같이 카페에 가자.</p>
        <button className="primary-button" onClick={() => setPage("promise")}>다음으로 <span className="button-arrow" /></button>
      </div>
    </section>
  );
}

function HomeHub({ completedSessionIds, coinBalance, onOpenSession, onCurriculum, onOutside }: { completedSessionIds: string[]; coinBalance: number; onOpenSession: (index: number) => void; onCurriculum: () => void; onOutside: () => void }) {
  const requiredSessions = cafeRequiredSessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session));
  const done = requiredSessions.filter((session) => completedSessionIds.includes(session.id)).length;
  const unlocked = done === requiredSessions.length;
  const nextSession = requiredSessions.find((session) => !completedSessionIds.includes(session.id));
  const level = Math.floor(completedSessionIds.length / 4) + 1;
  const stars = completedSessionIds.length * 3;

  return (
    <section className="journey-hub journey-hub--home">
      <div className="player-hud"><span>LV.{level}</span><b>⭐ {stars}</b><strong>🪙 {coinBalance.toLocaleString("ko-KR")}원</strong></div>
      <div className="home-room-main">
        <div className="home-room-copy">
          <p className="eyebrow">모르미의 생활 수학</p>
          <h1>오늘은 어떤 걸 할까?</h1>
          <div className="daily-quest"><span>오늘의 퀘스트</span><b>🔑 카페 열쇠 조각 모으기</b><strong>{done}/{requiredSessions.length}</strong></div>
          <div className="home-main-actions">
            <button onClick={onCurriculum}><span>🏠</span><b>집에서 복습하기</b><small>개념 완료 보상 ⭐ 3개</small></button>
            <button onClick={onOutside}><span>{unlocked ? "☕" : "🔒"}</span><b>외출하기</b><small>{unlocked ? "카페가 열렸어요!" : `카페 준비 ${done}/${requiredSessions.length}`}</small></button>
          </div>
        </div>
        <div className="home-room-morami"><Morami expression={unlocked ? "celebrate" : "bright"} /></div>
      </div>
      {!unlocked && nextSession && <button className="home-next-lesson" onClick={() => onOpenSession(sessions.findIndex((session) => session.id === nextSession.id))}><span>카페까지 {requiredSessions.length - done}개 남았어요</span><b>다음 필수 개념: {nextSession.title} →</b></button>}
    </section>
  );
}

function OutsideHub({ unlocked, onHome, onCafe }: { unlocked: boolean; onHome: () => void; onCafe: () => void }) {
  return (
    <section className="journey-hub journey-hub--outside">
      <div className="outside-scene-head"><div><p className="eyebrow">🌱 모르미의 생활 수학</p><h1>우리 같이 어디 갈까?</h1></div><button onClick={onHome} aria-label="집으로">⌂</button></div>
      <div className="outside-morami-talk"><Morami expression={unlocked ? "happy" : "confused"} size="small" /><p>{unlocked ? "나 카페 혼자 가는 건 처음이라 무서운데, 같이 가 주라!" : "집에서 카페에 필요한 개념을 모두 끝내면 같이 나갈 수 있어!"}</p></div>
      <div className="destination-grid">
        <button className={`destination-card destination-card--cafe ${unlocked ? "is-unlocked" : "is-locked"}`} onClick={unlocked ? onCafe : onHome}>
          <Image src="/scenes/cafe-bakery-cute-v4.png" alt="모르미와 갈 카페" width={1000} height={720} priority unoptimized />
          <span className="destination-shade" />
          <div><small>{unlocked ? "진행" : "잠김"}</small><h2>{unlocked ? "카페 가기" : "🔒 카페 가기"}</h2><p>{unlocked ? "줄을 서고, 메뉴를 골라 계산해요" : "필수 개념 4개를 끝내야 열려요"}</p><strong>{unlocked ? "모르미와 들어가기 →" : "집에서 복습하기 →"}</strong></div>
        </button>
        <article className="destination-card destination-card--soon"><Image src="/scenes/market-cute-v4.png" alt="잠긴 마트" width={800} height={600} unoptimized /><span>🔒 다음 외출</span><h2>마트 가기</h2><p>집에서 새 스테이션을 풀면 갈 수 있어요.</p><b>곧 만나요</b></article>
      </div>
    </section>
  );
}

export function MoramiApp() {
  const [sessionIndex, setSessionIndex] = useState(0);
  const [variantSeed, setVariantSeed] = useState(1);
  const activeSession = useMemo(() => {
    const base = sessions[sessionIndex];
    return {
      ...base,
      fillOptions: shuffleWords(base.fillOptions, variantSeed + sessionIndex * 43),
      oneWordOptions: shuffleWords(base.oneWordOptions, variantSeed + sessionIndex * 47),
      pointOptions: shuffleWords(base.pointOptions, variantSeed + sessionIndex * 53),
      sentenceWords: shuffleWords(base.sentenceWords, variantSeed + sessionIndex * 41),
      drills: Array.from({ length: masteryTarget }, (_, index) => {
        const problem = base.drills[index % base.drills.length];
        const cycle = Math.floor(index / base.drills.length);
        const seed = variantSeed + index * 11 + cycle * 130;
        return shuffleProblemAnswers(varyProblem(problem, seed), seed);
      }),
    };
  }, [sessionIndex, variantSeed]);
  const [stage, setStage] = useState<Stage>("onboarding");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [expression, setExpression] = useState<Expression>("happy");
  const [dialogue, setDialogue] = useState(sessions[0].memoryDialogue);
  const [soundOn, setSoundOn] = useState(true);
  const { startMusic, stopMusic } = useGameMusic(soundOn);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [drillIndex, setDrillIndex] = useState(0);
  const [drillCorrect, setDrillCorrect] = useState(0);
  const [drillAttempts, setDrillAttempts] = useState(0);
  const [drillFeedback, setDrillFeedback] = useState("");
  const [selectedDrillAnswer, setSelectedDrillAnswer] = useState<{ question: number; answer: string } | null>(null);
  const [wrongDrillAnswers, setWrongDrillAnswers] = useState<string[]>([]);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [coinReward, setCoinReward] = useState<number | null>(null);
  const [drillLocked, setDrillLocked] = useState(false);
  const [mastered, setMastered] = useState(false);
  const [ladder, setLadder] = useState(3);
  const [selectedWords, setSelectedWords] = useState<Array<{ id: string; word: string }>>([]);
  const [teachText, setTeachText] = useState("");
  const [speechStatus, setSpeechStatus] = useState("");
  const [showTeachHelp, setShowTeachHelp] = useState(false);
  const [teachMessages, setTeachMessages] = useState<TeachMessage[]>([{ id: 1, role: "morami", text: simpleTeachPrompt(sessions[0]) }]);
  const [teachSending, setTeachSending] = useState(false);
  const [teachSolved, setTeachSolved] = useState(false);
  const [solvedAtLevel, setSolvedAtLevel] = useState<number | null>(null);
  const [floorFails, setFloorFails] = useState(0);
  const [brightCarry, setBrightCarry] = useState(false);
  const [homeworkSolved, setHomeworkSolved] = useState(false);
  const [homeworkIndex, setHomeworkIndex] = useState(0);
  const [homeworkCorrect, setHomeworkCorrect] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  const [coinBalance, setCoinBalance] = useState(6000);
  const startedAt = useRef(Date.now());
  const elapsedSeconds = useRef(0);
  const teachMessageId = useRef(2);
  const teachThreadRef = useRef<HTMLDivElement>(null);

  const currentStep = stage === "drill" ? 0 : stage === "teach" ? 1 : stage === "wrap" ? 2 : 3;
  const learningStage = ["drill", "teach", "wrap", "homework"].includes(stage);
  const currentDrill = activeSession.drills[drillIndex % activeSession.drills.length];
  const currentSelectedDrillAnswer = selectedDrillAnswer?.question === drillIndex ? selectedDrillAnswer.answer : null;
  const homeworkBase = homeworkIndex < activeSession.homework.length ? activeSession.homework[homeworkIndex] : extraLifeProblem(activeSession, variantSeed + homeworkIndex * 17);
  const currentHomework = useMemo(() => {
    const seed = variantSeed + homeworkIndex * 29;
    return shuffleProblemAnswers(varyProblem(homeworkBase, seed), seed);
  }, [homeworkBase, homeworkIndex, variantSeed]);
  const activeArea = areaForSession(activeSession.id);
  const selectedArea = mathAreas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedAreaSessions = useMemo(() => selectedArea?.sessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)) ?? [], [selectedArea]);
  const sentenceBank = useMemo(() => activeSession.sentenceWords.map((word, index) => ({ id: `${variantSeed}-${sessionIndex}-${index}`, word })), [activeSession.sentenceWords, sessionIndex, variantSeed]);

  const askMorami = useCallback(async (event: MoramiEvent, fallbackDialogue: string, fallbackExpression: Expression, ladderLevel = ladder) => {
    setDialogue(fallbackDialogue);
    setExpression(fallbackExpression);
    const turn = await requestMoramiTurn(activeSession, event, fallbackDialogue, ladderLevel);
    if (turn) {
      setDialogue(turn.dialogue);
      setExpression(turn.expression);
    }
  }, [activeSession, ladder]);

  const appendTeachMessage = useCallback((role: TeachMessage["role"], text: string) => {
    const nextMessage = { id: teachMessageId.current, role, text };
    teachMessageId.current += 1;
    setTeachMessages((messages) => [...messages, nextMessage]);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("morami-completed-sessions") || "[]") as string[];
      const savedCoins = Number(localStorage.getItem("mormey-coins") || "6000");
      const onboarded = localStorage.getItem("morami-onboarding-complete") === "true";
      window.requestAnimationFrame(() => {
        setCompletedSessionIds(saved);
        setCoinBalance(Number.isFinite(savedCoins) ? savedCoins : 6000);
        if (onboarded) setStage("home");
      });
    } catch { /* device-local progress is optional */ }
  }, []);

  useEffect(() => {
    if (!["drill", "teach", "wrap", "homework"].includes(stage)) return;
    const timer = window.setInterval(() => {
      elapsedSeconds.current = Math.floor((Date.now() - startedAt.current) / 1000);
      if (elapsedSeconds.current >= 480 && !["wrap", "complete"].includes(stage)) {
        setTimedOut(true);
        setStage("wrap");
        setExpression("bright");
        setDialogue("오늘도 충분히 잘 가르쳐 줬어. 우리가 알아낸 걸 별노트에 적자!");
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    const thread = teachThreadRef.current;
    if (!thread || stage !== "teach") return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [stage, teachMessages, teachSending]);

  const saveReport = useCallback((transfer: boolean) => {
    const report = {
      date: new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date()),
      repetitions: drillAttempts,
      masterySeconds: Math.max(54, elapsedSeconds.current),
      sessionId: activeSession.id,
      sessionTitle: activeSession.title,
      sessionUnit: activeSession.unit,
      sessionLevel: activeSession.level,
      masteryTarget,
      misconception: activeSession.misconception,
      learnedLine: simpleLearnedLine(activeSession),
      synchronized: floorFails > 0 || brightCarry,
      transfer,
      ladder: solvedAtLevel ?? 0,
      timedOut,
      earnedCoins: sessionCoins,
    };
    localStorage.setItem("morami-report", JSON.stringify(report));
    try {
      const previous = JSON.parse(localStorage.getItem("morami-report-history") || "[]") as unknown[];
      localStorage.setItem("morami-report-history", JSON.stringify([report, ...previous].slice(0, 8)));
    } catch {
      localStorage.setItem("morami-report-history", JSON.stringify([report]));
    }
  }, [activeSession, brightCarry, drillAttempts, floorFails, sessionCoins, solvedAtLevel, timedOut]);

  function answerDrill(answer: string) {
    if (drillLocked || mastered) return;
    setSelectedDrillAnswer({ question: drillIndex, answer });
    setDrillAttempts((count) => count + 1);
    if (answer === currentDrill.correct) {
      const nextCorrect = drillCorrect + 1;
      const reward = wrongDrillAnswers.length === 0 ? 200 : wrongDrillAnswers.length <= 2 ? 100 : 50;
      setDrillCorrect(nextCorrect);
      setSessionCoins((coins) => coins + reward);
      setCoinReward(reward);
      setDrillFeedback(`맞았어요! +${reward}원을 얻었어요.`);
      setDrillLocked(true);
      captureMormeyEvent("drill_reward_earned", { session_id: activeSession.id, question_number: drillIndex + 1, wrong_answers: wrongDrillAnswers.length, reward });
      if (soundOn) playCoinRewardSound(reward);
      window.setTimeout(() => {
        setDrillFeedback("");
        setSelectedDrillAnswer(null);
        setWrongDrillAnswers([]);
        setCoinReward(null);
        setDrillLocked(false);
        if (nextCorrect >= masteryTarget) {
          setMastered(true);
        } else {
          setDrillIndex((index) => index + 1);
        }
      }, 1150);
    } else {
      setWrongDrillAnswers((answers) => answers.includes(answer) ? answers : [...answers, answer]);
      setDrillFeedback("이 답은 잠겼어요. 다른 답을 골라 봐요.");
      captureMormeyEvent("drill_answer_wrong", { session_id: activeSession.id, question_number: drillIndex + 1, wrong_answers: wrongDrillAnswers.length + 1 });
    }
  }

  function beginTeaching() {
    const prompt = simpleTeachPrompt(activeSession);
    setStage("teach");
    setExpression("confused");
    setDialogue(prompt);
    setShowTeachHelp(false);
    setTeachText("");
    setSpeechStatus("");
    setTeachSending(false);
    teachMessageId.current = 2;
    setTeachMessages([{ id: 1, role: "morami", text: prompt }]);
  }

  function lowerLadder(message: string) {
    setExpression("confused");
    setDialogue(message);
    appendTeachMessage("morami", message);
    setSelectedWords([]);
    if (ladder > 0) setLadder((level) => level - 1);
  }

  function solveTeaching(level: number, reply = `응! ${childName}가 알려 줘서 이제 알겠어.`, nextExpression: Expression = "happy", askForReply = true) {
    setTeachSolved(true);
    setSolvedAtLevel(level);
    setDialogue(reply);
    setExpression(nextExpression);
    appendTeachMessage("morami", reply);
    if (soundOn) playLearningChime();
    if (askForReply) void askMorami("teach_correct", `응! ${simpleLearnedLine(activeSession)}`, "happy", level);
  }

  function checkSentence() {
    if (selectedWords.map((token) => token.word).join("|") === activeSession.targetSentence.join("|")) solveTeaching(3);
    else lowerLadder("순서가 조금 달라. 빈칸으로 같이 볼까?");
  }

  async function submitTeachText() {
    const response = teachText.trim();
    if (!response || teachSending) return;
    const prompt = simpleTeachPrompt(activeSession);
    const conversation = [...teachMessages.map(({ role, text }) => ({ role, text })), { role: "child" as const, text: response }];
    appendTeachMessage("child", response);
    setTeachText("");
    setTeachSending(true);
    setSpeechStatus("모르미가 생각하고 있어요…");
    const turn = await requestMoramiTurn(activeSession, "teach_message", "무엇을 먼저 하면 될까?", ladder, {
      childMessage: response,
      teachPrompt: prompt,
      conversation,
    });
    setTeachSending(false);
    const understood = turn?.source === "anthropic" && typeof turn.understood === "boolean"
      ? turn.understood
      : teachResponseMatches(response, activeSession);
    if (understood) {
      solveTeaching(3, turn?.dialogue, turn?.expression ?? "happy", false);
      setSpeechStatus(`모르미가 ${childName}의 설명을 이해했어요!`);
    } else {
      const retry = turn?.dialogue || "아직 잘 모르겠어. 무엇을 먼저 하면 될까?";
      setExpression(turn?.expression ?? "confused");
      setDialogue(retry);
      setSpeechStatus("모르미의 질문에 짧게 답해 줘요.");
      appendTeachMessage("morami", retry);
    }
  }

  function openTeachHelp() {
    setShowTeachHelp(true);
    const helpMessage = "괜찮아. 아래 낱말로 같이 알려 줘.";
    setDialogue(helpMessage);
    setExpression("calm");
    appendTeachMessage("morami", helpMessage);
  }

  function startSpeechInput() {
    const speechWindow = window as typeof window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechStatus("이 기기에서는 말하기가 안 돼요. 아래 칸에 써 줘요.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setSpeechStatus("듣고 있어요. 천천히 말해 줘요.");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setTeachText(transcript);
      setSpeechStatus("잘 들었어요! 확인하고 보내 줘요.");
    };
    recognition.onerror = () => setSpeechStatus("잘 못 들었어요. 다시 말하거나 써 줘요.");
    recognition.onend = () => undefined;
    recognition.start();
  }

  function answerLadder(answer: string, correct: string) {
    if (answer === correct) {
      solveTeaching(ladder);
      return;
    }
    if (ladder > 0) {
      lowerLadder(ladder === 2 ? "중요한 말 하나만 알려 줘." : "맞는 답을 눌러 줘.");
    } else if (floorFails === 0) {
      setFloorFails(1);
      setExpression("confused");
      setDialogue("사전을 보고 다시 골라 보자.");
      setDictionaryOpen(true);
    } else {
      setBrightCarry(true);
      setExpression("bright");
      setDialogue("괜찮아! 오늘은 여기까지 해도 돼.");
    }
  }

  function goWrap() {
    setStage("wrap");
    void askMorami("teach_correct", `응! ${simpleLearnedLine(activeSession)}`, "happy");
  }

  function beginHomework() {
    finish(false);
  }

  function answerHomework(answer: string) {
    if (answersMatch(answer, currentHomework.correct)) {
      const nextCorrect = homeworkCorrect + 1;
      setHomeworkCorrect(nextCorrect);
      if (nextCorrect >= transferTarget) {
        setHomeworkSolved(true);
        void askMorami("homework_correct", "우와, 생활 문제도 풀었어!", "celebrate");
        saveReport(true);
      } else {
        setHomeworkIndex((index) => index + 1);
        void askMorami("homework_correct", "하나 풀었어! 다음 것도 알려 줘.", "happy");
      }
    } else {
      setExpression("confused");
      setDialogue("무엇을 묻는지 다시 읽어 볼까?");
    }
  }

  function finish(transfer = homeworkSolved) {
    saveReport(transfer);
    const next = completedSessionIds.includes(activeSession.id) ? completedSessionIds : [...completedSessionIds, activeSession.id];
    localStorage.setItem("morami-completed-sessions", JSON.stringify(next));
    captureMormeyEvent("session_completed", {
      session_id: activeSession.id,
      elapsed_seconds: elapsedSeconds.current,
      drill_attempts: drillAttempts,
      scaffold_level: solvedAtLevel,
      completed_at_home: true,
    });
    if (!isCafeUnlocked(completedSessionIds) && isCafeUnlocked(next)) {
      captureMormeyEvent("theme_unlocked", { theme: "cafe" });
    }
    setCompletedSessionIds(next);
    setCoinBalance((balance) => {
      const nextBalance = balance + sessionCoins;
      localStorage.setItem("mormey-coins", String(nextBalance));
      return nextBalance;
    });
    setStage("complete");
    void askMorami("session_complete", "오늘도 나를 가르쳐 줘서 고마워!", "celebrate");
  }

  function openSession(nextIndex: number) {
    setSessionIndex(nextIndex);
    setVariantSeed((seed) => seed + 97 + nextIndex * 13);
    setStage("drill");
    setExpression("calm");
    setDialogue("");
    setDictionaryOpen(false);
    setDrillIndex(0);
    setDrillCorrect(0);
    setDrillAttempts(0);
    setDrillFeedback("");
    setSelectedDrillAnswer(null);
    setWrongDrillAnswers([]);
    setSessionCoins(0);
    setCoinReward(null);
    setDrillLocked(false);
    setMastered(false);
    setLadder(3);
    setSelectedWords([]);
    setTeachText("");
    setSpeechStatus("");
    setTeachSending(false);
    setShowTeachHelp(false);
    teachMessageId.current = 2;
    setTeachMessages([{ id: 1, role: "morami", text: simpleTeachPrompt(sessions[nextIndex]) }]);
    setTeachSolved(false);
    setSolvedAtLevel(null);
    setFloorFails(0);
    setBrightCarry(false);
    setHomeworkSolved(false);
    setHomeworkIndex(0);
    setHomeworkCorrect(0);
    setTimedOut(false);
    startedAt.current = Date.now();
    elapsedSeconds.current = 0;
    captureMormeyEvent("lesson_started", { session_id: sessions[nextIndex].id, theme: "home" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCurriculum() {
    setStage("curriculum");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeOnboarding() {
    localStorage.setItem("morami-onboarding-complete", "true");
    captureMormeyEvent("onboarding_completed");
    setStage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showHome() {
    captureMormeyEvent("home_opened");
    setStage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showOutside() {
    captureMormeyEvent("outside_opened", { cafe_unlocked: isCafeUnlocked(completedSessionIds) });
    setStage("outside");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showArea(areaId: string) {
    setSelectedAreaId(areaId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showAreaList() {
    setSelectedAreaId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSound() {
    if (soundOn) stopMusic();
    else startMusic(true);
    setSoundOn(!soundOn);
  }

  const attribution = teachSolved && solvedAtLevel === 3 ? "지우가 알려줌" : "지우와 같이 공부함";
  const completedAfterLesson = completedSessionIds.includes(activeSession.id) ? completedSessionIds : [...completedSessionIds, activeSession.id];
  const cafeUnlockedAfterLesson = isCafeUnlocked(completedAfterLesson);
  const cafeReadyCountAfterLesson = cafeRequiredSessionIds.filter((id) => completedAfterLesson.includes(id)).length;

  return (
    <main className={`app-shell app-shell--${stage}`}>
      {stage !== "onboarding" && stage !== "cafe" && <header className="topbar">
        <button className="brand brand--button" onClick={showHome} aria-label="모르미 집으로"><span>모</span> 모르미</button>
        {learningStage ? <div className="progress-dots" aria-label={`학습 ${currentStep + 1}단계`}>
          {stageLabels.slice(0, 3).map((label, index) => <span key={label} className={index <= currentStep ? "is-active" : ""}><i />{label}</span>)}
        </div> : <nav className="journey-nav" aria-label="장소 이동"><button className={stage === "home" ? "is-active" : ""} onClick={showHome}>집</button><button className={stage === "outside" ? "is-active" : ""} onClick={showOutside}>외부</button></nav>}
        <div className="top-actions">
          <button className={`round-control ${soundOn ? "is-music-on" : ""}`} onClick={toggleSound} aria-label={soundOn ? "배경 음악과 효과음 끄기" : "배경 음악과 효과음 켜기"}><UiIcon name={soundOn ? "sound" : "mute"} size="small" /><span className="music-note" aria-hidden="true">♪</span></button>
          {learningStage && <button className="curriculum-link" onClick={showHome}>집으로</button>}
          <Link className="report-link" href="/report">어른 리포트 <span className="link-arrow" /></Link>
        </div>
      </header>}

      {stage === "onboarding" && <Onboarding onStart={completeOnboarding} />}

      {stage === "home" && <HomeHub completedSessionIds={completedSessionIds} coinBalance={coinBalance} onOpenSession={openSession} onCurriculum={showCurriculum} onOutside={showOutside} />}

      {stage === "outside" && <OutsideHub unlocked={isCafeUnlocked(completedSessionIds)} onHome={showHome} onCafe={() => setStage("cafe")} />}

      {stage === "cafe" && <CafeJourney onBack={showOutside} onComplete={showHome} />}

      {stage === "curriculum" && (
        <section className="curriculum-home curriculum-home--room">
          <div className="scene-balance">🪙 {coinBalance.toLocaleString("ko-KR")}원</div>
          {!selectedArea ? (
            <>
              <div className="room-list-heading"><p className="eyebrow">집에서 복습하기</p><h1>어떤 개념을 연습할까?</h1><p>카페 표시가 붙은 개념 4개를 모두 끝내면 외출할 수 있어요.</p></div>
              <div className="room-area-list">
                {mathAreas.map((area) => {
                  const done = area.sessionIds.filter((id) => completedSessionIds.includes(id)).length;
                  const required = area.sessionIds.filter((id) => cafeRequiredSessionIds.includes(id as (typeof cafeRequiredSessionIds)[number])).length;
                  return (
                    <button key={area.id} style={{ "--area-color": area.color } as React.CSSProperties} onClick={() => showArea(area.id)}>
                      <i>{done === area.sessionIds.length ? "✓" : done}</i><span><b>{area.title}</b><small>{area.description}</small>{required > 0 && <mark>☕ 카페 필수 개념 {required}개</mark>}</span><em>{done}/{area.sessionIds.length}<b>›</b></em>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="area-detail area-detail--room" style={{ "--area-color": selectedArea.color } as React.CSSProperties}>
              <button className="area-back" onClick={showAreaList}><span>‹</span> 개념 영역으로</button>
              <div className="room-list-heading"><p className="eyebrow">집에서 복습하기</p><h1>{selectedArea.title}</h1><p>{selectedArea.description}</p></div>
              {selectedAreaSessions.some((session) => cafeRequiredSessionIds.includes(session.id as (typeof cafeRequiredSessionIds)[number])) && <div className="cafe-required-banner"><span>☕</span><div><b>카페에 가려면 이 표시를 찾아요</b><p>`완료하면 카페에 갈 수 있어요!`가 붙은 개념을 모두 끝내야 카페가 열려요.</p></div></div>}
              <div className="curriculum-path-list math-course-list math-course-list--detail">
                {selectedAreaSessions.map((session, index) => <div className={`curriculum-path-row ${cafeRequiredSessionIds.includes(session.id as (typeof cafeRequiredSessionIds)[number]) ? "is-cafe-quest" : ""}`} key={session.id}>{(index === 0 || selectedAreaSessions[index - 1]?.unit !== session.unit) && <div className="curriculum-unit-marker"><span>{session.unit}</span><i>STAGE {index + 1}</i></div>}<CurriculumCourseButton session={session} index={sessions.findIndex((candidate) => candidate.id === session.id)} completed={completedSessionIds.includes(session.id)} cafeRequired={cafeRequiredSessionIds.includes(session.id as (typeof cafeRequiredSessionIds)[number])} onOpen={openSession} /></div>)}
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "drill" && (
        <section className="scene scene--drill">
          <div className="drill-header">
            <div>
              <p className="eyebrow">{activeSession.unit} 탐험 · {Math.min(drillCorrect + 1, masteryTarget)}/{masteryTarget}</p>
              <h1>{mastered ? "준비 끝!" : currentDrill.prompt}</h1>
            </div>
            <div className="drill-game-status"><div className="drill-wallet"><Image src="/cafe-money/100.png" alt="획득한 돈" width={50} height={50} unoptimized /><span>이번 세션</span><strong>{sessionCoins.toLocaleString("ko-KR")}/1,000원</strong></div><div className="seed-meter" aria-label={`${drillCorrect}개 익힘`}>
              {Array.from({ length: masteryTarget }, (_, index) => <span key={index} className={index < drillCorrect ? "filled" : ""}>{index < drillCorrect ? <UiIcon name="sprout" size="small" /> : <i className="seed-empty" />}</span>)}
            </div>
            </div>
          </div>
          <div className="drill-board drill-board--solo">
            {mastered ? (
              <div className="mastery-card">
                <div className="mastery-stars"><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /></div>
                <h2>5번 반복학습 끝!</h2>
                <div className="mastery-coin-total"><Image src="/cafe-money/100.png" alt="세션에서 얻은 돈" width={74} height={74} unoptimized /><span>반복학습 보상</span><strong>+{sessionCoins.toLocaleString("ko-KR")}원</strong></div>
                <p>이제 모르미가 처음 찾아올 거야.<br />방금 익힌 걸 {childName}가 가르쳐 줘.</p>
                <button className="primary-button" onClick={beginTeaching}>모르미 가르치기 <span className="button-arrow" /></button>
                <button className="dictionary-link" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 먼저 사전 보기</button>
              </div>
            ) : (
              <div className="practice-card">
                {coinReward !== null && <div className={`coin-reward-effect coin-reward-effect--${coinReward}`} key={`${drillIndex}-${coinReward}`}><i /><i /><i /><Image src="/cafe-money/100.png" alt="획득한 돈" width={120} height={120} unoptimized /><strong>+{coinReward}원!</strong><span>{coinReward === 200 ? "한 번에 정답!" : coinReward === 100 ? "다시 생각해서 성공!" : "끝까지 포기하지 않았어!"}</span></div>}
                <ProblemCard problem={currentDrill} />
                <div className="answer-grid">
                  {currentDrill.answers.map((answer) => {
                    const isWrong = wrongDrillAnswers.includes(answer);
                    const result = answer === currentDrill.correct && currentSelectedDrillAnswer === answer ? "is-correct" : isWrong ? "is-wrong is-answer-locked" : "";
                    return <button key={`${drillIndex}-${answer}`} className={result} onClick={() => answerDrill(answer)} disabled={drillLocked || isWrong} aria-pressed={currentSelectedDrillAnswer === answer}>{answer}</button>;
                  })}
                </div>
                <div className={`gentle-feedback ${drillFeedback && currentSelectedDrillAnswer ? "is-visible" : ""} ${currentSelectedDrillAnswer === currentDrill.correct ? "is-correct" : currentSelectedDrillAnswer ? "is-wrong" : ""}`} role="status" aria-live="polite">{currentSelectedDrillAnswer ? drillFeedback : ""}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "teach" && (
        <section className="chat-scene">
          <div className="chat-title">
            <div><p className="eyebrow">내가 선생님!</p><h1>모르미의 생각을 고쳐 줘</h1></div>
            <button className="dictionary-pill" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 궁금해 사전</button>
          </div>
          <div className="chat-window">
            <div className="morami-chat-row">
              <Morami expression={expression} size="small" />
              <div ref={teachThreadRef} className="teach-chat-thread" role="log" aria-label="모르미와 지우의 대화" aria-live="polite">
                {teachMessages.map((message) => (
                  <div className={`teach-message teach-message--${message.role}`} key={message.id}>
                    <b>{message.role === "morami" ? "모르미" : childName}</b>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
            </div>
            {!teachSolved && !brightCarry && (
              <div className="ladder-card">
                <div className="teach-free-response">
                  <p><strong>내 말로 모르미에게 설명하기</strong><span>말하거나 직접 써도 돼요</span></p>
                  <textarea value={teachText} onChange={(event) => setTeachText(event.target.value)} placeholder="짧게 말해도 괜찮아요" rows={2} />
                  <div><button type="button" className="speech-button" onClick={startSpeechInput} disabled={teachSending}>● 말로 알려주기</button><button type="button" className="send-teach-button" disabled={!teachText.trim() || teachSending} onClick={submitTeachText}>{teachSending ? "생각하는 중…" : "모르미에게 보내기"}</button></div>
                  {speechStatus && <small>{speechStatus}</small>}
                </div>
                {!showTeachHelp ? (
                  <button type="button" className="teach-help-button" onClick={openTeachHelp}>잘 모르겠어 · 도움 낱말 보기</button>
                ) : (
                  <div className="teach-help-panel">
                    <div className="help-divider"><span>도움 낱말로 알려주기</span></div>
                    <div className="ladder-topline"><span>천천히 한 단계씩</span><div>{[0,1,2,3].map((n) => <i key={n} className={n <= ladder ? "on" : ""} />)}</div></div>
                    {ladder === 3 && (
                      <>
                        <p className="kid-prompt">낱말을 차례로 톡톡!</p>
                        <div className="sentence-tray">
                          {selectedWords.length ? selectedWords.map((token) => <button key={token.id} onClick={() => setSelectedWords((words) => words.filter((word) => word.id !== token.id))}>{token.word}</button>) : <span>여기에 문장을 만들어요</span>}
                        </div>
                        <div className="word-bank">
                          {sentenceBank.map((token) => <button key={token.id} disabled={selectedWords.some((word) => word.id === token.id)} onClick={() => setSelectedWords((words) => [...words, token])}>{token.word}</button>)}
                        </div>
                        <button className="check-button" disabled={selectedWords.length !== activeSession.targetSentence.length} onClick={checkSentence}>이렇게 알려 줄래!</button>
                      </>
                    )}
                    {ladder === 2 && (
                      <>
                        <p className="kid-prompt">빈칸에 들어갈 말은?</p>
                        <div className="fill-sentence">{activeSession.fillBefore} <b>?</b> {activeSession.fillAfter}</div>
                        <div className="choice-row">{activeSession.fillOptions.map((word) => <button key={word} onClick={() => answerLadder(word, activeSession.fillCorrect)}>{word}</button>)}</div>
                        <p className="disguise-hint"><UiIcon name="bulb" size="small" /> {activeSession.hint}</p>
                      </>
                    )}
                    {ladder === 1 && (
                      <>
                        <p className="kid-prompt">{activeSession.oneWordPrompt}</p>
                        <div className="choice-row">{activeSession.oneWordOptions.map((word) => <button key={word} onClick={() => answerLadder(word, activeSession.oneWordCorrect)}>{word}</button>)}</div>
                      </>
                    )}
                    {ladder === 0 && (
                      <>
                        <p className="kid-prompt">{activeSession.pointPrompt}</p>
                        {activeSession.pointClockMarker ? (
                          <PointingClock marker={activeSession.pointClockMarker} onPick={(number) => answerLadder(String(number), activeSession.pointCorrect)} />
                        ) : (
                          <div className="point-choice-grid">{activeSession.pointOptions.map((answer) => <button key={answer} onClick={() => answerLadder(answer, activeSession.pointCorrect)}>{answer}</button>)}</div>
                        )}
                        <p className="tap-hint">답을 톡 눌러서 알려 줘</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            {(teachSolved || brightCarry) && (
              <div className="learned-card">
                <UiIcon name={teachSolved ? "star" : "sun"} size="large" />
                <h2>{teachSolved ? "모르미가 이해했어!" : "오늘의 배움을 챙겼어!"}</h2>
                <p>{teachSolved ? `${childName}가 알려 준 말로 다시 해 볼게.` : "내일 다시 만나면 한 번 더 알려 줘."}</p>
                <button className="primary-button" onClick={goWrap}>별노트에 적기 <span className="button-arrow" /></button>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "wrap" && (
        <section className="scene scene--wrap">
          <div className="character-column"><Morami expression={expression} /></div>
          <div className="content-column">
            <SpeechBubble><p>{dialogue}</p></SpeechBubble>
            <article className="star-note">
              <div className="note-ring">별<br />노<br />트</div>
              <div className="note-content">
                <p><UiIcon name="star" size="small" /> 오늘 모르미가 배운 말</p>
                <h2>“<em>{simpleLearnedLine(activeSession)}</em>”</h2>
                <span>{attribution}</span>
              </div>
            </article>
            <button className="primary-button" onClick={beginHomework}>집에서 오늘 학습 마치기 <span className="button-arrow" /></button>
          </div>
        </section>
      )}

      {stage === "homework" && (
        <section className="scene scene--homework">
          <LifeMissionGame key={`${activeSession.id}-${homeworkIndex}`} session={activeSession} problem={currentHomework} progress={`${Math.min(homeworkCorrect + 1, transferTarget)}/${transferTarget}`} solved={homeworkSolved} expression={expression} dialogue={dialogue} onAnswer={answerHomework} onFinish={() => finish(true)} />
        </section>
      )}

      {stage === "complete" && (
        <section className="complete-scene">
          <div className="confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <Morami expression="celebrate" />
          <div className="complete-copy">
            <p className="eyebrow">집에서 오늘의 준비 완료</p>
            <h1>모르미와<br /><em>오늘도 해냈어!</em></h1>
            <div className="session-coin-earned"><Image src="/cafe-money/100.png" alt="이번 세션 보상" width={90} height={90} unoptimized /><div><span>이번 세션을 통해</span><strong>+{sessionCoins.toLocaleString("ko-KR")}원을 얻었어!</strong><small>내 지갑 {coinBalance.toLocaleString("ko-KR")}원</small></div></div>
            <div className="today-badges" aria-label="오늘의 학습 결과">
              <span><UiIcon name="sprout" size="small" /><strong>{masteryTarget}번</strong><small>{activeSession.title} 연습</small></span>
              <span><UiIcon name="star" size="small" /><strong>1개</strong><small>별노트</small></span>
              <span><UiIcon name="bag" size="small" /><strong>{cafeReadyCountAfterLesson}/{cafeRequiredSessionIds.length}</strong><small>카페 준비</small></span>
            </div>
            <div className="complete-path">
              <p>이 영역에서 배운 길</p>
              <div className="session-roadmap" aria-label="단계별 학습 코스 목록">
                {(activeArea?.sessionIds || []).map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)).map((session) => <span key={session.id} className={completedSessionIds.includes(session.id) || session.id === activeSession.id ? "is-done" : ""}><i /><b>{session.title}</b></span>)}
              </div>
            </div>
            <button className="primary-button" onClick={cafeUnlockedAfterLesson ? showOutside : showHome}>{cafeUnlockedAfterLesson ? "열린 카페로 나가기" : "모르미와 집으로"} <span className="button-arrow" /></button>
            <div className="complete-secondary-actions">
              <button className="complete-report-link" onClick={showCurriculum}>전체 수학 과정</button>
              <Link className="complete-report-link" href="/report">오늘 기록 보기</Link>
            </div>
          </div>
        </section>
      )}

      {dictionaryOpen && <Dictionary session={activeSession} onClose={() => setDictionaryOpen(false)} />}
    </main>
  );
}
