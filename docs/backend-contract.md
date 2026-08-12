# FastAPI + PostgreSQL 연결 계약

프런트엔드와 백엔드는 분리 배포합니다. Next.js는 화면과 즉시 피드백을 담당하고, FastAPI는 인증·진행도·시도 기록·리포트를 담당합니다.

## 권장 테이블

| 테이블 | 핵심 컬럼 |
|---|---|
| `learners` | `id UUID`, `research_code`, `created_at` |
| `learning_sessions` | `id`, `learner_id`, `curriculum_session_id`, `started_at`, `completed_at`, `scaffold_level` |
| `attempts` | `id`, `learning_session_id`, `activity`, `attempt_no`, `is_correct`, `elapsed_ms`, `answer_meta JSONB` |
| `theme_progress` | `learner_id`, `theme_id`, `unlocked_at`, `completed_at` |
| `cafe_visits` | `id`, `learner_id`, `menu_id`, `target_amount`, `paid_amount`, `attempts`, `completed_at` |

`answer_meta`에는 화폐별 개수 같은 구조 데이터만 넣고, 아이 이름·음성·자유 입력 원문은 저장하지 않습니다. 모든 아동 데이터 테이블에는 `learner_id` 인덱스와 접근 정책을 둡니다.

## 권장 API

```text
POST /v1/learners/anonymous
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

## 프런트엔드 전환 순서

1. 앱 시작 시 로컬 연구 코드 또는 인증 토큰으로 `/v1/progress`를 읽습니다.
2. 응답 실패 시 현재 `localStorage` 진행도를 임시 큐에 유지합니다.
3. 온라인 복귀 시 `session_id + attempt_no` 멱등 키로 재전송합니다.
4. 카페 해금 여부는 서버가 계산하고, 프런트엔드는 표시만 합니다.
5. 운영 환경에서는 PostgreSQL RLS 또는 API 계층의 동등한 소유권 검사를 적용합니다.

FastAPI는 특정 ORM을 강제하지 않습니다. 작은 팀이라면 SQLModel/Alembic으로 시작하고, 연결 풀은 SQLAlchemy async engine과 `asyncpg` 조합을 권장합니다.
