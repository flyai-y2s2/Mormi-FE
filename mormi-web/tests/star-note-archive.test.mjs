import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ApiError } from "../app/api-client.ts";
import { mergeStarNoteItems, starNoteListErrorMessage } from "../app/star-note-list.ts";

function note(noteId, createdAt = "2026-08-20T00:00:00Z") {
  return {
    note_id: noteId,
    skill_id: "money-count",
    text: `${noteId} 내용`,
    attribution: "child",
    attribution_label: "아이가 알려줌",
    evidence: "direct_explanation",
    scene: "home_teach",
    scenario_id: "home_teach",
    task_id: "home_teaching",
    created_at: createdAt,
  };
}

test("별노트 페이지를 서버 순서대로 합치고 note_id 중복만 제거한다", () => {
  const merged = mergeStarNoteItems(
    [note("note_3"), note("note_2")],
    [note("note_2"), note("note_1"), note("note_1")],
  );

  assert.deepEqual(merged.map((item) => item.note_id), ["note_3", "note_2", "note_1"]);
});

test("별노트가 없으면 빈 목록을 그대로 유지한다", () => {
  assert.deepEqual(mergeStarNoteItems([], []), []);
});

test("인증 실패와 BE 연결 실패는 아이가 이해할 수 있는 재시도 안내로 바꾼다", () => {
  assert.match(starNoteListErrorMessage(new ApiError(401, "unauthorized", "raw")), /로그인/);
  assert.match(starNoteListErrorMessage(new ApiError(503, "network_error", "raw")), /다시 시도/);
  assert.doesNotMatch(starNoteListErrorMessage(new ApiError(503, "network_error", "raw")), /raw/);
});

test("별노트 모아보기는 BE 응답 필드를 렌더링하고 정적·AI fallback을 두지 않는다", async () => {
  const [modal, app, apiClient] = await Promise.all([
    readFile(new URL("../app/StarNoteArchiveModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api-client.ts", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<StarNoteArchiveModal learnerId=\{learner\.id\}/);
  assert.match(app, /aria-haspopup="dialog"[^>]*>[\s\S]{0,100}별노트/);
  assert.match(app, /returnToAuthScreen[\s\S]{0,180}setStarNoteArchiveOpen\(false\)/);
  assert.match(modal, /note\.note_id/);
  assert.match(modal, /note\.text/);
  assert.match(modal, /note\.attribution_label/);
  assert.match(modal, /note\.skill_id/);
  assert.match(modal, /note\.created_at/);
  assert.match(modal, /response\.next_cursor/);
  assert.match(modal, /cursor, signal/);
  assert.match(apiClient, /\/v1\/learners\/\$\{learnerId\}\/star-notes/);
  assert.doesNotMatch(modal, /fetch\(|\/api\/ai|AI_ORIGIN|static fallback/i);
});
