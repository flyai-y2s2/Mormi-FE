import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 대화 요청은 Spring BE가 두 번의 LLM 호출을 기다릴 수 있다. 브라우저(60초)가
// 이 프록시(55초)보다 먼저 끊지 않고, 이 프록시는 BE(45초)의 정제된 오류를
// 받을 수 있도록 바깥쪽일수록 조금 더 긴 제한을 둔다.
const REQUEST_TIMEOUT_MS = 55_000;

export const maxDuration = 60;

type BackendRouteContext = {
  params: Promise<{ path: string[] }>;
};

function backendOrigin() {
  const raw = process.env.BACKEND_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (process.env.NODE_ENV === "production"
        && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function forward(request: Request, context: BackendRouteContext) {
  const origin = backendOrigin();
  if (!origin) {
    return Response.json({
      code: "backend_not_configured",
      message: "배포된 Spring BE 주소가 설정되지 않았습니다.",
    }, { status: 503 });
  }

  const { path } = await context.params;
  const incomingUrl = new URL(request.url);
  const target = new URL(`${origin}/${path.map(encodeURIComponent).join("/")}`);
  target.search = incomingUrl.search;

  const headers = new Headers();
  for (const name of [
    "authorization",
    "content-type",
    "accept",
    "idempotency-key",
    "x-mormi-service-key",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return Response.json({
      code: timedOut ? "backend_timeout" : "backend_unavailable",
      message: timedOut
        ? "학습 서버 응답 시간이 초과되었습니다. 다시 시도해 주세요."
        : "배포된 학습 서버에 연결하지 못했습니다.",
    }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
