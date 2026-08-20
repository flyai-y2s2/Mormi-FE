import "server-only";
import { localReportAdminConfig } from "../../../local-report-admin-policy";
import { isTeacherReportRequestAuthorized } from "../../../teacher-report-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const config = localReportAdminConfig(process.env);
  if (!config) return Response.json({ code: "not_found" }, { status: 404 });
  if (!isTeacherReportRequestAuthorized(request, config.auth)) {
    return Response.json({ code: "teacher_auth_required" }, { status: 401 });
  }
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/v1/local-report-admin/${path.map(encodeURIComponent).join("/")}`, config.origin);
  target.search = incoming.search;
  const upstream = await fetch(target, {
    method: "GET",
    headers: { accept: "application/json", "X-Mormi-Local-Admin-Key": config.key },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}
