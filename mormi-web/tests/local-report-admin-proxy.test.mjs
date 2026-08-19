import assert from "node:assert/strict";
import { createServer } from "node:http";
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

async function startServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
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

test("does not follow an upstream redirect or send the local admin key to its destination", async () => {
  let redirectedRequests = 0;
  let redirectedKey;
  const redirected = await startServer((request, response) => {
    redirectedRequests += 1;
    redirectedKey = request.headers["x-mormi-local-admin-key"];
    response.end();
  });
  const upstream = await startServer((_request, response) => {
    response.writeHead(302, { location: `${redirected.origin}/redirected-host` });
    response.end();
  });

  try {
    await withEnv({
      ENABLE_LOCAL_REPORT_ADMIN: "true",
      LOCAL_REPORT_ADMIN_ORIGIN: upstream.origin,
      LOCAL_REPORT_ADMIN_KEY: "secret",
      NODE_ENV: "development",
    }, () => assert.rejects(() => GET(new Request("http://mormi.test/api/local-report-admin/learners"), {
      params: Promise.resolve({ path: ["learners"] }),
    })));

    assert.equal(redirectedRequests, 0);
    assert.equal(redirectedKey, undefined);
  } finally {
    await Promise.all([upstream.close(), redirected.close()]);
  }
});
