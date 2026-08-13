#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE_DIR="$PROJECT_ROOT/mormi-web"
BE_DIR="$PROJECT_ROOT/local-services/Mormi-BE"
AI_DIR="$PROJECT_ROOT/local-services/Mormi-AI"
RUNTIME_DIR="$PROJECT_ROOT/.local-runtime"
JAVA_HOME_LOCAL="$RUNTIME_DIR/jdk-21/Contents/Home"
AI_VENV="$RUNTIME_DIR/mormi-ai-venv"
GRADLE_CACHE="${TMPDIR:-/tmp}/mormi-be-gradle-cache"

if [[ -f "$FE_DIR/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$FE_DIR/.env.local"
  set +a
fi

: "${AI_ORIGIN:=http://127.0.0.1:8000}"
: "${MORMI_AI_BASE_URL:=$AI_ORIGIN}"
: "${BACKEND_ORIGIN:=http://127.0.0.1:8080}"
: "${NEXT_PUBLIC_API_BASE_URL:=/api/be}"
: "${MORMI_DIALOGUE_BASE_URL:=$AI_ORIGIN}"
: "${MORMI_ENABLE_AI_TEST_PAGE:=true}"

export AI_ORIGIN MORMI_AI_BASE_URL BACKEND_ORIGIN NEXT_PUBLIC_API_BASE_URL
export MORMI_DIALOGUE_BASE_URL MORMI_ENABLE_AI_TEST_PAGE

if [[ ! -x "$JAVA_HOME_LOCAL/bin/java" ]]; then
  echo "Java 21이 없습니다: $JAVA_HOME_LOCAL" >&2
  exit 1
fi

if [[ ! -x "$AI_VENV/bin/uvicorn" ]]; then
  echo "AI 가상환경이 없습니다: $AI_VENV" >&2
  exit 1
fi

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in "${FE_PID:-}" "${BE_PID:-}" "${AI_PID:-}"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "[1/3] Mormi-AI 시작: $AI_ORIGIN"
(
  cd "$AI_DIR"
  MORMI_ENVIRONMENT=development \
  MORMI_DATABASE_URL="sqlite+aiosqlite:////$RUNTIME_DIR/mormi-ai.db" \
  "$AI_VENV/bin/uvicorn" mormi_api.main:app --app-dir src --host 127.0.0.1 --port 8000
) &
AI_PID=$!

echo "[2/3] Mormi-BE 시작: $BACKEND_ORIGIN"
(
  cd "$BE_DIR"
  JAVA_HOME="$JAVA_HOME_LOCAL" \
  GRADLE_USER_HOME="$GRADLE_CACHE" \
  SPRING_DEVTOOLS_RESTART_ENABLED=false \
  SPRING_DATASOURCE_URL="jdbc:h2:file:$RUNTIME_DIR/mormi-db-v2;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;INIT=CREATE DOMAIN IF NOT EXISTS TIMESTAMPTZ AS TIMESTAMP WITH TIME ZONE\\;CREATE DOMAIN IF NOT EXISTS JSONB AS JSON" \
  SPRING_DATASOURCE_USERNAME=sa \
  SPRING_DATASOURCE_PASSWORD= \
  SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.h2.Driver \
  SPRING_JPA_DATABASE_PLATFORM=org.hibernate.dialect.H2Dialect \
  MORMI_DIALOGUE_BASE_URL="$MORMI_DIALOGUE_BASE_URL" \
  ./gradlew --init-script "$RUNTIME_DIR/backend-local.init.gradle" bootRun
) &
BE_PID=$!

echo "백엔드와 AI 상태를 기다리는 중…"
for _ in $(seq 1 120); do
  if curl -fsS "$AI_ORIGIN/health" >/dev/null 2>&1 && curl -fsS "$BACKEND_ORIGIN/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "$AI_ORIGIN/health" >/dev/null
curl -fsS "$BACKEND_ORIGIN/health" >/dev/null

echo "[3/3] Mormi-FE 빌드 및 시작: http://localhost:3000"
(
  cd "$FE_DIR"
  npm run build:vercel
  npm run start:vercel
) &
FE_PID=$!

echo "로컬 통합 실행 완료: http://localhost:3000"
wait "$FE_PID"
