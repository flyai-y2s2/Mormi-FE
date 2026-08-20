import assert from "node:assert/strict";
import test from "node:test";

const routeModule = await import("../app/api/teacher-report-session/route.ts").catch(() => null);
const envNames = [
  "ENABLE_LOCAL_REPORT_ADMIN",
  "LOCAL_REPORT_ADMIN_ORIGIN",
  "LOCAL_REPORT_ADMIN_KEY",
  "TEACHER_REPORT_PASSWORD",
  "TEACHER_REPORT_SESSION_SECRET",
  "NODE_ENV",
];

async function withProductionEnv(action) {
  const previous = new Map(envNames.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "https://api.mormi.example",
    LOCAL_REPORT_ADMIN_KEY: "server-secret",
    TEACHER_REPORT_PASSWORD: "teacher-password",
    TEACHER_REPORT_SESSION_SECRET: "session-secret-with-at-least-32-characters",
    NODE_ENV: "production",
  });
  try {
    return await action();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("sets a secure HttpOnly teacher session only for the configured password", async () => {
  assert.ok(routeModule, "teacher report authentication route must exist");
  await withProductionEnv(async () => {
    const originalFetch = globalThis.fetch;
    const attempts = [];
    globalThis.fetch = async (input, init) => {
      const forwarded = new Request(input, init);
      attempts.push({ url: forwarded.url, body: await forwarded.json(), key: forwarded.headers.get("X-Mormi-Local-Admin-Key") });
      return new Response(null, { status: attempts.at(-1).body.accepted ? 204 : 401 });
    };
    try {
      const rejected = await routeModule.POST(new Request("https://mormi.example/api/teacher-report-session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ password: "wrong" }),
      }));
      assert.equal(rejected.status, 401);
      assert.equal(rejected.headers.has("set-cookie"), false);

      const accepted = await routeModule.POST(new Request("https://mormi.example/api/teacher-report-session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-forwarded-for": "203.0.113.9" },
        body: JSON.stringify({ password: "teacher-password" }),
      }));
      const cookie = accepted.headers.get("set-cookie") ?? "";
      assert.equal(accepted.status, 204);
      assert.match(cookie, /mormi_teacher_report=/);
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=Strict/i);
      assert.match(cookie, /Max-Age=28800/i);
      assert.deepEqual(attempts.map(({ body }) => body.accepted), [false, true]);
      assert.equal(attempts[0].body.clientFingerprint, attempts[1].body.clientFingerprint);
      assert.match(attempts[0].body.clientFingerprint, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(JSON.stringify(attempts).includes("203.0.113.9"), false);
      assert.equal(attempts.every(({ key }) => key === "server-secret"), true);
      assert.equal(attempts.every(({ url }) => url === "https://api.mormi.example/v1/local-report-admin/auth-attempt"), true);
      assert.equal(JSON.stringify(attempts).includes("teacher-password"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("honors the shared backend block after repeated password failures", async () => {
  assert.ok(routeModule, "teacher report authentication route must exist");
  await withProductionEnv(async () => {
    const originalFetch = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = async () => {
      attempts += 1;
      return new Response(null, { status: attempts > 5 ? 429 : 401 });
    };
    const request = () => new Request("https://mormi.example/api/teacher-report-session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
      body: JSON.stringify({ password: "wrong" }),
    });
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal((await routeModule.POST(request())).status, 401);
      }
      assert.equal((await routeModule.POST(request())).status, 429);
      assert.equal(attempts, 6);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("derives distinct opaque limiter identities for different Vercel client IPs", async () => {
  assert.ok(routeModule, "teacher report authentication route must exist");
  await withProductionEnv(async () => {
    const originalFetch = globalThis.fetch;
    const fingerprints = [];
    globalThis.fetch = async (input, init) => {
      const forwarded = new Request(input, init);
      fingerprints.push((await forwarded.json()).clientFingerprint);
      return new Response(null, { status: 401 });
    };
    const request = (ip) => new Request("https://mormi.example/api/teacher-report-session", {
      method: "POST",
      headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
      body: JSON.stringify({ password: "wrong" }),
    });
    try {
      await routeModule.POST(request("203.0.113.9"));
      await routeModule.POST(request("203.0.113.10"));
      assert.equal(fingerprints.length, 2);
      assert.notEqual(fingerprints[0], fingerprints[1]);
      assert.equal(JSON.stringify(fingerprints).includes("203.0.113"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("fails closed when the shared backend attempt limiter is unavailable", async () => {
  assert.ok(routeModule, "teacher report authentication route must exist");
  await withProductionEnv(async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("backend unavailable"); };
    try {
      const response = await routeModule.POST(new Request("https://mormi.example/api/teacher-report-session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "teacher-password" }),
      }));
      assert.equal(response.status, 503);
      assert.equal(response.headers.has("set-cookie"), false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
