"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ApiError,
  api,
  readStoredLearner,
  type DiagnosticMode,
  type DiagnosticReportDto,
  type SpeechEvidenceDto,
} from "../api-client";
import { DomainDetail } from "./DomainDetail";
import { ReportTrendChart } from "./ReportTrendChart";
import {
  chooseDiagnosticSelection,
  diagnosticSeriesForDomain,
  groupDiagnosticDomains,
  isEmptyDiagnosticReport,
  statusLabel,
  type DiagnosticDomainGroup,
  type DiagnosticEvidenceKind,
} from "./diagnostic-report-model";

type LoadState = "loading" | "ready" | "auth" | "empty" | "error";
type SpeechState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; evidence: SpeechEvidenceDto };

const reportModes = ["HOME", "LIFE"] as const;
const modeLabels: Record<DiagnosticMode, string> = { HOME: "집 · 개념", LIFE: "실생활 · 응용" };
const directionLabels = {
  IMPROVING: "장기 향상",
  DECLINING: "최근 하락",
  MAINTAINING: "장기 유지",
  INSUFFICIENT_HISTORY: "최근 근거 추가",
} as const;
const kindLabels: Record<DiagnosticEvidenceKind, string> = {
  drill: "반복학습",
  teach: "모르미 가르치기",
  life: "실생활 수행",
};

function formatDate(value?: string): string {
  if (!value) return "기록 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function ReportShellHeader() {
  return (
    <header className="report-header">
      <div><Link className="report-brand" href="/">모르미</Link><span>교사용 리포트</span></div>
      <Link className="back-to-child" href="/"><span aria-hidden="true">←</span> 학습 화면</Link>
    </header>
  );
}

function SectionHeading({ id, eyebrow, title, detail }: { id: string; eyebrow: string; title: string; detail?: string }) {
  return (
    <div className="diagnostic-section-heading">
      <div><span>{eyebrow}</span><h2 id={id}>{title}</h2></div>
      {detail && <p>{detail}</p>}
    </div>
  );
}

function statusSummary(group: DiagnosticDomainGroup) {
  return group.statuses.map((item) => (
    <span className={`domain-status domain-status--${item.status.toLowerCase()}`} key={item.kind}>
      <b>{kindLabels[item.kind]}</b>{statusLabel(item.status)} · {directionLabels[item.direction]}
    </span>
  ));
}

export function ReportDashboard() {
  const [report, setReport] = useState<DiagnosticReportDto | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<DiagnosticMode>("HOME");
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [speechByDomain, setSpeechByDomain] = useState<Record<string, SpeechState>>({});
  const reportRef = useRef<DiagnosticReportDto | null>(null);
  const modeRef = useRef<DiagnosticMode>("HOME");
  const selectedDomainRef = useRef("");
  const reportControllerRef = useRef<AbortController | null>(null);
  const reportSequenceRef = useRef(0);
  const speechControllersRef = useRef(new Map<string, AbortController>());
  const tabRefs = useRef<Partial<Record<DiagnosticMode, HTMLButtonElement>>>({});

  const cancelSpeechRequests = useCallback(() => {
    speechControllersRef.current.forEach((controller) => controller.abort());
    speechControllersRef.current.clear();
  }, []);

  const loadReport = useCallback(async () => {
    const previousReport = reportRef.current;
    const previousMode = modeRef.current;
    const previousDomainId = selectedDomainRef.current;
    const sequence = reportSequenceRef.current + 1;
    reportSequenceRef.current = sequence;
    reportControllerRef.current?.abort();
    const controller = new AbortController();
    reportControllerRef.current = controller;

    if (previousReport) setRefreshing(true);
    else setLoadState("loading");
    setNotice("");

    try {
      const data = await api.diagnosticReport(controller.signal);
      if (controller.signal.aborted || reportSequenceRef.current !== sequence) return;
      if (isEmptyDiagnosticReport(data)) {
        cancelSpeechRequests();
        setSpeechByDomain({});
        setExpandedDomainId(null);
        reportRef.current = data;
        setReport(data);
        setMode("HOME");
        setSelectedDomainId("");
        setLoadState("empty");
        setNotice("아직 학습 기록이 없습니다. 학습을 시작하면 이곳에 변화 근거가 쌓입니다.");
        return;
      }

      const groups = groupDiagnosticDomains(data);
      const nextGroup = chooseDiagnosticSelection(groups, previousMode, previousDomainId);
      const nextMode = nextGroup?.mode ?? "HOME";
      cancelSpeechRequests();
      setSpeechByDomain({});
      setExpandedDomainId(null);
      reportRef.current = data;
      setReport(data);
      setMode(nextMode);
      setSelectedDomainId(nextGroup?.domain_id ?? "");
      setLoadState("ready");
    } catch (error: unknown) {
      if (controller.signal.aborted || reportSequenceRef.current !== sequence) return;
      if (error instanceof ApiError && error.status === 401) {
        cancelSpeechRequests();
        setSpeechByDomain({});
        reportRef.current = null;
        setReport(null);
        setLoadState("auth");
        setNotice("학습 화면에서 학습자로 로그인한 뒤 다시 열어 주세요.");
      } else if (previousReport) {
        setLoadState("ready");
        setNotice("리포트 데이터를 새로 계산하지 못했습니다. 이전 결과를 계속 표시합니다.");
      } else if (error instanceof ApiError && error.status === 404) {
        setLoadState("empty");
        setNotice("아직 학습 기록이 없습니다. 학습을 시작하면 이곳에 변화 근거가 쌓입니다.");
      } else {
        setLoadState("error");
        setNotice("리포트 데이터를 불러오지 못했습니다.");
      }
    } finally {
      if (reportSequenceRef.current === sequence) {
        setRefreshing(false);
        if (reportControllerRef.current === controller) reportControllerRef.current = null;
      }
    }
  }, [cancelSpeechRequests]);

  useEffect(() => {
    reportRef.current = report;
    modeRef.current = mode;
    selectedDomainRef.current = selectedDomainId;
  }, [mode, report, selectedDomainId]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!readStoredLearner()) {
        setLoadState("auth");
        setNotice("학습 화면에서 학습자로 로그인한 뒤 다시 열어 주세요.");
        return;
      }
      void loadReport();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      reportSequenceRef.current += 1;
      reportControllerRef.current?.abort();
      cancelSpeechRequests();
    };
  }, [cancelSpeechRequests, loadReport]);

  const groupedDomains = report ? groupDiagnosticDomains(report) : [];
  const modeDomains = groupedDomains.filter((domain) => domain.mode === mode);
  const selectedDomain = modeDomains.find((domain) => domain.domain_id === selectedDomainId) ?? modeDomains[0];
  const selectedSeries = selectedDomain ? diagnosticSeriesForDomain(selectedDomain) : [];
  const totalCompleted = report ? report.data_range.total_home_sessions + report.data_range.total_life_visits : 0;
  const chartDetail = selectedSeries.length > 0
    ? selectedSeries.map((item) => `${item.label} 누적 ${item.total_count}회 · 최근 ${item.recent_count}회`).join(" / ")
    : undefined;

  const selectMode = (nextMode: DiagnosticMode) => {
    setMode(nextMode);
    setSelectedDomainId(groupedDomains.find((domain) => domain.mode === nextMode)?.domain_id ?? "");
    setExpandedDomainId(null);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentMode = event.currentTarget.dataset.mode as DiagnosticMode;
    const currentIndex = reportModes.indexOf(currentMode);
    let nextMode: DiagnosticMode | null = null;
    if (event.key === "ArrowRight") nextMode = reportModes[(currentIndex + 1) % reportModes.length];
    if (event.key === "ArrowLeft") nextMode = reportModes[(currentIndex - 1 + reportModes.length) % reportModes.length];
    if (event.key === "Home") nextMode = reportModes[0];
    if (event.key === "End") nextMode = reportModes.at(-1)!;
    if (!nextMode) return;
    event.preventDefault();
    selectMode(nextMode);
    window.requestAnimationFrame(() => tabRefs.current[nextMode]?.focus());
  };

  const openDomain = (domain: DiagnosticDomainGroup) => {
    const domainId = domain.domain_id;
    if (expandedDomainId === domainId) {
      setExpandedDomainId(null);
      return;
    }
    setMode(domain.mode);
    setSelectedDomainId(domainId);
    setExpandedDomainId(domainId);

    const cached = speechByDomain[domainId];
    if (cached?.state === "ready" || cached?.state === "loading") return;
    speechControllersRef.current.get(domainId)?.abort();
    const controller = new AbortController();
    speechControllersRef.current.set(domainId, controller);
    setSpeechByDomain((current) => ({ ...current, [domainId]: { state: "loading" } }));
    void api.diagnosticSpeechEvidence(domainId, controller.signal).then(
      (evidence) => {
        if (controller.signal.aborted || speechControllersRef.current.get(domainId) !== controller) return;
        speechControllersRef.current.delete(domainId);
        setSpeechByDomain((current) => ({ ...current, [domainId]: { state: "ready", evidence } }));
      },
      () => {
        if (controller.signal.aborted || speechControllersRef.current.get(domainId) !== controller) return;
        speechControllersRef.current.delete(domainId);
        setSpeechByDomain((current) => ({
          ...current,
          [domainId]: { state: "error", message: "발화 근거를 불러오지 못했습니다. 영역을 닫았다가 다시 열어 주세요." },
        }));
      },
    );
  };

  const stateTitle = loadState === "loading"
    ? "리포트 데이터를 불러오는 중입니다"
    : loadState === "auth"
      ? "학습자 로그인이 필요합니다"
      : loadState === "empty"
        ? "아직 학습 기록이 없습니다"
        : "리포트를 표시할 수 없습니다";

  return (
    <main className="report-page">
      <ReportShellHeader />
      <div className="report-paper">
        <section className="diagnostic-hero" aria-labelledby="report-title">
          <div>
            <p className="diagnostic-kicker">INDIVIDUAL LEARNING REPORT</p>
            <h1 id="report-title">{report ? `${report.learner.display_name}의 개인 진단 리포트` : "개인 진단 리포트"}</h1>
            <p>전체 학습 기록에서 현재 상태와 변화의 근거를 함께 확인합니다.</p>
          </div>
          <div className="diagnostic-range-actions">
            <dl className="diagnostic-range">
              <div><dt>분석 범위</dt><dd>{report ? `${formatDate(report.data_range.first_at)} — ${formatDate(report.data_range.last_at)}` : "전체 기간"}</dd></div>
              <div><dt>누적 완료</dt><dd>{report ? `${totalCompleted}회` : "—"}</dd></div>
              <div><dt>마지막 학습 기록</dt><dd>{report ? formatDate(report.data_range.last_at) : "—"}</dd></div>
            </dl>
            {loadState === "ready" && report && (
              <button className="diagnostic-refresh" type="button" onClick={() => void loadReport()} disabled={refreshing}>
                {refreshing ? "새로 계산 중…" : "새로 계산"}
              </button>
            )}
          </div>
        </section>

        {loadState !== "ready" || !report ? (
          <>
            <section className={`diagnostic-state diagnostic-state--${loadState}`} role="status" aria-live="polite">
              <span aria-hidden="true">{loadState === "loading" ? "···" : "—"}</span>
              <div><h2>{stateTitle}</h2>{notice && <p>{notice}</p>}</div>
              {loadState === "error" && <button type="button" onClick={() => void loadReport()}>다시 불러오기</button>}
            </section>
            <div className="diagnostic-outline">
              <section className="diagnostic-section" aria-labelledby="summary-title"><SectionHeading id="summary-title" eyebrow="AT A GLANCE" title="현재 상태 요약" /></section>
              <section className="diagnostic-section" aria-labelledby="trend-title">
                <SectionHeading id="trend-title" eyebrow="CHANGE OVER TIME" title="학습 변화" />
                <div className="diagnostic-tabs" role="tablist" aria-label="학습 환경 선택">
                  <button id="diagnostic-tab-home" type="button" role="tab" aria-selected="true" disabled>집 · 개념</button>
                  <button id="diagnostic-tab-life" type="button" role="tab" aria-selected="false" disabled>실생활 · 응용</button>
                </div>
              </section>
              <section className="diagnostic-section" aria-labelledby="domains-title"><SectionHeading id="domains-title" eyebrow="CURRENT EVIDENCE" title="영역별 현재 상태" /></section>
            </div>
          </>
        ) : (
          <>
            {notice && <p className="diagnostic-ready-notice" role="alert">{notice}</p>}
            <section className="diagnostic-section diagnostic-summary" aria-labelledby="summary-title">
              <SectionHeading id="summary-title" eyebrow="AT A GLANCE" title="현재 상태 요약" />
              <div className="summary-strips">
                {([
                  ["개념 수행", report.current_summary.concept_performance, "영역 근거"],
                  ["설명 변화", report.current_summary.explanation_change, "발화 근거"],
                  ["실생활 적용", report.current_summary.life_transfer, "수행 근거"],
                ] as const).map(([label, summary, evidenceLabel]) => (
                  <article key={label}><strong>{label}</strong><p>{summary.text}</p><small>{evidenceLabel} · {summary.evidence_refs.length}건</small></article>
                ))}
              </div>
              {report.narrative_fallback && <p className="diagnostic-fallback">현재 요약은 검증된 기록을 바탕으로 한 기본 문장으로 표시됩니다.</p>}
            </section>

            <section className="diagnostic-section diagnostic-trends" aria-labelledby="trend-title">
              <SectionHeading id="trend-title" eyebrow="CHANGE OVER TIME" title="학습 변화" detail={chartDetail} />
              <div className="diagnostic-tabs" role="tablist" aria-label="학습 환경 선택">
                {reportModes.map((item) => {
                  const tabId = `diagnostic-tab-${item.toLowerCase()}`;
                  return (
                    <button
                      key={item}
                      id={tabId}
                      ref={(element) => { if (element) tabRefs.current[item] = element; }}
                      data-mode={item}
                      type="button"
                      role="tab"
                      aria-selected={mode === item}
                      aria-controls={`diagnostic-panel-${item.toLowerCase()}`}
                      tabIndex={mode === item ? 0 : -1}
                      className={mode === item ? "is-active" : ""}
                      onClick={() => selectMode(item)}
                      onKeyDown={handleTabKeyDown}
                    >
                      {modeLabels[item]}
                    </button>
                  );
                })}
              </div>
              <div className="diagnostic-domain-selector" aria-label="변화를 볼 영역 선택">
                {modeDomains.map((domain) => (
                  <button
                    key={domain.domain_id}
                    type="button"
                    className={selectedDomain?.domain_id === domain.domain_id ? "is-active" : ""}
                    aria-pressed={selectedDomain?.domain_id === domain.domain_id}
                    onClick={() => setSelectedDomainId(domain.domain_id)}
                  >{domain.label}</button>
                ))}
              </div>
              {reportModes.map((panelMode) => (
                <div
                  key={panelMode}
                  id={`diagnostic-panel-${panelMode.toLowerCase()}`}
                  role="tabpanel"
                  aria-labelledby={`diagnostic-tab-${panelMode.toLowerCase()}`}
                  className="diagnostic-chart-panel"
                  hidden={mode !== panelMode}
                >
                  {mode === panelMode && (selectedDomain
                    ? <ReportTrendChart label={selectedDomain.label} series={selectedSeries} />
                    : <p className="diagnostic-chart-empty">이 환경의 학습 변화 근거가 아직 없습니다.</p>)}
                </div>
              ))}
            </section>

            <section className="diagnostic-section diagnostic-domains" aria-labelledby="domains-title">
              <SectionHeading id="domains-title" eyebrow="CURRENT EVIDENCE" title="영역별 현재 상태" detail="영역을 누르면 같은 영역의 상세 근거가 펼쳐집니다." />
              <div className="domain-list">
                {groupedDomains.length === 0 && <p className="domain-empty">표시할 영역별 근거가 아직 없습니다.</p>}
                {groupedDomains.map((domain) => {
                  const expanded = expandedDomainId === domain.domain_id;
                  const panelId = `domain-detail-${domain.domain_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                  return (
                    <div className={`domain-row ${expanded ? "is-expanded" : ""}`} key={domain.domain_id}>
                      <button type="button" className="domain-status-button" aria-expanded={expanded} aria-controls={panelId} onClick={() => openDomain(domain)}>
                        <span><strong>{domain.label}</strong></span>
                        <span className="domain-status-stack">{statusSummary(domain)}</span>
                        <i aria-hidden="true">{expanded ? "−" : "+"}</i>
                      </button>
                      {expanded && <div id={panelId}><DomainDetail domain={domain} speech={speechByDomain[domain.domain_id]} /></div>}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="diagnostic-highlights" aria-label="좋아진 점과 계속 관찰할 점">
              <article><span aria-hidden="true">↗</span><div><strong>좋아진 점</strong><p>{report.improved_point.text}</p><small>근거 {report.improved_point.evidence_refs.length}건</small></div></article>
              <article><span aria-hidden="true">○</span><div><strong>계속 관찰할 점</strong><p>{report.observe_point.text}</p><small>근거 {report.observe_point.evidence_refs.length}건</small></div></article>
            </section>
            <section className="diagnostic-evidence" aria-label="분석 근거 수">
              {([
                ["누적 세션", report.evidence_counts.home_sessions],
                ["반복문제 시도", report.evidence_counts.drill_attempts],
                ["가르치기 대화", report.evidence_counts.teach_conversations],
                ["실생활 수행", report.evidence_counts.life_visits],
                ["사용한 발화", report.evidence_counts.speech_samples],
              ] as const).map(([label, count]) => <span key={label}><strong>{count}</strong>{label}</span>)}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
