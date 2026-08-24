# 놀이동산 세션 FE 연동 계약

놀이동산은 운영 학습 흐름이다. 아이가 보는 URL은 `/amusement-park`이며, 기존 `/amusement-park-preview`는 호환용으로 `/amusement-park`로 리다이렉트한다.

FE는 방문 시작, 단계 제출, AI 대화, 완료 판정을 모두 Spring BE에 맡긴다. 로컬 fixture로 문제를 대신 만들거나 정답, 설명문, 별노트를 임의 생성하지 않는다.

## 세션 구조

- `theme_id`: `amusement_park`
- 순서: `ticket` -> `snack_split` -> `pass_break_even`
- `stage_id`: `ticket | snack_split | pass_break_even`
- 해금 조건: 카페 완료. 해금 전 방문 시작은 403이다.
- 방문을 시작할 때 가격과 인원을 서버가 고정하고, 같은 `visit_id` 안에서는 바꾸지 않는다.
- 단계 완료와 다음 단계 해금은 서버의 `stage_progress`와 AI 대화 검증 결과를 기준으로 한다.

## FE가 호출하는 BE API

| Method | Path | 용도 |
| --- | --- | --- |
| `POST` | `/v1/amusement-park-visits` | 방문 시작. 진행 중 방문이 있으면 이어받는다. |
| `GET` | `/v1/amusement-park-visits/{id}` | 새로고침, 단계 제출, 대화 완료 뒤 최신 진행 상태를 재조회한다. |
| `POST` | `/v1/amusement-park-visits/{id}/stages/{stage_id}` | 아이가 계산한 파생 답만 제출한다. |
| `POST` | `/v1/amusement-park-visits/{id}/complete` | 세 단계가 모두 완료된 방문을 최종 완료 처리한다. |
| `POST` | `/v1/amusement-park-visits/{id}/dialogues` | 현재 놀이동산 단계의 AI 대화를 시작하거나 복구한다. |
| `POST` | `/v1/dialogue/conversations/{conversation_id}/responses` | AI 대화 턴에 대한 아이 응답을 BE를 통해 전달한다. |

## 방문 응답

```jsonc
{
  "theme_id": "amusement_park",
  "visit_id": "park_visit_...",
  "stage_order": ["ticket", "snack_split", "pass_break_even"],
  "stage_progress": {
    "ticket": "available",
    "snack_split": "locked",
    "pass_break_even": "locked"
  },
  "stages": [
    {
      "stage_id": "ticket",
      "scenario_id": "amusement_ticket_multiply",
      "title": "매표소",
      "mission": "우리 일행 표 사기",
      "skill": "multiply",
      "strategy": "같은 돈이 여러 번이면 곱하면 돼",
      "mormi_misconception": "표가 여러 장이어도 한 장 값만 내면 되는 줄 알았어.",
      "prompt": "1인 입장료와 일행 수를 이용해 총액을 설명해 주세요.",
      "facts": [
        { "key": "ticket_price", "label": "1인 입장료", "value": 3000, "unit": "원" },
        { "key": "party_count", "label": "우리 일행", "value": 2, "unit": "명" }
      ],
      "verified_facts": {
        "ticket_price": 3000,
        "party_count": 2,
        "total_price": 6000
      },
      "transfer": {
        "prompt": "그럼 1인 4,000원이고 3명이면?",
        "equation": "4,000 × 3 = 12,000",
        "conclusion": "4,000원을 3번 더한 것과 같으니까 12,000원이야!"
      }
    }
  ],
  "started_at": "2026-08-23T00:00:00Z",
  "completed_at": null,
  "attempts": []
}
```

`facts`와 `verified_facts`의 숫자는 방문마다 새로 뽑힌다. FE는 값을 하드코딩하지 않고 응답을 그대로 표시한다.

## 단계별 값

| 단계 | 주어지는 값 | 아이가 구하는 값 |
| --- | --- | --- |
| `ticket` | `ticket_price`, `party_count` | `total_price` |
| `snack_split` | `snack_total`, `payer_count` | `per_person` |
| `pass_break_even` | `single_ride_price`, `day_pass_price` | `break_even_rides`, `benefit_from_rides` |

직접 제출 경로의 `answers`에는 아이가 구하는 값만 담는다. 주어진 값을 같이 보내면 BE가 `answer_unknown` 400으로 거부한다.

```jsonc
// POST /v1/amusement-park-visits/{id}/stages/ticket
{
  "answers": { "total_price": 6000 },
  "attempt_no": 1,
  "elapsed_ms": 4200
}

// 200
{
  "visit_id": "park_visit_...",
  "stage": "ticket",
  "is_correct": true,
  "next_stage": "snack_split",
  "next_stage_unlocked": true,
  "attempts": 1,
  "expected_answers": { "total_price": 6000 },
  "submitted_answers": { "total_price": 6000 },
  "feedback_code": "ticket_correct"
}
```

마지막 단계 제출 결과의 `next_stage`는 `"complete"`가 될 수 있다. FE 타입은 `AmusementStageId | "complete" | null`로 표현한다.

## AI 대화

```jsonc
// POST /v1/amusement-park-visits/{id}/dialogues
{
  "scenario_id": "amusement_ticket_multiply",
  "start_mode": "resume",
  "request_id": "요청마다 새 UUID"
}
```

FE는 문제 사실을 대화 시작 요청에 보내지 않는다. Spring BE가 방문 스냅샷에서 문제 사실을 꺼내 FastAPI AI에 전달한다.

대화 응답은 카페와 같은 `MormiConversation` 구조를 쓰며, Spring BE가 `stage_progress`를 붙인다.

```jsonc
{
  "stage_progress": {
    "stage": "ticket",
    "completed": true,
    "next_stage": "snack_split",
    "source": "dialogue_verified_facts"
  }
}
```

대화 완료 턴의 `completion.verified_facts`는 Spring BE가 방문에 고정된 값과 다시 대조한다. 값이 맞으면 단계 시도로 기록하고, 맞지 않으면 진행시키지 않는다.

## FE 처리 원칙

- `/amusement-park`는 별도 페이지이므로 홈의 `stage === "cafe"` 화면과 달리 페이지 진입 시 `POST /v1/amusement-park-visits`로 진행 상태를 복구한다.
- 외출 카드 해금 여부는 `/v1/themes` 응답의 `amusement_park.unlocked`를 우선한다.
- 단계 제출 또는 AI 대화 완료 뒤에는 `GET /v1/amusement-park-visits/{id}`로 최신 `stage_progress`를 다시 읽는다.
- 세 단계가 모두 `completed`가 되면 `POST /v1/amusement-park-visits/{id}/complete`를 호출한다.
- 완료한 스테이지도 새 회차로 다시 연습할 수 있다.
- 서버 오류 때 로컬 문제로 대체하지 않고 재시도 상태를 보여 준다.
