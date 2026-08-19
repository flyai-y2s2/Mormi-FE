import Image from "next/image";

type StarNoteProps = {
  text: string | null | undefined;
  className?: string;
};

/** 집 반복학습과 카페가 함께 쓰는 모르미의 별노트. */
export function StarNote({ text, className = "" }: StarNoteProps) {
  return (
    <article className={`star-note ${className}`.trim()}>
      <div className="note-ring" aria-hidden="true">별<br />노<br />트</div>
      <div className="note-content">
        <p>
          <span className="star-note-icon" aria-hidden="true">
            <Image src="/ui/mormi-star.png" alt="" width={48} height={48} unoptimized />
          </span>
          오늘 모르미가 적은 말
        </p>
        <h2>“<em>{text ?? ""}</em>”</h2>
      </div>
    </article>
  );
}
