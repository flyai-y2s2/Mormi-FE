import "server-only";

// 자유 발화는 분류와 모르미 발화 생성을 연속 수행하므로 첫 실행이 12초를 넘을 수 있다.
const REQUEST_TIMEOUT_MS = 45_000;

function configuredBaseUrl() {
  const value = (process.env.MORMI_AI_BASE_URL || process.env.AI_ORIGIN)?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export async function forwardToMormi(path: string, init?: RequestInit) {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) {
    return Response.json({
      error: "MORMI_AI_NOT_CONFIGURED",
      detail: "AI_ORIGIN 또는 MORMI_AI_BASE_URL이 설정되지 않았습니다.",
    }, { status: 503 });
  }

  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const serviceKey = (process.env.MORMI_AI_SERVICE_KEY || process.env.MORMI_DIALOGUE_SERVICE_KEY)?.trim();
  if (serviceKey) headers.set("X-Mormi-Service-Key", serviceKey);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await response.text();
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok && !contentType.includes("application/json")) {
      return Response.json({
        error: "MORMI_AI_UPSTREAM_ERROR",
        detail: response.status >= 500
          ? "모르미가 답을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요."
          : "모르미 대화 요청을 처리하지 못했어요.",
        upstream_status: response.status,
      }, { status: response.status >= 500 ? 502 : response.status });
    }
    return new Response(body, {
      status: response.status,
      headers: { "Content-Type": contentType || "application/json" },
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return Response.json({
      error: timedOut ? "MORMI_AI_TIMEOUT" : "MORMI_AI_UNAVAILABLE",
      detail: timedOut ? "모르미 대화 서버의 응답 시간이 초과되었습니다." : "모르미 대화 서버에 연결하지 못했습니다.",
    }, { status: 503 });
  }
}
