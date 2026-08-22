import { ApiError, type StarNoteListItem } from "./api-client";

/** 서버 정렬은 유지하고, 페이지 경계에서 겹친 note_id만 한 번 보여 준다. */
export function mergeStarNoteItems(existing: StarNoteListItem[], incoming: StarNoteListItem[]) {
  const seen = new Set(existing.map((note) => note.note_id));
  return [...existing, ...incoming.filter((note) => {
    if (seen.has(note.note_id)) return false;
    seen.add(note.note_id);
    return true;
  })];
}

export function starNoteListErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return "로그인이 만료됐어요. 다시 로그인해 주세요.";
    if (error.status === 403) return "내 별노트만 볼 수 있어요. 다시 로그인해 주세요.";
    if (error.status === 404 || error.status === 503 || error.status === 504) {
      return "별노트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
    }
  }
  return "별노트를 불러오지 못했어요. 다시 시도해 주세요.";
}
