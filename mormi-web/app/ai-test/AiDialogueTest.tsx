"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  MormiDialogueError,
  startMormiConversation,
  submitMormiResponse,
  type MormiConversation,
  type MormiInputKind,
  type MormiMood,
  type StartMormiConversation,
  type SubmitMormiResponse,
} from "../mormi-dialogue";

const menu = [
  { id: "americano", name: "커피", price: 3000, image_url: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image_url: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image_url: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image_url: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 4500, image_url: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 5000, image_url: "/figma/cafe/sandwich.png?v=2" },
] as const;

const scenarios = [
  { id: "home_addition_teach", scene: "home_teach", label: "집 · 덧셈 가르치기", note: "현재 AI가 지원하는 집 시나리오" },
  { id: "cafe_queue", scene: "cafe", label: "카페 · 줄 서기", note: "1~5명 두 줄을 AI가 생성" },
  { id: "cafe_budget_menu", scene: "cafe", label: "카페 · 예산 메뉴", note: "모르미 메뉴 + 아이 메뉴" },
  { id: "cafe_menu_total", scene: "cafe", label: "카페 · 메뉴 합계", note: "선택 후 두 가격 덧셈" },
  { id: "cafe_change", scene: "cafe", label: "카페 · 거스름돈", note: "현재 AI 정의: 두 메뉴 합계 기준" },
] as const;

type Scenario = (typeof scenarios)[number];
type TestMessage = { role: "mormi" | "child"; text: string };

const moodImage: Record<MormiMood, string> = {
  curious: "/morami/confused-cutout.png",
  listening: "/morami/calm-cutout.png",
  thinking: "/morami/bright-cutout.png",
  relieved: "/morami/happy-cutout.png",
  celebrating: "/morami/celebrate-cutout.png",
};

function startPayload(scenario: Scenario): StartMormiConversation {
  const common = {
    learner_id: 1,
    scene: scenario.scene,
    scenario_id: scenario.id,
    conversation_storage_consent: false,
    retention_policy: "no_raw" as const,
  };
  if (scenario.scene === "home_teach") {
    return {
      ...common,
      scene: "home_teach",
      learning_session_id: `local-${Date.now()}`,
      practice_result_id: `practice-local-${Date.now()}`,
      practice_summary: {
        skill_id: "basic_addition",
        question_count: 5,
        first_try_correct_count: 4,
        wrong_attempt_count: 1,
        earned_reward: 950,
        misconception_tags: [],
      },
    };
  }
  if (scenario.id === "cafe_queue") {
    return { ...common, scene: "cafe" };
  }
  const cafe_context = {
    menu_items: [...menu],
    mormi_menu_id: "strawberry-juice",
    ...(scenario.id === "cafe_budget_menu" ? { budget: 9000 } : {}),
    ...(scenario.id === "cafe_change" ? { child_menu_id: "sandwich", paid_amount: 10000 } : {}),
  };
  return { ...common, scene: "cafe", cafe_context };
}

function childSummary(input: SubmitMormiResponse) {
  if (input.text) return input.text;
  if (input.choice_ids?.length) return input.choice_ids.join(", ");
  if (input.values) return Object.entries(input.values).map(([key, value]) => `${key}: ${value}`).join(", ");
  return "도움이 필요해";
}

function Visual({ conversation }: { conversation: MormiConversation }) {
  const { type, data } = conversation.turn.visual;
  if (type === "cafe_queues") {
    const left = Number(data.left_people || 0);
    const right = Number(data.right_people || 0);
    return <div className="ai-test-queues"><Queue label="왼쪽 줄" count={left} /><Queue label="오른쪽 줄" count={right} /></div>;
  }
  if (type === "cafe_menu") {
    const items = Array.isArray(data.menu_items) ? data.menu_items as Array<{ id: string; name: string; price: number; image_url?: string }> : [];
    return <div className="ai-test-menu">{items.map((item) => <article key={item.id}><Image src={item.image_url || "/figma/cafe/cookie.png?v=2"} alt={item.name} width={120} height={78} unoptimized /><b>{item.name}</b><span>{item.price.toLocaleString("ko-KR")}원</span></article>)}</div>;
  }
  if (["vertical_equation", "cafe_calculation", "money_calculation"].includes(type)) {
    const operator = data.operation === "subtraction" ? "−" : "+";
    return <div className="ai-test-equation"><strong>{Number(data.left || 0).toLocaleString("ko-KR")}</strong><b>{operator}</b><strong>{Number(data.right || 0).toLocaleString("ko-KR")}</strong><b>=</b><strong>?</strong></div>;
  }
  if (type === "success") return <div className="ai-test-success">★ 모르미가 배움을 마쳤어요!</div>;
  return <pre className="ai-test-json">{JSON.stringify({ type, data }, null, 2)}</pre>;
}

function Queue({ label, count }: { label: string; count: number }) {
  return <section><b>{label}</b><div>{Array.from({ length: count }, (_, index) => <i key={index}><span /></i>)}</div></section>;
}

function InputPanel({ conversation, busy, onSubmit }: { conversation: MormiConversation; busy: boolean; onSubmit: (input: SubmitMormiResponse) => void }) {
  const input = conversation.turn.input;
  const [text, setText] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  if (input.kind === "none") return <p className="ai-test-complete">대화 완료 · 위 결과와 별노트 내용을 확인해 주세요.</p>;
  if (input.kind === "choices" || input.kind === "fill") {
    return <div className="ai-test-choices">{input.choices.map((choice) => <button key={choice.id} disabled={busy || Boolean(choice.disabled)} onClick={() => onSubmit({ turn_id: conversation.turn.turn_id, type: input.kind === "fill" ? "fill" : "choice", choice_ids: [choice.id] })}>{choice.label}{choice.disabled ? " · 모르미 선택" : ""}</button>)}</div>;
  }
  if (input.kind === "text") {
    const submitText = () => {
      if (!text.trim() || busy) return;
      onSubmit({ turn_id: conversation.turn.turn_id, type: "text", text: text.trim() });
    };
    return <form className="ai-test-text" onSubmit={(event) => { event.preventDefault(); submitText(); }}><textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitText(); } }} placeholder={input.placeholder || "모르미에게 알려 주세요"} /><button disabled={busy || !text.trim()}>{busy ? "모르미가 생각하는 중…" : input.submit_label || "알려주기"}</button></form>;
  }

  const responseType = ({ count: "count", equation: "equation", joint: "action", button: "action" } as Partial<Record<MormiInputKind, SubmitMormiResponse["type"]>>)[input.kind] || "action";
  return <form className="ai-test-values" onSubmit={(event) => { event.preventDefault(); onSubmit({ turn_id: conversation.turn.turn_id, type: responseType, values }); }}>
    {input.target_slots.map((slot) => <label key={slot}><span>{slot}</span><input value={values[slot] || ""} onChange={(event) => setValues((current) => ({ ...current, [slot]: event.target.value }))} placeholder="값 입력" /></label>)}
    {!input.target_slots.length && <p>모르미와 화면의 순서를 함께 눌렀다고 가정해요.</p>}
    <button disabled={busy || (input.target_slots.length > 0 && input.target_slots.some((slot) => !values[slot]))}>{busy ? "진행 중…" : input.submit_label || "같이 해보기"}</button>
  </form>;
}

export function AiDialogueTest() {
  const [scenarioId, setScenarioId] = useState<Scenario["id"]>("home_addition_teach");
  const [health, setHealth] = useState<"checking" | "ready" | "no-llm" | "offline">("checking");
  const [conversation, setConversation] = useState<MormiConversation | null>(null);
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scenario = useMemo(() => scenarios.find((item) => item.id === scenarioId) || scenarios[0], [scenarioId]);

  useEffect(() => {
    fetch("/api/mormi/health", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ llm_configured: boolean }> : Promise.reject())
      .then((result) => setHealth(result.llm_configured ? "ready" : "no-llm"))
      .catch(() => setHealth("offline"));
  }, []);

  async function begin() {
    setBusy(true);
    setError("");
    try {
      const started = await startMormiConversation(startPayload(scenario));
      setConversation(started);
      setMessages([{ role: "mormi", text: started.turn.mormi.text }]);
    } catch (cause) {
      setError(cause instanceof MormiDialogueError ? cause.message : "대화를 시작하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(input: SubmitMormiResponse) {
    if (!conversation || busy) return;
    setBusy(true);
    setError("");
    const child = childSummary(input);
    setMessages((current) => [...current, { role: "child", text: child }]);
    try {
      const next = await submitMormiResponse(conversation.conversation_id, input);
      setConversation(next);
      setMessages((current) => [...current, { role: "mormi", text: next.turn.mormi.text }]);
    } catch (cause) {
      setError(cause instanceof MormiDialogueError ? cause.message : "다음 대화를 받지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="ai-test-page">
    <header className="ai-test-header"><div><span>LOCAL AI LAB</span><h1>모르미 대화 연결 테스트</h1><p>일반 백엔드 없이 Next.js와 Mormi-AI만 연결한 로컬 전용 화면이에요.</p></div><div className={`ai-test-health is-${health}`}><i />{health === "checking" ? "연결 확인 중" : health === "ready" ? "FastAPI 연결 · 키 등록됨" : health === "no-llm" ? "FastAPI 연결 · Claude 키 없음" : "FastAPI 연결 안 됨"}</div></header>

    <section className="ai-test-controls"><label><span>테스트할 시나리오</span><select value={scenarioId} onChange={(event) => { setScenarioId(event.target.value as Scenario["id"]); setConversation(null); setMessages([]); setError(""); }}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>{scenario.note}</small></label><button onClick={begin} disabled={busy || health === "offline"}>{busy ? "시작하는 중…" : conversation ? "새 문제로 다시 시작" : "대화 시작"}</button></section>

    {error && <p className="ai-test-error" role="alert">{error}</p>}
    {!conversation && <section className="ai-test-empty"><Image src="/morami/bright-cutout.png" alt="대화를 기다리는 모르미" width={300} height={330} unoptimized /><div><h2>시나리오를 고르고 시작해 봐!</h2><p>AI가 내려주는 질문과 입력 방식이 이 화면에 바로 나타나요.</p></div></section>}
    {conversation && <section className="ai-test-workspace">
      <div className="ai-test-scene"><div className="ai-test-mormi"><Image src={moodImage[conversation.turn.mormi.mood]} alt={`${conversation.turn.mormi.mood} 표정의 모르미`} width={260} height={300} unoptimized /><div><b>모르미</b><p>{conversation.turn.mormi.text}</p></div></div><Visual conversation={conversation} />{conversation.turn.help_card && <aside className="ai-test-help"><b>{conversation.turn.help_card.title}</b><p>{conversation.turn.help_card.body}</p></aside>}<InputPanel key={conversation.turn.turn_id} conversation={conversation} busy={busy} onSubmit={answer} />{conversation.turn.status === "active" && <button className="ai-test-help-button" disabled={busy} onClick={() => answer({ turn_id: conversation.turn.turn_id, type: "no_response" })}>잘 모르겠어 · 도움받기</button>}</div>
      <aside className="ai-test-log"><h2>대화 기록</h2>{messages.map((message, index) => <article className={`is-${message.role}`} key={`${message.role}-${index}`}><b>{message.role === "mormi" ? "모르미" : "아이"}</b><p>{message.text}</p></article>)}<details><summary>TurnContract 확인</summary><pre>{JSON.stringify(conversation, null, 2)}</pre></details></aside>
    </section>}
  </main>;
}
