"use client";

import { useState, type FormEvent } from "react";

export function TeacherReportLogin({
  onAuthenticated = () => window.location.reload(),
}: {
  onAuthenticated?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/teacher-report-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 429
          ? "입력 시도가 많습니다. 잠시 후 다시 시도해 주세요."
          : "비밀번호를 확인해 주세요.");
        return;
      }
      onAuthenticated();
    } catch {
      setError("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="teacher-report-login" aria-labelledby="teacher-report-login-title">
      <span className="teacher-report-login__mark" aria-hidden="true">교사</span>
      <div>
        <h1 id="teacher-report-login-title">교사용 리포트</h1>
        <p>교사용 비밀번호를 입력하면 학습자를 검색할 수 있습니다.</p>
        <form onSubmit={submit}>
          <label htmlFor="teacher-report-password">교사용 비밀번호</label>
          <input
            id="teacher-report-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={submitting}
            required
          />
          <button type="submit" disabled={submitting || !password}>
            {submitting ? "확인 중…" : "들어가기"}
          </button>
        </form>
        {error && <p className="teacher-report-login__error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
