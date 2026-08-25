# 놀이동산 세션 FE 연동 계약

놀이동산의 운영 URL은 `/amusement-park`다. 기존 `/amusement-park-preview`는 호환용으로
운영 URL에 리다이렉트한다.

## 소유권

| 계층 | 소유하는 것 |
| --- | --- |
| Mormi-AI | 문제 스냅샷, 정답과 검증 슬롯, 모르미 질문, 발화사다리, 힌트사다리, 시각 표상, 전이 문제, 완료 판정 |
| Spring BE | 인증, 카페 완료 해금, 방문 ID, 단계 순서, 현재 단계, AI 대화 연결, 검증된 완료 이벤트 기록 |
| FE | BE의 진행 상태와 AI `TurnContract`를 렌더링하고 아이 응답을 전달 |

FE는 로컬 fixture나 방문 응답으로 문제·정답·설명·힌트를 만들지 않는다. 놀이동산의 교육
콘텐츠는 현재 AI 턴의 `mormi`, `interaction`, `visual`, `pedagogy`, `task_anchor`만 사용한다.

## 세션 구조

- `theme_id`: `amusement_park`
- 순서: `ticket` → `snack_split` → `pass_break_even`
- 해금 조건: 카페 완료. 해금 전 방문 시작은 403이다.
- 새 대화를 만들 때 Mormi-AI가 문제를 생성해 그 대화 상태에 고정한다.
- `restart`는 새 문제 스냅샷을 만들고, `resume`과 대화 조회는 같은 스냅샷을 복구한다.
- 단계 진행은 AI의 `completion.stage_completion_eligible`을 기준으로 한다.
- 가르치기 보상은 별도 값인 `completion.teach_reward_eligible`을 기준으로 한다.

## FE가 호출하는 BE API

| Method | Path | 용도 |
| --- | --- | --- |
| `POST` | `/v1/amusement-park-visits` | 진행 중 방문을 이어 받거나 새 방문 시작 |
| `GET` | `/v1/amusement-park-visits/{id}` | 새로고침 및 최신 진행 상태 복구 |
| `POST` | `/v1/amusement-park-visits/{id}/dialogues` | 현재 단계 AI 대화 시작·복구 |
| `GET` | `/v1/dialogue/conversations/{conversation_id}` | 같은 AI 문제·대화 상태 복구 |
| `POST` | `/v1/dialogue/conversations/{conversation_id}/responses` | 아이 응답 전달 |
| `POST` | `/v1/amusement-park-visits/{id}/complete` | 세 단계 완료 방문의 멱등 완료 처리 |

별도 단계 정답 제출 API는 없다. FE가 입력값을 채점하거나 계산 결과를 BE에 직접 제출하지
않고, 모든 응답을 현재 AI 대화에 보낸다.

## 방문 응답

방문 응답의 `stages`는 지도와 라우팅용 껍데기다. 문제 숫자나 교수 문구는 포함하지 않는다.

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
      "skill": "multiply"
    }
  ],
  "started_at": "2026-08-23T00:00:00Z",
  "completed_at": null,
  "attempts": []
}
```

## AI 대화

```jsonc
// POST /v1/amusement-park-visits/{id}/dialogues
{
  "scenario_id": "amusement_ticket_multiply",
  "start_mode": "resume",
  "request_id": "요청마다 새 UUID"
}
```

BE는 권한과 현재 단계 확인 뒤 AI에 `scene=amusement_park`와 `scenario_id`만 전달한다.
`park_context`, 문제 숫자, 프롬프트 또는 정답은 보내지 않는다.

AI 턴의 `visual.data.facts`가 화면에 보여 줄 현재 문제의 주어진 값이다. FE는 이 배열을
순서대로 표시하되, `verified_facts`나 내부 전략을 문제 화면에 노출하지 않는다.

```jsonc
{
  "conversation_id": "conversation_...",
  "turn": {
    "mormi": { "text": "표를 모두 사려면 얼마인지 알려줄래?", "mood": "curious" },
    "visual": {
      "kind": "park_facts",
      "data": {
        "facts": [
          { "key": "ticket_price", "label": "1인 입장료", "value": 3000, "unit": "원" },
          { "key": "party_count", "label": "우리 일행", "value": 2, "unit": "명" }
        ]
      }
    },
    "interaction": { "kind": "text" },
    "completion": null
  },
  "scenario_context": { "content_owner": "mormi_ai" },
  "stage_progress": {
    "stage": "ticket",
    "completed": false,
    "next_stage": "ticket",
    "source": "pending"
  }
}
```

완료 턴에서 BE가 붙인 `stage_progress.completed=true`를 받으면 방문을 다시 조회해 다음
스테이지를 연다. L0/H3 공동 수행도 생활 단계는 성공으로 끝나므로 완료될 수 있지만,
`teach_reward_eligible=false`일 수 있다. FE는 이 둘을 같은 의미로 해석하지 않는다.

## FE 처리 원칙

- 페이지 진입 시 방문을 시작·복구하고 `stage_progress`로 열린 단계만 활성화한다.
- 현재 문제는 오직 AI 턴의 시각 계약에서 읽는다. 방문 응답이나 로컬 상수로 보충하지 않는다.
- 모든 텍스트·선택·채우기·공동 수행 응답은 대화 응답 API로 전달한다.
- 대화 완료 뒤 방문을 다시 조회해 최신 진행 상태를 렌더링한다.
- 세 단계가 모두 완료되면 완료 API를 멱등 호출할 수 있다.
- 서버 또는 AI 오류 때 임시 문제로 대체하지 않고 재시도 상태를 보여 준다.
