"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
};

const fallback: Report = {
  date: "8월 8일",
  sessionId: "half-hour",
  sessionTitle: "30분 시계",
  sessionUnit: "시계",
  sessionLevel: 1,
  masteryTarget: 10,
  repetitions: 5,
  masterySeconds: 142,
  misconception: "긴 바늘 숫자를 그대로 ‘분’으로 읽음",
  synchronized: true,
  transfer: true,
  ladder: 2,
  timedOut: false,
  learnedLine: "긴 바늘이 6이면 30분이야!",
};

export function ReportDashboard() {
  const [report, setReport] = useState<Report>(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("morami-report");
      if (saved) window.requestAnimationFrame(() => setReport({ ...fallback, ...JSON.parse(saved) }));
    } catch { /* demo fallback */ }
  }, []);

  const minutes = Math.floor(report.masterySeconds / 60);
  const seconds = report.masterySeconds % 60;
  return (
    <main className="report-page">
      <header className="report-header">
        <div><Link className="report-brand" href="/">모르미</Link><span>학습 리포트</span></div>
        <Link className="back-to-child" href="/"><ReportIcon name="arrow" /> 아이 화면</Link>
      </header>
      <section className="report-container">
        <div className="report-title-row">
          <div><p>{report.date} · {report.sessionUnit} {report.sessionLevel}단계</p><h1>지우의 {report.sessionTitle}</h1></div>
          <div className="session-status"><i /> 세션 완료</div>
        </div>
        <div className="report-metrics">
          <article><span>반복 시도</span><strong>{report.repetitions}<small>회</small></strong><p>숙달 기준 {report.masteryTarget}회 충족</p></article>
          <article><span>숙달까지</span><strong>{minutes}<small>분</small> {seconds}<small>초</small></strong><p>{report.timedOut ? "8분 상한에서 마무리" : "권장 시간 안에 완료"}</p></article>
          <article><span>발화 사다리</span><strong>{report.ladder}<small>단계</small></strong><p>{report.ladder === 3 ? "문장으로 독립 설명" : "선택 지원으로 설명"}</p></article>
          <article className={report.transfer ? "metric-success" : ""}><span>전이 확인</span><strong>{report.transfer ? "성공" : "다음에"}</strong><p>숫자를 바꾼 문제</p></article>
        </div>
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
            <small>{report.ladder === 3 ? "지우가 알려줌" : "지우와 같이 공부함"}</small>
          </article>
        </div>
        <article className="next-card"><div className="next-icon"><ReportIcon name="refresh" /></div><div><span>다음 세션 제안</span><h3>{report.transfer ? `${report.sessionUnit} 다음 단계로 이어가기` : `${report.sessionTitle} 실생활 문제 다시 보기`}</h3><p>{report.transfer ? "현재 전략을 한 번 확인한 뒤 더 복잡한 생활 문제로 확장합니다." : "같은 개념을 돈·시간·물건 그림으로 바꾸어 다시 연습합니다."}</p></div><b>다음 코스 반영</b></article>
      </section>
    </main>
  );
}
