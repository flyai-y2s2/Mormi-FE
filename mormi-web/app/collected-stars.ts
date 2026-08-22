import { sessions } from "./morami-content";
import { simpleLearnedLine } from "./math-curriculum";

export type CollectedStarConcept = {
  id: string;
  title: string;
  concept: string;
  stars: 3;
};

/** 서버가 완료로 기록한 세션만 커리큘럼 순서대로 모아 별 보상과 연결한다. */
export function collectedStarConcepts(completedSessionIds: string[]): CollectedStarConcept[] {
  const completedIds = new Set(completedSessionIds);

  return sessions
    .filter((session) => completedIds.has(session.id))
    .map((session) => ({
      id: session.id,
      title: session.title,
      concept: simpleLearnedLine(session),
      stars: 3,
    }));
}
