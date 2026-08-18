import type { DiagnosticMode, SpeechEvidenceDto } from "../api-client";
import { chooseDiagnosticSelection, type DiagnosticDomainGroup } from "./diagnostic-report-model.ts";

export type DiagnosticEvidenceActivity = "drill" | "teach" | "life" | "speech";

export type ParsedDiagnosticEvidenceRef =
  | { kind: "domain"; activity: DiagnosticEvidenceActivity; domain_id: string }
  | { kind: "global"; label: string }
  | { kind: "unknown"; raw: string };

export type DiagnosticEvidenceTarget = {
  mode: DiagnosticMode;
  domain_id: string;
  focus: "chart" | "domain";
  expand_speech: boolean;
};

export type DiagnosticEvidenceLink = {
  ref: string;
  label: string;
  target: DiagnosticEvidenceTarget | null;
};

export type DiagnosticSpeechState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; evidence: SpeechEvidenceDto };

const domainActivities = new Set<DiagnosticEvidenceActivity>(["drill", "teach", "life", "speech"]);
const highlightKinds = new Set(["improved", "observe"]);
const activityLabels: Record<DiagnosticEvidenceActivity, string> = {
  drill: "문제 정답률 근거",
  teach: "혼자 설명하기 근거",
  life: "생활 속 문제 해결 근거",
  speech: "발화 비교 근거",
};

export function isCompleteReportExample(search: string): boolean {
  return new URLSearchParams(search).get("example") === "complete";
}

export function parseDiagnosticEvidenceRef(ref: string): ParsedDiagnosticEvidenceRef {
  const parts = ref.split(":");
  if (parts.length === 2 && domainActivities.has(parts[0] as DiagnosticEvidenceActivity) && parts[1]) {
    return { kind: "domain", activity: parts[0] as DiagnosticEvidenceActivity, domain_id: parts[1] };
  }
  if (parts.length === 3 && highlightKinds.has(parts[0]) && domainActivities.has(parts[1] as DiagnosticEvidenceActivity) && parts[2]) {
    return { kind: "domain", activity: parts[1] as DiagnosticEvidenceActivity, domain_id: parts[2] };
  }
  if (ref === "improved:insufficient-history") return { kind: "global", label: "장기 비교 근거 부족" };
  if (ref === "observe:next-records") return { kind: "global", label: "다음 학습 기록 필요" };
  return { kind: "unknown", raw: ref };
}

export function evidenceLinksForRefs(
  refs: readonly string[],
  groups: readonly DiagnosticDomainGroup[],
): DiagnosticEvidenceLink[] {
  return refs.map((ref) => {
    const parsed = parseDiagnosticEvidenceRef(ref);
    if (parsed.kind === "global") return { ref, label: parsed.label, target: null };
    if (parsed.kind === "unknown") return { ref, label: `기타 근거 (${parsed.raw})`, target: null };

    const domain = groups.find((group) => group.domain_id === parsed.domain_id);
    if (!domain) return { ref, label: `기타 근거 (${ref})`, target: null };
    const mode = parsed.activity === "life" ? "LIFE" : parsed.activity === "speech" ? domain.mode : "HOME";
    if (domain.mode !== mode) return { ref, label: `기타 근거 (${ref})`, target: null };
    const expandSpeech = parsed.activity === "speech";
    return {
      ref,
      label: `${domain.label} · ${activityLabels[parsed.activity]}`,
      target: {
        mode,
        domain_id: domain.domain_id,
        focus: expandSpeech ? "domain" : "chart",
        expand_speech: expandSpeech,
      },
    };
  });
}

export function modeForTabKey(currentMode: DiagnosticMode, key: string): DiagnosticMode | null {
  if (key === "Home") return "HOME";
  if (key === "End") return "LIFE";
  if (key === "ArrowRight" || key === "ArrowLeft") return currentMode === "HOME" ? "LIFE" : "HOME";
  return null;
}

export function selectionAfterRefresh(
  groups: readonly DiagnosticDomainGroup[],
  previousMode: DiagnosticMode,
  previousDomainId: string,
): { mode: DiagnosticMode; domain_id: string } {
  const group = chooseDiagnosticSelection(groups, previousMode, previousDomainId);
  return { mode: group?.mode ?? "HOME", domain_id: group?.domain_id ?? "" };
}

export function reportRequestAccepted(activeSequence: number, responseSequence: number, aborted: boolean): boolean {
  return !aborted && activeSequence === responseSequence;
}

export function speechLoadDecision(state: DiagnosticSpeechState | undefined): "reuse" | "fetch" {
  return state?.state === "ready" || state?.state === "loading" ? "reuse" : "fetch";
}

export function speechStateAfterResult(
  result: { ok: true; evidence: SpeechEvidenceDto } | { ok: false; message: string },
): DiagnosticSpeechState {
  return result.ok ? { state: "ready", evidence: result.evidence } : { state: "error", message: result.message };
}
