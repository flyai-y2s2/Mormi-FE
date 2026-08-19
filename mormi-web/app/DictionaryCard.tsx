"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type DictionaryCardEnvelope, type DictionaryCardPayload } from "./api-client";

type DictionarySource = {
  conversationId?: string | null;
  learningSessionId?: string | null;
  expectedContentVersion?: number;
};

function isDictionaryCardEnvelope(value: DictionaryCardEnvelope): boolean {
  return Boolean(
    value?.card?.title
    && Array.isArray(value.card.concept?.lines)
    && Array.isArray(value.card.example?.lines)
    && value.reference?.card_id === value.card.card_id
    && value.reference?.content_version === value.card.content_version,
  );
}

function numericEntries(data: Record<string, unknown>) {
  return Object.entries(data).filter((entry): entry is [string, number] => typeof entry[1] === "number");
}

const visualLabels: Record<string, string> = {
  left: "왼쪽",
  right: "오른쪽",
  left_count: "왼쪽",
  right_count: "오른쪽",
  total: "모두",
  count: "개수",
  filled: "채운 수",
  empty: "빈칸",
  start: "처음",
  removed: "뺀 수",
  remaining: "남은 수",
  payment: "낸 돈",
  price: "물건값",
  change: "거스름돈",
  budget: "예산",
  order_total: "주문 금액",
  groups: "묶음 수",
  per_group: "한 묶음",
  number: "수",
  ones: "낱개",
  tens_value: "십의 값",
};

function DictionaryVisual({ card }: { card: DictionaryCardPayload }) {
  const { visual, example } = card;
  const data = visual.data ?? {};
  const entries = numericEntries(data);
  const count = typeof data.count === "number" ? data.count : typeof data.filled === "number" ? data.filled : null;
  const total = typeof data.total === "number" ? data.total : count;

  if ((visual.type === "count_sequence" || visual.type === "ten_frame") && count !== null) {
    const cells = Math.max(10, Math.min(20, total ?? 10));
    return (
      <div className="dictionary-api-dots" role="img" aria-label={visual.alt_text}>
        {Array.from({ length: cells }, (_, index) => <i key={index} className={index < count ? "is-filled" : ""} />)}
      </div>
    );
  }

  if (example.equation) {
    return <div className="dictionary-api-equation" role="img" aria-label={visual.alt_text}>{example.equation.expression}</div>;
  }

  if (entries.length > 0) {
    return (
      <div className="dictionary-api-values" role="img" aria-label={visual.alt_text}>
        {entries.slice(0, 6).map(([key, value]) => (
          <span key={key}><small>{visualLabels[key] ?? key.replaceAll("_", " ")}</small><strong>{value.toLocaleString("ko-KR")}{/(payment|price|change|budget|total)/.test(key) ? "원" : ""}</strong></span>
        ))}
      </div>
    );
  }

  return visual.alt_text ? <p className="dictionary-api-alt">{visual.alt_text}</p> : null;
}

export function DictionaryCardView({ card }: { card: DictionaryCardPayload }) {
  return (
    <article className="dictionary-api-card">
      <p className="dictionary-api-kicker">궁금해 사전</p>
      <h2>{card.title}</h2>
      <DictionaryVisual card={card} />
      <div className="dictionary-api-copy">
        {card.concept.lines.map((line) => <p key={`concept-${line}`}>{line}</p>)}
        {card.example.lines.map((line) => <p key={`example-${line}`} className="is-example">{line}</p>)}
      </div>
    </article>
  );
}

function dictionaryErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 404) return "아직 준비된 사전 카드가 없어요.";
  if (error instanceof ApiError && error.status === 409) return "사전 내용이 바뀌었어요. 다시 불러와 주세요.";
  return "궁금해 사전을 잠시 불러오지 못했어요.";
}

export function DictionaryModal({
  onClose,
  conversationId,
  learningSessionId,
  expectedContentVersion,
}: DictionarySource & { onClose: () => void }) {
  const [envelope, setEnvelope] = useState<DictionaryCardEnvelope | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    try {
      const next = conversationId
        ? await api.dictionaryForConversation(conversationId)
        : learningSessionId
          ? await api.dictionaryForLearningSession(learningSessionId, expectedContentVersion)
          : null;
      if (!next || !isDictionaryCardEnvelope(next)) {
        setEnvelope(null);
        setStatus("empty");
        return;
      }
      setEnvelope(next);
      setStatus("ready");
    } catch (error) {
      setEnvelope(null);
      setMessage(dictionaryErrorMessage(error));
      setStatus("error");
    }
  }, [conversationId, expectedContentVersion, learningSessionId]);

  useEffect(() => {
    const pendingLoad = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(pendingLoad);
  }, [load]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop dictionary-api-backdrop" role="dialog" aria-modal="true" aria-label="궁금해 사전">
      <div className="dictionary-api-modal">
        <button className="dictionary-api-close" type="button" onClick={onClose} aria-label="궁금해 사전 닫기">×</button>
        {status === "loading" && <div className="dictionary-api-state" role="status"><i className="dictionary-api-spinner" /><h2>궁금해 사전을 펼치는 중…</h2><p>잠시만 기다려 줘.</p></div>}
        {status === "ready" && envelope && <DictionaryCardView card={envelope.card} />}
        {status === "empty" && <div className="dictionary-api-state"><h2>아직 보여 줄 카드가 없어요.</h2><p>학습을 조금 더 진행한 뒤 다시 열어 봐요.</p></div>}
        {status === "error" && <div className="dictionary-api-state" role="alert"><h2>{message}</h2><button type="button" onClick={() => void load()}>다시 불러오기</button></div>}
        {status === "ready" && <button className="primary-button primary-button--purple dictionary-api-done" type="button" onClick={onClose}>다 읽었어!</button>}
      </div>
    </div>
  );
}
