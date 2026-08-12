"use client";

import posthog from "posthog-js";

export type MormeyAnalyticsEvent =
  | "onboarding_completed"
  | "onboarding_tutorial_started"
  | "onboarding_tutorial_completed"
  | "onboarding_tutorial_skipped"
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
