import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { transformWithOxc } from "vite";

const { ApiError } = await import("../app/api-client.ts");
const { localReportAdminApi } = await import("../app/local-report-admin-client.ts");

async function loadSearch() {
  const source = await readFile(new URL("../app/report/LocalLearnerSearch.tsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "LocalLearnerSearch.tsx", { target: "es2022" });
  const require = createRequire(import.meta.url);
  const moduleCode = code
    .replace('"react"', JSON.stringify(pathToFileURL(require.resolve("react")).href))
    .replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href))
    .replace('"../api-client"', JSON.stringify(new URL("../app/api-client.ts", import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
}

function setDom(html) {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root">${html}</div></body></html>`, { url: "http://localhost/report" });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Node", "MutationObserver", "Event", "MouseEvent", "KeyboardEvent"];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  return {
    container: dom.window.document.querySelector("#root"),
    window: dom.window,
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

async function type(input, value) {
  const setValue = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, "value").set;
  setValue.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }));
}

async function flushDebounce() {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await Promise.resolve();
}

test("local admin client trims searches, uses the same-origin proxy, and never needs a learner token", async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (input, init) => {
    requested.push({ url: String(input), init });
    return new Response(JSON.stringify([{ learner_id: 19, display_name: "이재용" }]), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const controller = new AbortController();
    const learners = await localReportAdminApi.search(" 이재 ", controller.signal);
    assert.equal(requested[0].url, "/api/local-report-admin/learners?query=%EC%9D%B4%EC%9E%AC&limit=10");
    assert.equal(requested[0].init.headers.accept, "application/json");
    assert.equal(requested[0].init.cache, "no-store");
    assert.equal(requested[0].init.headers.authorization, undefined);
    assert.deepEqual(learners, [{ learner_id: 19, display_name: "이재용" }]);

    await localReportAdminApi.diagnostic(19, "2026-08-17", controller.signal);
    assert.match(requested[1].url, /learners\/19\/diagnostic\?week_start=2026-08-17/);

    await localReportAdminApi.speechEvidence(19, "money-count", "2026-08-17", controller.signal);
    assert.match(requested[2].url, /learners\/19\/speech-evidence\?domain_id=money-count&week_start=2026-08-17/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("learner search waits for two trimmed characters, displays identities, and selects an option", async () => {
  const [{ LocalLearnerSearch }, React, server] = await Promise.all([loadSearch(), import("react"), import("react-dom/server")]);
  const searchCalls = [];
  const selected = [];
  const props = {
    currentLearner: { learner_id: 1, display_name: "현재 학습자" },
    searchLearners: async (query) => {
      searchCalls.push(query);
      return [{ learner_id: 19, display_name: "이재용" }];
    },
    onSelect: (learner) => selected.push(learner),
    onUnavailable: () => assert.fail("available search must not be marked unavailable"),
    debounceMs: 5,
  };
  const dom = setDom(server.renderToString(React.createElement(LocalLearnerSearch, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(LocalLearnerSearch, props)); });
    const input = dom.container.querySelector("#local-learner-query");
    assert.equal(input.getAttribute("role"), "combobox");
    assert.equal(input.getAttribute("aria-autocomplete"), "list");
    assert.match(dom.container.textContent, /현재: 현재 학습자/);

    await act(async () => { await type(input, "이"); });
    await act(flushDebounce);
    assert.deepEqual(searchCalls, []);

    await act(async () => { await type(input, "이재"); });
    await act(flushDebounce);
    assert.deepEqual(searchCalls, ["이재"]);
    const listbox = dom.container.querySelector('[role="listbox"]');
    assert.match(listbox.textContent, /이재용/);
    assert.match(listbox.textContent, /#19/);

    const option = [...listbox.querySelectorAll('[role="option"]')].find((element) => element.textContent.includes("이재용"));
    await act(async () => { option.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    assert.deepEqual(selected, [{ learner_id: 19, display_name: "이재용" }]);
    assert.equal(dom.container.querySelector('[role="listbox"]'), null);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("learner search supports keyboard selection, empty results, outside dismissal, and unavailable handling", async () => {
  const [{ LocalLearnerSearch }, React, server] = await Promise.all([loadSearch(), import("react"), import("react-dom/server")]);
  const selected = [];
  let unavailable = 0;
  let mode = "results";
  const props = {
    currentLearner: { learner_id: 1, display_name: "현재 학습자" },
    searchLearners: async () => {
      if (mode === "empty") return [];
      if (mode === "unavailable") throw new ApiError(403, "local_report_admin_disabled", "disabled");
      if (mode === "error") throw new Error("network");
      return [
        { learner_id: 19, display_name: "이재용" },
        { learner_id: 20, display_name: "이재훈" },
      ];
    },
    onSelect: (learner) => selected.push(learner),
    onUnavailable: () => { unavailable += 1; },
    debounceMs: 5,
  };
  const dom = setDom(server.renderToString(React.createElement(LocalLearnerSearch, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(LocalLearnerSearch, props)); });
    const input = dom.container.querySelector("#local-learner-query");
    await act(async () => { await type(input, "이재"); });
    await act(flushDebounce);
    await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    assert.equal(dom.container.querySelector('[role="option"][aria-selected="true"]').textContent, "이재용 · #19");
    await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })); });
    await act(async () => { input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    assert.deepEqual(selected, [{ learner_id: 20, display_name: "이재훈" }]);

    await act(async () => { await type(input, "이재"); });
    await act(flushDebounce);
    await act(async () => { dom.window.document.body.dispatchEvent(new dom.window.MouseEvent("pointerdown", { bubbles: true })); });
    assert.equal(dom.container.querySelector('[role="listbox"]'), null);

    mode = "empty";
    await act(async () => { await type(input, "없는이름"); });
    await act(flushDebounce);
    assert.match(dom.container.querySelector('[role="listbox"]').textContent, /일치하는 학습자가 없습니다/);

    mode = "unavailable";
    await act(async () => { await type(input, "권한없음"); });
    await act(flushDebounce);
    assert.equal(unavailable, 1);

    mode = "error";
    await act(async () => { await type(input, "오류이름"); });
    await act(flushDebounce);
    assert.match(dom.container.textContent, /검색하지 못했습니다.*다시 시도/);
    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});

test("learner search caps displayed matches and aborts superseded and unmounted requests", async () => {
  const [{ LocalLearnerSearch }, React, server] = await Promise.all([loadSearch(), import("react"), import("react-dom/server")]);
  const signals = [];
  const props = {
    currentLearner: { learner_id: 1, display_name: "현재 학습자" },
    searchLearners: (query, signal) => {
      signals.push({ query, signal });
      if (query === "이재") {
        return Promise.resolve(Array.from({ length: 11 }, (_, index) => ({ learner_id: index + 1, display_name: `이재${index + 1}` })));
      }
      return new Promise(() => {});
    },
    onSelect: () => {},
    onUnavailable: () => assert.fail("an aborted request is not unavailable"),
    debounceMs: 5,
  };
  const dom = setDom(server.renderToString(React.createElement(LocalLearnerSearch, props)));
  const { hydrateRoot } = await import("react-dom/client");
  const { act } = React;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  try {
    let root;
    await act(async () => { root = hydrateRoot(dom.container, React.createElement(LocalLearnerSearch, props)); });
    const input = dom.container.querySelector("#local-learner-query");
    await act(async () => { await type(input, "이재"); });
    await act(flushDebounce);
    assert.equal(dom.container.querySelectorAll('[role="option"]').length, 10);
    assert.equal(signals[0].signal.aborted, false);

    await act(async () => { await type(input, "민수"); });
    assert.equal(signals[0].signal.aborted, true);
    await act(flushDebounce);
    assert.equal(signals[1].signal.aborted, false);
    await act(async () => { root.unmount(); });
    assert.equal(signals[1].signal.aborted, true);
  } finally {
    dom.cleanup();
  }
});
