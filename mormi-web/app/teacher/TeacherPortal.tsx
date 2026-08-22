"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  api,
  ApiError,
  clearEducatorSession,
  readStoredEducator,
  type Cohort,
  type CohortLearner,
  type CohortLearnerReport,
  type CohortReport,
  type CohortTaskReport,
  type EducatorProfile,
} from "../api-client";
import { sessions } from "../math-curriculum";

function useEducator() {
  const [educator, setEducator] = useState<EducatorProfile | null | undefined>(undefined);
  useEffect(() => {
    const stored = readStoredEducator();
    if (!stored) {
      window.location.replace("/");
      return;
    }
    window.requestAnimationFrame(() => setEducator(stored));
  }, []);
  return educator;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "교사 로그인이 만료됐어요. 다시 로그인해 주세요.";
    if (error.status === 403) return "이 학급을 볼 권한이 없습니다.";
    if (error.status === 404) return "아직 집계할 학습 기록이 없습니다.";
    if (error.code === "research_code_issued") return "이미 발급된 참여 번호가 포함돼 있어요.";
  }
  return fallback;
}

function TeacherFrame({ educator, children }: { educator: EducatorProfile; children: ReactNode }) {
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    try { await api.educatorLogout(); } catch { /* 로컬 교사 세션은 항상 정리한다. */ }
    clearEducatorSession();
    window.location.assign("/");
  }
  return <main className="teacher-portal">
    <header className="teacher-portal__header">
      <Link className="teacher-portal__brand" href="/teacher/cohorts"><span>모르미</span> 교사 학급</Link>
      <div><span><b>{educator.displayName}</b> {educator.position}</span><small>{educator.organizationName}</small></div>
      <button type="button" onClick={() => void logout()} disabled={loggingOut}>{loggingOut ? "나가는 중…" : "교사 로그아웃"}</button>
    </header>
    {children}
  </main>;
}

function TeacherLoading() {
  return <main className="teacher-portal"><p className="teacher-loading" role="status">교사 화면을 준비하고 있어요…</p></main>;
}

export function TeacherCohorts() {
  const educator = useEducator();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Cohort | null>(null);

  useEffect(() => {
    if (!educator) return;
    void api.cohorts().then(setCohorts).catch((reason) => setError(errorMessage(reason, "학급 목록을 불러오지 못했어요."))).finally(() => setLoading(false));
  }, [educator]);

  async function create() {
    if (!name.trim() || creating) return;
    setCreating(true); setError("");
    try {
      const cohort = await api.createCohort(name.trim());
      setCohorts((current) => [...current, cohort]);
      setCreated(cohort); setName("");
    } catch (reason) { setError(errorMessage(reason, "학급을 만들지 못했어요.")); }
    finally { setCreating(false); }
  }

  if (!educator) return <TeacherLoading />;
  return <TeacherFrame educator={educator}>
    <section className="teacher-page">
      <div className="teacher-page__heading"><p className="eyebrow">담당 학급</p><h1>아이들과 함께할 학급</h1><p>학급을 만들고 참여 번호를 발급해 학습 기록을 연결하세요.</p></div>
      <form className="teacher-create-cohort" onSubmit={(event) => { event.preventDefault(); void create(); }}><label htmlFor="cohort-name">새 학급 이름</label><div><input id="cohort-name" value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} placeholder="예: 햇살반" /><button type="submit" disabled={!name.trim() || creating}>{creating ? "만드는 중…" : "학급 만들기"}</button></div></form>
      {created && <div className="teacher-class-code" role="status"><span>학급 생성 완료</span><b>{created.class_code}</b><p>학급 코드입니다. 참여 번호는 학급 상세에서 따로 발급해 주세요.</p><Link href={`/teacher/cohorts/${created.id}`}>학급 열기 →</Link></div>}
      {error && <p className="teacher-error" role="alert">{error}</p>}
      {loading ? <p className="teacher-empty" role="status">학급을 불러오는 중이에요…</p> : cohorts.length === 0 ? <div className="teacher-empty"><span aria-hidden="true">🏫</span><h2>아직 만든 학급이 없어요</h2><p>위에서 첫 학급을 만들어 보세요.</p></div> : <div className="teacher-cohort-grid">{cohorts.map((cohort) => <Link key={cohort.id} href={`/teacher/cohorts/${cohort.id}`}><span>학급 코드</span><b>{cohort.name}</b><strong>{cohort.class_code}</strong><small>아이 목록과 리포트 보기 →</small></Link>)}</div>}
    </section>
  </TeacherFrame>;
}

function reportForLearner(report: CohortReport | null, learnerId: number) {
  return report?.body.learners?.find((item) => item.learner_id === learnerId) ?? null;
}

function bottleneck(report: CohortLearnerReport | null) {
  return report?.tasks.filter((task) => task.bottleneck_candidate).sort((a, b) => (b.bottleneck_evidence_count ?? 0) - (a.bottleneck_evidence_count ?? 0))[0]?.bottleneck_candidate ?? "관찰 없음";
}

export function TeacherCohortDetail({ cohortId }: { cohortId: number }) {
  const educator = useEducator();
  const [cohort, setCohort] = useState<Cohort | null>(null);
  const [learners, setLearners] = useState<CohortLearner[]>([]);
  const [report, setReport] = useState<CohortReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [codesText, setCodesText] = useState("");
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);

  useEffect(() => {
    if (!educator || !Number.isInteger(cohortId)) return;
    void Promise.all([
      api.cohorts(),
      api.cohortLearners(cohortId),
      api.cohortReport(cohortId).catch((reason) => reason instanceof ApiError && reason.status === 404 ? null : Promise.reject(reason)),
    ]).then(([all, learnerRows, cohortReport]) => {
      setCohort(all.find((item) => item.id === cohortId) ?? null);
      setLearners(learnerRows); setReport(cohortReport);
    }).catch((reason) => setError(errorMessage(reason, "학급 정보를 불러오지 못했어요."))).finally(() => setLoading(false));
  }, [cohortId, educator]);

  async function issueCodes() {
    const codes = [...new Set(codesText.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean))];
    if (!codes.length || issuing) return;
    setIssuing(true); setError("");
    try {
      const issued = await api.issueResearchCodes(cohortId, codes);
      setIssuedCodes(issued.map((item) => item.code)); setCodesText("");
      setLearners(await api.cohortLearners(cohortId));
    } catch (reason) { setError(errorMessage(reason, "참여 번호를 발급하지 못했어요.")); }
    finally { setIssuing(false); }
  }

  if (!educator) return <TeacherLoading />;
  return <TeacherFrame educator={educator}><section className="teacher-page">
    <Link className="teacher-back" href="/teacher/cohorts">← 학급 목록</Link>
    <div className="teacher-page__heading"><p className="eyebrow">학급 상세</p><h1>{cohort?.name ?? (loading ? "학급을 불러오는 중…" : "학급")}</h1>{cohort && <p>학급 코드 <b>{cohort.class_code}</b> · 최근 7일 학습 집계</p>}</div>
    <form className="teacher-code-issuer" onSubmit={(event) => { event.preventDefault(); void issueCodes(); }}><div><label htmlFor="research-codes">참여 번호 발급</label><p>한 줄에 하나씩 또는 쉼표로 여러 개를 입력할 수 있어요.</p></div><textarea id="research-codes" value={codesText} onChange={(event) => setCodesText(event.target.value.toUpperCase().replace(/[^A-Z0-9._,\-\s]/g, ""))} placeholder={'MORMI-A01\nMORMI-A02'} /><button type="submit" disabled={!codesText.trim() || issuing}>{issuing ? "발급 중…" : "참여 번호 발급"}</button></form>
    {issuedCodes.length > 0 && <div className="teacher-issued-codes" role="status"><span>발급된 참여 번호</span>{issuedCodes.map((code) => <b key={code}>{code}</b>)}</div>}
    {error && <p className="teacher-error" role="alert">{error}</p>}
    {!loading && learners.length === 0 ? <div className="teacher-empty"><h2>아직 연결된 아이가 없어요</h2><p>참여 번호를 발급하고 아이가 그 번호로 가입하면 자동으로 연결됩니다.</p></div> : <div className="teacher-table-wrap"><table className="teacher-learners-table"><thead><tr><th>아이</th><th>참여 번호</th><th>최근 학습</th><th>완료 세션</th><th>병목 후보</th><th /></tr></thead><tbody>{learners.map((learner) => { const learnerReport = reportForLearner(report, learner.id); return <tr key={learner.id}><td><b>{learner.display_name}</b></td><td>{learner.research_code}</td><td>{learnerReport?.session_count ? "최근 7일 기록 있음" : "기록 없음"}</td><td>{learnerReport?.session_count ?? 0}개</td><td>{bottleneck(learnerReport)}</td><td><Link href={`/teacher/learners/${learner.id}?cohort=${cohortId}`}>리포트 보기</Link></td></tr>; })}</tbody></table></div>}
    {report?.body.disclaimer && <p className="teacher-disclaimer">※ {report.body.disclaimer}</p>}
  </section></TeacherFrame>;
}

function outcomeLabel(task: CohortTaskReport) {
  if (task.system_failure) return "시스템 확인 필요";
  if (task.first_try_success) return "첫 시도 성공";
  if (task.retry_success) return "다시 생각해 성공";
  if (task.success_after_help) return "도움 후 성공";
  return task.completion_outcome ?? "관찰 중";
}

export function TeacherLearnerReport({ learnerId, cohortId }: { learnerId: number; cohortId: number }) {
  const educator = useEducator();
  const [learner, setLearner] = useState<CohortLearner | null>(null);
  const [report, setReport] = useState<CohortReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!educator || !Number.isInteger(learnerId) || !Number.isInteger(cohortId)) return;
    void Promise.all([api.cohortLearners(cohortId), api.cohortReport(cohortId)]).then(([learners, cohortReport]) => {
      setLearner(learners.find((item) => item.id === learnerId) ?? null); setReport(cohortReport);
    }).catch((reason) => setError(errorMessage(reason, "아이 리포트를 불러오지 못했어요."))).finally(() => setLoading(false));
  }, [cohortId, educator, learnerId]);

  const learnerReport = useMemo(() => reportForLearner(report, learnerId), [learnerId, report]);
  const tasks = learnerReport?.tasks ?? [];
  const wrongAttempts = tasks.reduce((sum, task) => sum + task.wrong_attempt_count, 0);
  const helped = tasks.filter((task) => task.success_after_help).length;
  if (!educator) return <TeacherLoading />;
  return <TeacherFrame educator={educator}><section className="teacher-page teacher-learner-report">
    <Link className="teacher-back" href={Number.isInteger(cohortId) ? `/teacher/cohorts/${cohortId}` : "/teacher/cohorts"}>← 학급으로</Link>
    <div className="teacher-page__heading"><p className="eyebrow">아이 학습 리포트</p><h1>{learner?.display_name ?? (loading ? "리포트를 불러오는 중…" : "학습자")}</h1><p>교사 권한으로 조회한 최근 7일 학급 집계 중 이 아이의 관찰 기록입니다.</p></div>
    {error && <p className="teacher-error" role="alert">{error}</p>}
    {!loading && !learnerReport ? <div className="teacher-empty"><h2>최근 학습 기록이 없어요</h2><p>아이가 학습을 마치면 이곳에 집계 결과가 나타납니다.</p></div> : <><div className="teacher-report-stats"><div><span>완료 세션</span><b>{learnerReport?.session_count ?? 0}</b></div><div><span>관찰한 활동</span><b>{tasks.length}</b></div><div><span>도움 후 성공</span><b>{helped}</b></div><div><span>틀린 시도</span><b>{wrongAttempts}</b></div></div><div className="teacher-task-list">{tasks.map((task, index) => { const curriculum = sessions.find((item) => item.id === task.curriculum_session_id); return <article key={`${task.learning_session_id}-${task.task_key}-${index}`}><div><span>{curriculum?.unit ?? task.activity}</span><h2>{curriculum?.title ?? task.task_key}</h2><p>{task.activity} · 시도 {task.attempt_count}회</p></div><strong>{outcomeLabel(task)}</strong>{task.bottleneck_candidate && <small>병목 후보: {task.bottleneck_candidate} ({task.bottleneck_evidence_count ?? 0}회 근거)</small>}</article>; })}</div></>}
    {report?.body.disclaimer && <p className="teacher-disclaimer">※ {report.body.disclaimer}</p>}
  </section></TeacherFrame>;
}
