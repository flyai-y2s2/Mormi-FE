"use client";

import { useState } from "react";

type PreviewMode = "HOME" | "LIFE";
type PreviewStatus = "good" | "growing" | "review" | "collecting";
type PreviewDomain = { id: string; label: string; status: PreviewStatus; metrics: readonly [string, string, string][]; changeReason: string; thinkingChange: string; nextCheck: string; pastUtterance: string; recentUtterance: string };

const statusLabels: Record<PreviewStatus, string> = { good: "양호", growing: "발달 중", review: "확인 필요", collecting: "기록 모으는 중" };
const modeLabels: Record<PreviewMode, string> = { HOME: "집 · 개념", LIFE: "실생활 · 응용" };
const sessionSamples: Record<PreviewMode, readonly [string, string, string][]> = {
  HOME: [["반복학습 정답률", "64%", "86%"], ["정답까지 평균", "2.4회", "1.3회"], ["혼자 말하기", "20%", "60%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "20/35/25/15/5%", "60/20/20/0/0%"]],
  LIFE: [["실생활 정답률", "58%", "78%"], ["정답까지 평균", "2.8회", "1.6회"], ["혼자 말하기", "10%", "40%"], ["발화 단계 사용 비율 (L4/L3/L2/L1/L0)", "10/30/30/20/10%", "40/30/20/10/0%"]],
};
const previewDomains: Record<PreviewMode, readonly PreviewDomain[]> = {
  HOME: [
    { id: "money-count", label: "돈 세기", status: "good", metrics: [["정답률", "64%", "86%"], ["정답까지 평균", "2.4회", "1.3회"], ["혼자 말하기", "20%", "60%"]], changeReason: "최근에는 정답률이 높아지고 정답까지 필요한 시도가 줄어, 풀이가 더 안정적으로 이어졌어요.", thinkingChange: "과거에는 답만 말했지만, 최근에는 동전의 종류와 개수를 나누어 이유까지 설명했어요.", nextCheck: "다음 활동에서는 그림 없이도 동전의 종류와 개수를 나누어 말하는지 확인해 보세요.", pastUtterance: "500원이에요.", recentUtterance: "100원짜리 네 개와 500원짜리 한 개를 더하면 900원이에요." },
    { id: "price-add", label: "가격 더하기", status: "growing", metrics: [["정답률", "58%", "76%"], ["정답까지 평균", "2.7회", "1.7회"], ["혼자 말하기", "30%", "50%"]], changeReason: "최근에는 가격을 더한 답이 더 자주 맞고, 다시 시도하는 횟수도 줄었어요.", thinkingChange: "과거에는 큰 금액이라고만 말했지만, 최근에는 두 가격을 더한 식을 말했어요.", nextCheck: "다음 활동에서는 받아올림이 있는 두 가격도 순서대로 더하는지 살펴보세요.", pastUtterance: "둘 다 사면 많이 나와요.", recentUtterance: "2,000원과 1,500원을 더해서 3,500원이에요." },
    { id: "money-budget", label: "예산과 거스름돈", status: "review", metrics: [["정답률", "44%", "62%"], ["정답까지 평균", "3.1회", "2.2회"], ["혼자 말하기", "10%", "30%"]], changeReason: "최근 수치는 좋아졌지만, 여러 계산이 이어질 때는 아직 확인이 더 필요해요.", thinkingChange: "과거에는 남은 돈을 바로 말했지만, 최근에는 낸 돈과 가격을 구분하기 시작했어요.", nextCheck: "다음 활동에서는 거스름돈을 구하는 식을 먼저 말하는지 확인해 보세요.", pastUtterance: "남은 돈은 잘 모르겠어요.", recentUtterance: "5,000원에서 3,200원을 빼요." },
  ],
  LIFE: [
    { id: "menu-calculate", label: "메뉴 값 계산", status: "good", metrics: [["정답률", "58%", "78%"], ["정답까지 평균", "2.8회", "1.6회"], ["혼자 말하기", "10%", "40%"]], changeReason: "최근에는 생활 문제 정답률이 높아지고, 필요한 시도도 줄었어요.", thinkingChange: "과거에는 답만 고르던 모습에서 최근에는 메뉴 가격을 나누어 말하기 시작했어요.", nextCheck: "다음 활동에서는 두 메뉴의 가격을 먼저 찾아 합치는지 확인해 보세요.", pastUtterance: "이게 더 비싸요.", recentUtterance: "우유와 빵 가격을 더하면 돼요." },
    { id: "change-receive", label: "거스름돈 받기", status: "growing", metrics: [["정답률", "45%", "68%"], ["정답까지 평균", "3.0회", "2.0회"], ["혼자 말하기", "10%", "30%"]], changeReason: "최근에는 맞힌 비율이 높아졌지만, 계산 순서를 스스로 말하는 연습이 더 필요해요.", thinkingChange: "과거에는 답을 미뤘지만, 최근에는 낸 돈에서 가격을 빼는 방법을 말했어요.", nextCheck: "다음 활동에서는 계산 전후의 금액을 각각 말하는지 확인해 보세요.", pastUtterance: "잘 모르겠어요.", recentUtterance: "5,000원에서 가격을 빼요." },
    { id: "queue", label: "줄 서기", status: "collecting", metrics: [["정답률", "—", "85%"], ["정답까지 평균", "—", "1.5회"], ["혼자 말하기", "—", "40%"]], changeReason: "최근 기록은 좋지만, 과거와 비교할 만큼의 기록을 더 모으고 있어요.", thinkingChange: "최근에는 두 줄의 사람 수를 비교해 더 짧은 줄을 말했어요.", nextCheck: "다음 활동에서는 두 수를 어떤 방법으로 비교했는지 말하는지 확인해 보세요.", pastUtterance: "비교할 과거 발화 기록을 모으는 중이에요.", recentUtterance: "왼쪽 줄이 두 명이라 더 짧아요." },
  ],
};

export function NumericReportPreview() {
  const [mode, setMode] = useState<PreviewMode>("HOME");
  const [selectedDomainId, setSelectedDomainId] = useState("money-count");
  const domains = previewDomains[mode];
  const selectedDomain = domains.find((domain) => domain.id === selectedDomainId) ?? domains[0];
  const selectMode = (nextMode: PreviewMode) => { setMode(nextMode); setSelectedDomainId(previewDomains[nextMode][0].id); };

  return <main className="report-page numeric-preview-page">
    <header className="report-header"><div><a className="report-brand" href="/">모르미</a><span>교사용 리포트</span></div><a className="back-to-child" href="/"><span aria-hidden="true">←</span> 학습 화면</a></header>
    <article className="report-paper numeric-preview" data-report-format="a4">
      <header className="numeric-preview__header"><p className="numeric-preview__document-title">학습자 김민준 <span aria-hidden="true">/</span> 개인 진단 리포트</p><p>최근 학습 기록을 숫자로 먼저 살펴봅니다.</p></header>
      <section className="numeric-preview__section" aria-labelledby="numeric-summary-title"><h2 id="numeric-summary-title">현재 상태 요약</h2><div className="numeric-summary-values"><article><span>정답률</span><strong>86%</strong></article><article><span>정답까지 평균</span><strong>1.3회</strong></article><article><span>혼자 말하기</span><strong>60%</strong></article><article><span>주로 사용한 단계</span><strong>L4</strong></article></div></section>
      <section className="numeric-preview__section" aria-labelledby="numeric-trend-title">
        <h2 id="numeric-trend-title">세션별 변화</h2><div className="numeric-preview-tabs" role="tablist" aria-label="학습 환경 선택">{(Object.keys(modeLabels) as PreviewMode[]).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} className={mode === item ? "is-active" : ""} onClick={() => selectMode(item)}>{modeLabels[item]}</button>)}</div>
        <div className="numeric-domain-selector" aria-label="변화를 볼 영역 선택">{domains.map((domain) => <button key={domain.id} type="button" className={selectedDomain.id === domain.id ? "is-active" : ""} aria-pressed={selectedDomain.id === domain.id} onClick={() => setSelectedDomainId(domain.id)}>{domain.label}</button>)}</div>
        <div className="numeric-session-comparison" aria-label={`${modeLabels[mode]} 과거 전체와 최근 비교`}><div className="numeric-session-comparison__head"><span></span><strong>과거 전체</strong><strong>최근</strong></div>{sessionSamples[mode].map(([label, past, recent]) => <div key={label}><span>{label}</span><strong>{past}</strong><strong>{recent}</strong></div>)}</div>
        <details className="numeric-level-guide"><summary>발화 단계 L0–L4 보기</summary><ul><li><b>L4</b> 자기 말로 답과 이유 설명</li><li><b>L3</b> 답과 이유를 짧게 나누어 말함</li><li><b>L2</b> 선택지에서 골라 표현</li><li><b>L1</b> 빈칸·수 세기·조작 도움으로 완성</li><li><b>L0</b> 도움 카드와 함께 수행</li></ul><p>표시 비율은 과제마다 마지막으로 성공한 발화 단계입니다.</p></details>
      </section>
      <section className="numeric-preview__section" aria-labelledby="numeric-domain-title">
        <h2 id="numeric-domain-title">현재 영역별 상태</h2><div className="numeric-status-selector" aria-label="상태를 볼 영역 선택">{domains.map((domain) => <button key={domain.id} type="button" className={`numeric-status--${domain.status} ${selectedDomain.id === domain.id ? "is-active" : ""}`} aria-pressed={selectedDomain.id === domain.id} onClick={() => setSelectedDomainId(domain.id)}><span>{domain.label}</span><small>{statusLabels[domain.status]}</small></button>)}</div>
        <div className="numeric-domain-detail"><div className="numeric-domain-detail__numbers">{selectedDomain.metrics.map(([label, past, recent]) => <p key={label}><span>{label}</span><strong>{past}</strong><i aria-hidden="true">→</i><strong>{recent}</strong></p>)}</div><div className="numeric-ai-items" aria-label={`${selectedDomain.label} AI 진단`}><article><strong>변화 이유</strong><p>{selectedDomain.changeReason}</p></article><article><strong>생각의 변화</strong><p>{selectedDomain.thinkingChange}</p></article><article><strong>다음 확인</strong><p>{selectedDomain.nextCheck}</p></article></div><details className="numeric-evidence"><summary>계산·발화 근거 보기</summary><div><p><b>과거 발화</b>{selectedDomain.pastUtterance}</p><p><b>최근 발화</b>{selectedDomain.recentUtterance}</p></div></details></div>
      </section>
    </article>
  </main>;
}
