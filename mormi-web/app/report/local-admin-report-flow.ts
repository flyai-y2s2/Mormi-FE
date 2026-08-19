export type ReportRequest =
  | { source: "local-admin"; learnerId: number; weekStart?: string }
  | { source: "authenticated"; weekStart?: string };

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
