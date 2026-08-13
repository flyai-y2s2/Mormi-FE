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

### 프론트·백엔드·AI를 모두 로컬에서 실행

로컬 통합 실행은 다음 주소를 사용합니다.

```text
Mormi-FE  http://localhost:3000
Mormi-BE  http://127.0.0.1:8080
Mormi-AI  http://127.0.0.1:8000
```

백엔드와 AI 최신 코드는 각각 `local-services/Mormi-BE`, `local-services/Mormi-AI`에 별도 Git 저장소로 두며 프론트 저장소에는 커밋하지 않습니다. AI 소스는 수정하지 않고, 실행 데이터와 Python 가상환경은 `.local-runtime/`에 분리합니다.

최초 런타임 준비가 끝난 현재 작업 폴더에서는 아래 명령 하나로 세 서비스를 함께 실행할 수 있습니다.

```bash
./scripts/start-local-stack.sh
```

로컬 백엔드는 운영 PostgreSQL 스키마와 호환되는 H2 파일 DB를 사용합니다. 배포로 바꿀 때 프론트 코드를 고치지 않고 환경변수만 교체합니다.

```env
BACKEND_ORIGIN=https://새-백엔드-주소
NEXT_PUBLIC_API_BASE_URL=/api/be
AI_ORIGIN=https://새-AI-주소
MORMI_DIALOGUE_SERVICE_KEY=백엔드와-AI가-공유하는-키
```

`BACKEND_ORIGIN`, `AI_ORIGIN`, 서비스 키는 서버 전용이고 브라우저에는 노출되지 않습니다.

### 프론트만 실행

```bash
cd mormi-web
npm install
cp .env.example .env.local
npm run dev:vercel
```

기본 주소는 `http://localhost:3000`입니다. 기존 단발성 모르미 응답은 환경 변수를 비워도 안전한 로컬 문구로 대체되고, PostHog는 조용히 꺼진 상태로 동작합니다. 상태형 Mormi-AI 대화는 FastAPI 연결이 필요합니다.

```env
MORMI_AI_BASE_URL=http://localhost:8000
MORMI_AI_SERVICE_KEY=
```

두 값은 서버 전용입니다. 브라우저는 `/api/mormi/*`만 호출하고 서비스 키는 클라이언트 번들에 포함하지 않습니다.

### 일반 백엔드 없이 Mormi-AI만 로컬 테스트

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
- `mormi-web/app/CafeJourney.tsx`: 카페 스테이지, 줄 비교, 예산 메뉴 선택, 선택 메뉴 사진·합계 입력, 실제 화폐 PNG의 `− / ＋` 거스름돈 조합
- `mormi-web/app/journey-config.ts`: 카페 해금에 필요한 과정과 화폐 정의
- `mormi-web/public/figma/cafe/`: Figma에서 내려받은 카페 메뉴와 스테이지 원본 PNG
- `mormi-web/public/cafe-stages/`: 통일된 단순 3D 클레이 스타일의 카페 스테이지 카드 이미지
- 카페는 Figma의 학습 순서와 제공된 화면별 문구를 유지하고 시각 디자인은 모르미의 크림·민트 게임 UI로 통일합니다. 스테이지 화면은 `줄 서기 → 메뉴 고르기 → 계산하기 → 거스름돈 받기` 네 카드가 순서대로 열리며, 줄 서기는 대화·자유 입력·선택·별노트·성공 화면의 5단계로 진행됩니다.
- `mormi-web/app/mormi-dialogue.ts`: 집·카페가 함께 사용하는 Mormi-AI `TurnContract` 타입과 대화 클라이언트
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

프런트엔드는 `mormi-web`을 Vercel 프로젝트 루트로 지정합니다. Spring 백엔드와 FastAPI AI 서비스는 별도로 배포하고 Vercel 서버 환경 변수 `BACKEND_ORIGIN`, `AI_ORIGIN`, `MORMI_DIALOGUE_SERVICE_KEY`로 연결합니다. 공식 프런트 원격 저장소는 `https://github.com/flyai-y2s2/Mormi-FE.git`입니다.
