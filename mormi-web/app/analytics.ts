"use client";

import posthog from "posthog-js";

export type MormeyAnalyticsEvent =
  | "onboarding_completed"
  | "onboarding_intro_completed"
  /** 아이디·비밀번호로 다시 들어와 진행도를 이어 받았다. */
  | "learner_restored"
  /** 이 기기에서만 나갔다. 다른 기기의 로그인은 남아 있다. */
  | "logged_out"
  | "home_opened"
  | "outside_opened"
  | "lesson_started"
  | "drill_answer_wrong"
  | "drill_reward_earned"
  | "teach_reward_earned"
  | "session_completed"
  | "theme_unlocked"
  | "cafe_started"
  | "cafe_station_started"
  | "cafe_queue_answered"
  | "cafe_menu_selected"
  | "payment_submitted"
  | "cafe_journey_completed";

type SafeProperty = string | number | boolean | null;

export function captureMormeyEvent(event: MormeyAnalyticsEvent, properties: Record<string, SafeProperty> = {}) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || typeof window === "undefined") return;
  posthog.capture(event, properties);
}

/**
 * 서버가 발급한 가명 id 로만 식별한다.
 * 학습자의 정수 id, 이름, 참여 번호는 PostHog 로 보내지 않는다.
 */
export function identifyLearner(analyticsId: string | undefined) {
  if (!analyticsId || !process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || typeof window === "undefined") return;
  posthog.identify(analyticsId);
}
