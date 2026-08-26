"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { captureMormeyEvent, identifyLearner } from "./analytics";
import {
  api,
  apiEnabled,
  ApiError,
  clearSession,
  readStoredLearner,
  setUnauthorizedHandler,
  storeEducatorSession,
  storeSession,
  type AuthResponse,
  type ThemeView,
} from "./api-client";
import { toAuthFailure, type AuthField, type AuthFailure } from "./auth-errors";
import { orderedNumericChoicesWithSeededCorrect, orderNumericChoices } from "./answer-choices";
import { AmusementPark } from "./amusement-park/AmusementPark";
import { CafeJourney } from "./CafeJourney";
import {
  CharacterNameModal,
  CharacterNameProvider,
  readCharacterName,
  replaceCharacterName,
  storeCharacterName,
  useCharacterName,
} from "./CharacterName";
import { CollectedStarsModal } from "./CollectedStarsModal";
import { DictionaryModal } from "./DictionaryCard";
import { dialogueErrorMessage } from "./dialogue-errors";
import {
  cafeStageFromRememberedScreen,
  createDialogueStartIntent,
  readReloadDialogueId,
  readReloadDialogueScreen,
  rememberDialogueId,
  rememberDialogueScreen,
} from "./dialogue-restart";
import {
  amusementParkRequiredConceptTitles,
  amusementParkRequiredSessionIds,
  cafeRequiredConceptTitles,
  cafeRequiredSessionIds,
  isCafeUnlocked,
  outsideRequiredSessionIds,
} from "./journey-config";
import { curriculumForSession, masteryTarget, mathAreas, sessions, simpleLearnedLine, transferTarget } from "./math-curriculum";
import {
  startHomeTeaching,
  submitMormiResponseThroughBe,
  type MormiConversation,
  type MormiResponseType,
  type MormiTurn,
} from "./mormi-dialogue";
import { MormiChoiceContent, MormiHelpCard } from "./MormiDialogueUi";
import { visibleHelpCard } from "./help-card";
import { variedMoneyVisualAmounts } from "./money-visual";
import { StarNote } from "./StarNote";
import { StarNoteArchiveModal } from "./StarNoteArchiveModal";
import { TeacherReportEntry } from "./TeacherReportEntry";
import { nameWithSubjectParticle } from "./korean-name";
import type { Problem, Session, Visual } from "./morami-content";

type Expression = "calm" | "happy" | "confused" | "surprised" | "bright" | "celebrate";
// booting: 새로고침 뒤 서버 진행도를 읽고 메인으로 들어가기 전까지의 자리.
type Stage = "booting" | "onboarding" | "home" | "outside" | "cafe" | "amusement" | "curriculum" | "drill" | "teach" | "teachReward" | "wrap" | "homework" | "complete";

const expressions: Record<Expression, string> = {
  calm: "/morami/calm-cutout.png",
  happy: "/morami/happy-cutout.png",
  confused: "/morami/confused-cutout.png",
  surprised: "/morami/surprised-cutout.png",
  bright: "/morami/bright-cutout.png",
  celebrate: "/morami/celebrate-cutout.png",
};

const stageLabels = ["혼자 연습", "가르치기", "궁금해 사전", "생활 게임"];

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
  lock: "/ui/mormi-lock.png",
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

function moneyPracticeItemPrice(visual: Extract<Visual, { type: "money-practice" }>, index: number) {
  const amount = visual.facts[index]?.value.match(/\d[\d,]*원/)?.[0];
  if (!amount) return undefined;

  return (visual.items?.length ?? 0) > 1 ? `개당 ${amount}` : amount;
}

function MoneyPracticeVisual({ visual }: { visual: Extract<Visual, { type: "money-practice" }> }) {

  return (
    <figure className="money-practice-visual" aria-label={visual.imageAlt}>
      {visual.items?.length ? (
        <div className="money-practice-items">
          {visual.items.map((item, index) => {
            const itemPrice = moneyPracticeItemPrice(visual, index);
            return (
              <div key={`${item.image}-${item.label}-${item.count}`}>
                <Image src={item.image} alt="" width={210} height={160} unoptimized />
                {itemPrice && <span className="money-practice-item-price">{itemPrice}</span>}
                <strong>{item.label}</strong>
                <small>{item.count}개</small>
              </div>
            );
          })}
        </div>
      ) : (
        <Image src={visual.image} alt="" width={520} height={360} unoptimized />
      )}
    </figure>
  );
}

function LearningVisual({ visual, small = false }: { visual: Visual; small?: boolean }) {
  if (visual.type === "clock") return <Clock hour={visual.hour} minute={visual.minute} small={small} />;
  if (visual.type === "money") return <MoneyVisual amounts={visual.amounts} paid={visual.paid} labels={visual.labels} />;
  if (visual.type === "money-practice") return <MoneyPracticeVisual visual={visual} />;
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
  "money-practice",
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
  const orderedNumbers = orderNumericChoices(words);
  if (orderedNumbers) return orderedNumbers;
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
  // 콘텐츠가 정한 보기 순서는 그대로 둔다. 정답을 맨 앞에 강제로 넣으면
  // 숫자가 아닌 보기까지 매번 다시 섞어야 하므로 아이가 순서를 읽기 어렵다.
  const answers = Array.from(new Set([...problem.answers, problem.correct]));
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
    const isCurrencyVisual = !problem.visual.labels?.length;
    const amounts = variedMoneyVisualAmounts(problem.visual.amounts, !isCurrencyVisual, seed);
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
  const ensuredAnswers = ensureFourAnswers(problem);
  const orderedNumbers = orderedNumericChoicesWithSeededCorrect(ensuredAnswers, problem.correct, seed);
  if (orderedNumbers) return { ...problem, answers: orderedNumbers };
  // 도형·방향·문장처럼 의미 순서가 있는 보기는 전체 셔플하지 않는다.
  // 숫자 보기는 위 helper가 오름차순을 유지하면서 정답의 위치만 seed로 바꾼다.
  return { ...problem, answers: ensuredAnswers };
}

function randomVariantSeed() {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return (value[0] % 2_000_000_000) + 1;
}

function randomAnswerChoiceSeeds(count: number) {
  const values = new Uint32Array(Math.max(0, count));
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => (value % 2_000_000_000) + 1);
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
  if (problem.visual.type === "money-practice") return { scene: "fair", place: "놀이동산 준비 상점", title: "가격과 개수를 보고 돈을 계산해요", action: "계산 답 고르기" };
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
  const { displayName, subjectName, rename } = useCharacterName();
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
          <div><b>{showChoices ? "보기에서 한 번만 더 알려 줄래?" : "네 생각을 먼저 써서 알려 줘!"}</b><span>{answerFeedback ? (answerFeedback === "correct" ? "아, 이제 알겠어! 네가 알려 줘서 이해했어." : rename(dialogue)) : rename(dialogue)}</span></div>
        </div>
        <p>{showChoices ? `${story.action} · 보기에서 골라 ${displayName}에게 알려 줘요` : `${story.action} · 먼저 직접 써서 ${displayName}에게 알려 줘요`}</p>
        {!showChoices ? <form className="mission-write" onSubmit={(event) => { event.preventDefault(); if (typedAnswer.trim()) submitMissionAnswer(typedAnswer); }}>
          <input value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder="내 생각을 먼저 써 봐요" aria-label={`${displayName}에게 알려 줄 생활 미션 답`} autoComplete="off" />
          <button type="submit" disabled={!typedAnswer.trim() || answerLocked}>알려주기</button>
        </form> : <>
          <div className="mission-choice-list">{problem.answers.map((answer) => {
            const result = selectedAnswer === answer ? (answersMatch(answer, problem.correct) ? "is-correct" : "is-wrong") : "";
            return <button key={answer} className={result} onClick={() => submitMissionAnswer(answer, true)} aria-pressed={selectedAnswer === answer} disabled={answerLocked}>{readableChoice(answer)}</button>;
          })}</div>
          <button type="button" className="mission-rewrite" onClick={() => { setShowChoices(false); setSelectedAnswer(null); setAnswerFeedback(null); }}>내 답 다시 써 보기</button>
        </>}
        <div className={`mission-answer-feedback ${answerFeedback ? `is-${answerFeedback}` : ""}`} role="status" aria-live="polite">
          {answerFeedback === "correct" ? `${subjectName} 이해했어요! 네 설명이 맞아요.` : answerFeedback === "wrong" ? (showChoices ? "괜찮아요. 그림을 보고 보기에서 한 번 더 알려 줘요." : "괜찮아요. 그림을 보고 한 번 더 써 봐요.") : `${subjectName} 네 설명을 기다리고 있어요.`}
        </div>
      </div>
        : <button className="mission-finish" onClick={onFinish}>오늘 여행 마치기 <span className="button-arrow" /></button>}
    </div>
  );
}

function Morami({ expression, size = "large" }: { expression: Expression; size?: "large" | "small" }) {
  const { displayName } = useCharacterName();
  return (
    <div className={`morami-frame morami-frame--${size} morami-frame--${expression} ${expression === "happy" || expression === "celebrate" ? "is-bouncing" : ""}`}>
      <div className="morami-cutout">
        <Image key={expression} src={expressions[expression]} alt={`${displayName} ${expression} 표정`} width={1254} height={1254} unoptimized priority={size === "large" || expression === "bright"} />
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

/** 참여 번호 입력 규칙. 연구 담당자가 배정한 값과 형식을 맞춰 두어야 그 아이로 저장된다. */
const normalizeResearchCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 40);

/** 아이디는 영숫자 4~20자. 서버(422)와 같은 기준으로 화면에서 먼저 걸러 낸다. */
const LOGIN_ID_PATTERN = /^[a-zA-Z0-9]{4,20}$/;
const PASSWORD_MIN_LENGTH = 8;

function AuthInput({ id, label, hint, error, action, ...inputProps }: {
  id: string;
  label: string;
  /** 라벨 옆 작은 안내. 입력 규칙을 미리 알려 오답 제출을 줄인다. */
  hint?: string;
  error?: string;
  action?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={`auth-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        <span>{label}{hint && <em>{hint}</em>}</span>
        {action}
      </label>
      <input id={id} aria-invalid={error ? true : undefined} {...inputProps} />
      {error && <p className="auth-field-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * 가입·로그인 화면.
 *
 * 실패 사유는 부모가 아니라 이 폼이 들고 있는다. 같은 401 이라도 폼 전체에 띄울지
 * 특정 입력란에 붙일지가 갈리는데, 그 판단까지 부모로 올리면 "지금 어느 칸을
 * 고치는 중인지"를 부모가 알아야 해서 props 가 계속 늘어난다.
 */
function Onboarding({ onSignup, onLogin }: {
  onSignup: (name: string, researchCode: string, loginId: string, password: string) => Promise<AuthFailure | null>;
  onLogin: (loginId: string, password: string) => Promise<AuthFailure | null>;
}) {
  const [page, setPage] = useState<"hello" | "signup" | "login">("hello");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [researchCode, setResearchCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [revealPassword, setRevealPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({});

  /** 화면을 옮길 때는 이전 화면에서 난 오류를 들고 가지 않는다. */
  function goTo(next: "hello" | "signup" | "login", step: 1 | 2 = 1) {
    setPage(next);
    setSignupStep(step);
    setFormError("");
    setFieldErrors({});
    setRevealPassword(false);
  }

  /** 아이가 고치기 시작한 칸의 오류는 즉시 지운다. 빨간 글씨가 남아 있으면 고쳐도 틀린 것 같다. */
  function clearFieldError(field: AuthField) {
    setFormError("");
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function submit(run: () => Promise<AuthFailure | null>) {
    setSubmitting(true);
    setFormError("");
    setFieldErrors({});
    try {
      const failure = await run();
      if (!failure) return;
      setFormError(failure.message ?? "");
      setFieldErrors(failure.fields ?? {});
      // 1스텝 값이 문제면 그 화면으로 되돌려야 아이가 고칠 칸을 볼 수 있다.
      if (failure.fields?.name || failure.fields?.researchCode) setSignupStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  function goToPasswordStep() {
    const errors: Partial<Record<AuthField, string>> = {};
    if (!name.trim()) errors.name = "이름을 적어 주세요.";
    if (!researchCode.trim()) errors.researchCode = "선생님이 알려준 참여 번호를 적어 주세요.";
    setFieldErrors(errors);
    if (errors.name || errors.researchCode) return;
    captureMormeyEvent("onboarding_intro_completed");
    setSignupStep(2);
  }

  function submitSignup() {
    const errors: Partial<Record<AuthField, string>> = {};
    if (!LOGIN_ID_PATTERN.test(loginId)) errors.loginId = "아이디는 영어와 숫자로 4~20자예요.";
    if (password.length < PASSWORD_MIN_LENGTH) errors.password = "비밀번호는 8자 이상이어야 해요.";
    if (errors.loginId || errors.password) {
      setFieldErrors(errors);
      return;
    }
    void submit(() => onSignup(name.trim(), researchCode.trim(), loginId, password));
  }

  function submitLogin() {
    // 로그인에서는 형식 검사를 하지 않는다. 규칙이 나중에 바뀌면 예전 기준으로 만든
    // 아이디가 화면에서 먼저 막혀, 서버에 물어보지도 못하고 못 들어오게 된다.
    if (!loginId.trim() || !password) {
      setFormError("아이디와 비밀번호를 모두 적어 주세요.");
      return;
    }
    void submit(() => onLogin(loginId.trim(), password));
  }

  const passwordReveal = (
    <button type="button" className="auth-reveal" onClick={() => setRevealPassword((current) => !current)}>
      {revealPassword ? "숨기기" : "보기"}
    </button>
  );

  if (page === "login") {
    return (
      <section className="onboarding-scene onboarding-scene--name">
        <div className="onboarding-morami"><Morami expression="happy" /></div>
        <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); submitLogin(); }}>
          <span>로그인</span>
          <h1>다시 만나서 반가워!</h1>
          <p>아이디와 비밀번호를 넣으면 하던 데부터 이어서 할 수 있어.</p>
          <AuthInput
            id="login-id" label="아이디" value={loginId} error={fieldErrors.loginId}
            onChange={(event) => { setLoginId(event.target.value.trim()); clearFieldError("loginId"); }}
            placeholder="아이디를 적어 주세요" autoComplete="username" autoCapitalize="off" spellCheck={false}
          />
          <AuthInput
            id="login-password" label="비밀번호" value={password} error={fieldErrors.password} action={passwordReveal}
            type={revealPassword ? "text" : "password"}
            onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }}
            placeholder="비밀번호를 적어 주세요" autoComplete="current-password"
          />
          {formError && <p className="onboarding-error" role="alert">{formError}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "찾는 중…" : "이어서 하기"} <span className="button-arrow" /></button>
          <button type="button" className="onboarding-secondary onboarding-secondary--button" onClick={() => window.location.assign("/signup")}>처음 시작하는 거예요</button>
          <TeacherReportEntry />
        </form>
      </section>
    );
  }

  if (page === "signup") {
    const steps = <div className="onboarding-steps" aria-hidden="true"><i className="is-active" /><i className={signupStep === 2 ? "is-active" : ""} /></div>;

    // 아이디·비밀번호. 다음에 다시 들어올 때 쓰는 값이라 만드는 이유를 먼저 말해 준다.
    if (signupStep === 2) {
      return (
        <section className="onboarding-scene onboarding-scene--name">
          <div className="onboarding-morami"><Morami expression="happy" /></div>
          <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); submitSignup(); }}>
            {steps}
            <span>가입 · 2/2</span>
            <h1>이제 열쇠를 만들자!</h1>
            <p>다음에 올 때 이 아이디와 비밀번호로 들어오면 돼.</p>
            <AuthInput
              id="signup-login-id" label="아이디" hint="영어와 숫자로 4~20자" value={loginId} error={fieldErrors.loginId}
              onChange={(event) => { setLoginId(event.target.value.trim()); clearFieldError("loginId"); }}
              placeholder="예: minjun01" autoComplete="username" autoCapitalize="off" spellCheck={false}
            />
            <AuthInput
              id="signup-password" label="비밀번호" hint="8자 이상" value={password} error={fieldErrors.password} action={passwordReveal}
              type={revealPassword ? "text" : "password"}
              onChange={(event) => { setPassword(event.target.value); clearFieldError("password"); }}
              placeholder="잊어버리지 않을 비밀번호" autoComplete="new-password"
            />
            {formError && <p className="onboarding-error" role="alert">{formError}</p>}
            <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "만드는 중…" : "가입하고 시작하기"} <span className="button-arrow" /></button>
            <button type="button" className="onboarding-back" onClick={() => { setSignupStep(1); setFormError(""); }}>‹ 이름 다시 적기</button>
          </form>
        </section>
      );
    }

    return (
      <section className="onboarding-scene onboarding-scene--name">
        <div className="onboarding-morami"><Morami expression="happy" /></div>
        <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); goToPasswordStep(); }}>
          {steps}
          <span>가입 · 1/2</span>
          <h1>너를 뭐라고 부를까?</h1>
          <p>이름이랑 선생님이 준 참여 번호를 알려줘.</p>
          <AuthInput
            id="signup-name" label="이름" value={name} error={fieldErrors.name}
            onChange={(event) => { setName(event.target.value.slice(0, 12)); clearFieldError("name"); }}
            placeholder="이름을 적어 주세요" autoComplete="name"
          />
          <AuthInput
            id="signup-code" label="참여 번호" hint="선생님이 알려줬어요" value={researchCode} error={fieldErrors.researchCode}
            onChange={(event) => { setResearchCode(normalizeResearchCode(event.target.value)); clearFieldError("researchCode"); }}
            placeholder="예: MORMI-A03" autoComplete="off" autoCapitalize="off" spellCheck={false}
          />
          {formError && <p className="onboarding-error" role="alert">{formError}</p>}
          <button className="primary-button" type="submit">다음 <span className="button-arrow" /></button>
          <button type="button" className="onboarding-back" onClick={() => goTo("hello")}>‹ 처음으로</button>
        </form>
      </section>
    );
  }

  return (
    <section className="onboarding-scene onboarding-scene--welcome">
      <div className="onboarding-greeting onboarding-welcome-card">
        <Image
          className="onboarding-brand"
          src="/ui/iam-sam.png"
          alt="I AM 쌤"
          width={1920}
          height={819}
          sizes="(max-width: 760px) 210px, 300px"
          priority
        />
        <p className="onboarding-slogan">이번에는 내가 선생님</p>
        {/* 가입은 아이당 한 번뿐이고 그 뒤로는 늘 로그인이다. 기본 버튼을 로그인에 준다. */}
        <div className="onboarding-greeting__actions">
          <button className="primary-button" onClick={() => goTo("login")}>로그인하기 <span className="button-arrow" /></button>
          <button type="button" className="onboarding-secondary" onClick={() => window.location.assign("/signup")}>처음 왔어요</button>
        </div>
      </div>
    </section>
  );
}

/**
 * 프로필과 계정 메뉴.
 *
 * 문제를 푸는 화면에서는 띄우지 않는다. 반복 중에 로그아웃이 눌리면 그때까지
 * 서버에 쌓던 시도 기록이 끊긴 채로 세션이 남는다.
 */
function ProfileMenu({ name, loggingOut, onLogout }: {
  name: string;
  loggingOut: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className={`profile-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="profile-avatar" aria-hidden="true">{name.slice(0, 1)}</span>
        <b>{name}</b>
        <i className="profile-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="profile-sheet" role="menu">
          {/* 계정 관리는 화면 자리만 잡아 둔다. 누를 수 있게 두면 아무 일도 안 일어나 고장으로 보인다. */}
          <button type="button" role="menuitem" className="profile-item" disabled>계정 관리<em>준비 중</em></button>
          <button
            type="button"
            role="menuitem"
            className="profile-item profile-item--logout"
            onClick={onLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "나가는 중…" : "로그아웃"}
          </button>
        </div>
      )}
    </div>
  );
}

function HomeHub({ characterName, completedSessionIds, coinBalance, onNameCharacter, onOpenSession, onCurriculum, onOutside, onOpenStarNotes }: { characterName: string; completedSessionIds: string[]; coinBalance: number; onNameCharacter: () => void; onOpenSession: (index: number) => void; onCurriculum: () => void; onOutside: () => void; onOpenStarNotes: () => void }) {
  const [starsOpen, setStarsOpen] = useState(false);
  const requiredSessions = cafeRequiredSessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session));
  const done = requiredSessions.filter((session) => completedSessionIds.includes(session.id)).length;
  const unlocked = done === requiredSessions.length;
  const nextSession = requiredSessions.find((session) => !completedSessionIds.includes(session.id));
  const level = Math.floor(completedSessionIds.length / 4) + 1;
  const stars = completedSessionIds.length * 3;

  return (
    <section className="journey-hub journey-hub--home">
      <div className="home-room-main">
        <div className="home-room-copy-column">
          <div className="player-hud" aria-label="나의 모험 정보">
            <div className="player-status-summary">
              <div className="player-stat player-stat--level" aria-label={`레벨 ${level}, 새싹 ${level}단계`}>
                <div className="player-level-sprouts" aria-hidden="true">
                  {Array.from({ length: Math.min(level, 4) }, (_, index) => <UiIcon key={index} name="sprout" size="small" />)}
                  {level > 4 && <em>+{level - 4}</em>}
                </div>
                <span><small>레벨</small><b>{level}</b></span>
              </div>
              <div className="player-wallet"><Image src="/ui/mormi-coin.png" alt="새싹 코인" width={220} height={220} unoptimized /><span><small>모은 돈</small><strong>{coinBalance.toLocaleString("ko-KR")}원</strong></span></div>
            </div>
            <button type="button" className="player-stat player-stat--star" onClick={() => setStarsOpen(true)} aria-haspopup="dialog" aria-label={`모은 별 ${stars}개, 완료한 개념 보기`}><UiIcon name="star" size="large" /><span><small>별노트</small><b>모은 별 {stars}개</b></span></button>
          </div>
          <div className="home-room-copy">
            <h1>오늘은 어떤 걸 할까?</h1>
            <div className="home-main-actions">
              <button className="home-action-card home-action-card--study" onClick={onCurriculum}>
                <span className="home-action-visual home-action-visual--house" aria-hidden="true"><UiIcon name="home" size="large" /></span>
                <b>집에서 복습하기</b>
              </button>
              <button className="home-action-card home-action-card--outside" onClick={onOutside}>
                <span className="home-action-visual home-action-visual--door" aria-hidden="true">
                  <Image src="/home/exit-door-3d-v2.png" alt="" width={1254} height={1254} unoptimized />
                </span>
                <b>외출하기</b>
              </button>
            </div>
          </div>
        </div>
        <div className="home-room-character-column">
          <div className="home-room-morami"><Morami expression={unlocked ? "celebrate" : "bright"} /></div>
          {characterName
            ? <button type="button" className="home-character-name" onClick={onNameCharacter} aria-label={`${characterName} 이름 바꾸기`}><small>이름</small><strong>{characterName}</strong><span>이름 바꾸기</span></button>
            : <button type="button" className="home-character-name home-character-name--empty" onClick={onNameCharacter}>이름 지어주기 <span className="button-arrow" /></button>}
        </div>
      </div>
      {!unlocked && nextSession && <button className="home-next-lesson" onClick={() => onOpenSession(sessions.findIndex((session) => session.id === nextSession.id))}><span>카페까지 {requiredSessions.length - done}개 남았어요</span><b>다음 필수 개념: {nextSession.title} →</b></button>}
      {starsOpen && <CollectedStarsModal completedSessionIds={completedSessionIds} onClose={() => setStarsOpen(false)} onOpenStarNotes={onOpenStarNotes} />}
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
function OutsideHub({ unlocked, cafeTheme, amusementParkTheme, cafeVisited, onCafe, onAmusementPark }: {
  unlocked: boolean;
  cafeTheme: ThemeView | null;
  amusementParkTheme: ThemeView | null;
  /** 한 번이라도 카페에 다녀왔는지. 다녀왔으면 다시 연습하러 가는 안내로 바꾼다. */
  cafeVisited: boolean;
  onCafe: () => void;
  onAmusementPark: () => void;
}) {
  const isUnlocked = cafeTheme?.unlocked ?? unlocked;
  const requiredCount = cafeTheme?.required_session_ids.length ?? cafeRequiredSessionIds.length;
  const remainingCount = cafeTheme?.remaining_session_ids.length ?? null;
  const lockedNote = remainingCount === null
    ? `필수 개념 ${requiredCount}개를 끝내야 열려요`
    : `필수 개념 ${requiredCount}개 중 ${remainingCount}개가 남았어요`;
  const parkUnlocked = amusementParkTheme?.unlocked === true;
  const parkLockedNote = amusementParkTheme
    ? "카페 미션을 모두 완료하면 열려요"
    : "놀이동산을 준비하고 있어요";
  return (
    <section className="journey-hub journey-hub--outside">
      <div className="outside-scene-head"><div><h1>우리 같이 어디 갈까?</h1></div></div>
      <div className="outside-morami-talk"><Morami expression={isUnlocked ? "happy" : "confused"} size="small" /><p>{!isUnlocked ? "집에서 카페에 필요한 개념을 모두 끝내면 같이 나갈 수 있어!" : cafeVisited ? "저번에 도와줘서 고마워! 이번에도 또 같이 가주라!" : "나 카페 혼자 가는 건 처음이라 무서운데, 같이 가 주라!"}</p></div>
      <div className="destination-grid">
        <button className={`destination-card destination-card--cafe ${isUnlocked ? "is-unlocked" : "is-locked"}`} disabled={!isUnlocked} onClick={onCafe}>
          <Image src="/scenes/cafe-bakery-cute-v4.png" alt="카페" width={1000} height={720} priority unoptimized />
          <span className="destination-shade" />
          <div><small>{isUnlocked ? "진행" : "잠김"}</small><h2>카페 가기</h2><p>{isUnlocked ? "줄을 서고, 메뉴를 골라 계산해요" : lockedNote}</p><strong>{!isUnlocked ? "집에서 복습하기 →" : cafeVisited ? "다시 연습하러 가기 →" : "들어가기 →"}</strong></div>
        </button>
        {parkUnlocked ? <button type="button" className="destination-card destination-card--cafe destination-card--amusement is-unlocked" onClick={onAmusementPark}>
          <Image src="/amusement-park/park-map.png" alt="놀이동산" width={800} height={600} unoptimized />
          <span className="destination-shade" />
          <div><small>진행</small><h2>놀이동산 가기</h2><p>표를 사고, 간식을 나누고, 자유이용권을 골라요</p><strong>출발하기 →</strong></div>
        </button> : <article className="destination-card destination-card--cafe destination-card--amusement is-locked">
          <Image src="/amusement-park/park-map.png" alt="잠긴 놀이동산" width={800} height={600} unoptimized />
          <span className="destination-shade" />
          <div><small>잠김</small><h2>놀이동산 가기</h2><p>{parkLockedNote}</p><strong>카페 먼저 완료하기</strong></div>
        </article>}
      </div>
    </section>
  );
}

export function MoramiApp() {
  const [learner, setLearner] = useState<LearnerProfile>(defaultLearner);
  const [characterName, setCharacterName] = useState("");
  const [characterNameOpen, setCharacterNameOpen] = useState(false);
  // 반복 문제의 서버 세션과 기록은 순서대로 확정한 뒤에만 가르치기 대화를 시작한다.
  const learningSessionId = useRef<string | null>(null);
  const [dictionaryLearningSessionId, setDictionaryLearningSessionId] = useState<string | null>(null);
  const learningSessionPromise = useRef<Promise<string> | null>(null);
  const attemptWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const attemptWriteError = useRef<unknown>(null);
  const attemptCounter = useRef(0);
  const [reloadDialogueScreen, setReloadDialogueScreen] = useState(readReloadDialogueScreen);
  const [reloadDialogueId, setReloadDialogueId] = useState(readReloadDialogueId);
  const previousTeachingConversationId = useRef<string | null>(null);
  const teachingStartRequest = useRef<{
    sessionId: string;
    intent: ReturnType<typeof createDialogueStartIntent>;
  } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [variantSeed, setVariantSeed] = useState(1);
  const [answerChoiceSeeds, setAnswerChoiceSeeds] = useState(() => Array.from({ length: masteryTarget }, (_, index) => index + 1));
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
        const answerChoiceSeed = answerChoiceSeeds[index] ?? seed;
        return shuffleProblemAnswers(varyProblem(problem, variationSeed), answerChoiceSeed);
      }),
    };
  }, [answerChoiceSeeds, sessionIndex, variantSeed]);
  // "onboarding" 으로 시작하면 로그인된 아이도 새로고침마다 온보딩이 잠깐 보인다.
  // 진행도를 읽을 때까지 booting 에 머물고, 로그인 상태면 아래 부팅 effect 가 홈으로 보낸다.
  const [stage, setStage] = useState<Stage>("booting");
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [expression, setExpression] = useState<Expression>("happy");
  const [dialogue, setDialogue] = useState(sessions[0].memoryDialogue);
  const [showCafeConcepts, setShowCafeConcepts] = useState(false);
  const [showAmusementConcepts, setShowAmusementConcepts] = useState(false);
  const [showOtherConcepts, setShowOtherConcepts] = useState(false);
  const soundOn = true;
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const [starNoteArchiveOpen, setStarNoteArchiveOpen] = useState(false);
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
  // 진행 중 카페 방문은 완료 여부 표시에만 쓴다. 새로고침 뒤 진입 화면은 항상 홈이다.
  const [activeCafeVisitId, setActiveCafeVisitId] = useState<string | null>(null);
  // 서버가 확정한 외출 장소 해금 상태. 못 읽으면 null 이고 로컬 규칙으로 내려간다.
  const [themes, setThemes] = useState<ThemeView[] | null>(null);
  const [coinBalance, setCoinBalance] = useState(6000);
  const startedAt = useRef(0);
  const elapsedSeconds = useRef(0);
  const teachThreadRef = useRef<HTMLDivElement>(null);
  // AI 완료 응답과 홈 이동이 거의 동시에 들어와도 같은 완료 요청을 함께 기다린다.
  // 단순 boolean 으로 막으면 두 번째 호출이 먼저 반환해 오래된 진행도를 읽을 수 있다.
  const finishRequest = useRef<Promise<void> | null>(null);
  // AI 가 가르치기 완료를 확정한 즉시 BE 완료 기록은 저장하되,
  // 별노트와 보상 화면은 아이가 기존 다음 버튼을 눌렀을 때만 연다.
  const completedLearningStage = useRef<"teachReward" | "complete" | null>(null);
  const finishNavigationRequested = useRef(false);

  const childName = learner.name;
  const characterDisplayName = characterName || "이 친구";
  const characterSubjectName = nameWithSubjectParticle(characterDisplayName);
  const namedText = useCallback((text: string) => replaceCharacterName(text, characterName), [characterName]);
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
  const amusementParkConceptSessions = useMemo(() => amusementParkRequiredSessionIds.map((id) => sessions.find((session) => session.id === id)).filter((session): session is Session => Boolean(session)), []);
  /** 다음에 할 개념 하나만 강조한다. 다섯 줄이 모두 같은 무게면 어디부터 눌러야 할지 알 수 없다. */
  const nextConceptId = cafeConceptSessions.find((session) => !completedSessionIds.includes(session.id))?.id;
  const nextAmusementConceptId = amusementParkConceptSessions.find((session) => !completedSessionIds.includes(session.id))?.id;
  const otherConceptSessions = useMemo(() => sessions.filter((session) => !outsideRequiredSessionIds.includes(session.id as (typeof outsideRequiredSessionIds)[number])), []);
  const teachingTurn = mormiConversation?.turn ?? null;
  const teachingHelpCard = visibleHelpCard(teachingTurn);
  const teachingProblem = useMemo(
    () => teachingProblemFromTurn(teachingTurn, currentDrill),
    [currentDrill, teachingTurn],
  );
  const teachingComplete = teachingTurn?.status === "completed";
  const brightExit = teachingTurn?.completion?.outcome === "bright_exit";
  const hasTeachingNote = Boolean(teachingNote) && !brightExit;
  const serverMormiText = teachingTurn?.mormi.text?.trim() ?? "";
  const hasServerMessagePanel = Boolean(serverMormiText) || Boolean(teachingHelpCard) || Boolean(teachError);

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
  const amusementParkTheme = themes?.find((theme) => theme.theme_id === "amusement_park") ?? null;

  useEffect(() => {
    // 진행도 API 응답을 기다리는 동안에도 로그인한 학습자가 지어 둔 이름을 먼저 복원한다.
    // 그렇지 않으면 저장된 이름이 있어도 첫 화면에 잠깐 "이 친구"가 보인다.
    const storedLearner = readStoredLearner();
    if (storedLearner?.id) {
      const storedCharacterName = readCharacterName(storedLearner.id);
      window.requestAnimationFrame(() => setCharacterName(storedCharacterName));
    }

    // 서버가 붙어 있으면 진행도의 기준은 서버다. localStorage 는 오프라인 표시용으로만 남긴다.
    if (apiEnabled && storedLearner) {
      void api.progress().then((snapshot) => {
        setLearner({ id: snapshot.learner_id, name: snapshot.display_name });
        const restoredCharacterName = readCharacterName(snapshot.learner_id);
        setCharacterName(restoredCharacterName);
        if (!restoredCharacterName) setCharacterNameOpen(true);
        setCompletedSessionIds(snapshot.completed_session_ids);
        setCoinBalance(snapshot.wallet_balance);
        setActiveCafeVisitId(snapshot.active_cafe_visit_id ?? null);
        refreshThemes();
        // 이름과 원문은 보내지 않고, 서버가 발급한 가명 id 로만 식별한다.
        identifyLearner(snapshot.analytics_id);

        // 새로고침은 진행 중 문제를 자동 재개하지 않고 항상 메인에서 다시 시작한다.
        // 서버 기록은 그대로 두고 FE의 첫 화면만 홈으로 고정한다.
        setStage("home");
      }).catch((error: unknown) => {
        // 토큰이 만료·삭제되었으면 온보딩부터 다시 시작한다. 그 밖의 실패도 booting 에 머물 수는 없다.
        if (!(error instanceof ApiError && (error.status === 401 || error.status === 404))) {
          console.warn("[mormi-api] 진행도 조회 실패", error);
        }
        setStage("onboarding");
      });
      return;
    }

    // 저장된 로그인이 없으면 온보딩으로. 기기에 남은 옛 진행도가 있으면 그 위에 덮어쓴다.
    // (effect 본문에서 곧바로 setState 하지 않도록 한 프레임 뒤에 정한다.)
    try {
      const saved = JSON.parse(localStorage.getItem("morami-completed-sessions") || "[]") as string[];
      const savedCoins = Number(localStorage.getItem("mormey-coins") || "6000");
      const onboarded = localStorage.getItem("morami-onboarding-complete") === "true";
      const savedLearner = JSON.parse(localStorage.getItem("mormey-learner") || "null") as LearnerProfile | null;
      window.requestAnimationFrame(() => {
        setCompletedSessionIds(saved);
        setCoinBalance(Number.isFinite(savedCoins) ? savedCoins : 6000);
        if (savedLearner?.id && savedLearner.name) {
          setLearner(savedLearner);
          const restoredCharacterName = readCharacterName(savedLearner.id);
          setCharacterName(restoredCharacterName);
          if (!restoredCharacterName) setCharacterNameOpen(true);
        }
        setStage(onboarded && savedLearner?.id && savedLearner.name ? "home" : "onboarding");
      });
    } catch {
      // 손상된 값은 무시하고 온보딩부터 다시.
      window.requestAnimationFrame(() => setStage("onboarding"));
    }
  }, [refreshThemes]);

  useEffect(() => {
    if (stage === "teach") rememberDialogueScreen("home-teach");
    else if (stage !== "cafe") {
      rememberDialogueScreen(null);
      if (stage === "home") {
        const frame = window.requestAnimationFrame(() => {
          setReloadDialogueScreen(null);
          setReloadDialogueId(null);
        });
        return () => window.cancelAnimationFrame(frame);
      }
    }
  }, [stage]);

  /** 토큰이 만료·폐기됐을 때 돌아갈 자리. 화면에 남은 남의 진행도까지 함께 비운다. */
  const returnToAuthScreen = useCallback(() => {
    setStarNoteArchiveOpen(false);
    setLearner(defaultLearner);
    setCharacterName("");
    setCharacterNameOpen(false);
    setCompletedSessionIds([]);
    setCoinBalance(6000);
    setActiveCafeVisitId(null);
    setReloadDialogueScreen(null);
    setReloadDialogueId(null);
    setStage("onboarding");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setActiveCafeVisitId, setCharacterName, setCharacterNameOpen, setCoinBalance, setCompletedSessionIds, setLearner, setReloadDialogueId, setReloadDialogueScreen, setStage, setStarNoteArchiveOpen]);

  useEffect(() => {
    // api-client 는 React 밖이라 화면을 직접 못 바꾼다. 되돌릴 경로를 여기서 등록한다.
    setUnauthorizedHandler(returnToAuthScreen);
    return () => setUnauthorizedHandler(null);
  }, [returnToAuthScreen]);

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

  const saveReport = useCallback((transfer: boolean, turnOverride?: MormiTurn | null) => {
    const reportTurn = turnOverride ?? teachingTurn;
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
      synchronized: reportTurn?.pedagogy?.hint_level !== "H0",
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
  }, [activeSession, drillAttempts, learner, sessionCoins, solvedAtLevel, teachRewardAmount, teachingTurn]);

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
    rememberDialogueId(nextConversation.conversation_id);
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
    if (nextTurn.status === "completed") {
      if (soundOn) playLearningChime();
      // 완료 표시의 기준은 AI 대화 상태가 아니라 BE 진행도다. 별노트의
      // '다음으로'를 기다리지 않고 여기서 서버 진행도를 먼저 확정한다.
      void finish(false, {
        navigate: false,
        turn: nextTurn,
        conversationId: nextConversation.conversation_id,
      });
    }
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
      if (!sessionId) {
        throw new Error("반복 학습 세션을 찾지 못했습니다.");
      }
      if (attemptWriteError.current) {
        console.warn("[mormi-api] 일부 반복 학습 기록이 누락됐지만 가르치기를 계속합니다.");
      }
      const startMode = reloadDialogueScreen === "home-teach" ? "restart" : "resume";
      const request = teachingStartRequest.current?.sessionId === sessionId
        ? teachingStartRequest.current
        : { sessionId, intent: createDialogueStartIntent(startMode) };
      teachingStartRequest.current = request;
      const nextConversation = await startHomeTeaching(sessionId, request.intent);
      if (startMode === "restart"
          && previousTeachingConversationId.current
          && nextConversation.conversation_id === previousTeachingConversationId.current) {
        throw new Error("새 가르치기 대화를 시작하지 못했어요. 다시 시도해 주세요.");
      }
      applyTeachingConversation(nextConversation);
      previousTeachingConversationId.current = nextConversation.conversation_id;
      teachingStartRequest.current = null;
      setReloadDialogueScreen(null);
      setReloadDialogueId(null);
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

  function beginTeachingWithDictionary() {
    setDictionaryOpen(true);
    void beginTeaching();
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
      setTeachError(dialogueErrorMessage(error, "응답을 보내지 못했어요. 같은 답으로 다시 시도해 주세요."));
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

  async function finish(
    transfer = homeworkSolved,
    options: { navigate?: boolean; turn?: MormiTurn | null; conversationId?: string } = {},
  ) {
    const navigate = options.navigate ?? true;
    if (navigate) finishNavigationRequested.current = true;
    if (completedLearningStage.current) {
      if (navigate) setStage(completedLearningStage.current);
      return;
    }
    if (finishRequest.current) {
      await finishRequest.current;
      if (navigate && completedLearningStage.current) setStage(completedLearningStage.current);
      return;
    }
    const completionTurn = options.turn ?? teachingTurn;
    const request = (async () => {
      setTeachError("");
      setTeachSending(true);
      try {
      const sessionId = await learningSessionPromise.current;
      await attemptWriteQueue.current;
      if (!sessionId) {
        throw new Error("반복 학습 세션을 찾지 못했습니다.");
      }
      // 개별 문제 기록은 관찰용 데이터다. 일시적인 attempt 전송 실패가 있어도
      // 아이가 끝낸 가르치기와 세션 완료까지 막으면 진행도가 영원히 미완료로 남는다.
      // BE의 complete는 멱등하므로 최종 완료는 독립적으로 재시도한다.
      if (attemptWriteError.current) {
        console.warn("[mormi-api] 일부 반복 학습 기록이 누락됐지만 세션 완료를 계속합니다.");
      }
      const completionRequest = {
        conversation_id: options.conversationId ?? mormiConversation?.conversation_id,
        transfer_solved: transfer,
        timed_out: false,
        scaffold_level: scaffoldLevel(completionTurn),
        elapsed_seconds: elapsedSeconds.current,
      };
      let result: Awaited<ReturnType<typeof api.completeSession>> | null = null;
      let completionError: unknown = null;
      for (let attempt = 0; attempt < 3 && !result; attempt += 1) {
        try {
          result = await api.completeSession(sessionId, completionRequest);
        } catch (error) {
          completionError = error;
          if (error instanceof ApiError && error.status < 500 && error.status !== 429) throw error;
          if (attempt < 2) {
            await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
          }
        }
      }
      if (!result) throw completionError ?? new Error("학습 완료를 저장하지 못했습니다.");
      const next = result.completed_session_ids;
      setCompletedSessionIds(next);
      setCoinBalance(result.wallet_balance);
      // 이 세션으로 카페가 열렸을 수 있다. 해금 판정은 서버에서 다시 받아 온다.
      refreshThemes();
      setSessionCoins(result.total_reward);
      setTeachRewardAmount(result.teach_reward);
      learningSessionId.current = null;
      setDictionaryLearningSessionId(null);
      learningSessionPromise.current = null;
      localStorage.setItem("morami-completed-sessions", JSON.stringify(next));
      localStorage.setItem("mormey-coins", String(result.wallet_balance));
      saveReport(transfer, completionTurn);

      captureMormeyEvent("session_completed", {
        session_id: activeSession.id,
        elapsed_seconds: elapsedSeconds.current,
        drill_attempts: drillAttempts,
        scaffold_level: scaffoldLevel(completionTurn),
        completed_at_home: true,
      });
      if (!isCafeUnlocked(completedSessionIds) && isCafeUnlocked(next)) {
        captureMormeyEvent("theme_unlocked", { theme: "cafe" });
      }
      if (result.teach_reward > 0) {
        captureMormeyEvent("teach_reward_earned", {
          session_id: activeSession.id,
          reward: result.teach_reward,
          scaffold_level: scaffoldLevel(completionTurn),
        });
        if (soundOn) playCoinRewardSound(200);
      }
      const nextStage = result.teach_reward > 0 ? "teachReward" : "complete";
      completedLearningStage.current = nextStage;
      if (finishNavigationRequested.current) setStage(nextStage);
      } catch (error) {
        console.error("[mormi-api] 세션 완료 실패", error);
        setTeachError("학습 결과를 저장하지 못했어요. 다시 시도해 주세요.");
      } finally {
        setTeachSending(false);
      }
    })();
    finishRequest.current = request;
    try {
      await request;
    } finally {
      if (finishRequest.current === request) finishRequest.current = null;
    }
  }

  function openSession(nextIndex: number) {
    const nextVariantSeed = randomVariantSeed();
    const nextAnswerChoiceSeeds = randomAnswerChoiceSeeds(masteryTarget);
    finishRequest.current = null;
    completedLearningStage.current = null;
    finishNavigationRequested.current = false;
    setSessionIndex(nextIndex);
    setVariantSeed(nextVariantSeed);
    setAnswerChoiceSeeds(nextAnswerChoiceSeeds);
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
    previousTeachingConversationId.current = null;
    teachingStartRequest.current = null;
    setHomeworkSolved(false);
    setHomeworkIndex(0);
    setHomeworkCorrect(0);
    startedAt.current = nowMs();
    elapsedSeconds.current = 0;

    // 서버 세션을 즉시 열고, 뒤따르는 drill 기록은 이 Promise 뒤에 순차로 붙인다.
    learningSessionId.current = null;
    setDictionaryLearningSessionId(null);
    attemptCounter.current = 0;
    attemptWriteError.current = null;
    attemptWriteQueue.current = Promise.resolve();
    learningSessionPromise.current = api.startSession(sessions[nextIndex].id, nextVariantSeed)
      .then((started) => {
        learningSessionId.current = started.learning_session_id;
        setDictionaryLearningSessionId(started.learning_session_id);
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

  /**
   * 가입·로그인 성공 뒤 공통 진입 경로.
   *
   * 진행도 조회는 화면 진입을 막지 않는다. 방금 받은 토큰으로 세션은 이미 유효하므로,
   * 조회가 실패해도 홈은 기본값으로 열고 다음 새로고침에 다시 맞춘다. 여기서 예외를
   * 올리면 계정은 만들어졌는데 가입 화면에 갇혀, 다시 누르면 아이디 중복이 뜬다.
   */
  async function enterApp(auth: AuthResponse) {
    const profile = { id: auth.id, name: auth.display_name };
    storeSession(auth.access_token, { ...profile, researchCode: auth.research_code, analyticsId: auth.analytics_id });
    setLearner(profile);
    const storedCharacterName = readCharacterName(profile.id);
    setCharacterName(storedCharacterName);
    setCharacterNameOpen(!storedCharacterName);
    identifyLearner(auth.analytics_id);
    setStage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });

    const snapshot = await api.progress().catch((error: unknown) => {
      console.warn("[mormi-api] 진행도 조회 실패", error);
      return null;
    });
    if (!snapshot) return;

    setCompletedSessionIds(snapshot.completed_session_ids);
    setCoinBalance(snapshot.wallet_balance);
    setActiveCafeVisitId(snapshot.active_cafe_visit_id ?? null);
    refreshThemes();

    // 로그인은 항상 집에서 시작한다. 서버의 진행 중 세션은 기록으로만 유지하고,
    // 아이가 로그인하자마자 이전 문제 화면으로 강제 이동시키지 않는다.
  }

  async function handleSignup(name: string, researchCode: string, loginId: string, password: string) {
    try {
      const created = await api.signup(name, researchCode, loginId, password);
      await enterApp(created);
      captureMormeyEvent("onboarding_completed", { tutorial_available: false });
      return null;
    } catch (error) {
      return toAuthFailure(error, "signup");
    }
  }

  async function handleLogin(loginId: string, password: string) {
    try {
      const restored = await api.login(loginId, password);
      if (restored.role === "educator") {
        storeEducatorSession(restored.access_token, {
          id: restored.educator.id,
          displayName: restored.educator.display_name,
          position: restored.educator.position,
          organizationId: restored.educator.organization_id,
          organizationName: restored.educator.organization_name,
        });
        window.location.assign("/teacher/cohorts");
      } else {
        await enterApp({ ...restored.learner, access_token: restored.access_token });
        captureMormeyEvent("learner_restored");
      }
      return null;
    } catch (error) {
      return toAuthFailure(error, "login");
    }
  }

  /**
   * 이 기기에서만 로그아웃한다. 다른 기기의 로그인은 그대로 살아 있다.
   *
   * 서버 정리가 실패해도 로컬 세션은 지운다. 아이가 기대하는 건 이 기기에서
   * 빠져나가는 것이지 서버 폐기의 성공 여부가 아니다. 토큰이 이미 만료됐다면
   * 그 요청은 401 로 떨어지는데, 그건 이미 폐기됐다는 뜻이라 더 할 일이 없다.
   */
  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.logout();
    } catch (error) {
      console.warn("[mormi-api] 로그아웃 요청 실패", error);
    }
    clearSession();
    captureMormeyEvent("logged_out");
    returnToAuthScreen();
    setLoggingOut(false);
  }

  function saveCharacterName(name: string) {
    const savedName = storeCharacterName(learner.id, name);
    setCharacterName(savedName);
    setCharacterNameOpen(false);
  }

  async function syncHomeProgress() {
    // 완료 저장이 이미 진행 중이면 끝까지 기다린 뒤 서버 진행도를 읽는다.
    // 이 순서가 없으면 complete와 progress가 경합해 이전 2/4 상태가 다시 표시된다.
    if (teachingComplete && !completedLearningStage.current) {
      await finish(false, { navigate: false, turn: teachingTurn });
    }
    if (!apiEnabled) return;
    try {
      const snapshot = await api.progress();
      setCompletedSessionIds(snapshot.completed_session_ids);
      setCoinBalance(snapshot.wallet_balance);
    } catch (error) {
      console.warn("[mormi-api] 홈 진행도 동기화 실패", error);
    }
  }

  function showHome() {
    captureMormeyEvent("home_opened");
    setStage("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
    // 완료 화면에서 바로 집으로 나가도 마지막 세션 저장을 한 번 더 보장한다.
    // complete는 서버 멱등 API라 중복 호출되어도 보상과 진행도는 한 번만 반영된다.
    void syncHomeProgress();
  }

  function showOutside() {
    captureMormeyEvent("outside_opened", { cafe_unlocked: isCafeUnlocked(completedSessionIds) });
    refreshThemes();
    setStage("outside");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeCafeAndShowHome() {
    refreshThemes();
    showHome();
  }

  function showArea(areaId: string) {
    setSelectedAreaId(areaId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showAreaList() {
    setSelectedAreaId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const completedAfterLesson = completedSessionIds.includes(activeSession.id) ? completedSessionIds : [...completedSessionIds, activeSession.id];
  const cafeUnlockedAfterLesson = isCafeUnlocked(completedAfterLesson);
  const cafeReadyCountAfterLesson = cafeRequiredSessionIds.filter((id) => completedAfterLesson.includes(id)).length;

  return (
    <CharacterNameProvider name={characterName}>
    <main className={`app-shell app-shell--${stage}`}>
      {stage !== "booting" && stage !== "onboarding" && stage !== "cafe" && stage !== "amusement" && stage !== "teach" && <header className="topbar topbar--without-brand">
        {/* 외출은 홈의 문에서 시작한다. 다른 화면에서는 집으로 돌아가는 길만 보여준다. */}
        {learningStage ? <div className="progress-dots" aria-label={`학습 ${currentStep + 1}단계`}>
          {stageLabels.slice(0, 3).map((label, index) => <span key={label} className={index <= currentStep ? "is-active" : ""}><i />{label}</span>)}
        </div> : <div className="topbar-lead">
          {stage !== "home" && stage !== "complete" && <button type="button" className="home-return-control" onClick={showHome} aria-label="집으로 돌아가기">
            <UiIcon name="home" size="medium" /><span>집으로 돌아가기</span>
          </button>}
        </div>}
        <div className="top-actions">
          {!learningStage && <ProfileMenu name={childName} loggingOut={loggingOut} onLogout={() => { void handleLogout(); }} />}
          {learningStage && <button className="curriculum-link" onClick={showHome}>집으로</button>}
        </div>
      </header>}

      {stage === "booting" && (
        <section className="boot-scene" aria-busy="true" aria-live="polite">
          {/* 빠른 응답이면 아무것도 깜빡이지 않도록, 안내는 CSS 에서 잠깐 뒤에 나타난다. */}
          <div className="boot-card"><UiIcon name="sprout" size="large" /><h2>{characterName && <>{characterSubjectName} </>}준비하고 있어!</h2><p>메인 화면으로 데려다 줄게.</p></div>
        </section>
      )}

      {stage === "onboarding" && <Onboarding onSignup={handleSignup} onLogin={handleLogin} />}

      {stage === "home" && <HomeHub characterName={characterName} completedSessionIds={completedSessionIds} coinBalance={coinBalance} onNameCharacter={() => setCharacterNameOpen(true)} onOpenSession={openSession} onCurriculum={showCurriculum} onOutside={showOutside} onOpenStarNotes={() => setStarNoteArchiveOpen(true)} />}

      {stage === "outside" && <OutsideHub unlocked={isCafeUnlocked(completedSessionIds)} cafeTheme={cafeTheme} amusementParkTheme={amusementParkTheme} cafeVisited={activeCafeVisitId !== null} onCafe={() => setStage("cafe")} onAmusementPark={() => setStage("amusement")} />}

      {/* 완료 뒤에도 activeCafeVisitId 를 비우지 않는다. 같은 방문으로 다시 들어가야
          네 스테이지가 모두 열린 연습 모드로 돌아온다. */}
      {stage === "cafe" && <CafeJourney
        learnerName={childName}
        learnerId={learner.id}
        coinBalance={coinBalance}
        activeVisitId={activeCafeVisitId}
        reloadDialogueStage={cafeStageFromRememberedScreen(reloadDialogueScreen)}
        reloadConversationId={reloadDialogueId}
        onReloadRestarted={() => {
          setReloadDialogueScreen(null);
          setReloadDialogueId(null);
        }}
        onBack={showOutside}
        onComplete={completeCafeAndShowHome}
      />}

      {stage === "amusement" && <AmusementPark onExit={showOutside} />}

      {stage === "curriculum" && (
        <section className="curriculum-home curriculum-home--room">
          {!selectedArea ? (
            <>
              <div className="room-list-heading room-list-heading--curriculum"><h1>집에서 복습하기</h1></div>
              <section className="cafe-required-lessons">
                <div><strong><UiIcon name="cafe" size="small" /> 카페 필수 개념</strong><span>{cafeConceptSessions.filter((session) => completedSessionIds.includes(session.id)).length}/{cafeConceptSessions.length} 완료 <button type="button" className="required-lessons-toggle" onClick={() => setShowCafeConcepts((current) => !current)} aria-expanded={showCafeConcepts} aria-controls="cafe-required-concepts">{showCafeConcepts ? "접기" : "펼치기"}<i className="required-lessons-chevron" aria-hidden="true" /></button></span></div>
                <div id="cafe-required-concepts" className="required-lessons-list" hidden={!showCafeConcepts}>
                  {cafeConceptSessions.map((session) => <button key={session.id} className={`${completedSessionIds.includes(session.id) ? "is-complete" : ""}${session.id === nextConceptId ? " is-next" : ""}`.trim()} onClick={() => openSession(sessions.findIndex((candidate) => candidate.id === session.id))}><i>{completedSessionIds.includes(session.id) ? "✓" : cafeConceptSessions.indexOf(session) + 1}</i><span><b>{cafeRequiredConceptTitles[session.id as keyof typeof cafeRequiredConceptTitles]}</b></span><em>{completedSessionIds.includes(session.id) ? "완료" : "연습하기"}</em></button>)}
                </div>
              </section>
              <section className="cafe-required-lessons amusement-required-lessons">
                <div><strong><span aria-hidden="true">🎡</span> 놀이동산 필수 개념</strong><span>{amusementParkConceptSessions.filter((session) => completedSessionIds.includes(session.id)).length}/{amusementParkConceptSessions.length} 완료 <button type="button" className="required-lessons-toggle" onClick={() => setShowAmusementConcepts((current) => !current)} aria-expanded={showAmusementConcepts} aria-controls="amusement-required-concepts">{showAmusementConcepts ? "접기" : "펼치기"}<i className="required-lessons-chevron" aria-hidden="true" /></button></span></div>
                <div id="amusement-required-concepts" className="required-lessons-list" hidden={!showAmusementConcepts}>
                  {amusementParkConceptSessions.map((session) => <button key={session.id} className={`${completedSessionIds.includes(session.id) ? "is-complete" : ""}${session.id === nextAmusementConceptId ? " is-next" : ""}`.trim()} onClick={() => openSession(sessions.findIndex((candidate) => candidate.id === session.id))}><i>{completedSessionIds.includes(session.id) ? "✓" : amusementParkConceptSessions.indexOf(session) + 1}</i><span><b>{amusementParkRequiredConceptTitles[session.id as keyof typeof amusementParkRequiredConceptTitles]}</b></span><em>{completedSessionIds.includes(session.id) ? "완료" : "연습하기"}</em></button>)}
                </div>
              </section>
              <button className="other-concepts-toggle" onClick={() => setShowOtherConcepts((current) => !current)} aria-expanded={showOtherConcepts}>{showOtherConcepts ? "다른 개념 접기" : `다른 개념 더보기 (${otherConceptSessions.length})`}<i className="required-lessons-chevron" aria-hidden="true" /></button>
              {showOtherConcepts && <div className="room-area-list other-concepts-list">
                {mathAreas.map((area) => {
                  const areaSessions = area.sessionIds.filter((id) => !outsideRequiredSessionIds.includes(id as (typeof outsideRequiredSessionIds)[number]));
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
                {selectedAreaSessions.filter((session) => !outsideRequiredSessionIds.includes(session.id as (typeof outsideRequiredSessionIds)[number])).map((session, index, visibleSessions) => <div className="curriculum-path-row" key={session.id}>{(index === 0 || visibleSessions[index - 1]?.unit !== session.unit) && <div className="curriculum-unit-marker"><span>{session.unit}</span><i>STAGE {index + 1}</i></div>}<CurriculumCourseButton session={session} index={sessions.findIndex((candidate) => candidate.id === session.id)} completed={completedSessionIds.includes(session.id)} cafeRequired={false} onOpen={openSession} /></div>)}
              </div>
            </div>
          )}
        </section>
      )}

      {stage === "drill" && (
        <section className="scene scene--drill">
          <div className="drill-board drill-board--solo">
            {mastered ? (
              <div className="mastery-card">
                <div className="mastery-stars" aria-label="별 5개"><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /><UiIcon name="star" size="large" /></div>
                <h2>5번 반복학습 끝!</h2>
                <div className="mastery-coin-total"><Image src="/cafe-money/100.png" alt="세션에서 얻은 돈" width={74} height={74} unoptimized /><span>반복학습 보상</span><strong>+{sessionCoins.toLocaleString("ko-KR")}원</strong></div>
                <p>이제 {characterSubjectName} 찾아올 거야.<br />방금 익힌 걸 {characterDisplayName}에게 가르쳐 줘.</p>
                <button className="primary-button" onClick={beginTeachingWithDictionary}>{characterDisplayName} 가르치기 <span className="button-arrow" /></button>
              </div>
            ) : (
              <div className="practice-card">
                {coinReward !== null && <div className={`coin-reward-effect coin-reward-effect--${coinReward}`} key={`${drillIndex}-${coinReward}`}><i /><i /><i /><Image src="/cafe-money/100.png" alt="획득한 돈" width={120} height={120} unoptimized /><strong>+{coinReward}원!</strong><span>{coinReward === 200 ? "한 번에 정답!" : coinReward === 150 ? "한 번 더 생각해서 성공!" : coinReward === 100 ? "두 번 다시 생각해서 성공!" : "끝까지 포기하지 않았어!"}</span></div>}
                {/* 질문은 카드 안에 한 번만 둔다. 카드 밖에 또 두면 시선이 카드 안에 머물러 위쪽 질문을 지나친다. */}
                <header className="practice-card__head">
                  <div>
                    <p className="eyebrow">{activeSession.unit} 탐험 · {Math.min(drillCorrect + 1, masteryTarget)}/{masteryTarget}</p>
                    <h1>{currentDrill.prompt}</h1>
                  </div>
                  <div className="seed-meter" aria-label={`${drillCorrect}개 익힘`}>
                    {Array.from({ length: masteryTarget }, (_, index) => <span key={index} className={index < drillCorrect ? "filled" : ""}>{index < drillCorrect ? <UiIcon name="sprout" size="small" /> : <i className="seed-empty" />}</span>)}
                  </div>
                </header>
                <div className="practice-card__visual"><ProblemCard problem={currentDrill} /></div>
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
          <section className="learning-focus-panel learning-focus-panel--teaching">
            <div className="chat-title teaching-toolbar">
              <button className="teaching-back" onClick={() => { setStage("drill"); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label="이전 반복학습 화면으로 돌아가기"><span>←</span> 이전으로</button>
              <button className="dictionary-pill" onClick={() => setDictionaryOpen(true)} aria-label="궁금해 사전 열기"><UiIcon name="book" size="small" /> 궁금해 사전</button>
            </div>
            <div className="chat-window teaching-stage">
            {/* 아이는 모르미의 질문을 먼저 읽고 그 다음에 문제를 본다: 말풍선이 위, 문제와 답이 아래. */}
            {hasServerMessagePanel && !teachingComplete && (
              <div className="teaching-talk">
                <div className="teaching-morami"><Morami expression="confused" /></div>
                <div className="teaching-dialogue" ref={teachThreadRef} role="log" aria-label={`${characterDisplayName}와 ${childName}의 대화`} aria-live="polite">
                  {serverMormiText && <div><b>{characterDisplayName}</b><p>{formatTeachingDisplayText(namedText(serverMormiText))}</p></div>}
                  {teachHelpLoading && <p className="teaching-help-loading" role="status">{characterSubjectName} 도움 카드를 찾고 있어요…</p>}
                  <MormiHelpCard card={teachingHelpCard} />
                  {teachError && <p role="alert">{namedText(teachError)}</p>}
                  {teachingTurn && !teachingComplete && teachingTurn.input.kind !== "none" && <button type="button" className={`teaching-dont-know ${teachHelpLoading ? "is-loading" : ""}`} disabled={teachSending} aria-busy={teachHelpLoading} onClick={() => void submitTeachingResponse("no_response")}>{teachHelpLoading ? "도움 찾는 중…" : "잘 모르겠어"}</button>}
                </div>
              </div>
            )}
            <div className={`teaching-playground teaching-playground--${teachingTurn?.input.kind ?? "loading"}`}>
              {/* 문제 문구는 모르미 말풍선이 이미 물어보고 있다. 위에 같은 질문을 또 띄우면 아이가 두 번 읽는다. */}
              {teachingProblem && <article className={`teaching-problem teaching-problem--${teachingProblem.visual.type}`}>
                <ProblemCard problem={teachingProblem} />
              </article>}
              {!teachingTurn && teachSending && <div className="learned-card"><UiIcon name="sprout" size="large" /><h2>{characterSubjectName} 준비하고 있어!</h2><p>반복 학습 기록을 확인하는 중이야.</p></div>}
              {!teachingTurn && !teachSending && teachError && <div className="learned-card"><UiIcon name="refresh" size="large" /><h2>가르치기를 다시 준비할게</h2><p>{namedText(teachError)}</p><button className="primary-button" onClick={() => void beginTeaching()}>다시 시도하기 <span className="button-arrow" /></button></div>}
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
                    <div className="teaching-choice-list">{teachingTurn.input.choices.map((choice) => <button type="button" className={teachChoiceIds.includes(choice.id) ? "is-selected" : ""} key={choice.id} disabled={teachSending || Boolean(choice.disabled)} onClick={() => setTeachChoiceIds((selected) => selected.includes(choice.id) ? [] : [choice.id])}><MormiChoiceContent choice={{ ...choice, label: readableChoice(choice.label) }} /></button>)}</div>
                    <button className="send-teach-button" disabled={teachChoiceIds.length === 0 || teachSending} onClick={() => void submitTeachingResponse("choice", { choice_ids: teachChoiceIds })}>{teachingTurn.input.submit_label ?? "선택하기"}</button>
                  </div>}
                  {teachingTurn.input.kind === "fill" && <div className="teaching-choice-pair">
                    {typeof teachingTurn.input.config.sentence === "string" && teachingProblem?.visual.type !== "money" && <p>{formatTeachingDisplayText(teachingTurn.input.config.sentence)}</p>}
                    <div className="teaching-choice-list">{teachingTurn.input.choices.map((choice) => <button type="button" className={teachChoiceIds.includes(choice.id) ? "is-selected" : ""} key={choice.id} disabled={teachSending || Boolean(choice.disabled)} onClick={() => { setTeachChoiceIds([choice.id]); setTeachFillValues({ [teachingTurn.input.target_slots[0] ?? "answer"]: choice.label }); }}><MormiChoiceContent choice={{ ...choice, label: readableChoice(choice.label) }} /></button>)}</div>
                    <button className="send-teach-button" disabled={Object.keys(teachFillValues).length === 0 || teachSending} onClick={() => void submitTeachingResponse("fill", { choice_ids: teachChoiceIds, values: teachFillValues })}>{teachingTurn.input.submit_label ?? "완료"}</button>
                  </div>}
                  {(teachingTurn.input.kind === "joint" || teachingTurn.input.kind === "button") && <div className="model-teaching">
                    {typeof teachingTurn.input.config.text === "string" && <div className="model-teaching__reading">
                      <span>같이 읽어 볼 문장</span>
                      <p>{teachingTurn.input.config.text}</p>
                    </div>}
                    <button className="send-teach-button" disabled={teachSending} onClick={() => void submitTeachingResponse("action", { values: completionValues(teachingTurn) })}>{teachingTurn.input.submit_label ?? "다음"}</button>
                  </div>}
                </div>
              )}
              {teachingComplete && (
                <div className="learned-card learned-card--reveal">
                  <UiIcon name={brightExit ? "sun" : "star"} size="large" />
                  <h2>{brightExit ? "오늘의 배움을 챙겼어!" : `${characterSubjectName} 이해했어!`}</h2>
                  <p>{namedText(teachingTurn.mormi.text)}</p>
                  <button className="primary-button" onClick={goWrap} disabled={teachSending}>{hasTeachingNote ? "다음으로" : "오늘 마치기"} <span className="button-arrow" /></button>
                </div>
              )}
            </div>
            </div>
          </section>
        </section>
      )}

      {stage === "teachReward" && (
        <section className="teach-reward-scene">
          <div className="teach-reward-morami"><Morami expression="celebrate" /></div>
          <div className="teach-reward-copy">
            <div className="teach-reward-dialogue"><b>{characterDisplayName}</b><p>{childName}, 알려줘서 고마워~!</p></div>
            <h1>{characterDisplayName}를 도와줘서<br /><em>{teachRewardAmount.toLocaleString("ko-KR")}원을 받았어요!</em></h1>
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
            {hasTeachingNote && teachingNote && <StarNote text={teachingNote.text} />}
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
            <h1>{characterDisplayName}와<br /><em>오늘도 해냈어!</em></h1>
            <div className="session-coin-earned"><Image src="/cafe-money/100.png" alt="이번 세션 보상" width={90} height={90} unoptimized /><div><span>반복학습 + {characterDisplayName} 가르치기</span><strong>+{sessionCoins.toLocaleString("ko-KR")}원을 얻었어!</strong></div></div>
            <div className="today-badges" aria-label="오늘의 학습 결과">
              <span><UiIcon name="sprout" size="small" /><strong>{masteryTarget}번</strong><small>{activeSession.title} 연습</small></span>
              <span><UiIcon name="star" size="small" /><strong>{hasTeachingNote ? 1 : 0}개</strong><small>별노트</small></span>
              <span><UiIcon name="bag" size="small" /><strong>{cafeReadyCountAfterLesson}/{cafeRequiredSessionIds.length}</strong><small>카페 준비</small></span>
            </div>
            <button className="primary-button complete-exit-button" onClick={cafeUnlockedAfterLesson ? showOutside : showHome}>나가기 <span className="button-arrow" /></button>
          </div>
        </section>
      )}

      {dictionaryOpen && <DictionaryModal
        conversationId={stage === "teach" || stage === "teachReward" || stage === "wrap" ? mormiConversation?.conversation_id : null}
        learningSessionId={dictionaryLearningSessionId}
        expectedContentVersion={mormiConversation?.turn.dictionary_ref?.content_version}
        onClose={() => setDictionaryOpen(false)}
      />}
      {starNoteArchiveOpen && <StarNoteArchiveModal learnerId={learner.id} onClose={() => setStarNoteArchiveOpen(false)} />}
      {characterNameOpen && <CharacterNameModal initialName={characterName} onSave={saveCharacterName} onClose={() => setCharacterNameOpen(false)} />}
    </main>
    </CharacterNameProvider>
  );
}
