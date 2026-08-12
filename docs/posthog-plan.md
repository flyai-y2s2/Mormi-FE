# PostHog 평가 계획

## 수집 원칙

- 자동 클릭 수집, 자동 페이지뷰, 세션 녹화를 기본적으로 끕니다.
- 아이 이름, 음성, 자유 입력, 대화 원문, 별노트 문장을 보내지 않습니다.
- 로그인 전에는 PostHog의 익명 distinct ID를 사용하고, 연구 코드가 생기면 안정적인 내부 UUID만 식별자로 사용합니다.
- `+ / −` 버튼 한 번마다 이벤트를 보내지 않고, `payment_submitted` 한 번에 최종 구성을 보냅니다.

## 구현된 이벤트

| 이벤트 | 주요 속성 | 질문 |
|---|---|---|
| `onboarding_completed` | 없음 | 처음 만남을 끝냈는가 |
| `home_opened` | 없음 | 집 허브로 돌아오는가 |
| `lesson_started` | `session_id`, `theme` | 어떤 준비 과정을 시작했는가 |
| `session_completed` | 시간, 반복 시도, 사다리 단계 | 어느 정도 도움으로 끝냈는가 |
| `theme_unlocked` | `theme` | 카페까지 도달했는가 |
| `outside_opened` | `cafe_unlocked` | 해금 후 외부를 탐색하는가 |
| `cafe_started` | 없음 | 카페 입장을 시작했는가 |
| `cafe_menu_selected` | 메뉴 ID, 가격 | 메뉴 선택을 이해했는가 |
| `payment_submitted` | 목표/지불 금액, 차이, 시도, 화폐별 개수 | 돈을 정확히 구성했는가 |
| `cafe_journey_completed` | 메뉴 ID, 결제 시도 수 | 전체 외출을 완료했는가 |

## 첫 대시보드

1. 퍼널: `onboarding_completed → lesson_started → theme_unlocked → cafe_started → cafe_journey_completed`
2. 카페 준비: 세션별 시작 대비 완료율, 평균 반복 시도, 평균 사다리 단계
3. 결제 정확도: 첫 시도 정답률, 완료까지 평균 시도, 부족/초과 금액 분포
4. 전이: 집의 네 과정 완료 여부에 따른 카페 첫 시도 정답률 비교
5. 유지: 첫 완료 이벤트 이후 D1/D7 재방문 및 다시 학습 비율

환경 변수 `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`이 비어 있으면 SDK는 초기화되지 않습니다.
