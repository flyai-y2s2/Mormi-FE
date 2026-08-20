export type LocalReportAdminConfig = {
  origin: string;
  key: string;
  auth?: {
    password: string;
    sessionSecret: string;
    secureCookie: boolean;
  };
};

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
      if (["localhost", "127.0.0.1"].includes(configuredUrl.hostname)) {
        originValue = env.BACKEND_ORIGIN?.trim() || "";
      }
    }
    const origin = new URL(originValue);
    if (origin.username || origin.password) return null;
    if (nodeEnv === "production") {
      const password = env.TEACHER_REPORT_PASSWORD?.trim();
      const sessionSecret = env.TEACHER_REPORT_SESSION_SECRET?.trim();
      if (origin.protocol !== "https:" || !password || password.length < 12 || !sessionSecret || sessionSecret.length < 32) return null;
      return {
        origin: origin.toString().replace(/\/$/, ""),
        key,
        auth: { password, sessionSecret, secureCookie: true },
      };
    }
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return null;
    return { origin: origin.toString().replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}
