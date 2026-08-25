import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { transformWithOxc } from "vite";

async function loadPreview() {
  const source = await readFile(new URL("../app/report/NumericReportPreview.tsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "NumericReportPreview.tsx", { target: "es2022" });
  const require = createRequire(import.meta.url);
  const moduleCode = code
    .replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
    .replace('"react"', JSON.stringify(pathToFileURL(require.resolve("react")).href))
    .replace('"../expression-ladder"', JSON.stringify(new URL("../app/expression-ladder.ts", import.meta.url).href))
    .replace('"./numeric-report-live-model"', JSON.stringify(new URL("../app/report/numeric-report-live-model.ts", import.meta.url).href))
    .replace('"./weekly-report-period"', JSON.stringify(new URL("../app/report/weekly-report-period.ts", import.meta.url).href))
    .replace('import Link from "next/link";', 'const Link = ({ children, ...props }) => _jsx("a", { ...props, children });');
  return import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
}

function setDom(html) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, { url: "http://localhost/report?example=complete" });
  const keys = ["window", "document", "navigator", "HTMLElement", "Node", "MutationObserver", "Event", "MouseEvent"];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  return {
    container: dom.window.document.querySelector("#root"),
    cleanup() {
      for (const key of keys) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
      dom.window.close();
    },
  };
}

test("hydrates LIFE values and binds the comparison to the selected category", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview)); });
    const button = (text) => [...dom.container.querySelectorAll("button")].find((element) => element.textContent === text);
    const categoryButton = (text) => [...dom.container.querySelectorAll(".numeric-status-selector button")].find((element) => element.querySelector("span")?.textContent === text);

    await act(async () => { button("실생활 · 응용").dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    await act(async () => { categoryButton("거스름돈 받기").dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });

    assert.equal(button("실생활 · 응용").getAttribute("aria-selected"), "true");
    assert.equal(categoryButton("거스름돈 받기").getAttribute("aria-pressed"), "true");
    assert.equal(dom.container.querySelector(".numeric-domain-detail").getAttribute("aria-label"), "거스름돈 받기 상세");
    assert.match(dom.container.querySelector(".numeric-evidence").textContent, /이번 주 전체 8회 · 최근 3회/);
    assert.equal(dom.container.querySelector(".numeric-session-comparison").getAttribute("aria-label"), "실생활 · 응용 · 거스름돈 받기 이번 주 전체와 최근 비교");
    const comparison = dom.container.querySelector(".numeric-session-comparison").textContent;
    for (const value of ["45%", "68%", "3.0회", "2.0회", "10%", "30%"])
      assert.match(comparison, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(dom.container.querySelector(".numeric-ladder-bars").getAttribute("aria-label"), "L4, L3, L2, L0 순서로 30%, 30%, 35%, 5%");

    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("leads with the current state and turns the selected domain into one next-learning plan", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview)); });

    const hero = dom.container.querySelector(".numeric-current-story");
    assert.ok(hero, "현재 상태를 가장 먼저 읽는 요약이 있어야 한다");
    assert.match(hero.textContent, /돈 세기/);
    assert.equal(dom.container.querySelectorAll(".numeric-summary-values article").length, 4);

    const nextPlan = dom.container.querySelector(".numeric-next-plan");
    assert.ok(nextPlan, "분석 뒤에 AI 다음 학습 제안이 있어야 한다");
    assert.match(nextPlan.textContent, /돈 세기/);
    assert.match(nextPlan.textContent, /3문제/);
    assert.match(nextPlan.textContent, /L2/);
    assert.match(nextPlan.textContent, /동전의 단위를 혼자 말할 수 있는지/);
    assert.ok(nextPlan.querySelector("details"), "상세 계획은 필요할 때만 펼쳐야 한다");

    const priceButton = [...dom.container.querySelectorAll(".numeric-status-selector button")]
      .find((element) => element.querySelector("span")?.textContent === "가격 더하기");
    await act(async () => { priceButton.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });

    assert.match(dom.container.querySelector(".numeric-next-plan").textContent, /가격 더하기/);
    assert.doesNotMatch(dom.container.querySelector(".numeric-next-plan").textContent, /돈 세기 3문제/);

    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("places the unit selector under unit results and keeps AI change focused on evidence", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview)));
  try {
    const resultsSection = dom.container.querySelector('[aria-labelledby="numeric-trend-title"]');
    const changeSection = dom.container.querySelector('[aria-labelledby="numeric-domain-title"]');
    assert.ok(resultsSection.querySelector(".numeric-status-selector"), "단원 선택은 단원별 결과 바로 아래에 있어야 한다");
    assert.equal(changeSection.querySelector("h2").textContent, "AI가 본 변화");
    assert.equal(changeSection.querySelector(".numeric-status-selector"), null, "AI 변화 영역에 선택 바를 중복하지 않는다");
    assert.ok(changeSection.querySelector(".numeric-domain-detail .numeric-evidence"), "과거·최근 발화 근거는 유지한다");
  } finally {
    dom.cleanup();
  }
});

test("gives all ladder levels equal width while encoding share only as height", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview)));
  try {
    const bars = [...dom.container.querySelectorAll(".numeric-ladder-bars > span")];
    assert.equal(bars.length, 4);
    assert.deepEqual(bars.map((bar) => bar.style.flexGrow), ["1", "1", "1", "1"]);
    assert.deepEqual(bars.map((bar) => bar.style.flexBasis), ["0px", "0px", "0px", "0px"]);
    assert.ok(bars.every((bar) => bar.style.getPropertyValue("--bar-height")), "각 비율은 막대 높이로 표현해야 한다");
  } finally {
    dom.cleanup();
  }
});

test("renders a single visible ladder bar when one level owns 100 percent", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const report = structuredClone(completeDiagnosticReportExample);
  for (const mode of report.modes) {
    for (const domain of mode.domains) {
      for (const point of domain.points) point.expression_level = "L0";
    }
  }
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, { report })));
  try {
    const bars = [...dom.container.querySelectorAll(".numeric-ladder-bars > span")];
    assert.equal(bars.length, 4, "현재 단계명 자리는 L4, L3, L2, L0 네 개여야 한다");
    assert.equal(bars.filter((bar) => !bar.classList.contains("is-empty")).length, 1);
    assert.equal(bars.filter((bar) => bar.classList.contains("is-empty")).length, 3);
    assert.equal(bars.find((bar) => !bar.classList.contains("is-empty"))?.querySelector("i")?.textContent, "L0");
  } finally {
    dom.cleanup();
  }
});

test("places an optional local learner search above weekly navigation and the report paper", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const search = React.createElement("div", { className: "local-learner-search" }, "학습자 검색");
  const withSearch = setDom(server.renderToString(React.createElement(NumericReportPreview, {
    report: completeDiagnosticReportExample,
    topAccessory: search,
  })));
  const withoutSearch = setDom(server.renderToString(React.createElement(NumericReportPreview, {
    report: completeDiagnosticReportExample,
  })));
  try {
    const searchNode = withSearch.container.querySelector(".local-learner-search");
    assert.ok(searchNode);
    assert.ok(searchNode.compareDocumentPosition(withSearch.container.querySelector(".weekly-report-nav")) & 4);
    assert.ok(searchNode.compareDocumentPosition(withSearch.container.querySelector(".report-paper")) & 4);
    assert.equal(withoutSearch.container.querySelector(".local-learner-search"), null);
  } finally {
    withSearch.cleanup();
    withoutSearch.cleanup();
  }
});

test("uses the existing four summary cards for the selected week's server counts", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const html = server.renderToString(React.createElement(NumericReportPreview, { report: completeDiagnosticReportExample }));
  const dom = setDom(html);
  try {
    const cards = [...dom.container.querySelectorAll(".numeric-summary-values article")].map((card) => card.textContent.replace(/\s+/g, " ").trim());
    assert.deepEqual(cards, [
      "완료 단원3이번 주 완료",
      "반복학습92기록",
      "모르미 가르치기14기록",
      "실생활 수행6방문",
    ]);
    assert.match(dom.container.textContent, /다음 단원 계획 확인/);
  } finally {
    dom.cleanup();
  }
});

test("offers bounded week navigation and omits an empty LIFE tab", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(),
    import("../app/report/complete-report-example.ts"),
    import("react"),
    import("react-dom/server"),
  ]);
  const homeOnly = { ...completeDiagnosticReportExample, modes: [completeDiagnosticReportExample.modes[0], { mode: "LIFE", domains: [] }] };
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, { report: homeOnly })));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let previous = 0;
  let next = 0;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, { report: homeOnly, onPreviousWeek: () => { previous += 1; }, onNextWeek: () => { next += 1; } })); });
    const previousButton = dom.container.querySelector('button[aria-label="이전 주 리포트"]');
    const nextButton = dom.container.querySelector('button[aria-label="다음 주 리포트"]');
    assert.equal(previousButton.disabled, false);
    assert.equal(nextButton.disabled, true);
    assert.equal(dom.container.querySelector('[role="tab"][aria-label="실생활 · 응용"]'), null);
    await act(async () => { previousButton.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    await act(async () => { nextButton.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    assert.equal(previous, 1);
    assert.equal(next, 0);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("accumulates report weeks and selects a week with data directly", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(),
    import("../app/report/complete-report-example.ts"),
    import("react"),
    import("react-dom/server"),
  ]);
  const report = {
    ...completeDiagnosticReportExample,
    period: {
      ...completeDiagnosticReportExample.period,
      week_start: "2026-08-17",
      week_end: "2026-08-23",
      available_week_starts: ["2026-08-03", "2026-08-17"],
    },
  };
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, { report })));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const selected = [];

  try {
    let root;
    await act(async () => {
      root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, {
        report,
        onSelectWeek: (weekStart) => selected.push(weekStart),
      }));
    });
    const weekButtons = [...dom.container.querySelectorAll('.weekly-report-nav__weeks button')];
    assert.deepEqual(weekButtons.map((button) => button.textContent), ["8월 1주차", "8월 3주차"]);
    assert.equal(weekButtons[1].getAttribute("aria-current"), "date");

    await act(async () => {
      weekButtons[0].dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(selected, ["2026-08-03"]);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("renders a valid empty week without dereferencing a missing domain", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const empty = { ...completeDiagnosticReportExample, modes: [{ mode: "HOME", domains: [] }, { mode: "LIFE", domains: [] }] };
  const html = server.renderToString(React.createElement(NumericReportPreview, { report: empty }));
  assert.match(html, /이번 주에 완료한 단원이 없습니다/);
  assert.equal(html.includes("numeric-session-comparison"), false);
});

test("shows retained-week retry feedback and requests selected-week speech evidence", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  let retries = 0;
  let requestedDomain = "";
  const props = {
    report: completeDiagnosticReportExample,
    notice: "이전 결과를 계속 표시합니다.",
    onRetry: () => { retries += 1; },
    onRequestSpeech: (domainId) => { requestedDomain = domainId; },
    speechByDomain: {
      "money-count": {
        state: "ready",
        evidence: {
          available: true, domain_id: "money-count", verified_elements: ["계산 순서"],
          past: { evidence_id: "past", utterance: "과거 설명", occurred_at: "2026-08-11T09:00:00+09:00" },
          recent: { evidence_id: "recent", utterance: "이번 주 설명", occurred_at: "2026-08-15T09:00:00+09:00" },
          change_summary: "이번 주 발화 변화",
        },
      },
    },
  };
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, props)); });
    assert.match(dom.container.querySelector(".weekly-report-nav").textContent, /이전 결과를 계속 표시합니다/);
    const retry = [...dom.container.querySelectorAll("button")].find((button) => button.textContent === "다시 불러오기");
    await act(async () => { retry.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    const details = dom.container.querySelector(".numeric-evidence");
    await act(async () => { details.open = true; details.dispatchEvent(new dom.container.ownerDocument.defaultView.Event("toggle", { bubbles: true })); });
    assert.equal(retries, 1);
    assert.equal(requestedDomain, "money-count");
    assert.match(details.textContent, /이번 주 설명/);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("server-renders the canonical comparison message for unavailable speech evidence", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const html = server.renderToString(React.createElement(NumericReportPreview, {
    report: completeDiagnosticReportExample,
    speechByDomain: {
      "money-count": {
        state: "ready",
        evidence: { available: false, domain_id: "money-count", verified_elements: [], message: "서버가 반환한 다른 안내" },
      },
    },
  }));

  assert.match(html, /비교할 기록이 더 필요해요/);
  assert.doesNotMatch(html, /서버가 반환한 다른 안내/);
});

test("shows the selected unit speech comparison analysis in AI change summary", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const html = server.renderToString(React.createElement(NumericReportPreview, {
    report: completeDiagnosticReportExample,
    speechByDomain: {
      "money-count": {
        state: "ready",
        evidence: {
          available: true,
          domain_id: "money-count",
          verified_elements: ["counting_order"],
          past: { evidence_id: "past", utterance: "점 3개야", occurred_at: "2026-08-18T09:00:00+09:00", expression_level: "L4" },
          recent: { evidence_id: "recent", utterance: "하나 둘 셋 3개", occurred_at: "2026-08-25T09:00:00+09:00", expression_level: "L4" },
          change_summary: "답만 말하던 모습에서 수를 세는 순서를 표현하는 모습으로 변화했습니다.",
        },
      },
    },
  }));
  const dom = setDom(html);
  try {
    assert.equal(
      dom.container.querySelector(".numeric-domain-insight strong").textContent,
      "답만 말하던 모습에서 수를 세는 순서를 표현하는 모습으로 변화했습니다.",
    );
  } finally {
    dom.cleanup();
  }
});

test("never substitutes the report-wide narrative for a selected unit speech analysis", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const cases = [
    [undefined, "과거·최근 발화를 확인하고 있습니다."],
    [{ state: "loading" }, "과거·최근 발화를 비교하고 있습니다."],
    [{ state: "error", message: "서버 오류" }, "발화 비교 분석을 불러오지 못했습니다."],
    [{ state: "ready", evidence: { available: false, domain_id: "money-count", verified_elements: [], message: "기록 부족" } }, "비교할 발화 기록이 더 필요합니다."],
  ];

  for (const [speech, expected] of cases) {
    const speechByDomain = speech ? { "money-count": speech } : undefined;
    const html = server.renderToString(React.createElement(NumericReportPreview, {
      report: completeDiagnosticReportExample,
      speechByDomain,
    }));
    const dom = setDom(html);
    try {
      assert.equal(dom.container.querySelector(".numeric-domain-insight strong").textContent, expected);
    } finally {
      dom.cleanup();
    }
  }
});

test("requests the selected unit speech analysis without opening the evidence disclosure", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const requested = [];
  const props = {
    report: completeDiagnosticReportExample,
    onRequestSpeech: (domainId) => requested.push(domainId),
  };
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, props)); });
    assert.deepEqual(requested, ["money-count"]);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("renders LIFE-only content with the compact HOME empty message", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const lifeOnly = { ...completeDiagnosticReportExample, modes: [{ mode: "HOME", domains: [] }, completeDiagnosticReportExample.modes[1]] };
  const html = server.renderToString(React.createElement(NumericReportPreview, { report: lifeOnly }));
  assert.match(html, /집 학습에서 이번 주에 완료한 단원이 없습니다/);
  assert.match(html, /메뉴 값 계산하기/);
  assert.doesNotMatch(html, /role="tab"[^>]*>집 · 개념/);
});

test("requests speech evidence for a newly selected domain while evidence details stay open", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const requested = [];
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, { onRequestSpeech: (domainId) => requested.push(domainId) })));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, { onRequestSpeech: (domainId) => requested.push(domainId) })); });
    const details = dom.container.querySelector(".numeric-evidence");
    await act(async () => { details.open = true; details.dispatchEvent(new dom.container.ownerDocument.defaultView.Event("toggle", { bubbles: true })); });
    const priceButton = [...dom.container.querySelectorAll(".numeric-status-selector button")].find((button) => button.querySelector("span")?.textContent === "가격 더하기");
    await act(async () => { priceButton.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    assert.equal(requested[0], "money-count");
    assert.equal(requested.at(-1), "price-add");
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("keeps failed automatic speech evidence in error until selection or disclosure action changes", async () => {
  const [{ NumericReportPreview }, React, server] = await Promise.all([loadPreview(), import("react"), import("react-dom/server")]);
  const requested = [];
  const renderProps = (speechByDomain = {}) => ({ speechByDomain, onRequestSpeech: (domainId) => requested.push(domainId) });
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, renderProps())));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, renderProps())); });
    const details = dom.container.querySelector(".numeric-evidence");
    await act(async () => { details.open = true; details.dispatchEvent(new dom.container.ownerDocument.defaultView.Event("toggle", { bubbles: true })); });
    await act(async () => { root.render(React.createElement(NumericReportPreview, renderProps({ "money-count": { state: "error", message: "불러오지 못했습니다." } }))); });
    assert.deepEqual(requested, ["money-count"]);
    assert.match(details.textContent, /불러오지 못했습니다/);

    const priceButton = [...dom.container.querySelectorAll(".numeric-status-selector button")].find((button) => button.querySelector("span")?.textContent === "가격 더하기");
    await act(async () => { priceButton.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    assert.equal(requested.filter((domainId) => domainId === "price-add").length, 1);

    await act(async () => { details.open = false; details.dispatchEvent(new dom.container.ownerDocument.defaultView.Event("toggle", { bubbles: true })); });
    await act(async () => { details.open = true; details.dispatchEvent(new dom.container.ownerDocument.defaultView.Event("toggle", { bubbles: true })); });
    assert.equal(requested.filter((domainId) => domainId === "price-add").length, 2);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("renders retained empty-week feedback once beside the selector", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const empty = { ...completeDiagnosticReportExample, modes: [{ mode: "HOME", domains: [] }, { mode: "LIFE", domains: [] }] };
  const html = server.renderToString(React.createElement(NumericReportPreview, { report: empty, notice: "이전 결과를 계속 표시합니다.", onRetry: () => {} }));
  assert.equal((html.match(/이전 결과를 계속 표시합니다/g) ?? []).length, 1);
  assert.equal((html.match(/다시 불러오기/g) ?? []).length, 1);
});

test("shows an actual recent utterance when there is no older comparison sample", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const html = server.renderToString(React.createElement(NumericReportPreview, {
    report: completeDiagnosticReportExample,
    speechByDomain: {
      "money-count": {
        state: "ready",
        evidence: {
          available: true,
          domain_id: "money-count",
          verified_elements: ["계산 순서"],
          recent: { evidence_id: "recent", utterance: "백 원짜리 세 개라서 삼백 원이야.", occurred_at: "2026-08-22T09:00:00+09:00", expression_level: "L3" },
          change_summary: "최근 발화 한 건을 확인했습니다.",
        },
      },
    },
  }));

  assert.match(html, /백 원짜리 세 개라서 삼백 원이야/);
  assert.match(html, /최근 발화/);
  assert.doesNotMatch(html, /<b>과거<\/b>/);
});

test("renders the four ladder analysis states and only offers approval for a real level change", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const base = {
    analysis_id: "analysis-1",
    learner_id: completeDiagnosticReportExample.learner.learner_id,
    skill_id: "money-count",
    trigger_session_id: "session-2",
    session_ids: ["session-1", "session-2"],
    current_level: "L2",
    recommended_level: "L3",
    current_accuracy: 0.93,
    evidence_count: 5,
    reason_code: "test",
    recent_predictions: [{ level: "L3", confidence: 0.91 }],
    model_version: "ladder-v2",
    recommendation_version: 1,
    approved: false,
    analyzed_at: "2026-08-23T10:00:00+09:00",
  };
  const cases = [
    ["UPGRADE", "L3", "다음 단계로 올려도 좋아요", true],
    ["MAINTAIN", "L2", "현재 단계 유지", false],
    ["ADJUST_DOWN", "L0", "한 단계 낮춰 다시 연습", true],
    ["INSUFFICIENT_EVIDENCE", "L2", "분석 근거가 더 필요해요", false],
  ];

  for (const [action, recommended_level, copy, hasButton] of cases) {
    const report = { ...completeDiagnosticReportExample, ladder_recommendations: [{ ...base, action, recommended_level }] };
    const html = server.renderToString(React.createElement(NumericReportPreview, {
      report,
      onApproveLadder: hasButton ? async () => {} : undefined,
    }));
    assert.match(html, new RegExp(copy));
    assert.match(html, new RegExp(`L2.*${recommended_level}`));
    assert.equal(html.includes("이 단계로 적용"), hasButton);
    const dom = setDom(html);
    try {
      assert.match(dom.container.querySelector("#numeric-next-plan").textContent, new RegExp(copy));
      assert.equal(dom.container.querySelector(".numeric-ladder-analysis"), null);
    } finally {
      dom.cleanup();
    }
  }
});

test("shows a recommendation but never offers approval without the teacher handler", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const report = {
    ...completeDiagnosticReportExample,
    ladder_recommendations: [{
      analysis_id: "analysis-learner-read-only",
      learner_id: completeDiagnosticReportExample.learner.learner_id,
      skill_id: "money-count",
      trigger_session_id: "session-2",
      session_ids: ["session-1", "session-2"],
      current_level: "L2",
      recommended_level: "L3",
      action: "UPGRADE",
      current_accuracy: 0.95,
      evidence_count: 5,
      reason_code: "upgrade_threshold_met",
      recent_predictions: [{ level: "L3", confidence: 0.92 }],
      model_version: "ladder-v2",
      recommendation_version: 3,
      approved: false,
      analyzed_at: "2026-08-23T10:00:00+09:00",
    }],
  };

  const html = server.renderToString(React.createElement(NumericReportPreview, { report }));

  assert.doesNotMatch(html, /이 단계로 적용/);
  assert.match(html, /교사 확인/);
});

test("approves a ladder level change once and shows its applied state without a popup", async () => {
  const [{ NumericReportPreview }, { completeDiagnosticReportExample }, React, server] = await Promise.all([
    loadPreview(), import("../app/report/complete-report-example.ts"), import("react"), import("react-dom/server"),
  ]);
  const recommendation = {
    analysis_id: "analysis-approve",
    learner_id: completeDiagnosticReportExample.learner.learner_id,
    skill_id: "money-count",
    trigger_session_id: "session-2",
    session_ids: ["session-1", "session-2"],
    current_level: "L2",
    recommended_level: "L3",
    action: "UPGRADE",
    current_accuracy: 0.95,
    evidence_count: 5,
    reason_code: "upgrade_threshold_met",
    recent_predictions: [{ level: "L3", confidence: 0.92 }],
    model_version: "ladder-v2",
    recommendation_version: 3,
    approved: false,
    analyzed_at: "2026-08-23T10:00:00+09:00",
  };
  const report = { ...completeDiagnosticReportExample, ladder_recommendations: [recommendation] };
  const approvals = [];
  const props = { report, onApproveLadder: async (analysisId, version) => { approvals.push([analysisId, version]); } };
  const dom = setDom(server.renderToString(React.createElement(NumericReportPreview, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(NumericReportPreview, props)); });
    const button = [...dom.container.querySelectorAll("button")].find((item) => item.textContent === "이 단계로 적용");
    await act(async () => { button.dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(approvals, [["analysis-approve", 3]]);
    assert.match(dom.container.querySelector("#numeric-next-plan").textContent, /적용 완료/);
    assert.equal(dom.container.querySelector('[role="dialog"]'), null, "승인은 기존 화면 안에서 처리하고 별도 팝업을 만들지 않는다");
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});
