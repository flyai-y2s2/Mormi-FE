export type LocalReportAdminConfig = {
  origin: string;
  key: string;
  auth?: {
    password: string;
    sessionSecret: string;
    secureCookie: boolean;
  };
};

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1"];

export function localReportAdminConfig(
  env: Record<string, string | undefined>,
  nodeEnv = env.NODE_ENV,
): LocalReportAdminConfig | null {
  if (env.ENABLE_LOCAL_REPORT_ADMIN !== "true") return null;
  const key = env.LOCAL_REPORT_ADMIN_KEY?.trim();
  if (!key) return null;
  try {
    const configuredOrigin = env.LOCAL_REPORT_ADMIN_ORIGIN?.trim();
    let originValue = configuredOrigin || env.BACKEND_ORIGIN?.trim() || "";
    if (nodeEnv === "production" && configuredOrigin) {
      const configuredUrl = new URL(configuredOrigin);
      if (LOOPBACK_HOSTNAMES.includes(configuredUrl.hostname)) {
        originValue = env.BACKEND_ORIGIN?.trim() || "";
      }
    }
    const origin = new URL(originValue);
    if (origin.username || origin.password) return null;
    if (nodeEnv === "production") {
      // HTTPS 가 아직 없는 파일럿 스택을 위한 한시적 예외. 켜 두면 서버 간 관리자 키와
      // 진단 리포트가 Vercel~백엔드 구간을 평문으로 지나간다. HTTPS 를 붙이는 즉시
      // 이 변수를 지우면 원래의 https 전용 규칙으로 돌아온다.
      const allowInsecureOrigin = env.LOCAL_REPORT_ADMIN_ALLOW_INSECURE_ORIGIN === "true";
      const protocolAllowed = origin.protocol === "https:"
        || (allowInsecureOrigin && origin.protocol === "http:");
      // 루프백은 예외와 무관하게 막는다. 배포 함수 안에서 자기 자신을 가리키게 되는데,
      // 예외를 켜기 전에는 https 조건이 이 조합을 덤으로 걸러 내고 있었다.
      if (!protocolAllowed || LOOPBACK_HOSTNAMES.includes(origin.hostname)) return null;
      const password = env.TEACHER_REPORT_PASSWORD?.trim();
      const sessionSecret = env.TEACHER_REPORT_SESSION_SECRET?.trim();
      if (!password || password.length < 12 || !sessionSecret || sessionSecret.length < 32) return null;
      return {
        origin: origin.toString().replace(/\/$/, ""),
        key,
        auth: { password, sessionSecret, secureCookie: true },
      };
    }
    if (origin.protocol !== "http:" || !LOOPBACK_HOSTNAMES.includes(origin.hostname)) return null;
    return { origin: origin.toString().replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}
