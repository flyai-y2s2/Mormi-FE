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

    await act(async () => { button("실생활 · 응용").dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });
    await act(async () => { button("거스름돈 받기").dispatchEvent(new dom.container.ownerDocument.defaultView.MouseEvent("click", { bubbles: true })); });

    assert.equal(button("실생활 · 응용").getAttribute("aria-selected"), "true");
    assert.equal(button("거스름돈 받기").getAttribute("aria-pressed"), "true");
    assert.equal(dom.container.querySelector(".numeric-domain-detail").getAttribute("aria-label"), "거스름돈 받기 상세");
    assert.match(dom.container.querySelector(".numeric-evidence").textContent, /과거 전체 8회 · 최근 3회/);
    assert.equal(dom.container.querySelector(".numeric-session-comparison").getAttribute("aria-label"), "실생활 · 응용 · 거스름돈 받기 과거 전체와 최근 비교");
    const comparison = dom.container.querySelector(".numeric-session-comparison").textContent;
    for (const value of ["58%", "78%", "2.8회", "1.6회", "10%", "40%", "10/30/30/20/10%", "40/30/20/10/0%"])
      assert.match(comparison, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    await act(async () => { root.unmount(); });
  } finally {
    dom.cleanup();
  }
});
