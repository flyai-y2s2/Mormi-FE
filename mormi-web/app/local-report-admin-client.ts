"use client";

import { ApiError, type DiagnosticReportDto, type SpeechEvidenceDto } from "./api-client";

export type LocalAdminLearner = {
  learner_id: number;
  display_name: string;
};

async function localAdminRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/local-report-admin${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, "local_report_admin_error", "학습자 정보를 불러오지 못했습니다.");
  }
  return response.json() as Promise<T>;
}

export const localReportAdminApi = {
  search(query: string, signal?: AbortSignal) {
    return localAdminRequest<LocalAdminLearner[]>(
      `/learners?query=${encodeURIComponent(query.trim())}&limit=10`,
      signal,
    );
  },

  diagnostic(learnerId: number, weekStart?: string, signal?: AbortSignal) {
    const query = weekStart ? `?week_start=${encodeURIComponent(weekStart)}` : "";
    return localAdminRequest<DiagnosticReportDto>(
      `/learners/${learnerId}/diagnostic${query}`,
      signal,
    );
  },

  speechEvidence(learnerId: number, domainId: string, weekStart: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ domain_id: domainId, week_start: weekStart });
    return localAdminRequest<SpeechEvidenceDto>(`/learners/${learnerId}/speech-evidence?${params.toString()}`, signal);
  },
};
