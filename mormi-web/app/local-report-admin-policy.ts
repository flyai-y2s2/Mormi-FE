export type LocalReportAdminConfig = { origin: string; key: string };

export function localReportAdminConfig(
  env: Record<string, string | undefined>,
  nodeEnv = env.NODE_ENV,
): LocalReportAdminConfig | null {
  if (nodeEnv === "production" || env.ENABLE_LOCAL_REPORT_ADMIN !== "true") return null;
  const key = env.LOCAL_REPORT_ADMIN_KEY?.trim();
  if (!key) return null;
  try {
    const origin = new URL(env.LOCAL_REPORT_ADMIN_ORIGIN ?? "");
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return null;
    return { origin: origin.toString().replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}
