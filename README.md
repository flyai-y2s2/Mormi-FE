# Mormey FE

느린학습자가 서툰 AI 친구 **모르미를 가르치며** 생활 수학을 익히는 Next.js 프런트엔드입니다.

이번 버전의 핵심 동선은 다음과 같습니다.

```text
온보딩 → 집에서 반복 학습 → 카페 필수 과정 5개 완료 → 외부의 카페 해금
       → 카페 입장 → 줄 비교 → 예산 안에서 메뉴 선택 → 메뉴값 합산
       → 실제 화폐로 거스름돈 구성 → 주문 완료
```

Figma는 화면 디자인이 아니라 사용자 흐름만 참고했으며, UI는 기존 `mormy_v3`의 둥근 카드, 민트·크림 팔레트, 3D 모르미 스타일을 유지합니다.

## 실행

### 로컬 FE + 배포된 Spring BE

브라우저는 Spring BE를 직접 호출하지 않습니다. 브라우저 요청은 `/api/be/*`로 들어오고, Next.js 서버 라우트가 `BACKEND_ORIGIN`에 지정한 **배포된 Spring BE**로 프록시합니다. 따라서 로컬 FE 실행 시에도 Spring BE를 빌드·실행하거나 H2를 준비하지 않습니다. 주소가 빠졌거나 배포 서버에 닿지 않으면 이 라우트가 원인을 구분한 503 JSON을 반환합니다.

카페에서 무작위로 만든 줄 인원·예산·메뉴 맥락은 첫 대화 시작 때 Spring BE에 함께 저장됩니다. 새로고침이나 재진입 때는 BE가 돌려준 `scenario_context`로 화면을 복원해 AI가 기억한 문제와 항상 같은 장면을 보여 줍니다.
도움카드·선택형 단계에서 AI 대화가 완료된 경우에는 Spring BE가 AI의 검증 슬롯을
카페 기록과 다시 대조한 `stage_progress`를 반환합니다. FE는 이 값이 완료일 때만 다음
스테이지를 열며, 모르미 문장이나 아이 원문만 보고 정답을 추측하지 않습니다.

먼저 `mormi-web/.env.local`에 실제 배포 주소를 넣습니다. 이 파일은 커밋하지 않습니다.

```env
BACKEND_ORIGIN=https://실제-배포된-Spring-BE-주소
```

그 다음 아래 명령으로 FE를 실행합니다.

```bash
./scripts/start-local-stack.sh
```

이 스크립트는 `BACKEND_ORIGIN`이 없거나 `localhost`·`127.0.0.1`이면 실행을 중단합니다. 배포 주소는 이 저장소에서 추정하거나 하드코딩하지 않습니다.

`MORMI_START_LOCAL_AI=true`를 추가하면 개발 전용 `/ai-test` 점검을 위해 로컬 FastAPI AI만 함께 실행합니다. 이 경우에도 Spring BE는 항상 배포된 주소를 사용합니다.

```env
MORMI_START_LOCAL_AI=true
AI_ORIGIN=http://127.0.0.1:8000
```

일반 학습 API 경로는 코드에서 같은 출처의 `/api/be`로 고정됩니다.
`BACKEND_ORIGIN`, `AI_ORIGIN`, AI 서비스 키는 서버 전용이고 브라우저에는 노출되지 않습니다. 실제 키는 `.env.local` 또는 배포 환경 변수에만 둡니다.

### 프론트만 실행

```bash
cd mormi-web
npm install
cp .env.example .env.local
npm run dev:vercel
```

기본 주소는 `http://localhost:3000`입니다. 이 실행 방식도 `BACKEND_ORIGIN`에 배포된 Spring BE 주소가 필요합니다. 실제 집·카페 대화도 Spring BE가 FastAPI를 호출하므로 FE에는 AI 주소나 서비스 키가 필요하지 않습니다.

### 배포된 Spring BE와 별개로 Mormi-AI만 로컬 테스트

FastAPI와 프런트 개발 서버를 함께 실행한 뒤 `http://localhost:3000/ai-test`에서 집 가르치기와 카페 네 시나리오를 실제 `TurnContract`로 확인할 수 있습니다. 이 화면은 개발 환경 전용이며, 배포 빌드에서는 `MORMI_ENABLE_AI_TEST_PAGE=true`를 명시하지 않는 한 404를 반환합니다.

```bash
# 터미널 1: Mormi-AI 저장소에서
MORMI_DB_PATH=/tmp/mormi-ai-local.db \
MORMI_ANTHROPIC_API_KEY=... \
uvicorn mormi_api.main:app --host 127.0.0.1 --port 8000

# 터미널 2: mormi-web에서
MORMI_AI_BASE_URL=http://127.0.0.1:8000 npm run dev:vercel
```

`MORMI_ANTHROPIC_API_KEY`는 FastAPI 프로세스에 들어가야 합니다. 프런트 Vercel 프로젝트에만 등록한 키는 로컬 FastAPI나 별도 배포된 AI 서버로 자동 전달되지 않습니다.

AI `develop`의 strict schema 변환 적용 이후 후속 자유 발화가 동일한 `conversation_id`로 다음 턴까지 이어지는 것을 로컬에서 검증했습니다.

## 주요 경로

- `mormi-web/app/MoramiApp.tsx`: 온보딩, 집, 커리큘럼, 반복 학습, 가르치기, 완료 상태
- `mormi-web/app/CafeJourney.tsx`: 카페 3개 스테이지, 줄 비교, 모르미·아이의 메뉴 선택 후 합계 입력, 실제 화폐 PNG의 `− / ＋` 거스름돈 조합
- `mormi-web/app/journey-config.ts`: 카페 해금에 필요한 과정과 화폐 정의
- `mormi-web/public/figma/cafe/`: Figma에서 내려받은 카페 메뉴와 스테이지 원본 PNG
- `mormi-web/public/cafe-stages/`: 통일된 단순 3D 클레이 스타일의 카페 스테이지 카드 이미지
- 카페는 Figma의 화면별 문구와 크림·민트 게임 UI를 유지합니다. 제품 스테이지는
  `줄 서기 → 메뉴값 합산 → 거스름돈 받기` 세 카드입니다. 메뉴값 합산을 시작하면
  모르미가 하나를 무작위로 고르고 아이가 다른 하나를 직접 고른 뒤, 그 두 메뉴로
  하나의 AI 합산 문제를 엽니다. 메뉴 선택 자체는 별도 채점 스테이지가 아닙니다.
- `mormi-web/app/mormi-dialogue.ts`: 집·카페가 함께 사용하는 Mormi-AI `TurnContract` 타입과 대화 클라이언트
- `mormi-web/app/api/be/[...path]/route.ts`: 브라우저의 `/api/be/*`를 서버 전용
  `BACKEND_ORIGIN`에 등록된 배포 Spring BE로 전달하는 운영 프록시
- `mormi-web/app/ai-test/`: 일반 백엔드 없이 로컬 Mormi-AI를 점검하는 개발 전용 화면
- `mormi-web/app/api/mormi/`: Mormi-AI 상태형 대화를 전달하는 서버 전용 BFF
- `mormi-web/app/api/morami/respond/route.ts`: 이관 중 호환을 위한 기존 단발성 Anthropic 응답
- `mormi-web/instrumentation-client.ts`: 개인정보 보호형 PostHog 초기화
- `mormi-web/public/cafe-money/`: 100원, 500원, 1,000원, 5,000원 투명 PNG
- `docs/`: 원본 분석, 백엔드 계약, PostHog 평가 계획

## 검증

```bash
cd mormi-web
npm run lint
npm run build:vercel
npm test
```

## 배포

프런트엔드는 `mormi-web`을 Vercel 프로젝트 루트로 지정합니다. Vercel 서버 환경 변수에는 `BACKEND_ORIGIN`만 등록하고 반드시 배포된 Spring BE 주소를 넣습니다. `AI_ORIGIN`과 AI 서비스 키는 운영 FE에 등록하지 않습니다. Spring BE 운영 환경의 `MORMI_DIALOGUE_BASE_URL`, `MORMI_DIALOGUE_SERVICE_KEY`가 AI 연결을 담당합니다. 공식 프런트 원격 저장소는 `https://github.com/flyai-y2s2/Mormi-FE.git`입니다.
