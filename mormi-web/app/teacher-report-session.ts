import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const TEACHER_REPORT_COOKIE = "mormi_teacher_report";
export const TEACHER_REPORT_SESSION_SECONDS = 8 * 60 * 60;

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createTeacherReportSession(secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1_000) + TEACHER_REPORT_SESSION_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyTeacherReportSession(token: string | null | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [version, expiresAtText, providedSignature, extra] = token.split(".");
  if (version !== "v1" || extra !== undefined || !providedSignature || !/^\d+$/.test(expiresAtText ?? "")) return false;
  const expiresAt = Number(expiresAtText);
  const nowSeconds = Math.floor(now / 1_000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + TEACHER_REPORT_SESSION_SECONDS) return false;
  const expected = Buffer.from(signature(`${version}.${expiresAtText}`, secret));
  const provided = Buffer.from(providedSignature);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function readTeacherReportSession(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [name, ...valueParts] = item.trim().split("=");
    if (name !== TEACHER_REPORT_COOKIE) continue;
    try {
      return decodeURIComponent(valueParts.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export function isTeacherReportRequestAuthorized(
  request: Request,
  auth: { sessionSecret: string } | undefined,
): boolean {
  if (!auth) return true;
  const token = readTeacherReportSession(request.headers.get("cookie"));
  return verifyTeacherReportSession(token, auth.sessionSecret);
}
