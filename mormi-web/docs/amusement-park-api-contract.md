# 놀이동산 세션 FE 연동 계약 초안

이 문서는 FE 미리보기 화면을 실제 학습 세션에 연결할 때 필요한 BE 응답을 정리한다. 현재 `/amusement-park-preview`는 화면 검수 전용이며 판정·진행·별노트 저장을 수행하지 않는다.

## 세션 구조

- `theme_id`: `amusement_park`
- 순서: `ticket` → `snack_split` → `pass_break_even`
- 방문을 시작할 때 가격과 인원을 고정하고, 같은 `visit_id` 안에서는 바꾸지 않는다.
- 통과 판정과 단계 해금은 서버의 `verified_facts` 및 `stage_progress`를 기준으로 한다.

## 방문 응답

```json
{
  "theme_id": "amusement_park",
  "visit_id": "uuid",
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
        "prompt": "그럼 1인 3,500원이고 4명이면?",
        "equation": "3,500 × 4 = 14,000",
        "conclusion": "3,500원을 네 번 더한 것과 같으니까 14,000원이야!"
      }
    }
  ]
}
```

## 단계별 `verified_facts`

| 단계 | 필수 값 |
| --- | --- |
| `ticket` | `ticket_price`, `party_count`, `total_price` |
| `snack_split` | `snack_total`, `payer_count`, `per_person` |
| `pass_break_even` | `single_ride_price`, `day_pass_price`, `break_even_rides`, `benefit_from_rides` |

## 대화 및 완료 턴

기존 러닝바이티칭 대화 계약을 유지하되 아래 장면을 구분할 수 있어야 한다.

1. 모르미의 개념적 오개념
2. 아이가 쓴 안전한 원문 인용(`quote_safe`, `evidence_span`)
3. 배운 전략을 새 숫자에 적용하는 검수된 전이 턴
4. 아이의 실제 근거 문장만 저장하는 별노트 후보
5. 검증된 사실을 근거로 한 단계 완료 및 다음 단계 해금

FE는 정답·설명문·별노트를 임의 생성하지 않고 서버 응답을 표시한다. 네트워크 오류일 때 로컬 fixture로 학습을 저장하거나 완료 처리하지 않는다.

## FE 연결 시 필요한 작업

- 미리보기 fixture를 방문 조회 응답으로 교체
- 기존 인증/재시도/에러 처리 규칙을 그대로 사용
- `no_response` 도움 카드 계약 연결
- 단계 완료 후 서버의 최신 `stage_progress` 재조회
- 별노트 저장 성공 후에만 완료 화면에 기록 표시
- 일반 사용자에게 놀이동산 진입점을 노출하는 시점은 API 배포 이후로 제한
