"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureMormeyEvent, identifyLearner } from "./analytics";
import { api, apiEnabled, ApiError, readStoredLearner, storeSession, type ThemeView } from "./api-client";
import { CafeJourney } from "./CafeJourney";
import { cafeRequiredSessionIds, isCafeUnlocked } from "./journey-config";
import { curriculumForSession, masteryTarget, mathAreas, sessions, simpleLearnedLine, transferTarget } from "./math-curriculum";
import {
  startHomeTeaching,
  submitMormiResponseThroughBe,
  type MormiConversation,
  type MormiResponseType,
  type MormiTurn,
} from "./mormi-dialogue";
import type { Problem, Session, Visual } from "./morami-content";

type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
type Stage = "onboarding" | "home" | "outside" | "cafe" | "curriculum" | "drill" | "teach" | "teachReward" | "wrap" | "homework" | "complete";

const expressions: Record<Expression, string> = {
  calm: "/morami/calm-cutout.png",
  happy: "/morami/happy-cutout.png",
  confused: "/morami/confused-cutout.png",
  surprised: "/morami/surprised-cutout.png",
  bright: "/morami/bright-cutout.png",
  celebrate: "/morami/celebrate-cutout.png",
};

const stageLabels = ["혼자 연습", "가르치기", "별노트", "생활 게임"];

// 시계 읽기는 렌더가 아니라 이벤트 핸들러와 이펙트에서만 일어난다.
// 모듈 스코프에 두어 렌더 중 호출로 오해되지 않게 한다.
const nowMs = () => Date.now();

type LearnerProfile = {
  id: number;
  name: string;
};

const defaultLearner: LearnerProfile = { id: 1, name: "지우" };

function expressionFromMormiMood(mood: MormiTurn["mormi"]["mood"]): Expression {
  if (mood === "celebrating") return "celebrate";
  if (mood === "relieved") return "happy";
  if (mood === "thinking") return "confused";
  if (mood === "listening") return "calm";
  return "bright";
}

function scaffoldLevel(turn: MormiTurn | null) {
  const level = turn?.pedagogy?.expression_level;
  return level ? Number(level.slice(1)) : null;
}

/**
 * answer_meta.selected_choice_id 는 `${sessionId}:${questionIndex}:choice:${index}` 꼴이다.
 * 마지막 조각이 보기 번호다. 형식이 다르면 -1 을 돌려 복구에서 빠지게 한다.
 */
function choiceIndexOf(selectedChoiceId: unknown) {
  if (typeof selectedChoiceId !== "string") return -1;
  const parsed = Number(selectedChoiceId.split(":").pop());
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
}

const teachingBlank = `(\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0)`;

function formatTeachingDisplayText(text: string) {
  return text.replace(/[□▢]/g, teachingBlank);
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
  const notes = reward === 200
    ? [783.99, 1046.5, 1318.51]
    : reward === 150
      ? [698.46, 880, 1046.5]
      : reward === 100
        ? [659.25, 880]
        : [523.25, 659.25];
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

type UiIconName = "sound" | "mute" | "book" | "star" | "sprout" | "bulb" | "sun" | "clip" | "bag" | "refresh" | "home" | "cafe" | "key" | "lock";

const illustratedIconAssets: Partial<Record<UiIconName, string>> = {
  home: "/ui/mormi-home.png",
  cafe: "/ui/mormi-cafe.png",
  key: "/ui/mormi-key.png",
  star: "/ui/mormi-star.png",
  sprout: "/ui/mormi-sprout.png",
};

function UiIcon({ name, size = "medium" }: { name: UiIconName; size?: "small" | "medium" | "large" }) {
  const illustratedAsset = illustratedIconAssets[name];
  return (
    <span className={`ui-icon ui-icon--${name} ui-icon--${size} ${illustratedAsset ? "ui-icon--asset" : ""}`} aria-hidden="true">
      {illustratedAsset ? <Image src={illustratedAsset} alt="" width={96} height={96} unoptimized /> : <i />}
    </span>
  );
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
            {labels[index]
              ? <Image src={productImage(labels[index])} alt={`${labels[index]} 사진`} width={120} height={90} unoptimized />
              : <i className={amount >= 1000 ? "bill-shape" : "coin-shape"} />}
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

const learningVisualTypes = new Set<Visual["type"]>([
  "objects",
  "equation",
  "clock",
  "money",
  "ten-frame",
  "groups",
  "number-line",
  "measurement",
  "shapes",
  "pattern",
  "chart",
  "calendar",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * AI의 home_teaching 계약에는 반복학습 문제와 같은 `problem.visual`이 들어온다.
 * 정답은 의도적으로 오지 않으므로 화면 표시에는 기존 문제의 정답을 보존하고,
 * 프롬프트와 그림만 서버가 고른 세션별 문제로 교체한다.
 */
function teachingProblemFromTurn(turn: MormiTurn | null, fallback: Problem): Problem | null {
  if (!turn || !isRecord(turn.visual?.data)) return null;

  const candidate = turn.visual.type === "home_teaching"
    ? turn.visual.data.problem
    : turn.visual.type === "home_practice_problem"
      ? turn.visual.data
      : null;
  if (!isRecord(candidate) || typeof candidate.prompt !== "string" || !isRecord(candidate.visual)) return null;
  if (typeof candidate.visual.type !== "string" || !learningVisualTypes.has(candidate.visual.type as Visual["type"])) return null;

  return {
    ...fallback,
    prompt: candidate.prompt,
    answers: Array.isArray(candidate.answers) && candidate.answers.every((answer) => typeof answer === "string")
      ? candidate.answers
      : fallback.answers,
    visual: candidate.visual as unknown as Visual,
  };
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

function shuffledCountingValues(seed: number) {
  const values = Array.from({ length: 10 }, (_, index) => index + 1);
  let state = Math.abs(seed) + 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const target = state % (index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
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

  if (problem.answers.some((answer) => ["첫째", "둘째", "셋째"].includes(answer))) candidates.push("넷째");
  if (problem.visual.type === "shapes") candidates.push("오각형", "반원");
  if (problem.visual.type === "pattern") candidates.push("◆", "★", "↗");
  if (problem.visual.type === "chart") candidates.push(...problem.visual.labels, "표가 같아");
  candidates.push("모두 아니야", "알 수 없어", "조건이 부족해");
  return candidates;
}

function ensureFourAnswers(problem: Problem) {
  const comparisonChoices = ["왼쪽", "같아", "오른쪽"];
  if (comparisonChoices.includes(problem.correct) && problem.answers.some((answer) => comparisonChoices.includes(answer))) {
    return comparisonChoices;
  }
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
      const asksForLess = /더 (적|짧)|적을까|작은|적은/.test(problem.prompt);
      const count = relation === "왼쪽"
        ? (asksForLess ? low : high)
        : relation === "오른쪽"
          ? (asksForLess ? high : low)
          : 4 + step;
      const secondCount = relation === "같아" ? count : count === low ? high : low;
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
    // 상품 가격은 문제마다 바꿔도 되지만, 그림으로 보여 주는 동전·지폐의 값은
    // 실제 화폐 단위여야 한다. 예를 들어 1,000원 지폐를 1,200원으로 바꾸지 않는다.
    const isCurrencyVisual = !problem.visual.labels?.length;
    const amounts = isCurrencyVisual
      ? problem.visual.amounts
      : problem.visual.amounts.map((amount, index) => amount + 100 * (((seed + index) % 3 + 3) % 3));
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const paid = problem.visual.paid
      ? isCurrencyVisual
        ? problem.visual.paid
        : Math.max(total + 500, problem.visual.paid + step * 500)
      : undefined;
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
  const comparisonChoices = ["왼쪽", "같아", "오른쪽"];
  if (comparisonChoices.includes(problem.correct) && problem.answers.some((answer) => comparisonChoices.includes(answer))) {
    return { ...problem, answers: comparisonChoices };
  }
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
          <div><b>{showChoices ? "보기에서 한 번만 더 알려 줄래?" : "네 생각을 먼저 써서 알려 줘!"}</b><span>{answerFeedback ? (answerFeedback === "correct" ? "아, 이제 알겠어! 네가 알려 줘서 이해했어." : dialogue) : dialogue}</span></div>
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
          {answerFeedback === "correct" ? "모르미가 이해했어요! 네 설명이 맞아요." : answerFeedback === "wrong" ? (showChoices ? "괜찮아요. 그림을 보고 보기에서 한 번 더 알려 줘요." : "괜찮아요. 그림을 보고 한 번 더 써 봐요.") : "모르미가 네 설명을 기다리고 있어요."}
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
      <i>{completed ? "완료" : cafeRequired ? <UiIcon name="key" size="small" /> : session.level}</i>
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

/** 참여 번호 입력 규칙. 온보딩과 복구가 같은 형식을 써야 서버가 같은 아이로 찾는다. */
const normalizeResearchCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 40);

function Onboarding({ onStart, onRestore, submitting, submitError }: {
  onStart: (name: string, researchCode: string) => void;
  onRestore: (researchCode: string) => void;
  submitting: boolean;
  submitError: string;
}) {
  const [page, setPage] = useState<"hello" | "name" | "restore">("hello");
  const [name, setName] = useState("");
  const [researchCode, setResearchCode] = useState("");
  const profile = { name: name.trim() || "친구" };

  function finishOnboarding() {
    captureMormeyEvent("onboarding_intro_completed");
    onStart(profile.name, researchCode.trim());
  }

  // 기기를 바꾼 아이. 이름은 서버가 갖고 있으므로 참여 번호만 받는다.
  if (page === "restore") {
    return (
      <section className="onboarding-scene onboarding-scene--name">
        <div className="onboarding-morami"><Morami expression="happy" /></div>
        <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); if (researchCode.trim()) onRestore(researchCode.trim()); }}>
          <span>모르미</span>
          <h1>다시 만나서 반가워!</h1>
          <p>참여 번호를 적으면 하던 데부터 이어서 할 수 있어.</p>
          <label htmlFor="restore-code">참여 번호</label>
          <input id="restore-code" value={researchCode} onChange={(event) => setResearchCode(normalizeResearchCode(event.target.value))} placeholder="선생님이 알려준 번호" autoComplete="off" />
          <button className="primary-button" type="submit" disabled={submitting || !researchCode.trim()}>{submitting ? "찾는 중…" : "이어서 하기"} <span className="button-arrow" /></button>
          {submitError && <p className="onboarding-error" role="alert">{submitError}</p>}
          <button type="button" className="onboarding-secondary" onClick={() => setPage("name")}>처음 시작하는 거예요</button>
        </form>
      </section>
    );
  }

  if (page === "name") {
    return (
      <section className="onboarding-scene onboarding-scene--name">
        <div className="onboarding-morami"><Morami expression="happy" /></div>
        <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); if (name.trim() && (!apiEnabled || researchCode.trim())) finishOnboarding(); }}>
          <span>모르미</span>
          <h1>너의 이름을 알려줄래?</h1>
          <p>앞으로 내가 이름을 불러 줄게!</p>
          <label htmlFor="learner-name">이름</label>
          <input id="learner-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 12))} placeholder="이름을 적어 주세요" autoComplete="name" />
          {apiEnabled && (
            <>
              {/* 연구 코드가 아이를 구분한다. 같은 코드로 다시 들어오면 진행도가 이어진다. */}
              <label htmlFor="research-code">참여 번호</label>
              <input id="research-code" value={researchCode} onChange={(event) => setResearchCode(normalizeResearchCode(event.target.value))} placeholder="선생님이 알려준 번호" autoComplete="off" />
            </>
          )}
          <button className="primary-button" type="submit" disabled={submitting || !name.trim() || (apiEnabled && !researchCode.trim())}>{submitting ? "준비 중…" : "내 이름 알려주기"} <span className="button-arrow" /></button>
          {submitError && <p className="onboarding-error" role="alert">{submitError}</p>}
          {apiEnabled && <button type="button" className="onboarding-secondary" onClick={() => setPage("restore")}>전에 하던 게 있어요</button>}
        </form>
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
        <button className="primary-button" onClick={() => setPage("name")}>내 이름 알려주기 <span className="button-arrow" /></button>
        {apiEnabled && <button type="button" className="onboarding-secondary" onClick={() => setPage("restore")}>전에 하던 게 있어요</button>}
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
      <div className="player-hud" aria-label="나의 모험 정보">
        <div className="player-stat player-stat--level"><UiIcon name="sprout" size="large" /><span><small>레벨</small><b>{level}</b></span></div>
        <div className="player-stat player-stat--star"><UiIcon name="star" size="large" /><span><small>모은 별</small><b>{stars}개</b></span></div>
        <div className="player-wallet"><Image src="/ui/mormi-coin.png" alt="모르미 새싹 코인" width={220} height={220} unoptimized /><span><small>모은 돈</small><strong>{coinBalance.toLocaleString("ko-KR")}원</strong></span></div>
      </div>
      <div className="home-room-main">
        <div className="home-room-copy">
          <p className="eyebrow">모르미의 생활 수학</p>
          <h1>오늘은 어떤 걸 할까?</h1>
          <div className="daily-quest"><span>오늘의 퀘스트</span><b><UiIcon name="key" size="small" /> 카페 열쇠 조각 모으기</b><strong>{done}/{requiredSessions.length}</strong></div>
          <div className="home-main-actions">
            <button onClick={onCurriculum}><span><UiIcon name="home" size="large" /></span><b>집에서 복습하기</b><small>개념을 익히고 별 3개를 받아요</small></button>
            <button onClick={onOutside}><span><UiIcon name={unlocked ? "cafe" : "lock"} size="large" /></span><b>외출하기</b><small>{unlocked ? "카페가 열렸어요!" : `카페 준비 ${done}/${requiredSessions.length}`}</small></button>
          </div>
        </div>
        <div className="home-room-morami"><Morami expression={unlocked ? "celebrate" : "bright"} /></div>
      </div>
      {!unlocked && nextSession && <button className="home-next-lesson" onClick={() => onOpenSession(sessions.findIndex((session) => session.id === nextSession.id))}><span>카페까지 {requiredSessions.length - done}개 남았어요</span><b>다음 필수 개념: {nextSession.title} →</b></button>}
    </section>
  );
}

/**
 * 외출 장소. 해금 여부는 서버(`GET /v1/themes`)가 확정한 값을 그대로 쓴다.
 *
 * cafeTheme 이 없으면 서버를 못 읽은 것이므로 로컬 규칙으로 내려간다. 다만 로컬 규칙과
 * 서버 규칙이 어긋나면 화면만 열리고 방문 생성이 403 으로 막히므로, 서버 값이 있는 한
 * 그쪽을 우선한다.
 */
function OutsideHub({ unlocked, cafeTheme, onCafe }: {
  unlocked: boolean;
  cafeTheme: ThemeView | null;
  onCafe: () => void;
}) {
  const isUnlocked = cafeTheme?.unlocked ?? unlocked;
  const requiredCount = cafeTheme?.required_session_ids.length ?? cafeRequiredSessionIds.length;
  const remainingCount = cafeTheme?.remaining_session_ids.length ?? null;
  const lockedNote = remainingCount === null
    ? `필수 개념 ${requiredCount}개를 끝내야 열려요`
    : `필수 개념 ${requiredCount}개 중 ${remainingCount}개가 남았어요`;
  return (
    <section className="journey-hub journey-hub--outside">
      <div className="outside-scene-head"><div><p className="eyebrow"><UiIcon name="sprout" size="small" /> 모르미의 생활 수학</p><h1>우리 같이 어디 갈까?</h1></div></div>
      <div className="outside-morami-talk"><Morami expression={isUnlocked ? "happy" : "confused"} size="small" /><p>{isUnlocked ? "나 카페 혼자 가는 건 처음이라 무서운데, 같이 가 주라!" : "집에서 카페에 필요한 개념을 모두 끝내면 같이 나갈 수 있어!"}</p></div>
      <div className="destination-grid">
        <button className={`destination-card destination-card--cafe ${isUnlocked ? "is-unlocked" : "is-locked"}`} disabled={!isUnlocked} onClick={onCafe}>
          <Image src="/scenes/cafe-bakery-cute-v4.png" alt="모르미와 갈 카페" width={1000} height={720} priority unoptimized />
          <span className="destination-shade" />
          <div><small>{isUnlocked ? "진행" : "잠김"}</small><h2>{cafeTheme?.title ?? "카페"} 가기</h2><p>{isUnlocked ? "줄을 서고, 메뉴를 골라 계산해요" : lockedNote}</p><strong>{isUnlocked ? "모르미와 들어가기 →" : "집에서 복습하기 →"}</strong></div>
        </button>
        <article className="destination-card destination-card--soon"><Image src="/scenes/market-cute-v4.png" alt="잠긴 마트" width={800} height={600} unoptimized /><span><UiIcon name="lock" size="small" /> 다음 외출</span><h2>마트 가기</h2><p>집에서 새 스테이션을 풀면 갈 수 있어요.</p><b>곧 만나요</b></article>
      </div>
    </section>
  );
}

export function MoramiApp() {
  const [learner, setLearner] = useState<LearnerProfile>(defaultLearner);
  // 반복 문제의 서버 세션과 기록은 순서대로 확정한 뒤에만 가르치기 대화를 시작한다.
  const learningSessionId = useRef<string | null>(null);
  const learningSessionPromise = useRef<Promise<string> | null>(null);
  const attemptWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const attemptWriteError = useRef<unknown>(null);
  const attemptCounter = useRef(0);
  // 복구한 잠긴 오답. 문제 보기가 복구된 seed 로 다시 만들어진 뒤에 적용한다.
  const pendingDrillRestore = useRef<{
    curriculumSessionId: string;
    questionIndex: number;
    wrongChoiceIndexes: number[];
  } | null>(null);
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingError, setOnboardingError] = useState("");
  const [sessionIndex, setSessionIndex] = useState(0);
  const [variantSeed, setVariantSeed] = useState(1);
  const activeSession = useMemo(() => {
    const base = sessions[sessionIndex];
    const countingValues = base.id === "number-count"
      ? shuffledCountingValues(variantSeed + sessionIndex * 59)
      : null;
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
        const variationSeed = countingValues ? countingValues[index] - 1 : seed;
        return shuffleProblemAnswers(varyProblem(problem, variationSeed), seed);
      }),
    };
  }, [sessionIndex, variantSeed]);
  const [stage, setStage] = useState<Stage>("onboarding");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [expression, setExpression] = useState<Expression>("happy");
  const [dialogue, setDialogue] = useState(sessions[0].memoryDialogue);
  const [showOtherConcepts, setShowOtherConcepts] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
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
  const [teachText, setTeachText] = useState("");
  const [teachChoiceIds, setTeachChoiceIds] = useState<string[]>([]);
  const [teachFillValues, setTeachFillValues] = useState<Record<string, string>>({});
  const [mormiConversation, setMormiConversation] = useState<MormiConversation | null>(null);
  const [teachingNote, setTeachingNote] = useState<MormiTurn["note_update"] | null>(null);
  const [teachSending, setTeachSending] = useState(false);
  const [teachHelpLoading, setTeachHelpLoading] = useState(false);
  const teachRequestInFlight = useRef(false);
  const [teachError, setTeachError] = useState("");
  const [teachRewardAmount, setTeachRewardAmount] = useState(0);
  const [solvedAtLevel, setSolvedAtLevel] = useState<number | null>(null);
  const [homeworkSolved, setHomeworkSolved] = useState(false);
  const [homeworkIndex, setHomeworkIndex] = useState(0);
  const [homeworkCorrect, setHomeworkCorrect] = useState(0);
  const [completedSessionIds, setCompletedSessionIds] = useState<string[]>([]);
  // 진행 중 카페 방문. 새로고침 뒤 카페로 들어가면 이 방문을 이어 받는다.
  const [activeCafeVisitId, setActiveCafeVisitId] = useState<string | null>(null);
  // 서버가 확정한 외출 장소 해금 상태. 못 읽으면 null 이고 로컬 규칙으로 내려간다.
  const [themes, setThemes] = useState<ThemeView[] | null>(null);
  const [coinBalance, setCoinBalance] = useState(6000);
  const startedAt = useRef(0);
  const elapsedSeconds = useRef(0);
  const teachThreadRef = useRef<HTMLDivElement>(null);
  const finishInProgress = useRef(false);

  const childName = learner.name;
  const currentStep = stage === "drill" ? 0 : stage === "teach" || stage === "teachReward" ? 1 : stage === "wrap" ? 2 : 3;
  const learningStage = ["drill", "teach", "teachReward", "wrap", "homework"].includes(stage);
  const currentDrill = activeSession.drills[drillIndex % activeSession.drills.length];
  const currentSelectedDrillAnswer = selectedDrillAnswer?.question === drillIndex ? selectedDrillAnswer.answer : null;
  const homeworkBase = homeworkIndex < activeSession.homework.length ? activeSession.homework[homeworkIndex] : extraLifeProblem(activeSession, variantSeed + homeworkIndex * 17);
  const currentHomework = useMemo(() => {
    const seed = variantSeed + homeworkIndex * 29;
    return shuffleProblemAnswers(varyProblem(homeworkBase, seed), seed);
  }, [homeworkBase, homeworkIndex, variantSeed]);
  const selectedArea = mathAreas.find((area) => area.id === selectedAreaId) ?? null;
  const selectedAreaSessions = useMemo(() => selectedArea?.sessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)) ?? [], [selectedArea]);
  const cafeConceptSessions = useMemo(() => cafeRequiredSessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)), []);
  const otherConceptSessions = useMemo(() => sessions.filter((session) => !cafeRequiredSessionIds.includes(session.id as (typeof cafeRequiredSessionIds)[number])), []);
  const teachingTurn = mormiConversation?.turn ?? null;
  const teachingProblem = useMemo(
    () => teachingProblemFromTurn(teachingTurn, currentDrill),
    [currentDrill, teachingTurn],
  );
  const teachingComplete = teachingTurn?.status === "completed";
  const brightExit = teachingTurn?.completion?.outcome === "bright_exit";
  const hasTeachingNote = Boolean(teachingNote) && !brightExit;
  const serverMormiText = teachingTurn?.mormi.text?.trim() ?? "";
  const hasServerMessagePanel = Boolean(serverMormiText) || Boolean(teachingTurn?.help_card?.visible) || Boolean(teachError);

  const showMoramiFallback = useCallback((fallbackDialogue: string, fallbackExpression: Expression) => {
    setDialogue(fallbackDialogue);
    setExpression(fallbackExpression);
  }, []);

  /** 해금 상태 갱신. 실패해도 화면은 로컬 규칙으로 계속 돌아간다. */
  const refreshThemes = useCallback(() => {
    if (!apiEnabled) return;
    void api.themes()
      .then(setThemes)
      .catch((error: unknown) => console.warn("[mormi-api] 외출 장소 조회 실패", error));
  }, []);

  const cafeTheme = themes?.find((theme) => theme.theme_id === "cafe") ?? null;

  /**
   * 새로고침 복구. 서버가 들고 있는 진행 중 세션을 그대로 화면에 되돌린다.
   *
   * attemptCounter 복원이 특히 중요하다. 이걸 빼먹으면 재개 뒤 attempt_no 가 1부터
   * 다시 올라가고, 서버는 (session, activity, attempt_no) 멱등키로 이미 본 번호라
   * 판단해 새 시도를 중복 처리한다. 즉 재개 이후의 기록이 조용히 사라진다.
   *
   * @returns 복구해서 반복 화면으로 들어갔으면 true.
   */
  const restoreLearningSession = useCallback(async (activeSessionId: string) => {
    const view = await api.getSession(activeSessionId);
    if (view.completed_at) return false;

    const index = sessions.findIndex((session) => session.id === view.curriculum_session_id);
    if (index < 0) return false;

    const drills = view.attempts.filter((attempt) => attempt.activity === "drill");
    // 시도가 하나도 없으면 되살릴 화면이 없다. 홈에 두고 새로 고르게 한다.
    if (drills.length === 0) return false;

    const correct = Math.min(view.correct_count, masteryTarget);
    const questionIndex = Math.min(correct, masteryTarget - 1);
    pendingDrillRestore.current = {
      curriculumSessionId: view.curriculum_session_id,
      questionIndex,
      wrongChoiceIndexes: drills
        .filter((attempt) => !attempt.is_correct && attempt.question_index === questionIndex)
        .map((attempt) => choiceIndexOf(attempt.answer_meta.selected_choice_id)),
    };

    learningSessionId.current = view.learning_session_id;
    learningSessionPromise.current = Promise.resolve(view.learning_session_id);
    attemptCounter.current = drills.reduce((max, attempt) => Math.max(max, attempt.attempt_no), 0);
    attemptWriteError.current = null;
    attemptWriteQueue.current = Promise.resolve();

    setSessionIndex(index);
    // 서버가 보관한 seed 를 되돌려야 아이가 실제로 봤던 문제가 그대로 다시 만들어진다.
    setVariantSeed(view.variant_seed);
    setDrillIndex(questionIndex);
    setDrillCorrect(correct);
    setDrillAttempts(drills.length);
    setSessionCoins(view.drill_reward_subtotal);
    setMastered(correct >= masteryTarget);
    setStage("drill");
    startedAt.current = nowMs();
    elapsedSeconds.current = 0;
    return true;
  }, []);

  /**
   * 잠긴 오답 복원. 문제 보기는 variantSeed 로 섞이므로, activeSession 이 복구된 seed 로
   * 다시 만들어진 뒤에야 선택지 번호를 실제 답 문자열로 되돌릴 수 있다.
   */
  useEffect(() => {
    const pending = pendingDrillRestore.current;
    if (!pending || pending.curriculumSessionId !== activeSession.id) return;
    pendingDrillRestore.current = null;
    const question = activeSession.drills[pending.questionIndex % activeSession.drills.length];
    const locked = pending.wrongChoiceIndexes
      .map((choiceIndex) => question.answers[choiceIndex])
      .filter((answer): answer is string => Boolean(answer) && answer !== question.correct);
    if (locked.length > 0) setWrongDrillAnswers([...new Set(locked)]);
  }, [activeSession, drillIndex]);

  useEffect(() => {
    // 서버가 붙어 있으면 진행도의 기준은 서버다. localStorage 는 오프라인 표시용으로만 남긴다.
    if (apiEnabled && readStoredLearner()) {
      void api.progress().then(async (snapshot) => {
        setLearner({ id: snapshot.learner_id, name: snapshot.display_name });
        setCompletedSessionIds(snapshot.completed_session_ids);
        setCoinBalance(snapshot.wallet_balance);
        setActiveCafeVisitId(snapshot.active_cafe_visit_id);
        refreshThemes();
        setStage("home");
        // 이름과 원문은 보내지 않고, 서버가 발급한 가명 id 로만 식별한다.
        identifyLearner(snapshot.analytics_id);

        // 진행 중 세션이 남아 있으면 홈을 거쳐 반복 화면으로 되돌아간다.
        // 실패해도 홈은 그대로 두어, 아이가 새 개념을 고를 수 있게 한다.
        if (snapshot.active_learning_session_id) {
          await restoreLearningSession(snapshot.active_learning_session_id)
            .catch((error: unknown) => {
              console.warn("[mormi-api] 학습 세션 복구 실패", error);
              return false;
            });
        }
      }).catch((error: unknown) => {
        // 토큰이 만료·삭제되었으면 온보딩부터 다시 시작한다.
        if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return;
        console.warn("[mormi-api] 진행도 조회 실패", error);
      });
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem("morami-completed-sessions") || "[]") as string[];
      const savedCoins = Number(localStorage.getItem("mormey-coins") || "6000");
      const onboarded = localStorage.getItem("morami-onboarding-complete") === "true";
      const savedLearner = JSON.parse(localStorage.getItem("mormey-learner") || "null") as LearnerProfile | null;
      window.requestAnimationFrame(() => {
        setCompletedSessionIds(saved);
        setCoinBalance(Number.isFinite(savedCoins) ? savedCoins : 6000);
        if (savedLearner?.id && savedLearner.name) setLearner(savedLearner);
        if (onboarded && savedLearner?.id && savedLearner.name) setStage("home");
      });
    } catch { /* device-local progress is optional */ }
  }, [restoreLearningSession, refreshThemes]);

  useEffect(() => {
    if (!["drill", "teach", "wrap", "homework"].includes(stage)) return;
    const timer = window.setInterval(() => {
      elapsedSeconds.current = Math.floor((nowMs() - startedAt.current) / 1000);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    const thread = teachThreadRef.current;
    if (!thread || stage !== "teach") return;
    thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [stage, teachingTurn?.turn_id, teachSending]);

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
      synchronized: teachingTurn?.pedagogy?.hint_level !== "H0",
      transfer,
      ladder: solvedAtLevel ?? 0,
      timedOut: false,
      earnedCoins: sessionCoins,
      drillCoins: Math.max(0, sessionCoins - teachRewardAmount),
      teachCoins: teachRewardAmount,
      learnerId: learner.id,
      learnerName: learner.name,
    };
    localStorage.setItem("morami-report", JSON.stringify(report));
    try {
      const previous = JSON.parse(localStorage.getItem("morami-report-history") || "[]") as unknown[];
      localStorage.setItem("morami-report-history", JSON.stringify([report, ...previous].slice(0, 8)));
    } catch {
      localStorage.setItem("morami-report-history", JSON.stringify([report]));
    }
  }, [activeSession, drillAttempts, learner, sessionCoins, solvedAtLevel, teachRewardAmount, teachingTurn?.pedagogy?.hint_level]);

  /** 반복 문제 시도는 세션 생성 뒤 한 건씩 순서대로 전송한다. */
  function postDrillAttempt(answer: string, isCorrect: boolean) {
    attemptCounter.current += 1;
    const attemptNo = attemptCounter.current;
    const elapsedMs = nowMs() - startedAt.current;
    const selectedChoiceIndex = currentDrill.answers.indexOf(answer);
    const selectedChoiceId = `${activeSession.id}:${drillIndex}:choice:${Math.max(0, selectedChoiceIndex)}`;
    const lockedChoiceIds = wrongDrillAnswers.map((lockedAnswer) => {
      const lockedIndex = currentDrill.answers.indexOf(lockedAnswer);
      return `${activeSession.id}:${drillIndex}:choice:${Math.max(0, lockedIndex)}`;
    });
    const writeAttempt = async () => {
      const sessionId = await learningSessionPromise.current;
      if (!sessionId) throw new Error("학습 세션을 만들지 못했습니다.");
      await api.recordAttempt(sessionId, {
        activity: "drill",
        attempt_no: attemptNo,
        item_id: `${activeSession.id}:${drillIndex}`,
        question_index: drillIndex,
        is_correct: isCorrect,
        elapsed_ms: Math.min(elapsedMs, 600000),
        answer_meta: {
          selected_choice_id: selectedChoiceId,
          locked_choice_ids: lockedChoiceIds,
          misconception_tag: isCorrect ? undefined : `${activeSession.id}_wrong_choice`,
          response_category: isCorrect ? "correct_choice" : "incorrect_choice",
          input_kind: "choices",
        },
      });
    };
    const queued = attemptWriteQueue.current.then(writeAttempt);
    attemptWriteQueue.current = queued.catch((error: unknown) => {
      attemptWriteError.current = error;
      console.error("[mormi-api] 반복 학습 기록 실패", error);
    });
  }

  function answerDrill(answer: string) {
    if (drillLocked || mastered) return;
    setSelectedDrillAnswer({ question: drillIndex, answer });
    setDrillAttempts((count) => count + 1);
    postDrillAttempt(answer, answer === currentDrill.correct);
    if (answer === currentDrill.correct) {
      const nextCorrect = drillCorrect + 1;
      const reward = wrongDrillAnswers.length === 0
        ? 200
        : wrongDrillAnswers.length === 1
          ? 150
          : wrongDrillAnswers.length === 2
            ? 100
            : 50;
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

  function applyTeachingConversation(nextConversation: MormiConversation) {
    const nextTurn = nextConversation.turn;
    setMormiConversation(nextConversation);
    setDialogue(nextTurn.mormi.text);
    setExpression(expressionFromMormiMood(nextTurn.mormi.mood));
    setSolvedAtLevel(scaffoldLevel(nextTurn));
    setTeachChoiceIds([]);
    setTeachFillValues({});
    setTeachText("");
    if (nextTurn.completion?.outcome === "bright_exit") {
      setTeachingNote(null);
    } else if (nextTurn.note_update) {
      setTeachingNote(nextTurn.note_update);
    }
    if (nextTurn.status === "completed" && soundOn) playLearningChime();
  }

  async function beginTeaching() {
    setStage("teach");
    setTeachError("");
    setTeachSending(true);
    setMormiConversation(null);
    setTeachingNote(null);
    try {
      const sessionId = await learningSessionPromise.current;
      await attemptWriteQueue.current;
      if (!sessionId || attemptWriteError.current) {
        throw attemptWriteError.current ?? new Error("반복 학습 기록을 저장하지 못했습니다.");
      }
      applyTeachingConversation(await startHomeTeaching(sessionId));
    } catch (error) {
      if (error instanceof ApiError) {
        // 아이 화면에는 쉬운 안내만 표시하되, 운영 진단에는 BE가 정제한
        // 코드만 남긴다. 요청 본문이나 아이 원문은 기록하지 않는다.
        console.error(
          `[mormi-api] 가르치기 시작 실패 status=${error.status} code=${error.code}`,
        );
      } else {
        console.error("[mormi-api] 가르치기 시작 실패 (unexpected)");
      }
      setTeachError(error instanceof ApiError
        ? error.message
        : "가르치기를 준비하지 못했어요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setTeachSending(false);
    }
  }

  function completionValues(turn: MormiTurn): Record<string, string | number | boolean | string[]> {
    const raw = turn.input.config.completion_values;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw).filter((entry): entry is [string, string | number | boolean | string[]] => {
        const value = entry[1];
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          || (Array.isArray(value) && value.every((item) => typeof item === "string"));
      }),
    );
  }

  async function submitTeachingResponse(
    type: MormiResponseType,
    payload: Pick<Parameters<typeof submitMormiResponseThroughBe>[1], "text" | "choice_ids" | "values"> = {},
  ) {
    if (!mormiConversation || teachRequestInFlight.current || teachingComplete) return;
    const activeConversation = mormiConversation;
    teachRequestInFlight.current = true;
    setTeachError("");
    setTeachHelpLoading(type === "no_response");
    setTeachSending(true);
    try {
      const nextConversation = await submitMormiResponseThroughBe(activeConversation.conversation_id, {
        turn_id: activeConversation.turn.turn_id,
        type,
        latency_ms: Math.min(nowMs() - startedAt.current, 600000),
        ...payload,
      });
      applyTeachingConversation(nextConversation);
    } catch (error) {
      if (error instanceof ApiError) {
        // 원문 발화는 남기지 않고, AI·BE가 정제한 운영 코드만 기록한다.
        console.error(
          `[mormi-api] 가르치기 응답 실패 status=${error.status} code=${error.code}`,
        );
      } else {
        console.error("[mormi-api] 가르치기 응답 실패 (unexpected)");
      }
      setTeachError("응답을 보내지 못했어요. 같은 답으로 다시 시도해 주세요.");
    } finally {
      teachRequestInFlight.current = false;
      setTeachHelpLoading(false);
      setTeachSending(false);
    }
  }

  function goWrap() {
    if (!teachingComplete || teachSending) return;
    if (hasTeachingNote) {
      setStage("wrap");
      return;
    }
    void finish(false);
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
        showMoramiFallback("우와, 생활 문제도 풀었어!", "celebrate");
        saveReport(true);
      } else {
        setHomeworkIndex((index) => index + 1);
        showMoramiFallback("하나 풀었어! 다음 것도 알려 줘.", "happy");
      }
    } else {
      setExpression("confused");
      setDialogue("무엇을 묻는지 다시 읽어 볼까?");
    }
  }

  async function finish(transfer = homeworkSolved) {
    if (finishInProgress.current) return;
    finishInProgress.current = true;
    setTeachError("");
    setTeachSending(true);
    try {
      const sessionId = await learningSessionPromise.current;
      await attemptWriteQueue.current;
      if (!sessionId || attemptWriteError.current) {
        throw attemptWriteError.current ?? new Error("반복 학습 기록을 저장하지 못했습니다.");
      }
      const result = await api.completeSession(sessionId, {
        transfer_solved: transfer,
        timed_out: false,
        scaffold_level: scaffoldLevel(teachingTurn),
        elapsed_seconds: elapsedSeconds.current,
      });
      const next = result.completed_session_ids;
      setCompletedSessionIds(next);
      setCoinBalance(result.wallet_balance);
      // 이 세션으로 카페가 열렸을 수 있다. 해금 판정은 서버에서 다시 받아 온다.
      refreshThemes();
      setSessionCoins(result.total_reward);
      setTeachRewardAmount(result.teach_reward);
      learningSessionId.current = null;
      learningSessionPromise.current = null;
      localStorage.setItem("morami-completed-sessions", JSON.stringify(next));
      localStorage.setItem("mormey-coins", String(result.wallet_balance));
      saveReport(transfer);

      captureMormeyEvent("session_completed", {
        session_id: activeSession.id,
        elapsed_seconds: elapsedSeconds.current,
        drill_attempts: drillAttempts,
        scaffold_level: scaffoldLevel(teachingTurn),
        completed_at_home: true,
      });
      if (!isCafeUnlocked(completedSessionIds) && isCafeUnlocked(next)) {
        captureMormeyEvent("theme_unlocked", { theme: "cafe" });
      }
      if (result.teach_reward > 0) {
        captureMormeyEvent("teach_reward_earned", {
          session_id: activeSession.id,
          reward: result.teach_reward,
          scaffold_level: scaffoldLevel(teachingTurn),
        });
        if (soundOn) playCoinRewardSound(200);
        setStage("teachReward");
      } else {
        setStage("complete");
      }
    } catch (error) {
      console.error("[mormi-api] 세션 완료 실패", error);
      setTeachError("학습 결과를 저장하지 못했어요. 다시 시도해 주세요.");
      finishInProgress.current = false;
    } finally {
      setTeachSending(false);
    }
  }

  function openSession(nextIndex: number) {
    finishInProgress.current = false;
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
    setTeachText("");
    setTeachChoiceIds([]);
    setTeachFillValues({});
    setMormiConversation(null);
    setTeachingNote(null);
    setTeachSending(false);
    setTeachError("");
    setTeachRewardAmount(0);
    setSolvedAtLevel(null);
    setHomeworkSolved(false);
    setHomeworkIndex(0);
    setHomeworkCorrect(0);
    startedAt.current = nowMs();
    elapsedSeconds.current = 0;

    // 서버 세션을 즉시 열고, 뒤따르는 drill 기록은 이 Promise 뒤에 순차로 붙인다.
    learningSessionId.current = null;
    attemptCounter.current = 0;
    attemptWriteError.current = null;
    attemptWriteQueue.current = Promise.resolve();
    const seed = variantSeed + 97 + nextIndex * 13;
    learningSessionPromise.current = api.startSession(sessions[nextIndex].id, seed)
      .then((started) => {
        learningSessionId.current = started.learning_session_id;
        return started.learning_session_id;
      });
    void learningSessionPromise.current.catch((error: unknown) => {
      attemptWriteError.current = error;
      console.error("[mormi-api] 학습 세션 시작 실패", error);
    });

    captureMormeyEvent("lesson_started", { session_id: sessions[nextIndex].id, theme: "home" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showCurriculum() {
    setSelectedAreaId(null);
    setShowOtherConcepts(false);
    setStage("curriculum");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function completeOnboarding(name: string, researchCode: string) {
    if (!apiEnabled) {
      // 서버가 없는 로컬 데모. 기존 동작 그대로 진행한다.
      const profile = { id: 1, name };
      setLearner(profile);
      localStorage.setItem("mormey-learner", JSON.stringify(profile));
      localStorage.setItem("morami-onboarding-complete", "true");
      captureMormeyEvent("onboarding_completed", { tutorial_available: false });
      setStage("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setOnboardingSubmitting(true);
    setOnboardingError("");
    try {
      // 같은 참여 번호면 서버가 기존 학습자를 찾아 진행도를 이어 준다.
      const created = await api.createLearner(name, researchCode);
      const profile = { id: created.id, name: created.display_name };
      storeSession(created.access_token, { ...profile, researchCode: created.research_code, analyticsId: created.analytics_id });
      setLearner(profile);
      identifyLearner(created.analytics_id);

      const snapshot = await api.progress();
      setCompletedSessionIds(snapshot.completed_session_ids);
      setCoinBalance(snapshot.wallet_balance);
      setActiveCafeVisitId(snapshot.active_cafe_visit_id);
      refreshThemes();

      captureMormeyEvent("onboarding_completed", { tutorial_available: false });
      setStage("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setOnboardingError(error instanceof ApiError
        ? error.message
        : "연결이 잘 되지 않았어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOnboardingSubmitting(false);
    }
  }

  /**
   * 기기를 바꾼 아이. 이름 없이 참여 번호만으로 토큰을 다시 받아 진행도를 이어 받는다.
   *
   * createLearner 와 달리 없는 번호면 만들지 않고 실패한다. 오타로 새 학습자가
   * 생겨 연구 데이터가 둘로 갈라지는 걸 막아야 하므로, 이 경로에서는 그게 맞다.
   */
  async function restoreByResearchCode(researchCode: string) {
    setOnboardingSubmitting(true);
    setOnboardingError("");
    try {
      const restored = await api.restoreLearner(researchCode);
      const profile = { id: restored.id, name: restored.display_name };
      storeSession(restored.access_token, { ...profile, researchCode: restored.research_code, analyticsId: restored.analytics_id });
      setLearner(profile);
      identifyLearner(restored.analytics_id);

      const snapshot = await api.progress();
      setCompletedSessionIds(snapshot.completed_session_ids);
      setCoinBalance(snapshot.wallet_balance);
      setActiveCafeVisitId(snapshot.active_cafe_visit_id);
      refreshThemes();
      setStage("home");
      window.scrollTo({ top: 0, behavior: "smooth" });

      // 기기를 바꾸기 전에 풀던 세션이 남아 있으면 그 화면까지 되돌린다.
      if (snapshot.active_learning_session_id) {
        await restoreLearningSession(snapshot.active_learning_session_id)
          .catch((error: unknown) => {
            console.warn("[mormi-api] 학습 세션 복구 실패", error);
            return false;
          });
      }
      captureMormeyEvent("learner_restored");
    } catch (error) {
      setOnboardingError(error instanceof ApiError && error.status === 404
        ? "그 참여 번호로 저장된 기록을 찾지 못했어요. 번호를 다시 확인해 주세요."
        : error instanceof ApiError
          ? error.message
          : "연결이 잘 되지 않았어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOnboardingSubmitting(false);
    }
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
    setSoundOn((enabled) => !enabled);
  }

  const completedAfterLesson = completedSessionIds.includes(activeSession.id) ? completedSessionIds : [...completedSessionIds, activeSession.id];
  const cafeUnlockedAfterLesson = isCafeUnlocked(completedAfterLesson);
  const cafeReadyCountAfterLesson = cafeRequiredSessionIds.filter((id) => completedAfterLesson.includes(id)).length;

  return (
    <main className={`app-shell app-shell--${stage}`}>
      {stage !== "onboarding" && stage !== "cafe" && stage !== "teach" && <header className="topbar topbar--without-brand">
        {learningStage ? <div className="progress-dots" aria-label={`학습 ${currentStep + 1}단계`}>
          {stageLabels.slice(0, 3).map((label, index) => <span key={label} className={index <= currentStep ? "is-active" : ""}><i />{label}</span>)}
        </div> : <nav className="journey-nav" aria-label="장소 이동"><button className={stage === "home" ? "is-active" : ""} onClick={showHome}><UiIcon name="home" size="small" />집</button><button className={stage === "outside" ? "is-active" : ""} onClick={showOutside}><UiIcon name="cafe" size="small" />외부</button></nav>}
        <div className="top-actions">
          <button className={`round-control ${soundOn ? "is-sound-on" : ""}`} onClick={toggleSound} aria-label={soundOn ? "효과음 끄기" : "효과음 켜기"}><UiIcon name={soundOn ? "sound" : "mute"} size="small" /></button>
          {learningStage && <button className="curriculum-link" onClick={showHome}>집으로</button>}
        </div>
      </header>}

      {stage === "onboarding" && <Onboarding
        onStart={(name, code) => { void completeOnboarding(name, code); }}
        onRestore={(code) => { void restoreByResearchCode(code); }}
        submitting={onboardingSubmitting}
        submitError={onboardingError}
      />}

      {stage === "home" && <HomeHub completedSessionIds={completedSessionIds} coinBalance={coinBalance} onOpenSession={openSession} onCurriculum={showCurriculum} onOutside={showOutside} />}

      {stage === "outside" && <OutsideHub unlocked={isCafeUnlocked(completedSessionIds)} cafeTheme={cafeTheme} onCafe={() => setStage("cafe")} />}

      {stage === "cafe" && <CafeJourney
        learnerName={childName}
        learnerId={learner.id}
        activeVisitId={activeCafeVisitId}
        onBack={showOutside}
        onComplete={() => { setActiveCafeVisitId(null); showHome(); }}
      />}

      {stage === "curriculum" && (
        <section className="curriculum-home curriculum-home--room">
          {!selectedArea ? (
            <>
              <div className="room-list-heading"><p className="eyebrow">집에서 복습하기</p><h1>카페에 필요한 개념부터 배워요</h1><p>필수 개념 {cafeConceptSessions.length}개를 모두 끝내면 카페가 열려요.</p></div>
              <section className="cafe-required-lessons">
                <div><strong><UiIcon name="cafe" size="small" /> 카페 필수 개념</strong><span>{cafeConceptSessions.filter((session) => completedSessionIds.includes(session.id)).length}/{cafeConceptSessions.length} 완료</span></div>
                {cafeConceptSessions.map((session) => <button key={session.id} className={completedSessionIds.includes(session.id) ? "is-complete" : ""} onClick={() => openSession(sessions.findIndex((candidate) => candidate.id === session.id))}><i>{completedSessionIds.includes(session.id) ? "✓" : cafeConceptSessions.indexOf(session) + 1}</i><span><b>{session.title}</b><small>{session.id === "number-count" ? "줄의 사람을 1~5명까지 정확히 세어요" : session.id === "number-compare" ? "두 줄 중 사람이 더 적은 쪽을 찾아요" : session.id === "money-count" ? "100원·500원·1,000원·5,000원의 값을 읽어요" : session.id === "money-price" ? "모르미와 내가 고른 두 메뉴값을 더해요" : "예산과 합계를 비교하고 10,000원에서 메뉴값을 빼요"}</small></span><em>{completedSessionIds.includes(session.id) ? "완료" : "연습하기"}</em></button>)}
              </section>
              <button className="other-concepts-toggle" onClick={() => setShowOtherConcepts((current) => !current)} aria-expanded={showOtherConcepts}>{showOtherConcepts ? "다른 개념 접기" : `다른 개념 더보기 (${otherConceptSessions.length})`}<span>{showOtherConcepts ? "⌃" : "⌄"}</span></button>
              {showOtherConcepts && <div className="room-area-list other-concepts-list">
                {mathAreas.map((area) => {
                  const areaSessions = area.sessionIds.filter((id) => !cafeRequiredSessionIds.includes(id as (typeof cafeRequiredSessionIds)[number]));
                  const done = areaSessions.filter((id) => completedSessionIds.includes(id)).length;
                  if (!areaSessions.length) return null;
                  return <button key={area.id} style={{ "--area-color": area.color } as React.CSSProperties} onClick={() => showArea(area.id)}><i>{done === areaSessions.length ? "✓" : done}</i><span><b>{area.title}</b><small>{area.description}</small></span><em>{done}/{areaSessions.length}<b>›</b></em></button>;
                })}
              </div>
              }
            </>
          ) : (
            <div className="area-detail area-detail--room" style={{ "--area-color": selectedArea.color } as React.CSSProperties}>
              <button className="area-back" onClick={showAreaList}><span>‹</span> 개념 영역으로</button>
              <div className="room-list-heading"><p className="eyebrow">집에서 복습하기</p><h1>{selectedArea.title}</h1><p>{selectedArea.description}</p></div>
              <div className="curriculum-path-list math-course-list math-course-list--detail">
                {selectedAreaSessions.filter((session) => !cafeRequiredSessionIds.includes(session.id as (typeof cafeRequiredSessionIds)[number])).map((session, index, visibleSessions) => <div className="curriculum-path-row" key={session.id}>{(index === 0 || visibleSessions[index - 1]?.unit !== session.unit) && <div className="curriculum-unit-marker"><span>{session.unit}</span><i>STAGE {index + 1}</i></div>}<CurriculumCourseButton session={session} index={sessions.findIndex((candidate) => candidate.id === session.id)} completed={completedSessionIds.includes(session.id)} cafeRequired={false} onOpen={openSession} /></div>)}
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
            <div className="drill-game-status"><div className="seed-meter" aria-label={`${drillCorrect}개 익힘`}>
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
                <p>이제 모르미가 처음 찾아올 거야.<br />방금 익힌 걸 모르미에게 가르쳐 줘.</p>
                <button className="primary-button" onClick={beginTeaching}>모르미 가르치기 <span className="button-arrow" /></button>
                <button className="dictionary-link" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 먼저 사전 보기</button>
              </div>
            ) : (
              <div className="practice-card">
                {coinReward !== null && <div className={`coin-reward-effect coin-reward-effect--${coinReward}`} key={`${drillIndex}-${coinReward}`}><i /><i /><i /><Image src="/cafe-money/100.png" alt="획득한 돈" width={120} height={120} unoptimized /><strong>+{coinReward}원!</strong><span>{coinReward === 200 ? "한 번에 정답!" : coinReward === 150 ? "한 번 더 생각해서 성공!" : coinReward === 100 ? "두 번 다시 생각해서 성공!" : "끝까지 포기하지 않았어!"}</span></div>}
                <ProblemCard problem={currentDrill} />
                <p className="drill-choice-prompt">{currentDrill.prompt}</p>
                <div className={`answer-grid ${["왼쪽", "같아", "오른쪽"].includes(currentDrill.correct) ? "answer-grid--comparison" : ""}`}>
                  {currentDrill.answers.map((answer) => {
                    const isWrong = wrongDrillAnswers.includes(answer);
                    const result = answer === currentDrill.correct && currentSelectedDrillAnswer === answer ? "is-correct" : isWrong ? "is-wrong is-answer-locked" : "";
                    const visibleAnswer = answer === "왼쪽" ? "← 왼쪽" : answer === "오른쪽" ? "오른쪽 →" : answer;
                    return <button key={`${drillIndex}-${answer}`} className={result} onClick={() => answerDrill(answer)} disabled={drillLocked || isWrong} aria-pressed={currentSelectedDrillAnswer === answer}>{visibleAnswer}</button>;
                  })}
                </div>
                <div className={`gentle-feedback ${drillFeedback && currentSelectedDrillAnswer ? "is-visible" : ""} ${currentSelectedDrillAnswer === currentDrill.correct ? "is-correct" : currentSelectedDrillAnswer ? "is-wrong" : ""}`} role="status" aria-live="polite">{currentSelectedDrillAnswer ? drillFeedback : ""}</div>
              </div>
            )}
          </div>
        </section>
      )}

      {stage === "teach" && (
        <section className="chat-scene teaching-scene">
          <div className="chat-title teaching-toolbar">
            <button className="teaching-back" onClick={() => { setStage("drill"); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="이전 반복학습 화면으로 돌아가기"><span>←</span> 이전으로</button>
            <button className="dictionary-pill" onClick={() => setDictionaryOpen(true)}><UiIcon name="book" size="small" /> 별노트</button>
          </div>
          <div className="chat-window teaching-stage">
            {hasServerMessagePanel && !teachingComplete && (
              <div className="teaching-dialogue" ref={teachThreadRef} role="log" aria-label={`모르미와 ${childName}의 대화`} aria-live="polite">
                {serverMormiText && <div><b>모르미</b><p>{formatTeachingDisplayText(serverMormiText)}</p></div>}
                {teachingTurn?.help_card?.visible && <article className="star-note"><div className="note-content"><p><UiIcon name="bulb" size="small" /> {teachingTurn.help_card.title}</p><span>{teachingTurn.help_card.body}</span></div></article>}
                {teachError && <p role="alert">{teachError}</p>}
                {teachingTurn && !teachingComplete && teachingTurn.input.kind !== "none" && <button type="button" className={`teaching-dont-know ${teachHelpLoading ? "is-loading" : ""}`} disabled={teachSending} aria-busy={teachHelpLoading} onClick={() => void submitTeachingResponse("no_response")}>{teachHelpLoading ? "도움 준비 중…" : "잘 모르겠어"}</button>}
              </div>
            )}
            <div className={`teaching-playground teaching-playground--${teachingTurn?.input.kind ?? "loading"}`}>
              <div className="teaching-morami"><Morami expression={expression} /></div>
              {teachingProblem && <article className={`teaching-problem teaching-problem--${teachingProblem.visual.type}`}>
                <ProblemCard problem={teachingProblem} />
                <p className="teaching-problem-recap"><span>모르미가 헷갈린 문제</span>{teachingProblem.prompt}</p>
              </article>}
              {!teachingTurn && teachSending && <div className="learned-card"><UiIcon name="sprout" size="large" /><h2>모르미가 준비하고 있어!</h2><p>반복 학습 기록을 확인하는 중이야.</p></div>}
              {!teachingTurn && !teachSending && teachError && <div className="learned-card"><UiIcon name="refresh" size="large" /><h2>가르치기를 다시 준비할게</h2><p>{teachError}</p><button className="primary-button" onClick={() => void beginTeaching()}>다시 시도하기 <span className="button-arrow" /></button></div>}
              {teachingTurn && !teachingComplete && (
                <div className={`teaching-answer teaching-answer--${teachingTurn.input.kind} teaching-answer--${teachingTurn.pedagogy?.expression_level ?? "L4"}`}>
                  {teachingTurn.input.kind === "text" && <form className="teach-free-response" onSubmit={(event) => { event.preventDefault(); if (teachText.trim()) void submitTeachingResponse("text", { text: teachText.trim() }); }}>
                    <textarea
                      value={teachText}
                      onChange={(event) => setTeachText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        if (teachText.trim() && !teachSending) void submitTeachingResponse("text", { text: teachText.trim() });
                      }}
                      placeholder={teachingTurn.input.placeholder ?? ""}
                      rows={1}
                      disabled={teachSending}
                    />
                    <button type="submit" className="send-teach-button" disabled={!teachText.trim() || teachSending}>{teachSending ? "확인 중…" : "완료"}</button>
                  </form>}
                  {teachingTurn.input.kind === "choices" && <div className="teaching-choice-pair">
                    <div className="teaching-choice-list">{teachingTurn.input.choices.map((choice) => <button type="button" className={teachChoiceIds.includes(choice.id) ? "is-selected" : ""} key={choice.id} disabled={teachSending || Boolean(choice.disabled)} onClick={() => setTeachChoiceIds((selected) => selected.includes(choice.id) ? [] : [choice.id])}>{readableChoice(choice.label)}</button>)}</div>
                    <button className="send-teach-button" disabled={teachChoiceIds.length === 0 || teachSending} onClick={() => void submitTeachingResponse("choice", { choice_ids: teachChoiceIds })}>{teachingTurn.input.submit_label ?? "선택하기"}</button>
                  </div>}
                  {teachingTurn.input.kind === "fill" && <div className="teaching-choice-pair">
                    {typeof teachingTurn.input.config.sentence === "string" && teachingProblem?.visual.type !== "money" && <p>{formatTeachingDisplayText(teachingTurn.input.config.sentence)}</p>}
                    <div className="teaching-choice-list">{teachingTurn.input.choices.map((choice) => <button type="button" className={teachChoiceIds.includes(choice.id) ? "is-selected" : ""} key={choice.id} disabled={teachSending || Boolean(choice.disabled)} onClick={() => { setTeachChoiceIds([choice.id]); setTeachFillValues({ [teachingTurn.input.target_slots[0] ?? "answer"]: choice.label }); }}>{readableChoice(choice.label)}</button>)}</div>
                    <button className="send-teach-button" disabled={Object.keys(teachFillValues).length === 0 || teachSending} onClick={() => void submitTeachingResponse("fill", { choice_ids: teachChoiceIds, values: teachFillValues })}>{teachingTurn.input.submit_label ?? "완료"}</button>
                  </div>}
                  {(teachingTurn.input.kind === "joint" || teachingTurn.input.kind === "button") && <div className="model-teaching">
                    {typeof teachingTurn.input.config.text === "string" && <p>{teachingTurn.input.config.text}</p>}
                    <button className="send-teach-button" disabled={teachSending} onClick={() => void submitTeachingResponse("action", { values: completionValues(teachingTurn) })}>{teachingTurn.input.submit_label ?? "다음"}</button>
                  </div>}
                </div>
              )}
              {teachingComplete && (
                <div className="learned-card">
                  <UiIcon name={brightExit ? "sun" : "star"} size="large" />
                  <h2>{brightExit ? "오늘의 배움을 챙겼어!" : "모르미가 이해했어!"}</h2>
                  <p>{teachingTurn.mormi.text}</p>
                  <button className="primary-button" onClick={goWrap} disabled={teachSending}>{hasTeachingNote ? "별노트 보기" : "오늘 마치기"} <span className="button-arrow" /></button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {stage === "teachReward" && (
        <section className="teach-reward-scene">
          <div className="teach-reward-morami"><Morami expression="celebrate" /></div>
          <div className="teach-reward-copy">
            <div className="teach-reward-dialogue"><b>모르미</b><p>{childName}, 알려줘서 고마워~!</p></div>
            <h1>모르미를 도와줘서<br /><em>{teachRewardAmount.toLocaleString("ko-KR")}원을 받았어요!</em></h1>
            <div className="teach-reward-coins" aria-label={`${teachRewardAmount.toLocaleString("ko-KR")}원 보상`}>{Array.from({ length: Math.max(1, Math.ceil(teachRewardAmount / 100)) }, (_, index) => <Image key={index} src="/cafe-money/100.png" alt="100원" width={110} height={110} unoptimized />)}</div>
            <button className="primary-button" onClick={() => setStage("complete")}>다음으로 <span className="button-arrow" /></button>
          </div>
        </section>
      )}

      {stage === "wrap" && (
        <section className="scene scene--wrap">
          <div className="character-column"><Morami expression={expression} /></div>
          <div className="content-column">
            <SpeechBubble><p>{dialogue}</p></SpeechBubble>
            {hasTeachingNote && teachingNote && <article className="star-note">
              <div className="note-ring">별<br />노<br />트</div>
              <div className="note-content">
                <p><UiIcon name="star" size="small" /> 오늘 모르미가 적은 말</p>
                <h2>“<em>{teachingNote.text}</em>”</h2>
                <span>{teachingNote.attribution_label}</span>
              </div>
            </article>}
            {teachError && <p role="alert">{teachError}</p>}
            <button className="primary-button" onClick={beginHomework} disabled={teachSending}>집에서 오늘 학습 마치기 <span className="button-arrow" /></button>
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
            <div className="session-coin-earned"><Image src="/cafe-money/100.png" alt="이번 세션 보상" width={90} height={90} unoptimized /><div><span>반복학습 + 모르미 가르치기</span><strong>+{sessionCoins.toLocaleString("ko-KR")}원을 얻었어!</strong></div></div>
            <div className="today-badges" aria-label="오늘의 학습 결과">
              <span><UiIcon name="sprout" size="small" /><strong>{masteryTarget}번</strong><small>{activeSession.title} 연습</small></span>
              <span><UiIcon name="star" size="small" /><strong>{hasTeachingNote ? 1 : 0}개</strong><small>별노트</small></span>
              <span><UiIcon name="bag" size="small" /><strong>{cafeReadyCountAfterLesson}/{cafeRequiredSessionIds.length}</strong><small>카페 준비</small></span>
            </div>
            <button className="primary-button" onClick={cafeUnlockedAfterLesson ? showOutside : showHome}>나가기 <span className="button-arrow" /></button>
          </div>
        </section>
      )}

      {dictionaryOpen && <Dictionary session={activeSession} onClose={() => setDictionaryOpen(false)} />}
    </main>
  );
}
