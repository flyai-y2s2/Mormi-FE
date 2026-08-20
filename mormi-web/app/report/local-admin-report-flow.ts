export type ReportRequest =
  | { source: "local-admin"; learnerId: number; weekStart?: string }
  | { source: "authenticated"; weekStart?: string };

export type ReportLanding = "local-admin-search" | "authenticated" | "auth" | "teacher-login" | "teacher-unavailable";

export function reportLandingFor({
  localAdminEnabled,
  hasStoredLearner,
  teacherMode = false,
  teacherAuthRequired = false,
  teacherAuthenticated = false,
}: {
  localAdminEnabled: boolean;
  hasStoredLearner: boolean;
  teacherMode?: boolean;
  teacherAuthRequired?: boolean;
  teacherAuthenticated?: boolean;
}): ReportLanding {
  if (teacherMode) {
    if (!localAdminEnabled) return "teacher-unavailable";
    if (teacherAuthRequired && !teacherAuthenticated) return "teacher-login";
    return "local-admin-search";
  }
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
