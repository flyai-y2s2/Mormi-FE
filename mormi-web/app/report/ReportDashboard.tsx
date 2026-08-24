"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ApiError,
  api,
  readStoredLearner,
  type DiagnosticMode,
  type DiagnosticReportDto,
  type ReportSummaryDto,
} from "../api-client";
import { DomainDetail } from "./DomainDetail";
import { diagnosticReportFromHistory } from "./diagnostic-history-fallback";
import { NumericReportPreview } from "./NumericReportPreview";
import { completeDiagnosticReportExample } from "./complete-report-example";
import { ReportTrendChart } from "./ReportTrendChart";
import {
  chooseDiagnosticSelection,
  diagnosticCategoryStatus,
  diagnosticSeriesForDomain,
  groupDiagnosticDomains,
  isEmptyDiagnosticReport,
  statusLabel,
  type DiagnosticDomainGroup,
  type DiagnosticEvidenceKind,
} from "./diagnostic-report-model";
import {
  evidenceLinksForRefs,
  modeForTabKey,
  reportRequestAccepted,
  selectionAfterRefresh,
  speechLoadDecision,
  speechStateAfterResult,
  type DiagnosticEvidenceLink,
  type DiagnosticSpeechState,
} from "./diagnostic-report-interactions";
import { localReportAdminApi, type LocalAdminLearner } from "../local-report-admin-client";
import { LocalLearnerSearch } from "./LocalLearnerSearch";
import { reportLandingFor, reportRequestFor } from "./local-admin-report-flow";
import { shiftIsoWeek } from "./weekly-report-period";
import { TeacherReportLogin } from "./TeacherReportLogin";

type LoadState = "loading" | "ready" | "auth" | "empty" | "error";
const reportModes = ["HOME", "LIFE"] as const;
const modeLabels: Record<DiagnosticMode, string> = { HOME: "집 · 개념", LIFE: "실생활 · 응용" };
const directionLabels = {
  IMPROVING: "좋아지는 중",
  DECLINING: "최근 낮아짐",
  MAINTAINING: "비슷하게 유지",
  INSUFFICIENT_HISTORY: "기록 더 필요",
} as const;
const kindLabels: Record<DiagnosticEvidenceKind, string> = {
  drill: "문제 정답률",
  teach: "혼자 설명하기",
  life: "생활 속 문제 해결",
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

function SectionHeading({ id, title, detail }: { id: string; title: string; detail?: string }) {
  return (
    <div className="diagnostic-section-heading">
      <div><h2 id={id}>{title}</h2></div>
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

function EvidenceLinks({
  refs,
  groups,
  onActivate,
}: {
  refs: readonly string[];
  groups: readonly DiagnosticDomainGroup[];
  onActivate: (link: DiagnosticEvidenceLink) => void;
}) {
  const links = evidenceLinksForRefs(refs, groups);
  if (links.length === 0) return <span className="diagnostic-evidence-empty">근거 없음</span>;
  return (
    <div className="diagnostic-evidence-links" aria-label="연결된 근거">
      {links.map((link) => link.target ? (
        <button className="diagnostic-evidence-link" type="button" key={link.ref} onClick={() => onActivate(link)}>
          {link.label}
        </button>
      ) : (
        <span className="diagnostic-evidence-link diagnostic-evidence-link--static" key={link.ref}>{link.label}</span>
      ))}
    </div>
  );
}

type ReportDashboardProps = {
  completeExample?: boolean;
  localAdminEnabled?: boolean;
  teacherMode?: boolean;
  teacherAuthRequired?: boolean;
  teacherAuthenticated?: boolean;
};

async function loadAuthenticatedReportWithHistoryFallback(weekStart: string | undefined, controller: AbortController) {
  const [diagnosticResult, history] = await Promise.all([
    api.diagnosticReport({ weekStart, signal: controller.signal }).then(
      (data) => ({ ok: true as const, data }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    api.reportHistory(50).catch(() => [] as ReportSummaryDto[]),
  ]);
  if (diagnosticResult.ok) return { data: diagnosticResult.data, history, usedHistoryFallback: false };
  if (!(diagnosticResult.error instanceof ApiError) || diagnosticResult.error.status < 500) throw diagnosticResult.error;
  const learner = readStoredLearner();
  if (!learner) throw diagnosticResult.error;
  return {
    data: diagnosticReportFromHistory(history, learner, weekStart),
    history,
    usedHistoryFallback: true,
  };
}

export function ReportDashboard({
  completeExample = false,
  localAdminEnabled = false,
  teacherMode = false,
  teacherAuthRequired = false,
  teacherAuthenticated = false,
}: ReportDashboardProps) {
  if (completeExample) return <NumericReportPreview report={completeDiagnosticReportExample} />;
  if (teacherMode && !localAdminEnabled) {
    return (
      <main className="report-page">
        <ReportShellHeader />
        <article className="report-paper teacher-report-gate">
          <section className="teacher-report-unavailable" role="status">
            <h1>교사용 리포트를 준비 중입니다</h1>
            <p>운영 환경의 교사용 리포트 설정을 확인해 주세요.</p>
          </section>
        </article>
      </main>
    );
  }
  if (teacherMode && teacherAuthRequired && !teacherAuthenticated) {
    return (
      <main className="report-page">
        <ReportShellHeader />
        <article className="report-paper teacher-report-gate"><TeacherReportLogin /></article>
      </main>
    );
  }
  return <ConnectedReportDashboard
    localAdminEnabled={localAdminEnabled}
    teacherMode={teacherMode}
    teacherAuthRequired={teacherAuthRequired}
    teacherAuthenticated={teacherAuthenticated}
  />;
}

function ConnectedReportDashboard({
  localAdminEnabled: initiallyLocalAdminEnabled,
  teacherMode,
  teacherAuthRequired,
  teacherAuthenticated,
}: {
  localAdminEnabled: boolean;
  teacherMode: boolean;
  teacherAuthRequired: boolean;
  teacherAuthenticated: boolean;
}) {
  const [report, setReport] = useState<DiagnosticReportDto | null>(null);
  const [history, setHistory] = useState<ReportSummaryDto[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<DiagnosticMode>("HOME");
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [speechByDomain, setSpeechByDomain] = useState<Record<string, DiagnosticSpeechState>>({});
  const [selectedLearner, setSelectedLearner] = useState<LocalAdminLearner | null>(null);
  const [localAdminAvailable, setLocalAdminAvailable] = useState(initiallyLocalAdminEnabled);
  const reportRef = useRef<DiagnosticReportDto | null>(null);
  const modeRef = useRef<DiagnosticMode>("HOME");
  const selectedDomainRef = useRef("");
  const reportControllerRef = useRef<AbortController | null>(null);
  const reportSequenceRef = useRef(0);
  const requestedWeekRef = useRef<string | undefined>(undefined);
  const selectedLearnerRef = useRef<LocalAdminLearner | null>(null);
  const speechControllersRef = useRef(new Map<string, AbortController>());
  const tabRefs = useRef<Partial<Record<DiagnosticMode, HTMLButtonElement>>>({});
  const chartSectionRef = useRef<HTMLElement | null>(null);
  const domainSelectorRefs = useRef(new Map<string, HTMLButtonElement>());
  const domainStatusRefs = useRef(new Map<string, HTMLButtonElement>());

  const cancelSpeechRequests = useCallback(() => {
    speechControllersRef.current.forEach((controller) => controller.abort());
    speechControllersRef.current.clear();
  }, []);

  const loadReport = useCallback(async (
    weekStart?: string,
    learnerOverride = selectedLearnerRef.current,
  ) => {
    const previousReport = reportRef.current;
    const previousMode = modeRef.current;
    const previousDomainId = selectedDomainRef.current;
    const request = reportRequestFor({ selectedLearnerId: learnerOverride?.learner_id ?? null, weekStart });
    const sequence = reportSequenceRef.current + 1;
    reportSequenceRef.current = sequence;
    requestedWeekRef.current = weekStart;
    reportControllerRef.current?.abort();
    const controller = new AbortController();
    reportControllerRef.current = controller;

    if (previousReport) setRefreshing(true);
    else setLoadState("loading");
    setNotice("");

    try {
      const result = request.source === "local-admin"
        ? {
          data: await localReportAdminApi.diagnostic(request.learnerId, request.weekStart, controller.signal),
          history: [] as ReportSummaryDto[],
          usedHistoryFallback: false,
        }
        : await loadAuthenticatedReportWithHistoryFallback(request.weekStart, controller);
      if (!reportRequestAccepted(reportSequenceRef.current, sequence, controller.signal.aborted)) return;
      const { data, history: historyData, usedHistoryFallback } = result;
      setHistory(historyData);
      if (isEmptyDiagnosticReport(data)) {
        cancelSpeechRequests();
        setSpeechByDomain({});
        setExpandedDomainId(null);
        reportRef.current = data;
        setReport(data);
        setMode("HOME");
        setSelectedDomainId("");
        setLoadState("ready");
        setNotice("");
        return;
      }

      const groups = groupDiagnosticDomains(data);
      const nextSelection = selectionAfterRefresh(groups, previousMode, previousDomainId);
      cancelSpeechRequests();
      setSpeechByDomain({});
      setExpandedDomainId(null);
      reportRef.current = data;
      setReport(data);
      setMode(nextSelection.mode);
      setSelectedDomainId(nextSelection.domain_id);
      setLoadState("ready");
      if (usedHistoryFallback) setNotice("완료된 학습 이력으로 주간 리포트를 표시하고 있습니다.");
    } catch (error: unknown) {
      if (!reportRequestAccepted(reportSequenceRef.current, sequence, controller.signal.aborted)) return;
      if (request.source === "local-admin") {
        cancelSpeechRequests();
        setSpeechByDomain({});
        reportRef.current = null;
        setReport(null);
        setHistory([]);
        setLoadState("error");
        setNotice("선택한 학습자의 리포트 데이터를 불러오지 못했습니다.");
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) setLocalAdminAvailable(false);
      } else if (error instanceof ApiError && error.status === 401) {
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
      if (reportRequestAccepted(reportSequenceRef.current, sequence, false)) {
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

  const selectLearner = (learner: LocalAdminLearner) => {
    const weekStart = requestedWeekRef.current ?? reportRef.current?.period.week_start;
    reportSequenceRef.current += 1;
    reportControllerRef.current?.abort();
    cancelSpeechRequests();
    setSpeechByDomain({});
    setExpandedDomainId(null);
    setNotice("");
    setRefreshing(false);
    reportRef.current = null;
    setReport(null);
    setHistory([]);
    setLoadState("loading");
    selectedLearnerRef.current = learner;
    setSelectedLearner(learner);
    void loadReport(weekStart, learner);
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const landing = reportLandingFor({
        localAdminEnabled: initiallyLocalAdminEnabled,
        hasStoredLearner: Boolean(readStoredLearner()),
        teacherMode,
        teacherAuthRequired,
        teacherAuthenticated,
      });
      if (landing === "auth") {
        setLoadState("auth");
        setNotice("학습 화면에서 학습자로 로그인한 뒤 다시 열어 주세요.");
        return;
      }
      if (landing === "local-admin-search") {
        setLoadState("auth");
        setNotice("위 검색창에서 학습자를 선택해 주세요.");
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
  }, [cancelSpeechRequests, initiallyLocalAdminEnabled, loadReport, teacherAuthenticated, teacherAuthRequired, teacherMode]);

  const groupedDomains = report ? groupDiagnosticDomains(report) : [];
  const modeDomains = groupedDomains.filter((domain) => domain.mode === mode);
  const selectedDomain = modeDomains.find((domain) => domain.domain_id === selectedDomainId) ?? modeDomains[0];
  const expandedDomain = groupedDomains.find((domain) => domain.domain_id === expandedDomainId);
  const selectedSeries = selectedDomain ? diagnosticSeriesForDomain(selectedDomain) : [];
  const totalCompleted = report ? report.data_range.total_home_sessions + report.data_range.total_life_visits : 0;
  const chartDetail = selectedSeries.length > 0
    ? selectedSeries.map((item) => `${item.label} 누적 ${item.total_count}회 · 최근 ${item.recent_count}회`).join(" / ")
    : undefined;

  const selectMode = (nextMode: DiagnosticMode) => {
    const nextSelection = chooseDiagnosticSelection(groupedDomains, nextMode, selectedDomainId);
    setMode(nextMode);
    setSelectedDomainId(nextSelection?.domain_id ?? "");
    setExpandedDomainId(null);
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentMode = event.currentTarget.dataset.mode as DiagnosticMode;
    const nextMode = modeForTabKey(currentMode, event.key);
    if (!nextMode) return;
    event.preventDefault();
    selectMode(nextMode);
    window.requestAnimationFrame(() => tabRefs.current[nextMode]?.focus());
  };

  const loadSpeechEvidence = (domain: DiagnosticDomainGroup) => {
    const domainId = domain.domain_id;
    const cached = speechByDomain[domainId];
    if (speechLoadDecision(cached) === "reuse") return;
    const currentReport = reportRef.current;
    if (!currentReport) return;
    const learner = selectedLearnerRef.current;
    speechControllersRef.current.get(domainId)?.abort();
    const controller = new AbortController();
    speechControllersRef.current.set(domainId, controller);
    setSpeechByDomain((current) => ({ ...current, [domainId]: { state: "loading" } }));
    const evidenceRequest = learner
      ? localReportAdminApi.speechEvidence(learner.learner_id, domainId, currentReport.period.week_start, controller.signal)
      : api.diagnosticSpeechEvidence(domainId, {
        weekStart: reportRef.current!.period.week_start,
        signal: controller.signal,
      });
    void evidenceRequest.then(
      (evidence) => {
        if (controller.signal.aborted || speechControllersRef.current.get(domainId) !== controller) return;
        speechControllersRef.current.delete(domainId);
        setSpeechByDomain((current) => ({ ...current, [domainId]: speechStateAfterResult({ ok: true, evidence }) }));
      },
      () => {
        if (controller.signal.aborted || speechControllersRef.current.get(domainId) !== controller) return;
        speechControllersRef.current.delete(domainId);
        setSpeechByDomain((current) => ({
          ...current,
          [domainId]: speechStateAfterResult({ ok: false, message: "발화 근거를 불러오지 못했습니다. 영역을 닫았다가 다시 열어 주세요." }),
        }));
      },
    );
  };

  const approveLadderRecommendation = async (analysisId: string, recommendationVersion: number) => {
    const learner = selectedLearnerRef.current;
    if (!learner) throw new Error("teacher learner selection is required");
    await localReportAdminApi.approveLadderRecommendation(
      learner.learner_id,
      analysisId,
      recommendationVersion,
    );
  };

  const openDomain = (domain: DiagnosticDomainGroup) => {
    const domainId = domain.domain_id;
    setMode(domain.mode);
    setSelectedDomainId(domainId);
    setExpandedDomainId(domainId);
    loadSpeechEvidence(domain);
  };

  const activateEvidenceLink = (link: DiagnosticEvidenceLink) => {
    if (!link.target) return;
    const target = link.target;
    const domain = groupedDomains.find((item) => item.domain_id === target.domain_id && item.mode === target.mode);
    if (!domain) return;
    setMode(target.mode);
    setSelectedDomainId(target.domain_id);
    if (target.expand_speech) {
      setExpandedDomainId(target.domain_id);
      loadSpeechEvidence(domain);
    } else {
      setExpandedDomainId(null);
    }
    window.requestAnimationFrame(() => {
      if (target.focus === "domain") {
        const statusButton = domainStatusRefs.current.get(target.domain_id);
        statusButton?.focus();
        statusButton?.scrollIntoView({ block: "center" });
      } else {
        chartSectionRef.current?.scrollIntoView({ block: "start" });
        domainSelectorRefs.current.get(target.domain_id)?.focus();
      }
    });
  };

  const adminSearch = localAdminAvailable ? (
    <LocalLearnerSearch
      searchLearners={localReportAdminApi.search}
      onSelect={selectLearner}
      onUnavailable={() => setLocalAdminAvailable(false)}
    />
  ) : undefined;

  if (loadState === "ready" && report) {
    return <NumericReportPreview
      key={`${report.learner.learner_id}:${report.period.week_start}`}
      report={report}
      history={history}
      refreshing={refreshing}
      notice={notice}
      onPreviousWeek={() => void loadReport(shiftIsoWeek(report.period.week_start, -1))}
      onNextWeek={() => void loadReport(shiftIsoWeek(report.period.week_start, 1))}
      onRetry={() => void loadReport(requestedWeekRef.current)}
      speechByDomain={speechByDomain}
      topAccessory={adminSearch}
      onRequestSpeech={(domainId) => {
        const domain = groupedDomains.find((item) => item.domain_id === domainId);
        if (domain) loadSpeechEvidence(domain);
      }}
      onApproveLadder={selectedLearner ? approveLadderRecommendation : undefined}
    />;
  }

  const stateTitle = localAdminAvailable && !selectedLearner
    ? "학습자를 검색해 주세요"
    : loadState === "loading"
    ? "리포트 데이터를 불러오는 중입니다"
    : loadState === "auth"
      ? "학습자 로그인이 필요합니다"
      : loadState === "empty"
        ? "아직 학습 기록이 없습니다"
        : "리포트를 표시할 수 없습니다";

  return (
    <main className="report-page">
      <ReportShellHeader />
      {adminSearch && <div className="local-report-admin-bar">{adminSearch}</div>}
      <article className="report-paper" data-report-format="a4">
        <section className="diagnostic-hero" aria-labelledby="report-title">
          <div>
            {report && (
              <p className="diagnostic-learner-name"><span>학습자</span><strong>{report.learner.display_name}</strong></p>
            )}
            <h1 id="report-title">개인 진단 리포트</h1>
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
              <section className="diagnostic-section" aria-labelledby="summary-title"><SectionHeading id="summary-title" title="현재 상태 요약" /></section>
              <section className="diagnostic-section" aria-labelledby="trend-title">
                <SectionHeading id="trend-title" title="단원별 결과" />
                <div className="diagnostic-tabs" role="tablist" aria-label="학습 환경 선택">
                  <button id="diagnostic-tab-home" type="button" role="tab" aria-selected="true" disabled>집 · 개념</button>
                  <button id="diagnostic-tab-life" type="button" role="tab" aria-selected="false" disabled>실생활 · 응용</button>
                </div>
              </section>
              <section className="diagnostic-section" aria-labelledby="domains-title"><SectionHeading id="domains-title" title="현재 영역별 상태" /></section>
            </div>
          </>
        ) : (
          <>
            {notice && <p className="diagnostic-ready-notice" role="alert">{notice}</p>}
            <section className="diagnostic-section diagnostic-summary" aria-labelledby="summary-title">
              <SectionHeading id="summary-title" title="현재 상태 요약" />
              <div className="summary-strips">
                {([
                  ["문제 풀기", report.current_summary.concept_performance],
                  ["혼자 설명하기", report.current_summary.explanation_change],
                  ["생활 속 문제 해결", report.current_summary.life_transfer],
                ] as const).map(([label, summary]) => (
                  <article key={label}><strong>{label}</strong><p>{summary.text}</p><EvidenceLinks refs={summary.evidence_refs} groups={groupedDomains} onActivate={activateEvidenceLink} /></article>
                ))}
              </div>
              {report.narrative_fallback && <p className="diagnostic-fallback">현재 요약은 검증된 기록을 바탕으로 한 기본 문장으로 표시됩니다.</p>}
            </section>

            <section className="diagnostic-section diagnostic-trends" aria-labelledby="trend-title" ref={chartSectionRef}>
              <SectionHeading id="trend-title" title="세션별 변화" detail={chartDetail} />
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
                    ref={(element) => { if (element) domainSelectorRefs.current.set(domain.domain_id, element); else domainSelectorRefs.current.delete(domain.domain_id); }}
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
              <SectionHeading id="domains-title" title="현재 영역별 상태" detail="영역을 누르면 같은 영역의 발화 변화를 확인할 수 있습니다." />
              {groupedDomains.length === 0 && <p className="domain-empty">표시할 영역별 근거가 아직 없습니다.</p>}
              <div className="domain-category-bar" aria-label="상태를 볼 영역 선택">
                {groupedDomains.map((domain) => {
                  const buttonId = `domain-category-${domain.domain_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                  const categoryStatus = diagnosticCategoryStatus(domain);
                  return (
                    <button
                      key={domain.domain_id}
                      id={buttonId}
                      ref={(element) => { if (element) domainStatusRefs.current.set(domain.domain_id, element); else domainStatusRefs.current.delete(domain.domain_id); }}
                      type="button"
                      className={`domain-category-button domain-category-button--${categoryStatus.toLowerCase()} ${expandedDomainId === domain.domain_id ? "is-active" : ""}`}
                      aria-pressed={expandedDomainId === domain.domain_id}
                      aria-controls="domain-category-detail"
                      onClick={() => openDomain(domain)}
                    >
                      <span>{domain.label}</span>
                      <small>{statusLabel(categoryStatus)}</small>
                    </button>
                  );
                })}
              </div>
              {expandedDomain && (
                <div
                  className="domain-category-panel"
                  id="domain-category-detail"
                  aria-labelledby={`domain-category-${expandedDomain.domain_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                >
                  <DomainDetail domain={expandedDomain} speech={speechByDomain[expandedDomain.domain_id]} />
                </div>
              )}
              <div className="domain-list domain-print-list" aria-label="인쇄용 영역별 상태">
                {groupedDomains.map((domain) => (
                  <div className="domain-row" key={domain.domain_id}>
                    <div className="domain-status-button">
                      <span><strong>{domain.label}</strong></span>
                      <span className="domain-status-stack">{statusSummary(domain)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="diagnostic-highlights" aria-label="좋아진 점과 계속 관찰할 점">
              <article><span aria-hidden="true">↗</span><div><strong>좋아진 점</strong><p>{report.improved_point.text}</p><EvidenceLinks refs={report.improved_point.evidence_refs} groups={groupedDomains} onActivate={activateEvidenceLink} /></div></article>
              <article><span aria-hidden="true">○</span><div><strong>계속 관찰할 점</strong><p>{report.observe_point.text}</p><EvidenceLinks refs={report.observe_point.evidence_refs} groups={groupedDomains} onActivate={activateEvidenceLink} /></div></article>
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
      </article>
    </main>
  );
}
