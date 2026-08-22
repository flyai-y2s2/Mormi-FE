"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type StarNoteListItem } from "./api-client";
import { mergeStarNoteItems, starNoteListErrorMessage } from "./star-note-list";

type StarNoteArchiveModalProps = {
  learnerId: number;
  onClose: () => void;
};

type ArchiveStatus = "loading" | "ready" | "empty" | "error";

function noteDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function StarNoteArchiveModal({ learnerId, onClose }: StarNoteArchiveModalProps) {
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [notes, setNotes] = useState<StarNoteListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<ArchiveStatus>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const loadFirstPage = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    setErrorMessage("");
    setLoadingMore(false);
    setLoadMoreError("");
    try {
      const response = await api.starNotes(learnerId, { limit: 20, signal: controller.signal });
      if (controller.signal.aborted) return;
      const uniqueNotes = mergeStarNoteItems([], response.star_notes);
      setNotes(uniqueNotes);
      setNextCursor(response.next_cursor ?? null);
      setStatus(uniqueNotes.length === 0 ? "empty" : "ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotes([]);
      setNextCursor(null);
      setErrorMessage(starNoteListErrorMessage(error));
      setStatus("error");
    }
  }, [learnerId]);

  useEffect(() => {
    const controller = new AbortController();
    requestRef.current = controller;
    api.starNotes(learnerId, { limit: 20, signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const uniqueNotes = mergeStarNoteItems([], response.star_notes);
        setNotes(uniqueNotes);
        setNextCursor(response.next_cursor ?? null);
        setStatus(uniqueNotes.length === 0 ? "empty" : "ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setNotes([]);
        setNextCursor(null);
        setErrorMessage(starNoteListErrorMessage(error));
        setStatus("error");
      });
    return () => controller.abort();
  }, [learnerId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
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
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  async function loadNextPage() {
    if (!nextCursor || loadingMore) return;
    const cursor = nextCursor;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError("");
    try {
      const response = await api.starNotes(learnerId, { limit: 20, cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setNotes((current) => mergeStarNoteItems(current, response.star_notes));
      setNextCursor(response.next_cursor ?? null);
    } catch (error) {
      if (!controller.signal.aborted) setLoadMoreError(starNoteListErrorMessage(error));
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return (
    <div className="modal-backdrop star-note-archive-backdrop" role="dialog" aria-modal="true" aria-labelledby="star-note-archive-title" aria-describedby="star-note-archive-description">
      <section ref={modalRef} className="star-note-archive-modal">
        <button ref={closeButtonRef} className="star-note-archive-close" type="button" onClick={onClose} aria-label="별노트 모아보기 닫기">×</button>
        <header>
          <Image src="/ui/mormi-star.png" alt="" width={82} height={82} unoptimized />
          <div>
            <p>모르미가 기억해 둔 이야기</p>
            <h2 id="star-note-archive-title">별노트 모아보기</h2>
            <span id="star-note-archive-description">내가 모르미에게 알려 준 내용을 다시 볼 수 있어요.</span>
          </div>
          <button className="star-note-archive-refresh" type="button" onClick={() => void loadFirstPage()} disabled={status === "loading"}>새로고침</button>
        </header>

        {status === "loading" && (
          <div className="star-note-archive-state" aria-live="polite">
            <span className="star-note-archive-spinner" aria-hidden="true" />
            <h3>별노트를 펼치고 있어요…</h3>
          </div>
        )}

        {status === "empty" && (
          <div className="star-note-archive-state">
            <Image src="/morami/bright-cutout.png" alt="응원하는 모르미" width={170} height={180} unoptimized />
            <h3>아직 저장된 별노트가 없어요.</h3>
            <p>모르미에게 개념을 가르쳐 주면 별노트가 여기에 모여요.</p>
            <button type="button" onClick={onClose}>학습하러 돌아가기</button>
          </div>
        )}

        {status === "error" && (
          <div className="star-note-archive-state star-note-archive-state--error" role="alert">
            <Image src="/morami/confused-cutout.png" alt="고민하는 모르미" width={150} height={160} unoptimized />
            <h3>{errorMessage}</h3>
            <button type="button" onClick={() => void loadFirstPage()}>다시 불러오기</button>
            <button type="button" className="star-note-archive-return" onClick={onClose}>학습 화면으로 돌아가기</button>
          </div>
        )}

        {status === "ready" && (
          <>
            <div className="star-note-archive-grid" role="list" aria-label="저장된 별노트">
              {notes.map((note) => (
                <article key={note.note_id} data-note-id={note.note_id} className="star-note-archive-card" role="listitem">
                  <div className="star-note-archive-card__meta">
                    <span>{note.attribution_label}</span>
                    <time dateTime={note.created_at} title={note.created_at}>{noteDate(note.created_at)}</time>
                  </div>
                  <p>{note.text}</p>
                  <footer>
                    <span>개념 {note.skill_id}</span>
                    <small>기록 번호 {note.note_id}</small>
                  </footer>
                </article>
              ))}
            </div>

            <div className="star-note-archive-more" aria-live="polite">
              {loadMoreError && <p role="alert">{loadMoreError}</p>}
              {nextCursor && <button type="button" onClick={() => void loadNextPage()} disabled={loadingMore}>{loadingMore ? "다음 별노트를 불러오는 중…" : loadMoreError ? "다시 불러오기" : "별노트 더 보기"}</button>}
              {!nextCursor && <span>모든 별노트를 다 봤어요!</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
