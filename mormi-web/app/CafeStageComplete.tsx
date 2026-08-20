"use client";

import Image from "next/image";

/** 반복학습 완료 장면과 같은 구성으로 카페 스테이지와 외출 완료 상태를 보여 준다. */
export function CafeStageComplete({
  stageNumber,
  eyebrow,
  title,
  highlight,
  noteCount,
  currentMoney,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  stageNumber: number;
  eyebrow?: string;
  title: string;
  highlight: string;
  noteCount: number;
  currentMoney: number;
  actionLabel: string;
  onAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  const statuses = [
    { label: "별노트", value: `${noteCount}개`, image: "/ui/mormi-star.png" },
    { label: "현재 돈", value: `${currentMoney.toLocaleString("ko-KR")}원`, image: "/ui/mormi-coin.png" },
    { label: "현재 스테이지", value: `${stageNumber}/3`, image: "/ui/mormi-cafe.png" },
  ];

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
          <p className="eyebrow">{eyebrow ?? `STAGE ${stageNumber} CLEAR!`}</p>
          <h1>{title}<br /><em>{highlight}</em></h1>
          <div className="today-badges cafe-stage-complete__status" aria-label={`스테이지 ${stageNumber} 현재 상태`}>
            {statuses.map((status) => (
              <span key={status.label}>
                <Image src={status.image} alt="" width={72} height={72} unoptimized />
                <strong>{status.value}</strong>
                <small>{status.label}</small>
              </span>
            ))}
          </div>
          <div className={`cafe-stage-complete__actions${onSecondaryAction ? " has-secondary" : ""}`}>
            <button className="primary-button complete-exit-button" onClick={onAction}>
              {actionLabel} <span className="button-arrow" />
            </button>
            {onSecondaryAction && secondaryActionLabel && (
              <button className="cafe-stage-complete__secondary" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
