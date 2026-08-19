export type ReportRequest =
  | { source: "local-admin"; learnerId: number; weekStart?: string }
  | { source: "authenticated"; weekStart?: string };

export type ReportLanding = "local-admin-search" | "authenticated" | "auth";

export function reportLandingFor({
  localAdminEnabled,
  hasStoredLearner,
}: {
  localAdminEnabled: boolean;
  hasStoredLearner: boolean;
}): ReportLanding {
  if (hasStoredLearner) return "authenticated";
  return localAdminEnabled ? "local-admin-search" : "auth";
}

export function reportRequestFor({
  selectedLearnerId,
  weekStart,
}: {
  selectedLearnerId: number | null;
  weekStart?: string;
}): ReportRequest {
  return selectedLearnerId === null
    ? { source: "authenticated", weekStart }
    : { source: "local-admin", learnerId: selectedLearnerId, weekStart };
}
