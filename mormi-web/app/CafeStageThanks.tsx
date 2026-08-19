"use client";

import Image from "next/image";

/** 반복학습의 보상 장면처럼, 결과 요약 전에 모르미가 먼저 고마움을 전한다. */
export function CafeStageThanks({
  learnerName,
  title,
  onNext,
}: {
  learnerName: string;
  title: string;
  onNext: () => void;
}) {
  return (
    <main className="cafe-stage-thanks">
      <div className="cafe-stage-thanks__dialogue">
        <b>모르미</b>
        <p>{learnerName}, 알려줘서 고마워~!</p>
      </div>
      <h1>모르미와 함께<br /><em>{title}</em></h1>
      <Image
        src="/morami/celebrate-cutout.png"
        alt="도움을 받아 기뻐하는 모르미"
        width={300}
        height={300}
        priority
        unoptimized
      />
      <button className="primary-button" onClick={onNext}>다음으로 <span className="button-arrow" /></button>
    </main>
  );
}
