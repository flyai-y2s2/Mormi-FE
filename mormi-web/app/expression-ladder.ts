/**
 * 현재 서비스에서 사용하는 발화사다리 단계.
 *
 * L1은 과거 데이터와 구버전 서버 응답을 읽기 위한 호환 값으로만 남긴다.
 * 화면 표시와 통계에서는 L1을 L2(선택지)로 합산하며 단계 번호를 재부여하지 않는다.
 */
export const ACTIVE_EXPRESSION_LEVELS = ["L4", "L3", "L2", "L0"] as const;

export type ActiveExpressionLevel = typeof ACTIVE_EXPRESSION_LEVELS[number];
export type WireExpressionLevel = ActiveExpressionLevel | "L1";

export function canonicalExpressionLevel(
  value: string | null | undefined,
): ActiveExpressionLevel | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === "L1") return "L2";
  return ACTIVE_EXPRESSION_LEVELS.find((level) => level === normalized);
}
