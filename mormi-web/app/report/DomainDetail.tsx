import type { SpeechEvidenceDto } from "../api-client";
import { statusLabel, type DiagnosticDomainGroup, type DiagnosticEvidenceKind } from "./diagnostic-report-model";

type SpeechState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; evidence: SpeechEvidenceDto };

type DomainDetailProps = {
  domain: DiagnosticDomainGroup;
  speech?: SpeechState;
};

const directionLabels = {
  IMPROVING: "좋아지는 중",
  DECLINING: "최근 낮아짐",
  MAINTAINING: "비슷하게 유지",
  INSUFFICIENT_HISTORY: "기록 더 필요",
} as const;

const kindLabels: Record<DiagnosticEvidenceKind, string> = {
  drill: "문제 정답률",
  teach: "혼자 설명하기",
  life: "생활 속 문제 해결",
};

function EvidenceSample({ label, sample }: {
  label: string;
  sample: NonNullable<Extract<SpeechEvidenceDto, { available: true }>["past"]>;
}) {
  return (
    <article className="speech-sample">
      <div><strong>{label}</strong><time dateTime={sample.occurred_at}>{sample.occurred_at.slice(0, 10)}</time></div>
      <blockquote>{sample.utterance}</blockquote>
      {(sample.hint_level || sample.expression_level) && (
        <dl>
          {sample.hint_level && <><dt>도움 수준</dt><dd>{sample.hint_level}</dd></>}
          {sample.expression_level && <><dt>표현 수준</dt><dd>{sample.expression_level}</dd></>}
        </dl>
      )}
    </article>
  );
}

export function DomainDetail({ domain, speech }: DomainDetailProps) {
  return (
    <div className="domain-detail">
      <div className="domain-detail__status">
        <span>현재 상태</span>
        {domain.statuses.map((item) => (
          <div className="domain-detail__status-row" key={`${item.kind}-${item.label}`}>
            <small>{kindLabels[item.kind]}</small>
            <strong>{statusLabel(item.status)} · {directionLabels[item.direction]}</strong>
            <small>누적 {item.total_count}회 · 최근 {item.recent_count}회</small>
          </div>
        ))}
      </div>
      <div className="domain-detail__evidence" aria-live="polite">
        <h3>같은 문제를 어떻게 설명했는지</h3>
        {!speech || speech.state === "loading" ? (
          <p className="domain-detail__message">발화 근거를 불러오는 중입니다.</p>
        ) : speech.state === "error" ? (
          <p className="domain-detail__message">{speech.message}</p>
        ) : !speech.evidence.available ? (
          <p className="domain-detail__message">{speech.evidence.message}</p>
        ) : (
          <>
            <div className="speech-comparison">
              {speech.evidence.past && <EvidenceSample label="과거 대표 발화" sample={speech.evidence.past} />}
              <EvidenceSample label="최근 대표 발화" sample={speech.evidence.recent} />
            </div>
            {speech.evidence.verified_elements.length > 0 && (
              <div className="verified-elements">
                <span>검증된 개념 요소</span>
                <ul>{speech.evidence.verified_elements.map((element) => <li key={element}>{element}</li>)}</ul>
              </div>
            )}
            <p className="speech-change"><span>간접적으로 관찰되는 변화</span>{speech.evidence.change_summary}</p>
          </>
        )}
      </div>
    </div>
  );
}
