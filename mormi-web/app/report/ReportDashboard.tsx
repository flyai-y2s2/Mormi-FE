"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, apiEnabled, readStoredLearner, type ReportSummaryDto } from "../api-client";
import { sessionById, simpleLearnedLine } from "../math-curriculum";
import { ConsentPanel } from "./ConsentPanel";

function ReportIcon({ name }: { name: "star" | "refresh" | "arrow" }) {
  return <span className={`report-icon report-icon--${name}`} aria-hidden="true" />;
}

type Report = {
  date: string;
  sessionId: string;
  sessionTitle: string;
  sessionUnit: string;
  sessionLevel: number;
  masteryTarget: number;
  repetitions: number;
  masterySeconds: number;
  misconception: string;
  synchronized: boolean;
  transfer: boolean;
  ladder: number;
  timedOut: boolean;
  learnedLine: string;
  learnerName?: string;
  learnerId?: number;
  earnedCoins?: number;
  drillCoins?: number;
  teachCoins?: number;
  /** 서버 응답에만 있는 값. localStorage 폴백에는 없다. */
  learningSessionId?: string;
  walletBalance?: number;
  wrongAttemptCount?: number;
  firstTryCorrectCount?: number;
};

/** 서버도 로컬 기록도 없을 때만 보여 주는 데모 값. */
const fallback: Report = {
  date: "8월 8일",
  sessionId: "half-hour",
  sessionTitle: "30분 시계",
  sessionUnit: "시계",
  sessionLevel: 1,
  masteryTarget: 5,
  repetitions: 5,
  masterySeconds: 142,
  misconception: "긴 바늘 숫자를 그대로 ‘분’으로 읽음",
  synchronized: true,
  transfer: true,
  ladder: 2,
  timedOut: false,
  learnedLine: "긴 바늘이 6이면 30분이야!",
};

/** 데이터 출처. 화면에 그대로 표시해, 지금 보는 값이 서버 값인지 헷갈리지 않게 한다. */
type Source = "loading" | "server" | "local" | "demo";

/**
 * 서버 요약 + 정적 커리큘럼 → 화면용 Report.
 *
 * 서버는 자기가 계산한 수치만 갖고 있고 세션 제목·오개념 같은 본문은 갖고 있지 않다.
 * 그래서 수치는 서버 값을 그대로 쓰고, 본문만 session_id 로 커리큘럼에서 채운다.
 */
function toReport(dto: ReportSummaryDto): Report {
  const session = sessionById(dto.session_id);
  return {
    date: dto.date ?? "",
    sessionId: dto.session_id,
    sessionTitle: session?.title ?? dto.session_id,
    sessionUnit: session?.unit ?? "",
    sessionLevel: session?.level ?? 1,
    masteryTarget: dto.mastery_target,
    repetitions: dto.repetitions,
    masterySeconds: dto.mastery_seconds,
    misconception: session?.misconception ?? "기록된 오개념 없음",
    synchronized: dto.synchronized,
    transfer: dto.transfer,
    ladder: dto.ladder,
    timedOut: dto.timed_out,
    learnedLine: session ? simpleLearnedLine(session) : "",
    learnerName: dto.learner_name ?? undefined,
    learnerId: dto.learner_id ?? undefined,
    earnedCoins: dto.earned_coins,
    drillCoins: dto.drill_coins,
    teachCoins: dto.teach_coins,
    learningSessionId: dto.learning_session_id,
    walletBalance: dto.wallet_balance,
    wrongAttemptCount: dto.wrong_attempt_count,
    firstTryCorrectCount: dto.first_try_correct_count,
  };
}

function readLocalReport(): Report | null {
  try {
    const saved = localStorage.getItem("morami-report");
    if (!saved) return null;
    return { ...fallback, ...JSON.parse(saved) } as Report;
  } catch {
    return null;
  }
}

export function ReportDashboard() {
  const [report, setReport] = useState<Report>(fallback);
  const [history, setHistory] = useState<Report[]>([]);
  const [source, setSource] = useState<Source>("loading");
  const [notice, setNotice] = useState("");

  // setState 는 전부 await 뒤에서만 한다. 효과 본문에서 동기로 부르면 연쇄 렌더가 된다.
  const loadFromServer = useCallback(async () => {
    const [summary, sessionHistory] = await Promise.all([
      api.reportSummary(),
      // 이력은 없어도 요약은 보여 준다. 이력만 실패하면 빈 목록으로 넘어간다.
      api.reportHistory(8).catch(() => [] as ReportSummaryDto[]),
    ]);
    setReport(toReport(summary));
    setHistory(sessionHistory.map(toReport));
    setSource("server");
    setNotice("");
  }, []);

  useEffect(() => {
    const local = readLocalReport();

    if (!apiEnabled || !readStoredLearner()) {
      // 첫 렌더 직후에 넘긴다. 효과 본문에서 바로 setState 하면 연쇄 렌더가 된다.
      window.requestAnimationFrame(() => {
        setReport(local ?? fallback);
        setSource(local ? "local" : "demo");
        if (!local) setNotice("아직 저장된 리포트가 없어요. 학습을 한 번 마치면 이 화면이 채워집니다.");
      });
      return;
    }

    // 첫 렌더 뒤로 넘긴다. 효과 본문에서 곧장 부르면 연쇄 렌더가 된다.
    window.requestAnimationFrame(() => {
      void loadFromServer().catch((error: unknown) => {
        // 완료된 세션이 하나도 없으면 서버가 404 를 준다. 오류가 아니라 빈 상태다.
        if (error instanceof ApiError && error.status === 404) {
          setReport(fallback);
          setHistory([]);
          setSource("demo");
          setNotice("아직 완료한 세션이 없어요. 학습을 한 번 마치면 이 화면이 채워집니다.");
          return;
        }
        // 서버를 못 읽었을 때만 로컬 값으로 내려간다. 이때는 화면에 출처를 밝힌다.
        setReport(local ?? fallback);
        setHistory([]);
        setSource(local ? "local" : "demo");
        setNotice(error instanceof ApiError
          ? `서버 리포트를 불러오지 못했어요 (${error.message}). 이 기기에 남은 기록을 보여 주는 중입니다.`
          : "서버 리포트를 불러오지 못했어요. 이 기기에 남은 기록을 보여 주는 중입니다.");
      });
    });
  }, [loadFromServer]);

  const retry = () => {
    setSource("loading");
    setNotice("");
    void loadFromServer().catch((error: unknown) => {
      setSource((current) => (current === "loading" ? "demo" : current));
      setNotice(error instanceof ApiError ? error.message : "다시 불러오지 못했어요.");
    });
  };

  const minutes = Math.floor(report.masterySeconds / 60);
  const seconds = report.masterySeconds % 60;
  const learnerLabel = report.learnerName || "지우";
  return (
    <main className="report-page">
      <header className="report-header">
        <div><Link className="report-brand" href="/">모르미</Link><span>학습 리포트</span></div>
        <Link className="back-to-child" href="/"><ReportIcon name="arrow" /> 아이 화면</Link>
      </header>
      <section className="report-container">
        {source !== "server" && (
          <div className={`report-source report-source--${source}`} role="status">
            <span>{source === "loading" ? "서버에서 불러오는 중" : source === "local" ? "이 기기에 저장된 기록" : "예시 데이터"}</span>
            {notice && <p>{notice}</p>}
            {source !== "loading" && apiEnabled && <button type="button" onClick={retry}>다시 불러오기</button>}
          </div>
        )}
        <div className="report-title-row">
          <div><p>{report.date}{report.sessionUnit && ` · ${report.sessionUnit} ${report.sessionLevel}단계`}</p><h1>{learnerLabel}의 {report.sessionTitle}</h1></div>
          <div className="session-status"><i /> 세션 완료</div>
        </div>
        <div className="report-metrics">
          <article><span>반복 시도</span><strong>{report.repetitions}<small>회</small></strong><p>숙달 기준 {report.masteryTarget}회 충족</p></article>
          <article><span>숙달까지</span><strong>{minutes}<small>분</small> {seconds}<small>초</small></strong><p>{report.timedOut ? "8분 상한에서 마무리" : "권장 시간 안에 완료"}</p></article>
          <article><span>발화 사다리</span><strong>{report.ladder}<small>단계</small></strong><p>{report.ladder === 3 ? "문장으로 독립 설명" : "선택 지원으로 설명"}</p></article>
          <article className={report.transfer ? "metric-success" : ""}><span>전이 확인</span><strong>{report.transfer ? "성공" : "다음에"}</strong><p>숫자를 바꾼 문제</p></article>
        </div>
        {typeof report.firstTryCorrectCount === "number" && (
          <div className="report-metrics report-metrics--secondary">
            <article><span>한 번에 정답</span><strong>{report.firstTryCorrectCount}<small>회</small></strong><p>힌트 없이 맞힌 문제</p></article>
            <article><span>오답 시도</span><strong>{report.wrongAttemptCount ?? 0}<small>회</small></strong><p>다시 생각해 고친 횟수</p></article>
            <article><span>이번 세션 보상</span><strong>{(report.earnedCoins ?? 0).toLocaleString("ko-KR")}<small>원</small></strong><p>반복 {(report.drillCoins ?? 0).toLocaleString("ko-KR")}원 · 가르치기 {(report.teachCoins ?? 0).toLocaleString("ko-KR")}원</p></article>
            <article><span>지갑 잔액</span><strong>{(report.walletBalance ?? 0).toLocaleString("ko-KR")}<small>원</small></strong><p>서버가 정산한 누적 금액</p></article>
          </div>
        )}
        <div className="report-grid">
          <article className="report-panel misconception-panel">
            <div className="panel-heading"><div><span>오늘 관찰된 오개념</span><h2>{report.misconception}</h2></div><b>우선순위 높음</b></div>
            <div className="misconception-flow">
              <div><i>1</i><span>처음 반응</span><strong>대표 오개념 선택</strong></div><em><ReportIcon name="arrow" /></em>
              <div><i>2</i><span>지원 방법</span><strong>시각 자료 + 발화 사다리</strong></div><em><ReportIcon name="arrow" /></em>
              <div><i>3</i><span>마지막 반응</span><strong>{report.transfer ? "생활 문제까지 적용" : "전략을 함께 확인"}</strong></div>
            </div>
            <p className="observation-note">{report.synchronized ? "오개념에 한 차례 동조했지만, 힌트 뒤 스스로 수정했습니다." : "오개념에 동조하지 않고 바로 정정했습니다."}</p>
          </article>
          <article className="report-panel note-panel">
            <span>별노트 기록</span>
            <div className="mini-star-note"><ReportIcon name="star" /><p>{report.learnedLine}</p></div>
            <small>{report.ladder === 3 ? `${learnerLabel}가 알려줌` : `${learnerLabel}와 같이 공부함`}</small>
          </article>
        </div>
        {history.length > 1 && (
          <article className="report-panel report-history">
            <div className="panel-heading"><div><span>세션 이력</span><h2>최근 {history.length}개 세션</h2></div></div>
            <table>
              <thead><tr><th>날짜</th><th>세션</th><th>반복</th><th>전이</th><th>사다리</th><th>보상</th></tr></thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.learningSessionId ?? `${row.date}-${row.sessionId}`} className={row.learningSessionId === report.learningSessionId ? "is-current" : ""}>
                    <td>{row.date}</td>
                    <td>{row.sessionTitle}</td>
                    <td>{row.repetitions}회</td>
                    <td>{row.transfer ? "성공" : "다음에"}</td>
                    <td>{row.ladder}단계</td>
                    <td>{(row.earnedCoins ?? 0).toLocaleString("ko-KR")}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        )}
        <ConsentPanel />
        <article className="next-card"><div className="next-icon"><ReportIcon name="refresh" /></div><div><span>다음 세션 제안</span><h3>{report.transfer ? `${report.sessionUnit} 다음 단계로 이어가기` : `${report.sessionTitle} 실생활 문제 다시 보기`}</h3><p>{report.transfer ? "현재 전략을 한 번 확인한 뒤 더 복잡한 생활 문제로 확장합니다." : "같은 개념을 돈·시간·물건 그림으로 바꾸어 다시 연습합니다."}</p></div><b>다음 코스 반영</b></article>
      </section>
    </main>
  );
}
