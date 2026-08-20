import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { GET } from "../app/api/local-report-admin/[...path]/route.ts";
import { createTeacherReportSession, TEACHER_REPORT_COOKIE } from "../app/teacher-report-session.ts";

const localAdminEnv = [
  "ENABLE_LOCAL_REPORT_ADMIN",
  "LOCAL_REPORT_ADMIN_ORIGIN",
  "LOCAL_REPORT_ADMIN_KEY",
  "TEACHER_REPORT_PASSWORD",
  "TEACHER_REPORT_SESSION_SECRET",
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

test("does not contact the production report API without a valid teacher session", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamRequests = 0;
  globalThis.fetch = async () => {
    upstreamRequests += 1;
    return new Response(JSON.stringify([]));
  };
  try {
    const response = await withEnv({
      ENABLE_LOCAL_REPORT_ADMIN: "true",
      LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example",
      LOCAL_REPORT_ADMIN_KEY: "server-secret",
      TEACHER_REPORT_PASSWORD: "teacher-password",
      TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
      NODE_ENV: "production",
    }, () => GET(new Request("https://mormi.example/api/local-report-admin/learners?query=민수"), {
      params: Promise.resolve({ path: ["learners"] }),
    }));

    assert.equal(response.status, 401);
    assert.equal(upstreamRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a valid production teacher session forwards the server key but tampered and expired sessions do not", async () => {
  const originalFetch = globalThis.fetch;
  const forwarded = [];
  globalThis.fetch = async (input, init) => {
    forwarded.push(new Request(input, init));
    return new Response(JSON.stringify([]), { headers: { "content-type": "application/json" } });
  };
  const secret = "session-secret-with-at-least-32-characters";
  const env = {
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    BACKEND_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_ORIGIN: "",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: secret,
    NODE_ENV: "production",
  };
  const requestWith = (token) => new Request("https://mormi.example/api/local-report-admin/learners?query=민수", {
    headers: { cookie: `${TEACHER_REPORT_COOKIE}=${encodeURIComponent(token)}` },
  });
  try {
    const valid = createTeacherReportSession(secret);
    const accepted = await withEnv(env, () => GET(requestWith(valid), {
      params: Promise.resolve({ path: ["learners"] }),
    }));
    assert.equal(accepted.status, 200);
    assert.equal(forwarded.length, 1);
    assert.equal(forwarded[0].headers.get("X-Mormi-Local-Admin-Key"), "server-secret");

    const tampered = await withEnv(env, () => GET(requestWith(`${valid}x`), {
      params: Promise.resolve({ path: ["learners"] }),
    }));
    const expired = createTeacherReportSession(secret, Date.now() - (8 * 60 * 60 * 1_000) - 1_000);
    const expiredResponse = await withEnv(env, () => GET(requestWith(expired), {
      params: Promise.resolve({ path: ["learners"] }),
    }));
    assert.equal(tampered.status, 401);
    assert.equal(expiredResponse.status, 401);
    assert.equal(forwarded.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
