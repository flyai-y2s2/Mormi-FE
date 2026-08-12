# Mormey FE

느린학습자가 서툰 AI 친구 **모르미를 가르치며** 생활 수학을 익히는 Next.js 프런트엔드입니다.

이번 버전의 핵심 동선은 다음과 같습니다.

```text
온보딩 → 집에서 반복 학습 → 카페 필수 과정 4개 완료 → 외부의 카페 해금
       → 카페 입장 → 줄 비교 → 예산 안에서 메뉴 선택 → 메뉴값 합산
       → 실제 금액 구성 → 거스름돈 구성 → 주문 완료
```

Figma는 화면 디자인이 아니라 사용자 흐름만 참고했으며, UI는 기존 `mormy_v3`의 둥근 카드, 민트·크림 팔레트, 3D 모르미 스타일을 유지합니다.

## 실행

```bash
cd mormi-web
npm install
cp .env.example .env.local
npm run dev:vercel
```

기본 주소는 `http://localhost:3000`입니다. 환경 변수를 비워도 모르미 응답은 안전한 로컬 문구로 대체되고, PostHog는 조용히 꺼진 상태로 동작합니다.

## 주요 경로

- `mormi-web/app/MoramiApp.tsx`: 온보딩, 집, 커리큘럼, 반복 학습, 가르치기, 완료 상태
- `mormi-web/app/CafeJourney.tsx`: Figma 돌다리, 줄 비교, 메뉴 선택, 합계 입력, 돈·거스름돈 조합
- `mormi-web/app/journey-config.ts`: 카페 해금에 필요한 과정과 화폐 정의
- `mormi-web/public/figma/cafe/`: Figma에서 내려받은 카페 메뉴와 스테이지 원본 PNG
- 카페는 Figma의 단계와 학습 흐름만 유지하고 시각 디자인은 모르미의 게임 UI로 구현합니다. 줄서기는 사람 캐릭터, 메뉴는 진열대·주문 바구니, 계산은 주문서 형태이며 메뉴 PNG는 이름과 순서를 고정 관리합니다.
- `mormi-web/app/api/morami/respond/route.ts`: Anthropic 응답과 로컬 대체 응답
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

프런트엔드는 `mormi-web`을 Vercel 프로젝트 루트로 지정합니다. FastAPI 백엔드는 별도 서비스로 배포하고 `NEXT_PUBLIC_API_BASE_URL`로 연결합니다. 최종 원격 저장소는 `https://github.com/flyai-y2s2/Mormey_FE.git`입니다.
