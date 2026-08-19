"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import type { DiagnosticReportDto } from "../api-client";
import { buildNumericLiveReport, type NumericPreviewDomain, type NumericPreviewStatus } from "./numeric-report-live-model";
import type { DiagnosticSpeechState } from "./diagnostic-report-interactions";
import { canMoveToNextWeek, canMoveToPreviousWeek, formatKoreanWeekLabel } from "./weekly-report-period";

type PreviewMode = "HOME" | "LIFE";
type PreviewStatus = NumericPreviewStatus;
type PreviewDomain = NumericPreviewDomain;

const statusLabels: Record<PreviewStatus, string> = { good: "양호", growing: "발달 중", review: "확인 필요", collecting: "기록 모으는 중" };
const modeLabels: Record<PreviewMode, string> = { HOME: "집 · 개념", LIFE: "실생활 · 응용" };
const exampleDomains: Record<PreviewMode, readonly PreviewDomain[]> = {
  HOME: [
    { id: "money-count", label: "돈 세기", status: "good", metrics: [["정답률", "64%", "86%"], ["정답까지 평균", "2.4회", "1.3회"], ["혼자 말하기", "20%", "60%"]], sessionRows: [["반복학습 정답률", "64%", "86%"], ["정답까지 평균", "2.4회", "1.3회"], ["혼자 말하기", "20%", "60%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "20/35/25/15/5%", "60/20/20/0/0%"]], historyCount: 18, recentCount: 6, headline: "돈 세기 정답이 더 안정됐어요", dominantStage: "L4", changeReason: "최근 정답률은 높아지고, 정답까지 필요한 시도는 줄었어요.", thinkingChange: "답만 말하던 모습에서 동전의 종류와 개수를 나누어 설명하는 모습으로 바뀌었어요.", nextCheck: "동전의 단위를 혼자 말할 수 있는지 확인해 주세요.", pastUtterance: "500원이에요.", recentUtterance: "100원짜리 네 개와 500원짜리 한 개를 더하면 900원이에요.", repeatCount: 3, ladderStart: "L2", ladderRule: "두 번 연속 혼자 설명하면 L3로 높이고, 막히면 L1 도움을 제공합니다." },
    { id: "price-add", label: "가격 더하기", status: "growing", metrics: [["정답률", "58%", "76%"], ["정답까지 평균", "2.7회", "1.7회"], ["혼자 말하기", "30%", "50%"]], sessionRows: [["반복학습 정답률", "58%", "76%"], ["정답까지 평균", "2.7회", "1.7회"], ["혼자 말하기", "30%", "50%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "30/25/25/15/5%", "50/25/20/5/0%"]], historyCount: 15, recentCount: 5, headline: "가격을 더하는 순서가 잡히고 있어요", dominantStage: "L3", changeReason: "최근에는 가격을 더한 답이 더 자주 맞고, 다시 시도하는 횟수도 줄었어요.", thinkingChange: "큰 금액이라고만 말하던 모습에서 두 가격을 더한 식을 말하는 모습으로 바뀌었어요.", nextCheck: "받아올림이 있는 가격도 순서대로 더하는지 확인해 주세요.", pastUtterance: "둘 다 사면 많이 나와요.", recentUtterance: "2,000원과 1,500원을 더해서 3,500원이에요.", repeatCount: 3, ladderStart: "L2", ladderRule: "식과 답을 두 번 혼자 말하면 L3로 높이고, 순서가 섞이면 L1으로 낮춥니다." },
    { id: "money-budget", label: "예산과 거스름돈", status: "review", metrics: [["정답률", "44%", "62%"], ["정답까지 평균", "3.1회", "2.2회"], ["혼자 말하기", "10%", "30%"]], sessionRows: [["반복학습 정답률", "44%", "62%"], ["정답까지 평균", "3.1회", "2.2회"], ["혼자 말하기", "10%", "30%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "10/25/30/25/10%", "30/30/25/10/5%"]], historyCount: 12, recentCount: 4, headline: "거스름돈 계산은 조금 더 확인이 필요해요", dominantStage: "L2", changeReason: "최근 수치는 좋아졌지만, 여러 계산이 이어질 때는 아직 도움이 필요해요.", thinkingChange: "남은 돈을 바로 말하던 모습에서 낸 돈과 가격을 구분하기 시작했어요.", nextCheck: "거스름돈을 구하는 식을 먼저 말하는지 확인해 주세요.", pastUtterance: "남은 돈은 잘 모르겠어요.", recentUtterance: "5,000원에서 3,200원을 빼요.", repeatCount: 4, ladderStart: "L1", ladderRule: "식을 먼저 고르면 L2로 높이고, 지불액과 가격을 섞으면 L0 도움을 제공합니다." },
  ],
  LIFE: [
    { id: "menu-calculate", label: "메뉴 값 계산", status: "good", metrics: [["정답률", "58%", "78%"], ["정답까지 평균", "2.8회", "1.6회"], ["혼자 말하기", "10%", "40%"]], sessionRows: [["실생활 정답률", "58%", "78%"], ["정답까지 평균", "2.8회", "1.6회"], ["혼자 말하기", "10%", "40%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "10/30/30/20/10%", "40/30/20/10/0%"]], historyCount: 10, recentCount: 4, headline: "메뉴 가격을 생활 문제에 적용하고 있어요", dominantStage: "L3", changeReason: "최근에는 생활 문제 정답률이 높아지고, 필요한 시도도 줄었어요.", thinkingChange: "답만 고르던 모습에서 메뉴 가격을 나누어 말하는 모습으로 바뀌었어요.", nextCheck: "두 메뉴의 가격을 먼저 찾아 합치는지 확인해 주세요.", pastUtterance: "이게 더 비싸요.", recentUtterance: "우유와 빵 가격을 더하면 돼요.", repeatCount: 3, ladderStart: "L2", ladderRule: "가격을 혼자 찾으면 L3로 높이고, 메뉴 선택에서 막히면 L1 도움을 제공합니다." },
    { id: "change-receive", label: "거스름돈 받기", status: "growing", metrics: [["정답률", "45%", "68%"], ["정답까지 평균", "3.0회", "2.0회"], ["혼자 말하기", "10%", "30%"]], sessionRows: [["실생활 정답률", "45%", "68%"], ["정답까지 평균", "3.0회", "2.0회"], ["혼자 말하기", "10%", "30%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "10/30/30/20/10%", "30/30/20/15/5%"]], historyCount: 8, recentCount: 3, headline: "거스름돈 계산 방법을 말하기 시작했어요", dominantStage: "L2", changeReason: "맞힌 비율은 높아졌지만, 계산 순서를 혼자 말하는 연습이 더 필요해요.", thinkingChange: "답을 미루던 모습에서 낸 돈에서 가격을 빼는 방법을 말하는 모습으로 바뀌었어요.", nextCheck: "계산 전후의 금액을 각각 말하는지 확인해 주세요.", pastUtterance: "잘 모르겠어요.", recentUtterance: "5,000원에서 가격을 빼요.", repeatCount: 4, ladderStart: "L1", ladderRule: "뺄셈 순서를 말하면 L2로 높이고, 금액을 섞으면 L0 도움을 제공합니다." },
    { id: "queue", label: "줄 서기", status: "collecting", metrics: [["정답률", "—", "85%"], ["정답까지 평균", "—", "1.5회"], ["혼자 말하기", "—", "40%"]], sessionRows: [["실생활 정답률", "—", "85%"], ["정답까지 평균", "—", "1.5회"], ["혼자 말하기", "—", "40%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "—", "40/30/20/10/0%"]], historyCount: 3, recentCount: 3, headline: "줄을 비교하는 기록을 모으고 있어요", dominantStage: "L3", changeReason: "최근 기록은 좋지만, 과거와 비교할 만큼의 기록이 아직 부족해요.", thinkingChange: "두 줄의 사람 수를 비교해 더 짧은 줄을 말하기 시작했어요.", nextCheck: "두 수를 어떤 방법으로 비교했는지 말하는지 확인해 주세요.", pastUtterance: "비교할 과거 발화 기록을 모으는 중이에요.", recentUtterance: "왼쪽 줄이 두 명이라 더 짧아요.", repeatCount: 2, ladderStart: "L2", ladderRule: "비교 이유를 혼자 말하면 L3로 높이고, 수 세기에서 막히면 L1 도움을 제공합니다." },
  ],
};

type NumericReportPreviewProps = {
  report?: DiagnosticReportDto;
  refreshing?: boolean;
  notice?: string;
  onPreviousWeek?: () => void;
  onNextWeek?: () => void;
  onRetry?: () => void;
  speechByDomain?: Record<string, DiagnosticSpeechState>;
  onRequestSpeech?: (domainId: string) => void;
};

function WeeklyReportNav({
  report,
  refreshing = false,
  notice,
  onRetry,
  onPreviousWeek,
  onNextWeek,
}: Pick<NumericReportPreviewProps, "report" | "refreshing" | "notice" | "onRetry" | "onPreviousWeek" | "onNextWeek">) {
  if (!report) return null;
  return (
    <nav className="weekly-report-nav" aria-label="리포트 주차 선택">
      <button type="button" aria-label="이전 주 리포트" disabled={!canMoveToPreviousWeek(report.period) || refreshing} onClick={onPreviousWeek}>‹</button>
      <span aria-label={`${report.period.week_start}부터 ${report.period.week_end}까지`}>
        {formatKoreanWeekLabel(report.period.week_start)}
      </span>
      <button type="button" aria-label="다음 주 리포트" disabled={!canMoveToNextWeek(report.period) || refreshing} onClick={onNextWeek}>›</button>
      {refreshing && <small aria-live="polite">새로 불러오는 중…</small>}
      {notice && <small className="weekly-report-nav__notice" role="alert">{notice}</small>}
      {notice && onRetry && <button className="weekly-report-nav__retry" type="button" onClick={onRetry}>다시 불러오기</button>}
    </nav>
  );
}

export function NumericReportPreview({
  report,
  refreshing,
  notice,
  onPreviousWeek,
  onNextWeek,
  onRetry,
  speechByDomain,
  onRequestSpeech,
}: NumericReportPreviewProps) {
  const liveModel = report ? buildNumericLiveReport(report) : null;
  const previewDomains = liveModel?.domains ?? exampleDomains;
  const initialMode: PreviewMode = previewDomains.HOME.length > 0 ? "HOME" : "LIFE";
  const [mode, setMode] = useState<PreviewMode>(initialMode);
  const activeMode = previewDomains[mode].length > 0 ? mode : initialMode;
  const [selectedDomainId, setSelectedDomainId] = useState(previewDomains[initialMode][0]?.id ?? "money-count");
  const evidenceDetailsRef = useRef<HTMLDetailsElement>(null);
  const lastAutoRequestedDomainRef = useRef<string | null>(null);
  const domains = previewDomains[activeMode];
  const selectedDomain = domains.find((domain) => domain.id === selectedDomainId) ?? domains[0];
  const selectedDomainKey = selectedDomain?.id;
  useEffect(() => {
    if (!selectedDomainKey || !evidenceDetailsRef.current?.open || lastAutoRequestedDomainRef.current === selectedDomainKey) return;
    lastAutoRequestedDomainRef.current = selectedDomainKey;
    onRequestSpeech?.(selectedDomainKey);
  }, [onRequestSpeech, selectedDomainKey]);
  const selectMode = (nextMode: PreviewMode) => {
    if (previewDomains[nextMode].length === 0) return;
    setMode(nextMode);
    setSelectedDomainId(previewDomains[nextMode][0].id);
  };

  if (!selectedDomain) {
    return <main className="report-page numeric-preview-page">
      <header className="report-header"><div><Link className="report-brand" href="/">모르미</Link><span>교사용 리포트</span></div><Link className="back-to-child" href="/"><span aria-hidden="true">←</span> 학습 화면</Link></header>
      <WeeklyReportNav report={report} refreshing={refreshing} notice={notice} onRetry={onRetry} onPreviousWeek={onPreviousWeek} onNextWeek={onNextWeek} />
      <article className="report-paper numeric-preview" data-report-format="a4"><section className="numeric-preview__section numeric-empty-report" role="status"><h2>이번 주에 완료한 단원이 없습니다</h2></section></article>
    </main>;
  }

  const recentMetrics = Object.fromEntries(selectedDomain.metrics.map(([label, , recent]) => [label, recent]));
  const summaryValues = liveModel
    ? [
      ["완료 단원", liveModel.weeklySummary.completedUnits, "이번 주 완료"],
      ["반복학습", liveModel.weeklySummary.drillAttempts, "기록"],
      ["모르미 가르치기", liveModel.weeklySummary.teachConversations, "기록"],
      ["실생활 수행", liveModel.weeklySummary.lifeVisits, "방문"],
    ]
    : [
      ["정답률", recentMetrics["정답률"], "최근 기록"],
      ["정답까지", recentMetrics["정답까지 평균"], "평균 시도"],
      ["모르미 가르치기", recentMetrics["모르미 가르치기"] ?? recentMetrics["혼자 말하기"], "단독 발화"],
      ["주로 사용", selectedDomain.dominantStage, "발화 단계"],
    ];
  const rawLadder = selectedDomain.sessionRows.at(-1)?.[2] ?? "—";
  const ladderValues = rawLadder === "—" ? [] : rawLadder.split("/").map((value) => value.endsWith("%") ? value : `${value}%`);
  const ladderPlanLabel = selectedDomain.ladderStart === "기록 필요" ? "발화 기록 먼저" : `${selectedDomain.ladderStart}부터 시작`;
  const ladderPlanDetail = selectedDomain.ladderStart === "기록 필요"
    ? "아이의 답을 한 번 기록한 뒤 알맞은 시작 단계를 정합니다."
    : `${selectedDomain.ladderStart}에서 아이가 자신의 말로 답해보도록 기다립니다.`;
  const speech = speechByDomain?.[selectedDomain.id];

  return <main className="report-page numeric-preview-page">
    <header className="report-header"><div><Link className="report-brand" href="/">모르미</Link><span>교사용 리포트</span></div><Link className="back-to-child" href="/"><span aria-hidden="true">←</span> 학습 화면</Link></header>
    <WeeklyReportNav report={report} refreshing={refreshing} notice={notice} onRetry={onRetry} onPreviousWeek={onPreviousWeek} onNextWeek={onNextWeek} />
    <article className="report-paper numeric-preview" data-report-format="a4">
      <header className="numeric-preview__header"><div><span>학습자</span><strong>{liveModel?.learnerName ?? "김민준"}</strong></div><p className="numeric-preview__document-title">개인 진단 리포트</p><a href="#numeric-next-plan">다음 학습 제안 <span aria-hidden="true">↓</span></a></header>
      <section className="numeric-preview__section numeric-current" aria-labelledby="numeric-summary-title"><div className="numeric-section-heading"><span>01</span><h2 id="numeric-summary-title">현재 상태</h2></div><div className="numeric-current-story"><div className="numeric-current-story__mark" aria-hidden="true">↗</div><div><span>{selectedDomain.label} · {statusLabels[selectedDomain.status]}</span><strong>{selectedDomain.headline}</strong><p>{selectedDomain.changeReason}</p></div></div><div className="numeric-summary-values">{summaryValues.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div></section>
      <section className="numeric-preview__section" aria-labelledby="numeric-trend-title">
        <div className="numeric-section-heading"><span>02</span><h2 id="numeric-trend-title">단원별 결과</h2><div className="numeric-preview-tabs" role="tablist" aria-label="학습 환경 선택">{(Object.keys(modeLabels) as PreviewMode[]).filter((item) => previewDomains[item].length > 0).map((item) => <button key={item} type="button" role="tab" aria-label={modeLabels[item]} aria-selected={activeMode === item} className={activeMode === item ? "is-active" : ""} onClick={() => selectMode(item)}>{modeLabels[item]}</button>)}</div></div>
        {previewDomains.HOME.length === 0 && previewDomains.LIFE.length > 0 && <p className="numeric-home-empty">집 학습에서 이번 주에 완료한 단원이 없습니다.</p>}
        <div className="numeric-session-comparison" aria-label={`${modeLabels[activeMode]} · ${selectedDomain.label} 이번 주 전체와 최근 비교`}>{selectedDomain.sessionRows.slice(0, 3).map(([label, past, recent]) => <article key={label}><span>{label.replace("반복학습 ", "").replace("실생활 ", "").replace("혼자 말하기", "모르미 가르치기")}</span><div><small>{past}</small><i aria-hidden="true">→</i><strong>{recent}</strong></div></article>)}</div>
        <div className="numeric-ladder-summary"><div><span>발화 사다리</span><strong>최근 사용 비율</strong></div>{ladderValues.length > 0 ? <div className="numeric-ladder-bars" aria-label={`L4부터 L0까지 ${ladderValues.join(", ")}`}>{ladderValues.map((value, index) => <span key={`${value}-${index}`} style={{ "--share": Number.parseInt(value) || 0 } as CSSProperties}><i>L{4 - index}</i><b>{value}</b></span>)}</div> : <p className="numeric-ladder-empty">발화 단계 기록이 아직 없어요</p>}</div>
        <details className="numeric-level-guide"><summary>발화 단계 L0–L4 보기</summary><ul><li><b>L4</b> 자기 말로 답과 이유 설명</li><li><b>L3</b> 답과 이유를 짧게 나누어 말함</li><li><b>L2</b> 선택지에서 골라 표현</li><li><b>L1</b> 빈칸·수 세기·조작 도움으로 완성</li><li><b>L0</b> 도움 카드와 함께 수행</li></ul><p>표시 비율은 과제마다 마지막으로 성공한 발화 단계입니다.</p></details>
      </section>
      <section className="numeric-preview__section" aria-labelledby="numeric-domain-title">
        <div className="numeric-section-heading"><span>03</span><h2 id="numeric-domain-title">현재 영역별 상태</h2></div><div className="numeric-status-selector" aria-label="상태를 볼 영역 선택">{domains.map((domain) => <button key={domain.id} type="button" className={`numeric-status--${domain.status} ${selectedDomain.id === domain.id ? "is-active" : ""}`} aria-pressed={selectedDomain.id === domain.id} onClick={() => setSelectedDomainId(domain.id)}><span>{domain.label}</span><small>{statusLabels[domain.status]}</small></button>)}</div>
        <div className="numeric-domain-detail" aria-label={`${selectedDomain.label} 상세`}><div className="numeric-domain-insight"><span>AI가 본 변화</span><strong>{selectedDomain.thinkingChange}</strong></div><details ref={evidenceDetailsRef} className="numeric-evidence" onToggle={(event) => {
          if (!event.currentTarget.open) {
            lastAutoRequestedDomainRef.current = null;
            return;
          }
          if (lastAutoRequestedDomainRef.current === selectedDomain.id) return;
          lastAutoRequestedDomainRef.current = selectedDomain.id;
          onRequestSpeech?.(selectedDomain.id);
        }}><summary>과거·최근 발화 보기</summary><div>{speech?.state === "loading" ? <p>발화 근거를 불러오는 중이에요.</p> : speech?.state === "ready" && speech.evidence.available ? <><p><b>과거</b>{speech.evidence.past.utterance}</p><p><b>최근</b>{speech.evidence.recent.utterance}</p><small>{speech.evidence.change_summary}</small></> : speech?.state === "ready" ? <p>비교할 기록이 더 필요해요</p> : speech?.state === "error" ? <p>{speech.message}</p> : <><p><b>과거</b>{selectedDomain.pastUtterance}</p><p><b>최근</b>{selectedDomain.recentUtterance}</p><small>이번 주 전체 {selectedDomain.historyCount}회 · 최근 {selectedDomain.recentCount}회 기록을 함께 봤어요.</small></>}</div></details></div>
      </section>
      <section id="numeric-next-plan" className="numeric-preview__section numeric-next-plan" aria-labelledby="numeric-next-title"><div className="numeric-next-plan__eyebrow"><span aria-hidden="true">✦</span> AI 다음 학습 제안</div><div className="numeric-next-plan__body"><div><h2 id="numeric-next-title">다음은 {selectedDomain.label} 연습이에요</h2><p>{selectedDomain.nextCheck}</p></div><div className="numeric-next-plan__quick"><span><small>반복학습</small><strong>{selectedDomain.label} {selectedDomain.repeatCount}문제</strong></span><span><small>발화 사다리</small><strong>{ladderPlanLabel}</strong></span></div></div><details><summary>다음 단원 계획 확인</summary><div><p><b>시작 단계</b>{ladderPlanDetail}</p><p><b>단계 조절</b>{selectedDomain.ladderRule}</p><p><b>관찰할 점</b>{selectedDomain.nextCheck}</p></div></details></section>
    </article>
  </main>;
}
