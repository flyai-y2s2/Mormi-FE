"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef } from "react";
import { collectedStarConcepts } from "./collected-stars";
import { useCharacterName } from "./CharacterName";

type CollectedStarsModalProps = {
  completedSessionIds: string[];
  onClose: () => void;
  onOpenStarNotes: () => void;
};

export function CollectedStarsModal({ completedSessionIds, onClose, onOpenStarNotes }: CollectedStarsModalProps) {
  const { displayName } = useCharacterName();
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const concepts = useMemo(() => collectedStarConcepts(completedSessionIds), [completedSessionIds]);
  const totalStars = concepts.length * 3;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop collected-stars-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collected-stars-title"
      aria-describedby="collected-stars-description"
    >
      <section ref={modalRef} className="collected-stars-modal">
        <button ref={closeButtonRef} className="collected-stars-close" type="button" onClick={onClose} aria-label="모은 별 닫기">×</button>
        <header>
          <Image src="/ui/mormi-star.png" alt="" width={90} height={90} unoptimized />
          <div>
            <p>내가 해낸 생활 수학</p>
            <h2 id="collected-stars-title">완료한 개념</h2>
            <span id="collected-stars-description">완료한 개념 {concepts.length}개 · 별 {totalStars}개</span>
          </div>
        </header>

        {concepts.length === 0 ? (
          <div className="collected-stars-empty">
            <Image src="/morami/bright-cutout.png" alt={`응원하는 ${displayName}`} width={180} height={190} unoptimized />
            <h3>아직 모은 별이 없어요.</h3>
            <p>첫 개념을 완료하면 배운 내용과 별 3개가 여기에 모여요!</p>
          </div>
        ) : (
          <>
            <p className="collected-stars-summary-note">
              아래 문장은 완료한 개념의 요약이에요. 내가 {displayName}에게 직접 알려 준 말은 별노트에서 확인할 수 있어요.
            </p>
            <div className="collected-stars-grid" role="list" aria-label="완료한 학습 개념">
              {concepts.map((concept) => (
                <article key={concept.id} role="listitem" className="collected-stars-card">
                  <div className="collected-stars-card__stars" aria-label={`${concept.title}에서 얻은 별 3개`}>
                    {Array.from({ length: concept.stars }, (_, index) => (
                      <Image key={index} src="/ui/mormi-star.png" alt="" width={42} height={42} unoptimized />
                    ))}
                  </div>
                  <h3>{concept.title}</h3>
                  <p><span className="sr-only">완료한 개념 요약: </span>{concept.concept}</p>
                </article>
              ))}
            </div>
          </>
        )}

        <div className="collected-stars-actions">
          <button className="collected-stars-notes" type="button" onClick={() => { onClose(); onOpenStarNotes(); }}>별노트 모아보기</button>
          <button className="collected-stars-done" type="button" onClick={onClose}>다 봤어요!</button>
        </div>
      </section>
    </div>
  );
}
