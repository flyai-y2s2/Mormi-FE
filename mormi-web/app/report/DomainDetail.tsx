import type { DiagnosticDomainStatusDto, SpeechEvidenceDto } from "../api-client";
import { statusLabel } from "./diagnostic-report-model";

type SpeechState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; evidence: SpeechEvidenceDto };

type DomainDetailProps = {
  domain: DiagnosticDomainStatusDto;
  speech?: SpeechState;
};

const directionLabels = {
  IMPROVING: "장기 향상",
  DECLINING: "최근 하락",
  MAINTAINING: "장기 유지",
  INSUFFICIENT_HISTORY: "최근 근거 추가",
} as const;

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
        <strong>{statusLabel(domain.status)} · {directionLabels[domain.direction]}</strong>
        <small>동일 영역 누적 {domain.total_count}회 · 최근 {domain.recent_count}회</small>
      </div>
      <div className="domain-detail__evidence" aria-live="polite">
        <h3>같은 영역의 설명 변화</h3>
        {!speech || speech.state === "loading" ? (
          <p className="domain-detail__message">발화 근거를 불러오는 중입니다.</p>
        ) : speech.state === "error" ? (
          <p className="domain-detail__message">{speech.message}</p>
        ) : !speech.evidence.available ? (
          <p className="domain-detail__message">{speech.evidence.message}</p>
        ) : (
          <>
            <div className="speech-comparison">
              <EvidenceSample label="과거 대표 발화" sample={speech.evidence.past} />
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
