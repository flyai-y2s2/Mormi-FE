import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../app/api/local-report-admin/[...path]/route.ts";

const localAdminEnv = [
  "ENABLE_LOCAL_REPORT_ADMIN",
  "LOCAL_REPORT_ADMIN_ORIGIN",
  "LOCAL_REPORT_ADMIN_KEY",
  "NODE_ENV",
];

async function withEnv(values, action) {
  const previous = new Map(localAdminEnv.map((name) => [name, process.env[name]]));
  Object.assign(process.env, values);
  try {
    return await action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("returns not found when the local admin proxy is disabled", async () => {
  const disabledResponse = await withEnv({
    ENABLE_LOCAL_REPORT_ADMIN: "false",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
    NODE_ENV: "development",
  }, () => GET(new Request("http://mormi.test/api/local-report-admin/learners?query=민수"), {
    params: Promise.resolve({ path: ["learners"] }),
  }));

  assert.equal(disabledResponse.status, 404);
});

test("forwards GET requests with only the server-side local admin key", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedRequest;
  globalThis.fetch = async (input, init) => {
    forwardedRequest = new Request(input, init);
    return new Response(JSON.stringify([]), {
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const response = await withEnv({
      ENABLE_LOCAL_REPORT_ADMIN: "true",
      LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
      LOCAL_REPORT_ADMIN_KEY: "secret",
      NODE_ENV: "development",
    }, () => GET(new Request("http://mormi.test/api/local-report-admin/learners?query=민수", {
      headers: { authorization: "Bearer browser-token" },
    }), {
      params: Promise.resolve({ path: ["learners"] }),
    }));

    assert.equal(response.status, 200);
    assert.equal(forwardedRequest.headers.get("X-Mormi-Local-Admin-Key"), "secret");
    assert.equal(forwardedRequest.headers.has("authorization"), false);
    assert.equal(forwardedRequest.method, "GET");
    assert.match(forwardedRequest.url, /\/v1\/local-report-admin\/learners\?query=/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
