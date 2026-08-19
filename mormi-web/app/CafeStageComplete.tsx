"use client";

import Image from "next/image";

export type CafeStageResult = {
  label: string;
  value: string;
};

/** 반복학습 완료 장면과 같은 구성으로 카페 네 스테이지의 결과를 보여 준다. */
export function CafeStageComplete({
  stageNumber,
  title,
  highlight,
  results,
  actionLabel,
  onAction,
}: {
  stageNumber: number;
  title: string;
  highlight: string;
  results: CafeStageResult[];
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="cafe-stage-complete-wrap">
      <section className="complete-scene cafe-stage-complete">
        <div className="confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
        <Image
          className="cafe-stage-complete__morami"
          src="/morami/celebrate-cutout.png"
          alt="스테이지 완료를 기뻐하는 모르미"
          width={430}
          height={500}
          priority
          unoptimized
        />
        <div className="complete-copy">
          <p className="eyebrow">STAGE {stageNumber} CLEAR!</p>
          <h1>{title}<br /><em>{highlight}</em></h1>
          <div className="cafe-stage-complete__results" aria-label={`스테이지 ${stageNumber} 결과`}>
            {results.map((result) => (
              <span key={result.label}>
                <strong>{result.value}</strong>
                <small>{result.label}</small>
              </span>
            ))}
          </div>
          <button className="primary-button complete-exit-button" onClick={onAction}>
            {actionLabel} <span className="button-arrow" />
          </button>
        </div>
      </section>
    </div>
  );
}
