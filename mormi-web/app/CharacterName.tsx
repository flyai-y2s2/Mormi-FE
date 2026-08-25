"use client";

import Image from "next/image";
import { createContext, useContext, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { nameWithSubjectParticle } from "./korean-name";

const CHARACTER_NAME_KEY_PREFIX = "mormey-character-name";
export const CHARACTER_NAME_MAX_LENGTH = 10;

export function normalizeCharacterName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, CHARACTER_NAME_MAX_LENGTH);
}

function characterNameKey(learnerId: number) {
  return `${CHARACTER_NAME_KEY_PREFIX}:${learnerId}`;
}

export function readCharacterName(learnerId: number) {
  if (typeof window === "undefined" || !learnerId) return "";
  try {
    return normalizeCharacterName(window.localStorage.getItem(characterNameKey(learnerId)) ?? "");
  } catch {
    return "";
  }
}

export function storeCharacterName(learnerId: number, value: string) {
  const normalized = normalizeCharacterName(value);
  if (typeof window === "undefined" || !learnerId) return normalized;
  try {
    if (normalized) window.localStorage.setItem(characterNameKey(learnerId), normalized);
    else window.localStorage.removeItem(characterNameKey(learnerId));
  } catch {
    // 사생활 보호 모드처럼 저장소를 막은 브라우저에서도 현재 화면의 이름은 유지한다.
  }
  return normalized;
}

export function replaceCharacterName(text: string, name: string) {
  if (!text) return text;
  const displayName = normalizeCharacterName(name) || "이 친구";
  return text.replaceAll("모르미", displayName);
}

type CharacterNameContextValue = {
  name: string;
  displayName: string;
  subjectName: string;
  rename: (text: string) => string;
};

const CharacterNameContext = createContext<CharacterNameContextValue>({
  name: "",
  displayName: "이 친구",
  subjectName: "이 친구가",
  rename: (text) => replaceCharacterName(text, ""),
});

export function CharacterNameProvider({ name, children }: { name: string; children: ReactNode }) {
  const displayName = normalizeCharacterName(name) || "이 친구";
  const value = useMemo<CharacterNameContextValue>(() => ({
    name,
    displayName,
    subjectName: nameWithSubjectParticle(displayName),
    rename: (text) => replaceCharacterName(text, name),
  }), [displayName, name]);
  return <CharacterNameContext.Provider value={value}>{children}</CharacterNameContext.Provider>;
}

export function useCharacterName() {
  return useContext(CharacterNameContext);
}

export function CharacterNameModal({ initialName, onSave, onClose }: {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialName);
  const [step, setStep] = useState<"introduction" | "name">(initialName ? "name" : "introduction");
  const normalized = normalizeCharacterName(draft);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (normalized) onSave(normalized);
  }

  return (
    <div className="character-name-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form className={`character-name-modal character-name-modal--${step}`} role="dialog" aria-modal="true" aria-labelledby="character-name-title" onSubmit={submit}>
        <button className="character-name-close" type="button" aria-label="닫기" onClick={onClose}>×</button>
        {step === "introduction" ? <>
          <Image src="/morami/confused-cutout.png" alt="배우고 싶어 하는 캐릭터" width={190} height={210} unoptimized />
          <div className="character-name-introduction">
            <p>처음 만난 우리</p>
            <h2 id="character-name-title">안녕! 만나서 반가워.</h2>
            <div className="character-name-speech">나 배우고 싶은데 어떻게 해야 할지 모르겠어.<br />내 이름부터 정해 줄래?</div>
            <button className="primary-button" type="button" onClick={() => setStep("name")}>좋아, 이름 지어 줄게 <span className="button-arrow" /></button>
          </div>
        </> : <>
          <Image src="/morami/happy-cutout.png" alt="이름을 기다리는 캐릭터" width={190} height={210} unoptimized />
          <div>
            <p>{initialName ? "이름 바꾸기" : "우리만의 친구"}</p>
            <h2 id="character-name-title">나를 뭐라고 부를까?</h2>
            <label htmlFor="character-name-input">이름</label>
            <input
              id="character-name-input"
              value={draft}
              maxLength={CHARACTER_NAME_MAX_LENGTH}
              autoComplete="off"
              placeholder="예: 모아"
              onChange={(event) => setDraft(event.target.value)}
            />
            <small>{normalized.length}/{CHARACTER_NAME_MAX_LENGTH}자</small>
            <button className="primary-button" type="submit" disabled={!normalized}>이 이름으로 부르기 <span className="button-arrow" /></button>
          </div>
        </>}
      </form>
    </div>
  );
}
