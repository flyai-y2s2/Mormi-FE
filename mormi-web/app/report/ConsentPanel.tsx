"use client";

import { useEffect, useState } from "react";
import { ApiError, api, apiEnabled, readStoredLearner, type RetentionPolicy } from "../api-client";

/**
 * 자유 발화 저장 동의. 보호자·교사가 보는 리포트 화면에만 둔다.
 *
 * 아이가 가르치기 화면에서 직접 쓴 문장은 개인정보라, 저장 여부와 보존 기간을
 * 서버가 이 값으로 판단한다. 화면에 임시로 들고 있다가 나중에 보내지 않고,
 * 바꾸는 즉시 서버에 반영하고 서버가 돌려준 값을 다시 표시한다.
 *
 * 서버는 두 값의 조합을 강하게 제약한다(Learner.applyConsent).
 *   동의함  → retention_policy 는 no_raw 가 될 수 없다
 *   동의 안 함 → retention_policy 는 반드시 no_raw
 * 그래서 no_raw 는 선택지로 두지 않고 동의 토글로만 표현하고, 동의를 켤 때는
 * 보관 기간 기본값을 함께 정해 보낸다.
 */
const RETENTION_OPTIONS: { value: Exclude<RetentionPolicy, "no_raw">; label: string; detail: string }[] = [
  { value: "30_days", label: "30일 보관", detail: "30일 뒤 원문을 자동으로 지웁니다." },
  { value: "90_days", label: "90일 보관", detail: "90일 뒤 원문을 자동으로 지웁니다." },
  { value: "permanent", label: "연구 종료까지 보관", detail: "연구가 끝날 때까지 암호화해 보관합니다." },
];

const DEFAULT_RETENTION: RetentionPolicy = "30_days";

export function ConsentPanel() {
  const [consent, setConsent] = useState(false);
  const [retention, setRetention] = useState<RetentionPolicy>("no_raw");
  const [state, setState] = useState<"loading" | "ready" | "saving" | "unavailable">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const learner = readStoredLearner();
    if (!apiEnabled || !learner) {
      // 첫 렌더 직후에 넘긴다. 효과 본문에서 바로 setState 하면 연쇄 렌더가 된다.
      window.requestAnimationFrame(() => setState("unavailable"));
      return;
    }
    void api.getLearner(learner.id).then((profile) => {
      setConsent(profile.conversation_storage_consent);
      setRetention(profile.retention_policy);
      setState("ready");
    }).catch((error: unknown) => {
      setState("unavailable");
      setMessage(error instanceof ApiError ? error.message : "동의 설정을 불러오지 못했어요.");
    });
  }, []);

  // 서버가 확정한 값만 화면에 남긴다. 실패하면 이전 값으로 되돌린다.
  const save = (nextConsent: boolean, nextRetention: RetentionPolicy) => {
    const previous = { consent, retention };
    setConsent(nextConsent);
    setRetention(nextRetention);
    setState("saving");
    setMessage("");
    void api.updateConversationConsent(nextConsent, nextRetention).then((profile) => {
      setConsent(profile.conversation_storage_consent);
      setRetention(profile.retention_policy);
      setState("ready");
      setMessage("저장했습니다.");
    }).catch((error: unknown) => {
      setConsent(previous.consent);
      setRetention(previous.retention);
      setState("ready");
      setMessage(error instanceof ApiError ? error.message : "저장하지 못했어요. 다시 시도해 주세요.");
    });
  };

  /** 동의를 켜면 no_raw 로는 둘 수 없으므로 보관 기간을 함께 정해 보낸다. */
  const toggleConsent = (nextConsent: boolean) => {
    if (!nextConsent) return save(false, "no_raw");
    save(true, retention === "no_raw" ? DEFAULT_RETENTION : retention);
  };

  if (state === "loading") return null;
  if (state === "unavailable") {
    return (
      <article className="report-panel consent-panel">
        <div className="panel-heading"><div><span>자유 발화 저장 동의</span><h2>설정을 불러올 수 없어요</h2></div></div>
        <p className="consent-note">{message || "아이 화면에서 한 번 로그인한 뒤 다시 열어 주세요."}</p>
      </article>
    );
  }

  const busy = state === "saving";
  return (
    <article className="report-panel consent-panel">
      <div className="panel-heading">
        <div><span>자유 발화 저장 동의</span><h2>아이가 직접 쓴 문장을 저장할까요?</h2></div>
        <b className={consent ? "is-on" : ""}>{consent ? "동의함" : "동의 안 함"}</b>
      </div>
      <p className="consent-note">
        모르미를 가르칠 때 아이가 입력창에 쓴 문장을 말합니다. 동의하면 암호화해 보관하고,
        동의하지 않으면 정답 여부·걸린 시간 같은 분석 지표만 남습니다. 언제든지 바꿀 수 있습니다.
      </p>
      <label className="consent-toggle">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(event) => toggleConsent(event.target.checked)}
        />
        <span>아이가 쓴 문장 원문을 저장하는 데 동의합니다</span>
      </label>
      <fieldset className="consent-retention" disabled={busy || !consent}>
        <legend>보존 기간</legend>
        {RETENTION_OPTIONS.map((option) => (
          <label key={option.value} htmlFor={`retention-${option.value}`} className={retention === option.value ? "is-selected" : ""}>
            <input
              id={`retention-${option.value}`}
              type="radio"
              name="retention-policy"
              value={option.value}
              checked={retention === option.value}
              onChange={() => save(true, option.value)}
            />
            <strong>{option.label}</strong>
            <small>{option.detail}</small>
          </label>
        ))}
      </fieldset>
      <p className="consent-message" role="status">{busy ? "저장하는 중…" : message}</p>
    </article>
  );
}
