# FastAPI + PostgreSQL 연결 계약

프런트엔드와 백엔드는 분리 배포합니다. Next.js는 화면과 즉시 피드백을 담당하고, FastAPI는 인증·진행도·시도 기록·리포트를 담당합니다.

AI 대화의 교육적 판단과 턴 상태는 일반 학습 기록 API와 분리합니다. 세부 합의안은 [`frontend-ai-dialogue-reply.md`](./frontend-ai-dialogue-reply.md)를 기준으로 협의합니다.

## 권장 테이블

| 테이블 | 핵심 컬럼 |
|---|---|
| `learners` | `id BIGSERIAL`, `display_name`, `research_code`, `created_at` |
| `learning_sessions` | `id`, `learner_id`, `curriculum_session_id`, `started_at`, `completed_at`, `scaffold_level` |
| `attempts` | `id`, `learning_session_id`, `activity`, `attempt_no`, `is_correct`, `elapsed_ms`, `answer_meta JSONB` |
| `theme_progress` | `learner_id`, `theme_id`, `unlocked_at`, `completed_at` |
| `cafe_visits` | `id`, `learner_id`, `menu_id`, `target_amount`, `paid_amount`, `attempts`, `completed_at` |
| `reward_ledger` | `id`, `learner_id`, `learning_session_id`, `source`, `amount`, `idempotency_key`, `created_at` |

`answer_meta`에는 화폐별 개수 같은 구조 데이터만 넣고, 아이 이름·음성·자유 입력 원문은 저장하지 않습니다. AI 대화 원문이 필요한 경우 일반 `attempts`가 아닌 별도 암호화 저장소에 동의 상태·접근 권한·보존 기간을 적용해 저장합니다. 음성 파일은 저장하지 않습니다. 모든 아동 데이터 테이블에는 `learner_id` 인덱스와 접근 정책을 둡니다.

## 권장 API

```text
POST /v1/learners
GET  /v1/learners/{id}
GET  /v1/progress
POST /v1/learning-sessions
POST /v1/learning-sessions/{id}/attempts
POST /v1/learning-sessions/{id}/complete
GET  /v1/themes
POST /v1/cafe-visits
POST /v1/cafe-visits/{id}/payments
POST /v1/cafe-visits/{id}/complete
GET  /v1/reports/summary
```

AI 대화 API는 별도 경로를 사용합니다.

```text
POST /v1/practice-results
POST /v1/conversations
POST /v1/conversations/{conversation_id}/responses
GET  /v1/conversations/{conversation_id}
GET  /v1/learners/{learner_id}/skill-profiles
GET  /v1/learners/{learner_id}/star-notes
```

브라우저는 서비스 키를 보유하지 않으며 Next.js BFF를 통해 AI 대화 API를 호출합니다.

### 최초 학습자 생성

요청:

```json
{ "display_name": "민준" }
```

응답:

```json
{ "id": 1, "display_name": "민준", "created_at": "2026-08-12T10:00:00+09:00" }
```

현재 프런트 프로토타입은 같은 의미의 `{ "id": 1, "name": "민준" }`을 `mormey-learner`에 저장한다. FastAPI 연결 시 응답의 `display_name`을 프런트의 `name`으로 매핑한다. 이름은 개인화 표시에만 사용하고 PostHog에는 보내지 않는다.

### 세션 완료와 보상 원장

`POST /v1/learning-sessions/{id}/complete`는 다음 보상을 한 트랜잭션으로 기록한다.

- 반복학습: 문제별 `200 / 150 / 100 / 50원`, 합계 최대 1,000원
- 모르미 가르치기 성공: 고정 500원
- 응답 필드: `drill_reward`, `teach_reward`, `total_reward`, `wallet_balance`
- `reward_ledger.idempotency_key`로 새로고침·재전송에 따른 중복 지급을 막는다.

### 카페 방문 상태

카페 상태는 `stage = queue | menu | calculate | change | complete`로 저장한다. 다음 단계 잠금은 서버의 완료 상태를 기준으로 계산한다. 결제 제출에는 `target_amount`, `paid_amount`, `order_total`, 화폐별 개수만 저장하며 버튼 클릭 원본 로그는 저장하지 않는다.

## 프런트엔드 전환 순서

1. 온보딩 이름 제출 시 `/v1/learners`를 호출하고 반환된 정수 ID를 로컬에 보관합니다.
2. 앱 시작 시 학습자 ID 또는 인증 토큰으로 `/v1/progress`를 읽습니다.
3. 응답 실패 시 현재 `localStorage` 진행도를 임시 큐에 유지합니다.
4. 온라인 복귀 시 `session_id + attempt_no` 멱등 키로 재전송합니다.
5. 카페 해금 여부는 서버가 계산하고, 프런트엔드는 표시만 합니다.
6. 운영 환경에서는 PostgreSQL RLS 또는 API 계층의 동등한 소유권 검사를 적용합니다.

FastAPI는 특정 ORM을 강제하지 않습니다. 작은 팀이라면 SQLModel/Alembic으로 시작하고, 연결 풀은 SQLAlchemy async engine과 `asyncpg` 조합을 권장합니다.
