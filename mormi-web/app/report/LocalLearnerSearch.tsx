"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "../api-client";
import type { LocalAdminLearner } from "../local-report-admin-client";

type LocalLearnerSearchProps = {
  searchLearners: (query: string, signal?: AbortSignal) => Promise<readonly LocalAdminLearner[]>;
  onSelect: (learner: LocalAdminLearner) => void;
  onUnavailable: () => void;
  debounceMs?: number;
};

const RESULTS_ID = "local-learner-results";

export function LocalLearnerSearch({
  searchLearners,
  onSelect,
  onUnavailable,
  debounceMs = 250,
}: LocalLearnerSearchProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly LocalAdminLearner[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retryVersion, setRetryVersion] = useState(0);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) return;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setCompleted(false);
      setError(false);
      setOpen(true);
      try {
        const learners = await searchLearners(normalizedQuery, controller.signal);
        if (controller.signal.aborted) return;
        setResults(learners.slice(0, 10));
        setCompleted(true);
        setActiveIndex(-1);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setResults([]);
        setCompleted(false);
        setActiveIndex(-1);
        if (caught instanceof ApiError && (caught.status === 403 || caught.status === 404)) {
          setOpen(false);
          onUnavailable();
          return;
        }
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [debounceMs, normalizedQuery, onUnavailable, retryVersion, searchLearners]);

  useEffect(() => {
    const closeWhenOutside = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeWhenOutside);
    return () => document.removeEventListener("pointerdown", closeWhenOutside);
  }, []);

  const selectLearner = (learner: LocalAdminLearner) => {
    onSelect(learner);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setResults([]);
    setLoading(false);
    setCompleted(false);
    setError(false);
    setActiveIndex(-1);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      selectLearner(results[activeIndex]);
    }
  };

  const activeOptionId = activeIndex >= 0 ? `local-learner-option-${results[activeIndex]?.learner_id}` : undefined;

  return (
    <div className="local-learner-search" ref={containerRef}>
      <label htmlFor="local-learner-query">학습자 검색</label>
      <input
        id="local-learner-query"
        role="combobox"
        aria-expanded={open}
        aria-controls={RESULTS_ID}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        value={query}
        onChange={(event) => handleQuery(event.target.value)}
        onFocus={() => {
          if (normalizedQuery.length >= 2 && (loading || completed || error)) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul className="local-learner-results" id={RESULTS_ID} role="listbox" aria-label="학습자 검색 결과">
          {loading && <li className="local-learner-results__loading" role="status">검색 중…</li>}
          {!loading && error && (
            <li className="local-learner-results__error" role="alert">
              검색하지 못했습니다. <button type="button" onClick={() => setRetryVersion((version) => version + 1)}>다시 시도</button>
            </li>
          )}
          {!loading && !error && completed && results.length === 0 && <li className="local-learner-results__empty">일치하는 학습자가 없습니다</li>}
          {!loading && !error && results.map((learner, index) => (
            <li
              id={`local-learner-option-${learner.learner_id}`}
              key={learner.learner_id}
              role="option"
              aria-selected={index === activeIndex}
              className={`local-learner-results__option ${index === activeIndex ? "is-active" : ""}`}
              onClick={() => selectLearner(learner)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectLearner(learner);
                }
              }}
              tabIndex={-1}
            >
              {learner.display_name} · #{learner.learner_id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
