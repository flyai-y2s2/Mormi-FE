import Image from "next/image";
import { useCharacterName } from "./CharacterName";

type StarNoteProps = {
  text: string | null | undefined;
  attribution?: "child" | "coauthored" | null;
  learnerName?: string;
  className?: string;
};

function hasFinalConsonant(value: string) {
  const last = Array.from(value.trim()).at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}

export function starNoteAttributionLabel(
  learnerName: string | undefined,
  attribution: "child" | "coauthored" | string | null | undefined,
) {
  if (!attribution) return null;
  const name = learnerName?.trim() || "아이";
  const finalConsonant = hasFinalConsonant(name);
  if (attribution === "child") return `${name}${finalConsonant ? "이가" : "가"} 알려줌`;
  if (attribution === "coauthored") return `${name}${finalConsonant ? "이와" : "와"} 함께 공부함`;
  return null;
}

/** 집 반복학습과 카페가 함께 쓰는 모르미의 별노트. */
export function StarNote({ text, attribution, learnerName, className = "" }: StarNoteProps) {
  const { displayName } = useCharacterName();
  const attributionText = starNoteAttributionLabel(learnerName, attribution);
  return (
    <article className={`star-note ${className}`.trim()}>
      <div className="note-ring" aria-hidden="true">별<br />노<br />트</div>
      <div className="note-content">
        <p>
          <span className="star-note-icon" aria-hidden="true">
            <Image src="/ui/mormi-star.png" alt="" width={48} height={48} unoptimized />
          </span>
          오늘 {displayName}가 적은 말
        </p>
        <h2>“<em>{text ?? ""}</em>”</h2>
        {attributionText && <small className="star-note-attribution">{attributionText}</small>}
      </div>
    </article>
  );
}
