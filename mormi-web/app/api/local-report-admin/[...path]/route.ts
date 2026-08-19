import "server-only";
import { localReportAdminConfig } from "../../../local-report-admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const config = localReportAdminConfig(process.env);
  if (!config) return Response.json({ code: "not_found" }, { status: 404 });
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/v1/local-report-admin/${path.map(encodeURIComponent).join("/")}`, config.origin);
  target.search = incoming.search;
  const upstream = await fetch(target, {
    method: "GET",
    headers: { accept: "application/json", "X-Mormi-Local-Admin-Key": config.key },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}
