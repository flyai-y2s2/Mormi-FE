import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { localReportAdminConfig } from "../../local-report-admin-policy";
import {
  createTeacherReportSession,
  TEACHER_REPORT_COOKIE,
  TEACHER_REPORT_SESSION_SECONDS,
} from "../../teacher-report-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function passwordsMatch(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

function clientFingerprint(request: Request, secret: string): string {
  const clientIp = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-forwarded-for")
    ?? "unknown";
  return createHmac("sha256", secret).update(clientIp).digest("base64url");
}

export async function POST(request: Request) {
  const config = localReportAdminConfig(process.env);
  if (!config?.auth) return Response.json({ code: "not_found" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }
  const password = body && typeof body === "object" ? (body as { password?: unknown }).password : undefined;
  const accepted = passwordsMatch(password, config.auth.password);
  let attemptResponse: Response;
  try {
    attemptResponse = await fetch(new URL("/v1/local-report-admin/auth-attempt", config.origin), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Mormi-Local-Admin-Key": config.key,
      },
      body: JSON.stringify({ accepted, clientFingerprint: clientFingerprint(request, config.auth.sessionSecret) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return Response.json({ code: "teacher_auth_unavailable" }, { status: 503 });
  }
  if (attemptResponse.status === 429) {
    return Response.json({ code: "too_many_attempts" }, {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "retry-after": attemptResponse.headers.get("retry-after") ?? "600",
      },
    });
  }
  if (!accepted && attemptResponse.status === 401) {
    return Response.json({ code: "invalid_teacher_password" }, { status: 401 });
  }
  if (!accepted || attemptResponse.status !== 204) {
    return Response.json({ code: "teacher_auth_unavailable" }, { status: 503 });
  }
  const session = createTeacherReportSession(config.auth.sessionSecret);
  const secure = config.auth.secureCookie ? "; Secure" : "";
  return new Response(null, {
    status: 204,
    headers: {
      "cache-control": "no-store",
      "set-cookie": `${TEACHER_REPORT_COOKIE}=${encodeURIComponent(session)}; Path=/; Max-Age=${TEACHER_REPORT_SESSION_SECONDS}; HttpOnly; SameSite=Strict${secure}`,
    },
  });
}
