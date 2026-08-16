"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  api,
  readStoredLearner,
  type DiagnosticDomainStatusDto,
  type DiagnosticMode,
  type DiagnosticReportDto,
  type SpeechEvidenceDto,
} from "../api-client";
import { DomainDetail } from "./DomainDetail";
import { ReportTrendChart } from "./ReportTrendChart";
import { statusLabel } from "./diagnostic-report-model";

type LoadState = "loading" | "ready" | "empty" | "error";
type SpeechState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; evidence: SpeechEvidenceDto };

const modeLabels: Record<DiagnosticMode, string> = {
  HOME: "집 · 개념",
  LIFE: "실생활 · 응용",
};

const directionLabels = {
  IMPROVING: "장기 향상",
  DECLINING: "최근 하락",
  MAINTAINING: "장기 유지",
  INSUFFICIENT_HISTORY: "최근 근거 추가",
} as const;

function formatDate(value?: string): string {
  if (!value) return "기록 없음";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "short", day: "numeric" }).format(parsed);
}

function domainsForMode(report: DiagnosticReportDto, mode: DiagnosticMode) {
  return report.modes.find((item) => item.mode === mode)?.domains ?? [];
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

export function ReportDashboard() {
  const [report, setReport] = useState<DiagnosticReportDto | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<DiagnosticMode>("HOME");
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [expandedDomainId, setExpandedDomainId] = useState<string | null>(null);
  const [speechByDomain, setSpeechByDomain] = useState<Record<string, SpeechState>>({});

  const loadReport = useCallback(async () => {
    setLoadState("loading");
    setNotice("");
    try {
      const data = await api.diagnosticReport();
      const hasHomeDomains = data.modes.some((item) => item.mode === "HOME" && item.domains.length > 0);
      const initialMode: DiagnosticMode = hasHomeDomains ? "HOME" : "LIFE";
      const firstDomain = domainsForMode(data, initialMode)[0];
      setReport(data);
      setMode(initialMode);
      setSelectedDomainId(firstDomain?.domain_id ?? "");
      setLoadState("ready");
    } catch (error: unknown) {
      setReport(null);
      if (error instanceof ApiError && error.status === 404) {
        setLoadState("empty");
        setNotice("아직 분석할 완료 기록이 없어 리포트 데이터가 없습니다.");
      } else {
        setLoadState("error");
        setNotice("리포트 데이터를 불러오지 못했습니다.");
      }
    }
  }, []);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (!readStoredLearner()) {
        setLoadState("empty");
        setNotice("로그인한 학습자 정보가 없어 리포트 데이터가 없습니다.");
        return;
      }
      void loadReport();
    });
  }, [loadReport]);

  const selectMode = (nextMode: DiagnosticMode) => {
    if (!report) return;
    setMode(nextMode);
    setSelectedDomainId(domainsForMode(report, nextMode)[0]?.domain_id ?? "");
    setExpandedDomainId(null);
  };

  const openDomain = (domain: DiagnosticDomainStatusDto) => {
    if (!report) return;
    const domainId = domain.domain_id;
    if (expandedDomainId === domainId) {
      setExpandedDomainId(null);
      return;
    }

    const containingMode = report.modes.find((item) => item.domains.some((candidate) => candidate.domain_id === domainId));
    if (containingMode) {
      setMode(containingMode.mode);
      setSelectedDomainId(domainId);
    }
    setExpandedDomainId(domainId);

    if (speechByDomain[domainId]) return;
    setSpeechByDomain((current) => ({ ...current, [domainId]: { state: "loading" } }));
    void api.diagnosticSpeechEvidence(domainId).then(
      (evidence) => setSpeechByDomain((current) => ({ ...current, [domainId]: { state: "ready", evidence } })),
      () => setSpeechByDomain((current) => ({
        ...current,
        [domainId]: { state: "error", message: "발화 근거를 불러오지 못했습니다." },
      })),
    );
  };

  const modeDomains = report ? domainsForMode(report, mode) : [];
  const selectedTrend = modeDomains.find((domain) => domain.domain_id === selectedDomainId) ?? modeDomains[0];
  const totalCompleted = report ? report.data_range.total_home_sessions + report.data_range.total_life_visits : 0;

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
          <dl className="diagnostic-range">
            <div><dt>분석 범위</dt><dd>{report ? `${formatDate(report.data_range.first_at)} — ${formatDate(report.data_range.last_at)}` : "전체 기간"}</dd></div>
            <div><dt>누적 완료</dt><dd>{report ? `${totalCompleted}회` : "—"}</dd></div>
            <div><dt>최근 갱신</dt><dd>{report ? formatDate(report.data_range.last_at) : "—"}</dd></div>
          </dl>
        </section>

        {loadState !== "ready" || !report ? (
          <>
            <section className={`diagnostic-state diagnostic-state--${loadState}`} role="status" aria-live="polite">
              <span aria-hidden="true">{loadState === "loading" ? "···" : "—"}</span>
              <div>
                <h2>{loadState === "loading" ? "리포트 데이터를 불러오는 중입니다" : "표시할 리포트 데이터가 없습니다"}</h2>
                {notice && <p>{notice}</p>}
              </div>
              {loadState === "error" && <button type="button" onClick={() => void loadReport()}>다시 불러오기</button>}
            </section>
            <div className="diagnostic-outline">
              <section className="diagnostic-section" aria-labelledby="summary-title">
                <SectionHeading id="summary-title" eyebrow="AT A GLANCE" title="현재 상태 요약" />
              </section>
              <section className="diagnostic-section" aria-labelledby="trend-title">
                <SectionHeading id="trend-title" eyebrow="CHANGE OVER TIME" title="학습 변화" />
                <div className="diagnostic-tabs" role="tablist" aria-label="학습 환경 선택">
                  <button type="button" role="tab" aria-selected="true" disabled>집 · 개념</button>
                  <button type="button" role="tab" aria-selected="false" disabled>실생활 · 응용</button>
                </div>
              </section>
              <section className="diagnostic-section" aria-labelledby="domains-title">
                <SectionHeading id="domains-title" eyebrow="CURRENT EVIDENCE" title="영역별 현재 상태" />
              </section>
            </div>
          </>
        ) : (
          <>
            <section className="diagnostic-section diagnostic-summary" aria-labelledby="summary-title">
              <SectionHeading id="summary-title" eyebrow="AT A GLANCE" title="현재 상태 요약" />
              <div className="summary-strips">
                {([
                  ["개념 수행", report.current_summary.concept_performance, "영역 근거"],
                  ["설명 변화", report.current_summary.explanation_change, "발화 근거"],
                  ["실생활 적용", report.current_summary.life_transfer, "수행 근거"],
                ] as const).map(([label, summary, evidenceLabel]) => (
                  <article key={label}>
                    <strong>{label}</strong>
                    <p>{summary.text}</p>
                    <small>{evidenceLabel} · {summary.evidence_refs.length}건</small>
                  </article>
                ))}
              </div>
              {report.narrative_fallback && <p className="diagnostic-fallback">현재 요약은 검증된 기록을 바탕으로 한 기본 문장으로 표시됩니다.</p>}
            </section>

            <section className="diagnostic-section diagnostic-trends" aria-labelledby="trend-title">
              <SectionHeading
                id="trend-title"
                eyebrow="CHANGE OVER TIME"
                title="학습 변화"
                detail={selectedTrend ? `동일 영역 누적 ${selectedTrend.total_count}회 · 최근 ${selectedTrend.recent_count}회` : undefined}
              />
              <div className="diagnostic-tabs" role="tablist" aria-label="학습 환경 선택">
                {(["HOME", "LIFE"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={mode === item}
                    aria-controls="diagnostic-trend-panel"
                    className={mode === item ? "is-active" : ""}
                    onClick={() => selectMode(item)}
                  >
                    {modeLabels[item]}
                  </button>
                ))}
              </div>
              <div className="diagnostic-domain-selector" aria-label="변화를 볼 영역 선택">
                {modeDomains.map((domain) => (
                  <button
                    key={domain.domain_id}
                    type="button"
                    className={selectedTrend?.domain_id === domain.domain_id ? "is-active" : ""}
                    aria-pressed={selectedTrend?.domain_id === domain.domain_id}
                    onClick={() => setSelectedDomainId(domain.domain_id)}
                  >
                    {domain.label}
                  </button>
                ))}
              </div>
              <div id="diagnostic-trend-panel" role="tabpanel" className="diagnostic-chart-panel">
                {selectedTrend ? (
                  <ReportTrendChart mode={mode} trend={selectedTrend} />
                ) : (
                  <p className="diagnostic-chart-empty">이 환경의 학습 변화 근거가 아직 없습니다.</p>
                )}
              </div>
            </section>

            <section className="diagnostic-section diagnostic-domains" aria-labelledby="domains-title">
              <SectionHeading id="domains-title" eyebrow="CURRENT EVIDENCE" title="영역별 현재 상태" detail="영역을 누르면 같은 영역의 상세 근거가 펼쳐집니다." />
              <div className="domain-list">
                {report.domains.length === 0 && <p className="domain-empty">표시할 영역별 근거가 아직 없습니다.</p>}
                {report.domains.map((domain) => {
                  const expanded = expandedDomainId === domain.domain_id;
                  const panelId = `domain-detail-${domain.domain_id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                  return (
                    <div className={`domain-row ${expanded ? "is-expanded" : ""}`} key={domain.domain_id}>
                      <button
                        type="button"
                        className="domain-status-button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() => openDomain(domain)}
                      >
                        <span><strong>{domain.label}</strong><small>누적 {domain.total_count}회 · 최근 {domain.recent_count}회</small></span>
                        <span className={`domain-status domain-status--${domain.status.toLowerCase()}`}>
                          {statusLabel(domain.status)} · {directionLabels[domain.direction]}
                        </span>
                        <i aria-hidden="true">{expanded ? "−" : "+"}</i>
                      </button>
                      {expanded && (
                        <div id={panelId}>
                          <DomainDetail domain={domain} speech={speechByDomain[domain.domain_id]} />
                        </div>
                      )}
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
