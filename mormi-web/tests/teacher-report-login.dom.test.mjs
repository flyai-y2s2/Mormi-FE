import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { JSDOM } from "jsdom";
import { transformWithOxc } from "vite";

async function loadLogin() {
  const source = await readFile(new URL("../app/report/TeacherReportLogin.tsx", import.meta.url), "utf8").catch(() => null);
  assert.ok(source, "teacher report login component must exist");
  const { code } = await transformWithOxc(source, "TeacherReportLogin.tsx", { target: "es2022" });
  const require = createRequire(import.meta.url);
  const moduleCode = code
    .replace('"react"', JSON.stringify(pathToFileURL(require.resolve("react")).href))
    .replace('"react/jsx-runtime"', JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  return import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
}

test("teacher password form reports rejection and enters the report after success", async () => {
  const [{ TeacherReportLogin }, React, server] = await Promise.all([loadLogin(), import("react"), import("react-dom/server")]);
  const dom = new JSDOM(`<!doctype html><div id="root">${server.renderToString(React.createElement(TeacherReportLogin, { onAuthenticated() {} }))}</div>`, { url: "https://mormi.example/report?teacher=1" });
  const keys = ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "Event", "SubmitEvent"];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  const requests = [];
  let responseStatus = 429;
  let authenticated = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response(null, { status: responseStatus });
  };
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { hydrateRoot } = await import("react-dom/client");
  const container = dom.window.document.querySelector("#root");
  const props = { onAuthenticated: () => { authenticated += 1; } };
  let root;
  try {
    await React.act(async () => { root = hydrateRoot(container, React.createElement(TeacherReportLogin, props)); });
    const input = container.querySelector('input[type="password"]');
    const form = container.querySelector("form");
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
    await React.act(async () => {
      setValue.call(input, "wrong");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    assert.match(container.textContent, /잠시 후 다시 시도해 주세요/);
    responseStatus = 401;
    await React.act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    assert.match(container.textContent, /비밀번호를 확인해 주세요/);
    assert.equal(authenticated, 0);

    responseStatus = 204;
    await React.act(async () => {
      setValue.call(input, "teacher-password");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    assert.equal(requests.at(-1).input, "/api/teacher-report-session");
    assert.deepEqual(JSON.parse(requests.at(-1).init.body), { password: "teacher-password" });
    assert.equal(authenticated, 1);
    await React.act(async () => { root.unmount(); });
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
});
