"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { captureMormeyEvent } from "../analytics";
import {
  api,
  ApiError,
  storeEducatorSession,
  storeSession,
  type EducatorAuthResponse,
} from "../api-client";
import { toAuthFailure, type AuthField, type AuthFailure } from "../auth-errors";

type SignupRole = "learner" | "educator";
type EducatorField = "organizationName" | "displayName" | "position" | "loginId" | "password";
const LOGIN_ID_PATTERN = /^[a-zA-Z0-9]{4,20}$/;

function AuthInput({ id, label, hint, error, action, ...inputProps }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  action?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return <div className={`auth-field${error ? " has-error" : ""}`}>
    <label htmlFor={id}><span>{label}{hint && <em>{hint}</em>}</span>{action}</label>
    <input id={id} aria-invalid={error ? true : undefined} {...inputProps} />
    {error && <p className="auth-field-error" role="alert">{error}</p>}
  </div>;
}

function PasswordReveal({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return <button type="button" className="auth-reveal" onClick={onToggle}>{visible ? "숨기기" : "보기"}</button>;
}

function RoleChooser({ onChoose }: { onChoose: (role: SignupRole) => void }) {
  return <main className="signup-role-scene">
    <section className="signup-role-card" aria-labelledby="signup-role-title">
      <Image src="/ui/igeonaega-logo.png" alt="이제 거꾸로, 내가 가르칠게. 이거, 내가!" width={520} height={292} priority />
      <p className="eyebrow">처음 오셨나요?</p>
      <h1 id="signup-role-title">어떤 모습으로 함께할까요?</h1>
      <p>학생은 모르미와 수학을 배우고, 선생님은 학급과 학습 기록을 관리해요.</p>
      <div className="signup-role-options">
        <button type="button" onClick={() => onChoose("learner")}><span aria-hidden="true">🌱</span><b>나는 학생</b><small>모르미와 수학 시작하기</small></button>
        <button type="button" onClick={() => onChoose("educator")}><span aria-hidden="true">🏫</span><b>나는 선생님</b><small>학급 만들고 살펴보기</small></button>
      </div>
      <Link className="onboarding-back" href="/">‹ 첫 화면으로</Link>
    </section>
  </main>;
}

function LearnerSignup({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [researchCode, setResearchCode] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, string>>>({});

  function clear(field: AuthField) {
    setFormError("");
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function next() {
    const errors: Partial<Record<AuthField, string>> = {};
    if (!name.trim()) errors.name = "이름을 적어 주세요.";
    if (!researchCode.trim()) errors.researchCode = "선생님이 알려준 참여 번호를 적어 주세요.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    captureMormeyEvent("onboarding_intro_completed");
    setStep(2);
  }

  async function submit() {
    const errors: Partial<Record<AuthField, string>> = {};
    if (!LOGIN_ID_PATTERN.test(loginId)) errors.loginId = "아이디는 영어와 숫자로 4~20자예요.";
    if (password.length < 8) errors.password = "비밀번호는 8자 이상이어야 해요.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setFormError("");
    try {
      const auth = await api.signup(name.trim(), researchCode.trim(), loginId, password);
      storeSession(auth.access_token, {
        id: auth.id,
        name: auth.display_name,
        researchCode: auth.research_code,
        analyticsId: auth.analytics_id,
      });
      captureMormeyEvent("onboarding_completed", { tutorial_available: false });
      window.location.assign("/");
    } catch (error) {
      const failure: AuthFailure = toAuthFailure(error, "signup");
      setFormError(failure.message ?? "");
      setFieldErrors(failure.fields ?? {});
      if (failure.fields?.name || failure.fields?.researchCode) setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = <div className="onboarding-steps" aria-hidden="true"><i className="is-active" /><i className={step === 2 ? "is-active" : ""} /></div>;
  return <main className="signup-form-scene onboarding-scene onboarding-scene--name">
    <div className="onboarding-morami"><Image src="/morami/happy-cutout.png" alt="웃고 있는 모르미" width={430} height={500} priority /></div>
    {step === 1 ? <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); next(); }}>
      {steps}<span>모르미 · 1/2</span><h1>너를 뭐라고 부를까?</h1><p>이름이랑 선생님이 준 참여 번호를 알려줘.</p>
      <AuthInput id="signup-name" label="이름" value={name} error={fieldErrors.name} onChange={(event) => { setName(event.target.value.slice(0, 12)); clear("name"); }} placeholder="이름을 적어 주세요" autoComplete="name" />
      <AuthInput id="signup-code" label="참여 번호" hint="선생님이 알려줬어요" value={researchCode} error={fieldErrors.researchCode} onChange={(event) => { setResearchCode(event.target.value.toUpperCase().replace(/[^A-Z0-9._-]/g, "").slice(0, 40)); clear("researchCode"); }} placeholder="예: MORMI-A03" autoComplete="off" />
      {formError && <p className="onboarding-error" role="alert">{formError}</p>}
      <button className="primary-button" type="submit">다음 <span className="button-arrow" /></button>
      <button type="button" className="onboarding-back" onClick={onBack}>‹ 역할 다시 고르기</button>
    </form> : <form className="onboarding-greeting onboarding-name-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      {steps}<span>모르미 · 2/2</span><h1>이제 열쇠를 만들자!</h1><p>다음에 올 때 이 아이디와 비밀번호로 들어오면 돼.</p>
      <AuthInput id="signup-login-id" label="아이디" hint="영어와 숫자로 4~20자" value={loginId} error={fieldErrors.loginId} onChange={(event) => { setLoginId(event.target.value.trim()); clear("loginId"); }} placeholder="예: minjun01" autoComplete="username" />
      <AuthInput id="signup-password" label="비밀번호" hint="8자 이상" value={password} error={fieldErrors.password} action={<PasswordReveal visible={reveal} onToggle={() => setReveal((value) => !value)} />} type={reveal ? "text" : "password"} onChange={(event) => { setPassword(event.target.value); clear("password"); }} placeholder="잊어버리지 않을 비밀번호" autoComplete="new-password" />
      {formError && <p className="onboarding-error" role="alert">{formError}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "만드는 중…" : "가입하고 시작하기"} <span className="button-arrow" /></button>
      <button type="button" className="onboarding-back" onClick={() => setStep(1)}>‹ 이름 다시 적기</button>
    </form>}
  </main>;
}

function educatorFailure(error: unknown) {
  const fallback = "가입 정보를 확인하고 다시 시도해 주세요.";
  if (!(error instanceof ApiError)) return { message: fallback, fields: {} };
  if (error.code === "login_id_taken") return { message: "", fields: { loginId: "이미 사용 중인 아이디예요." } };
  const known = new Set<EducatorField>(["organizationName", "displayName", "position", "loginId", "password"]);
  const fields: Partial<Record<EducatorField, string>> = {};
  for (const field of Object.keys(error.fields ?? {})) {
    if (known.has(field as EducatorField)) fields[field as EducatorField] = field === "password" ? "비밀번호는 8자 이상이어야 합니다." : "입력값을 확인해 주세요.";
  }
  return { message: Object.keys(fields).length ? "" : fallback, fields };
}

function toEducatorProfile(auth: EducatorAuthResponse) {
  return {
    id: auth.id,
    displayName: auth.display_name,
    position: auth.position,
    organizationId: auth.organization_id,
    organizationName: auth.organization_name,
  };
}

function EducatorSignup({ onBack }: { onBack: () => void }) {
  const [organizationName, setOrganizationName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState<"교사" | "연구자">("교사");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EducatorField, string>>>({});

  function clear(field: EducatorField) {
    setFormError("");
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit() {
    const errors: Partial<Record<EducatorField, string>> = {};
    if (!organizationName.trim()) errors.organizationName = "기관 이름을 적어 주세요.";
    if (!displayName.trim()) errors.displayName = "이름을 적어 주세요.";
    if (!LOGIN_ID_PATTERN.test(loginId)) errors.loginId = "아이디는 영어와 숫자로 4~20자예요.";
    if (password.length < 8) errors.password = "비밀번호는 8자 이상이어야 합니다.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSubmitting(true);
    try {
      const auth = await api.educatorSignup(organizationName.trim(), displayName.trim(), position, loginId, password);
      storeEducatorSession(auth.access_token, toEducatorProfile(auth));
      window.location.assign("/teacher/cohorts");
    } catch (error) {
      const failure = educatorFailure(error);
      setFormError(failure.message);
      setFieldErrors(failure.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="educator-signup-scene">
    <form className="educator-signup-card" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="eyebrow">선생님 가입</p><h1>학급을 준비해 볼까요?</h1><p>가입한 뒤 학급을 만들고 아이들에게 참여 번호를 나눠줄 수 있어요.</p>
      <AuthInput id="educator-organization" label="기관" value={organizationName} error={fieldErrors.organizationName} onChange={(event) => { setOrganizationName(event.target.value.slice(0, 80)); clear("organizationName"); }} placeholder="학교·센터·연구기관 이름" autoComplete="organization" />
      <AuthInput id="educator-name" label="이름" value={displayName} error={fieldErrors.displayName} onChange={(event) => { setDisplayName(event.target.value.slice(0, 40)); clear("displayName"); }} placeholder="이름을 적어 주세요" autoComplete="name" />
      <div className={`auth-field${fieldErrors.position ? " has-error" : ""}`}><label htmlFor="educator-position"><span>직위</span></label><select id="educator-position" value={position} onChange={(event) => { setPosition(event.target.value as "교사" | "연구자"); clear("position"); }}><option value="교사">교사</option><option value="연구자">연구자</option></select></div>
      <AuthInput id="educator-login-id" label="아이디" hint="영어와 숫자로 4~20자" value={loginId} error={fieldErrors.loginId} onChange={(event) => { setLoginId(event.target.value.trim()); clear("loginId"); }} placeholder="아이디를 적어 주세요" autoComplete="username" />
      <AuthInput id="educator-password" label="비밀번호" hint="8자 이상" value={password} error={fieldErrors.password} action={<PasswordReveal visible={reveal} onToggle={() => setReveal((value) => !value)} />} type={reveal ? "text" : "password"} onChange={(event) => { setPassword(event.target.value); clear("password"); }} placeholder="비밀번호를 적어 주세요" autoComplete="new-password" />
      {formError && <p className="onboarding-error" role="alert">{formError}</p>}
      <button className="primary-button" type="submit" disabled={submitting}>{submitting ? "가입하는 중…" : "가입하고 학급 만들기"} <span className="button-arrow" /></button>
      <button type="button" className="onboarding-back" onClick={onBack}>‹ 역할 다시 고르기</button>
    </form>
  </main>;
}

export function SignupExperience() {
  const [role, setRole] = useState<SignupRole | null>(null);
  if (role === "learner") return <LearnerSignup onBack={() => setRole(null)} />;
  if (role === "educator") return <EducatorSignup onBack={() => setRole(null)} />;
  return <RoleChooser onChoose={setRole} />;
}
