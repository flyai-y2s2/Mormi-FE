# 모르미 AI 대화 백엔드 연동 — 프론트엔드 회신 및 합의 요청

> 대상: AI 대화 백엔드 팀
>
> 목적: 전달받은 「모르미 프론트엔드–대화 백엔드 연동 협의안」에 대한 프론트엔드 팀의 답변과 구현 전 확정이 필요한 계약을 정리한다.
>
> 문서 상태: 협의용 초안. 아래의 “구현 전 확정 항목”에 양 팀이 합의하면 API 계약 기준 문서로 승격한다.

## 1. 프론트엔드 팀 결론

제안한 책임 분리는 동의한다.

- 일반 학습 백엔드: 학습자, 반복학습 결과, 진행도, 보상 원장, 장소 해금, 카페 방문·결제 기록
- AI 대화 백엔드: 아이 발화 이해, 발화사다리, 힌트사다리, 모르미 대사, 도움 카드, 별노트 후보 생성
- 프론트엔드: 화면, 입력 수집, 캐릭터·애니메이션, 백엔드가 반환한 턴 계약 렌더링

최종 구조에서는 프론트가 아이의 대화 입력을 보고 정오, 오개념, 사다리 이동, 별노트 등록 여부를 자체 판정하지 않는다. 이 판단은 AI 대화 백엔드의 턴 응답을 따른다.

다만 반복학습 5문제의 선택지 잠금과 문제별 보상처럼 이미 규칙이 완전히 결정된 활동은 일반 학습 규칙으로 유지한다. AI 대화 판단과 반복학습의 결정론적 채점을 섞지 않는다.

## 2. 2026-08-12 기준 현재 프론트 상태

### 이미 반영된 내용

- 온보딩에서 아이 이름을 입력받는다.
- 프로토타입 학습자 데이터는 `{ "id": 1, "name": "입력한 이름" }` 형태다.
- `childName = "지우"` 전역 하드코딩은 제거했다.
- 이름은 PostHog 이벤트와 현재 LLM 프롬프트에 보내지 않는다.
- 반복학습은 정확히 5문제다.
- 문제별 보상은 `200 / 150 / 100 / 50원`, 최대 1,000원이다.
- 모르미 가르치기 성공 시 500원을 추가 지급한다.
- 카페는 `줄 서기 → 메뉴 고르기 → 계산하기 → 거스름돈 받기` 순서로 잠금 해제된다.

### FastAPI 연결 전 임시 구현

- 진행도, 학습자 프로필, 지갑, 리포트는 `localStorage`를 사용한다.
- `/api/morami/respond`가 임시 대화 라우트다.
- 자유 발화 성공 판정과 발화사다리 이동 일부가 프론트에 남아 있다.
- 발화사다리는 숫자 `3~0` 상태다.
- 별노트는 정적 커리큘럼 문장을 사용한다.
- 카페 정오 피드백은 프론트에 하드코딩되어 있다.

따라서 전달받은 제안은 기존 UI를 폐기하는 작업이 아니라, 위 임시 교육 판단을 턴 계약 기반으로 교체하는 작업으로 이해한다.

## 3. 합의하는 책임 경계

| 기능 | 프론트엔드 | 일반 학습 백엔드 | AI 대화 백엔드 |
|---|---|---|---|
| 학습자 생성·조회 | 입력·표시 | 최종 저장·ID 발급 | 필요 시 ID로 프로필 조회 |
| 반복학습 5문제 | 문제·보기·잠금·효과 렌더링 | 시도·보상·완료 저장 | 대화 시작용 요약 참조 |
| 아이 대화 입력 | 텍스트·선택·세기·세로식 수집 | 저장하지 않음 | 의미 분석·상태 갱신 |
| 발화사다리 | 받은 입력 UI 렌더링 | 관여하지 않음 | 신규 턴은 `L4/L3/L2/L0` 결정, 과거 `L1`은 `L2`로 해석 |
| 힌트사다리 | 도움 카드 렌더링 | 관여하지 않음 | `H0~H3` 결정 |
| 모르미 대사·표정 | 대사·이미지·애니메이션 표시 | 관여하지 않음 | 대사와 `mood` 반환 |
| 별노트 | `note_update` 표시 | 최종 별노트 조회 제공 가능 | 문장·귀속·근거 판정 |
| 가르치기 500원 | 획득 연출 | 원장 기록·중복 지급 방지 | 보상 가능 완료 결과 반환 |
| 카페 해금 | 서버 결과 표시 | 필수 세션 완료 여부 계산 | 관여하지 않음 |
| 카페 대화 진행 | 시각 장면·입력 렌더링 | 방문 진행도 저장 | 다음 카페 턴 결정 |

## 4. ID 타입 제안

현재 사용자 요구사항과 일반 백엔드 계약에 맞춰 학습자 ID는 정수로 통일한다.

| 필드 | 타입 | 예시 |
|---|---|---|
| `learner_id` | integer | `1` |
| `learning_session_id` | string 또는 UUID | `"session_123"` |
| `practice_result_id` | string 또는 UUID | `"practice_123"` |
| `conversation_id` | string 또는 UUID | `"conversation_123"` |
| `turn_id` | string 또는 UUID | `"turn_127"` |
| `response_id` | UUID | `"9cda..."` |
| `note_id` | string 또는 UUID | `"note_123"` |

첨부 문서의 `learner_123` 문자열 예시는 `1` 같은 정수로 바꿔야 한다. 나머지 대화 관련 ID는 클라이언트가 의미를 해석하지 않는 불투명 문자열로 사용한다.

또한 URL 변수 이름은 `{session_id}`가 아니라 `{conversation_id}`로 통일한다. 일반 학습 세션과 AI 대화 세션을 혼동하지 않기 위함이다.

## 5. 공식 영문명과 호환 이전 원칙

현재 프론트 코드에는 `morami`, `mormi`, `mormey` 세 표기가 섞여 있다. 신규 코드와 외부 계약에서 사용하는 공식 영문명은 **`mormi`**로 통일한다.

| 대상 | 신규 표기 |
|---|---|
| 외부 API | `/api/mormi/respond` |
| FastAPI 패키지 | `mormi_api` |
| TypeScript 타입 | `MormiTurn`, `MormiEvent` |
| 소스 파일 | `mormi-content.ts` |
| 이미지 경로 | `/mormi/*` |
| 브라우저 저장 키 | `mormi-*` |

명칭 변경은 참조와 기존 사용자 데이터를 깨뜨리지 않도록 단계적으로 진행한다.

1. 신규 Next.js BFF 경로 `/api/mormi/respond`를 기본 경로로 만든다.
2. 기존 `/api/morami/respond`는 일정 기간 같은 핸들러를 호출하는 호환 경로로 유지한다.
3. 코드의 타입·변수·파일명은 `Mormi`/`mormi`로 변경하고 테스트의 참조도 함께 갱신한다.
4. 이미지 파일은 `/mormi/*`로 복사 또는 이동한 뒤 기존 `/morami/*` 참조가 필요한 기간에는 별칭을 유지한다.
5. 브라우저 저장 데이터는 새 `mormi-*` 키를 먼저 읽고, 값이 없으면 기존 `morami-*`와 `mormey-*` 키를 읽어 새 키로 한 번만 마이그레이션한다.
6. 호환 키와 경로는 운영 데이터 마이그레이션이 확인된 뒤 별도 버전에서 제거한다.

예시 저장 키 마이그레이션:

```ts
const completedSessions =
  localStorage.getItem("mormi-completed-sessions") ??
  localStorage.getItem("morami-completed-sessions") ??
  "[]";

localStorage.setItem("mormi-completed-sessions", completedSessions);
```

API 문서, 환경 변수, 이벤트 이름, 새 데이터베이스 스키마에는 과거 표기인 `morami`와 `mormey`를 새로 추가하지 않는다. 화면에 표시하는 한글 이름은 계속 **모르미**를 사용한다.

## 6. API 분리안

### 일반 학습 API

```text
POST /v1/learners
GET  /v1/learners/{learner_id}
GET  /v1/progress
POST /v1/learning-sessions
POST /v1/learning-sessions/{learning_session_id}/attempts
POST /v1/learning-sessions/{learning_session_id}/complete
GET  /v1/themes
POST /v1/cafe-visits
POST /v1/cafe-visits/{visit_id}/payments
POST /v1/cafe-visits/{visit_id}/complete
GET  /v1/reports/summary
```

현재 온보딩은 이름을 입력받으므로 `POST /v1/learners/anonymous`보다 `POST /v1/learners`를 사용한다. 인증 없는 MVP라는 의미가 필요하면 응답에 학습자 범위 토큰을 포함하고, 경로 이름은 일반 학습 계약과 맞춘다.

### AI 대화 API

```text
POST /v1/practice-results
POST /v1/conversations
POST /v1/conversations/{conversation_id}/responses
GET  /v1/conversations/{conversation_id}
GET  /v1/learners/{learner_id}/skill-profiles
GET  /v1/learners/{learner_id}/star-notes
```

브라우저는 FastAPI를 직접 호출하지 않고 Next.js BFF를 거친다.

```text
브라우저
  → Next.js /api/dialogue/*
  → FastAPI /v1/conversations/*
```

신규 `/api/mormi/respond`를 기본 BFF로 사용한다. 현재 `/api/morami/respond`는 첫 시나리오와 기존 배포 데이터의 마이그레이션이 끝날 때까지 같은 핸들러를 호출하는 임시 호환 라우트로 유지한다. 서비스 키는 Next.js 서버의 `MORMI_DIALOGUE_SERVICE_KEY`에만 두고 브라우저 번들에는 포함하지 않는다.

## 7. 반복학습 결과 전달 방식

동일 데이터를 일반 백엔드와 AI 대화 백엔드에 중복 저장하지 않는 것이 우선이다.

권장 순서:

1. 반복학습 종료 시 일반 학습 API가 5문제 시도와 보상을 저장한다.
2. 일반 학습 API가 `practice_result_id`와 요약을 반환한다.
3. 대화 시작 시 프론트는 가능하면 `practice_result_id`만 보낸다.
4. AI 대화 백엔드가 내부 API 또는 공용 DB 읽기 모델로 요약을 조회한다.

서비스 분리 때문에 내부 조회가 불가능한 MVP에서만 `practice_summary` 스냅샷을 함께 보낸다.

```json
{
  "learner_id": 1,
  "scene": "home_teach",
  "scenario_id": "home_money_count_teach",
  "learning_session_id": "session_123",
  "practice_result_id": "practice_123",
  "practice_summary": {
    "skill_id": "money_count",
    "question_count": 5,
    "first_try_correct_count": 3,
    "wrong_attempt_count": 2,
    "earned_reward": 850,
    "misconception_tags": ["coin_count_not_value"]
  }
}
```

원문 문제, 정답 문장, 아이 이름은 대화 시작 요청에 넣지 않는다.

## 8. 프론트가 원하는 턴 계약

응답 최상위 필드는 `session_id` 대신 `conversation_id`를 사용한다.

```ts
// L1은 저장된 과거 턴을 읽기 위한 wire 호환 값이다. 신규 턴에는 사용하지 않는다.
type ExpressionLevel = "L4" | "L3" | "L2" | "L0" | "L1";
type HintLevel = "H0" | "H1" | "H2" | "H3";
type MormiMood =
  | "curious"
  | "listening"
  | "thinking"
  | "relieved"
  | "celebrating";

type InputKind =
  | "text"
  | "choices"
  | "fill"
  | "count"
  | "equation"
  | "joint"
  | "button"
  | "none";

type TurnStatus = "active" | "completed";

type TurnChoice = {
  id: string;
  label: string;
  image_url?: string;
  disabled?: boolean;
};

type TurnInput = {
  kind: InputKind;
  placeholder?: string;
  choices?: TurnChoice[];
  target_slots?: string[];
  submit_label?: string;
};

type HelpCard = {
  visible: boolean;
  auto_open: boolean;
  level: HintLevel;
  title: string;
  body: string;
  visual_type?: string;
  visual_data?: Record<string, unknown>;
};

type NoteUpdate = {
  note_id: string;
  skill_id: string;
  text: string;
  attribution: "child" | "coauthored";
  evidence: "direct_explanation" | "supported_completion";
  attribution_label: string;
};

type TurnContract = {
  conversation_id: string;
  turn: {
    turn_id: string;
    scene: "home_teach" | "cafe";
    scenario_id: string;
    task_id: string;
    stage_id: string;
    task_index: number;
    mormi: {
      text: string;
      mood: MormiMood;
      max_lines: 1 | 2;
    };
    input: TurnInput;
    visual: {
      type: string;
      data: Record<string, unknown>;
    };
    help_card: HelpCard | null;
    note_update: NoteUpdate | null;
    status: TurnStatus;
    state_version: number;
    completion: {
      outcome: "taught" | "supported" | "bright_exit";
      teach_reward_eligible: boolean;
    } | null;
    pedagogy?: {
      expression_level: ExpressionLevel;
      hint_level: HintLevel;
      subgoal_id: string;
      verified_slots: Record<string, string | number | boolean>;
      bottleneck: string | null;
    };
  };
};
```

`pedagogy`는 개발·QA에서만 사용하고 아동 UI에는 직접 표시하지 않는다.

## 9. 가르치기 완료와 500원 보상 연결

프론트가 `note_update` 유무나 사다리 단계를 보고 보상 가능 여부를 추론하면 안 된다. AI 대화 백엔드가 다음을 반환한다.

```json
{
  "status": "completed",
  "completion": {
    "outcome": "taught",
    "teach_reward_eligible": true
  }
}
```

처리 순서:

1. AI 대화 백엔드가 대화를 완료하고 `conversation_id`와 완료 결과를 반환한다.
2. 프론트가 일반 학습 API의 세션 완료 요청에 `conversation_id`를 포함한다.
3. 일반 학습 백엔드가 대화 완료를 검증한다.
4. `teach_reward_eligible=true`일 때만 보상 원장에 500원을 한 번 기록한다.
5. 일반 학습 백엔드가 최종 지갑 잔액을 반환한 뒤 프론트가 보상 연출을 표시한다.

`bright_exit`처럼 오늘 활동을 안전하게 종료했지만 가르치기 성공은 아닌 경우에는 세션을 종료할 수 있으나 500원은 지급하지 않는다.

중복 지급 방지 키 예시:

```text
teach-reward:{learning_session_id}:{conversation_id}
```

## 10. 응답 전송과 멱등 처리

프론트는 한 번의 사용자 행동에 UUID `response_id`를 하나 생성한다.

```json
{
  "turn_id": "turn_127",
  "response_id": "9cda3c1e-6539-4b35-9ac5-c63f91e203b1",
  "type": "choice",
  "choice_ids": ["left_queue"],
  "latency_ms": 1800
}
```

- 전송 즉시 해당 입력을 잠근다.
- 실패 후 재시도할 때 같은 `response_id`를 사용한다.
- 백엔드는 같은 `response_id`에 같은 턴 응답을 반환한다.
- 새 턴을 받은 뒤에만 `turn_id`를 교체한다.
- 화면 문구가 아니라 `choice_id`를 전송한다.

오류 처리:

| HTTP | 프론트 처리 | 백엔드 응답 요구사항 |
|---:|---|---|
| `409` | `GET /conversations/{id}`로 최신 턴 복구 | 최신 `state_version` 제공 |
| `422` | 입력 보존, 개발용 오류 코드 기록 | 필드별 오류 제공 |
| `503` | 입력 보존, 동일 ID 재시도 | 성공 턴으로 처리하지 않음 |
| 네트워크 실패 | 마지막 성공 턴 유지 | 재전송 멱등 보장 |

대화 응답은 오프라인 큐에서 나중에 일괄 전송하지 않는다. 다음 질문을 받아야 진행할 수 있기 때문이다.

## 11. 입력 컴포넌트 매핑

| `turn.input.kind` | 프론트 UI | 요청 `type` |
|---|---|---|
| `text` | 말하기·텍스트 입력 | `text` |
| `choices` | 카드·버튼 선택 | `choice` |
| `fill` | 빈칸 완성 | `fill` |
| `count` | 사람·물건 직접 세기 | `count` |
| `equation` | 세로식 숫자 입력 | `equation` |
| `joint` | 도움 카드와 함께 수행 | `action` |
| `button` | 다음·확인 버튼 | `action` |
| `none` | 완료 연출만 표시 | 전송하지 않음 |

한 턴에는 하나의 입력 방식만 활성화한다. 정오나 다음 입력 종류는 프론트가 결정하지 않는다.

## 12. 표정 매핑

백엔드는 파일 경로 대신 의미 단위 `mood`를 반환한다.

```ts
const mormiMoodImage = {
  curious: "/morami/confused-cutout.png",
  listening: "/morami/calm-cutout.png",
  thinking: "/morami/calm-cutout.png",
  relieved: "/morami/happy-cutout.png",
  celebrating: "/morami/celebrate-cutout.png",
} as const;
```

모르미 대사는 최대 50자·두 줄 이내로 제한한다. 실제 카페 장면에서는 “연습”, “문제”, “정답”, “미션 성공”처럼 몰입을 깨는 메타 표현을 대화 문장에 넣지 않는다. 게임 HUD의 퀘스트 표시는 프론트 연출이므로 별도로 유지할 수 있다.

## 13. 도움 카드와 별노트

### 도움 카드

- `help_card=null`: 표시하지 않음
- `visible=true`, `auto_open=true`: 즉시 열기
- `visible=true`, `auto_open=false`: 접힌 카드 표시 가능
- 도움 카드가 열려도 모르미 말풍선과 시각적으로 구분한다.
- 도움 카드 내용을 모르미가 가르친 것처럼 말풍선에 복사하지 않는다.

### 별노트

- `note_update`가 있을 때만 새 기록을 추가한다.
- `attribution=child`: “○○가 알려줌”
- `attribution=coauthored`: “○○와 같이 공부함”
- 백엔드가 `note_id`로 중복 생성을 방지한다.
- 프론트는 별노트 문장을 수정하거나 새로 만들어내지 않는다.

## 14. 대화 원문과 개인정보

일반 학습 기록과 AI 대화 원문을 분리한다.

- `attempts.answer_meta`: 정오, 시간, 선택지 ID, 화폐별 개수 등 구조 데이터만 저장
- 대화 전용 저장소: 모르미 질문, 아이 텍스트 원문, 선택지 ID, 분류, `verified_slots`
- 음성 파일: 저장하지 않음
- 브라우저 장기 저장: 대화 전체를 `localStorage`에 저장하지 않음
- PostHog: 이름, 원문, 음성, 별노트 문장을 보내지 않음
- 대화 원문: 암호화 저장, 최소 권한 접근, 보존 기간 설정

원문 저장은 기관·보호자 동의 상태로 제어해야 한다. 동의하지 않은 학습자는 원문 대신 분류 결과와 구조화 슬롯만 저장하는 모드가 필요하다.

백엔드 팀에서 다음 필드를 확정해 주기를 요청한다.

```json
{
  "conversation_storage_consent": true,
  "retention_policy": "30_days"
}
```

## 15. 단계별 연결 순서

### 1차 — 계약과 BFF

- 공용 `TurnContract` JSON 예시 확정
- FastAPI OpenAPI와 TypeScript 타입 대조
- Next.js BFF에서 인증·서비스 키 처리
- 네트워크 오류와 `response_id` 재시도 구현

### 2차 — 집에서 모르미 가르치기 1개

- `money-count` 한 시나리오만 연결
- 활성 발화 단계 `L4/L3/L2/L0`, 힌트 단계 `H0~H3` 상태 렌더링
- 과거 `L1`은 원본을 변경하지 않고 화면·통계에서 `L2`로 합산
- 부분 답변, “잘 모르겠어”, 오개념, 주제 이탈 확인
- `note_update`와 500원 지급 연결

### 3차 — 집 전체 세션

- 나머지 커리큘럼 세션에 동일 계약 재사용
- 정적 별노트와 프론트 성공 판정 제거
- 보호자 리포트에 대화 결과 요약 연결

### 4차 — 카페

- 줄 서기
- 메뉴 고르기
- 메뉴값 계산과 돈 구성
- 거스름돈 받기
- 카페 돌다리 진행도와 대화 상태 복구

## 16. 구현 전 백엔드 팀 확인 요청

다음 항목에 답을 받으면 프론트 연결을 시작할 수 있다.

1. `learner_id`를 정수로 확정 가능한가?
2. URL 변수명을 `{conversation_id}`로 통일 가능한가?
3. 대화 시작 응답도 이후 응답과 동일한 `TurnContract`인가?
4. `choices`는 `{ id, label, image_url? }` 배열로 반환되는가?
5. `visual.type`별 JSON Schema와 샘플을 제공할 수 있는가?
6. `status=completed`일 때 `completion.outcome`과 `teach_reward_eligible`를 반환할 수 있는가?
7. `409` 응답에 현재 `conversation_id`, `turn_id`, `state_version`이 포함되는가?
8. 동일 `response_id`의 응답 보존 기간은 얼마인가?
9. `practice_result_id`만으로 반복학습 요약을 조회할 수 있는가?
10. 원문 저장 동의 플래그와 보존 기간 정책은 누가 관리하는가?
11. 별노트 저장 주체는 AI 대화 DB인가, 일반 학습 DB인가?
12. 개발·스테이징 FastAPI 주소와 BFF용 인증 헤더 이름은 무엇인가?
13. 기존 `/api/morami/respond` 호환 경로의 제거 기준과 종료 버전은 무엇으로 정할 것인가?

## 17. 완료 기준

첫 연결은 아래 항목이 모두 통과하면 완료로 본다.

- 아이가 자유 발화로 한 번에 설명한다.
- 부분 답변 후 다음 턴에서 부족한 슬롯만 질문한다.
- “잘 모르겠어”에서 사다리가 내려가고 도움 카드가 열린다.
- 중복 클릭과 네트워크 재시도에도 턴과 보상이 중복 생성되지 않는다.
- `409` 이후 최신 턴이 복구된다.
- `note_update`가 없는 대화는 별노트에 기록되지 않는다.
- 성공 완료에서만 가르치기 500원이 한 번 지급된다.
- PostHog에 이름·원문·별노트 문장이 없는 것을 확인한다.
- 새로고침 후 진행 중 대화의 최신 턴을 복구한다.
- 기존 `morami-*` 또는 `mormey-*` 저장 데이터가 새 `mormi-*` 키로 손실 없이 이전된다.
- 기존 `/api/morami/respond` 호출도 호환 기간에는 동일한 대화 응답을 받는다.

## 18. 한 문장 합의안

> 프론트는 백엔드가 반환한 턴을 그대로 렌더링하고, AI 대화 백엔드는 아이의 이해 상태와 다음 지원을 결정하며, 일반 학습 백엔드는 진행도와 보상을 최종 확정한다.
