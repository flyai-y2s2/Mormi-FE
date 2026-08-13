#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FE_DIR="$PROJECT_ROOT/mormi-web"
AI_DIR="$PROJECT_ROOT/local-services/Mormi-AI"
RUNTIME_DIR="$PROJECT_ROOT/.local-runtime"
AI_VENV="$RUNTIME_DIR/mormi-ai-venv"

if [[ ! -f "$FE_DIR/.env.local" ]]; then
  echo "mormi-web/.env.local 파일이 필요합니다." >&2
  echo "배포된 Spring BE 주소를 BACKEND_ORIGIN=https://... 형태로 설정해 주세요." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "$FE_DIR/.env.local"
set +a

: "${MORMI_START_LOCAL_AI:=false}"
: "${MORMI_ENABLE_AI_TEST_PAGE:=true}"

if [[ -z "${BACKEND_ORIGIN:-}" ]]; then
  echo "BACKEND_ORIGIN이 비어 있습니다." >&2
  echo "mormi-web/.env.local에 배포된 Spring BE 주소를 설정해 주세요." >&2
  exit 1
fi

if [[ ! "$BACKEND_ORIGIN" =~ ^https?:// ]]; then
  echo "BACKEND_ORIGIN은 http:// 또는 https://로 시작해야 합니다: $BACKEND_ORIGIN" >&2
  exit 1
fi

case "$BACKEND_ORIGIN" in
  http://localhost*|https://localhost*|http://127.*|https://127.*|http://0.0.0.0*|https://0.0.0.0*)
    echo "BACKEND_ORIGIN에는 로컬 주소를 사용할 수 없습니다: $BACKEND_ORIGIN" >&2
    echo "배포된 Spring BE의 HTTPS 주소를 설정해 주세요." >&2
    exit 1
    ;;
esac

export BACKEND_ORIGIN MORMI_ENABLE_AI_TEST_PAGE

if [[ "$MORMI_START_LOCAL_AI" == "true" ]]; then
  : "${AI_ORIGIN:=http://127.0.0.1:8000}"
  : "${MORMI_AI_BASE_URL:=$AI_ORIGIN}"

  if [[ ! -x "$AI_VENV/bin/uvicorn" ]]; then
    echo "로컬 AI를 실행할 가상환경이 없습니다: $AI_VENV" >&2
    exit 1
  fi

  export AI_ORIGIN MORMI_AI_BASE_URL
fi

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in "${FE_PID:-}" "${AI_PID:-}"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  exit "$status"
}
trap cleanup EXIT INT TERM

if [[ "$MORMI_START_LOCAL_AI" == "true" ]]; then
  echo "[1/2] Mormi-AI 시작 (ai-test 전용): $AI_ORIGIN"
  (
    cd "$AI_DIR"
    MORMI_ENVIRONMENT=development \
    MORMI_DATABASE_URL="sqlite+aiosqlite:////$RUNTIME_DIR/mormi-ai.db" \
    "$AI_VENV/bin/uvicorn" mormi_api.main:app --app-dir src --host 127.0.0.1 --port 8000
  ) &
  AI_PID=$!
fi

echo "[2/2] Mormi-FE 시작: http://localhost:3000"
echo "Spring BE는 배포 주소를 사용합니다: $BACKEND_ORIGIN"
(
  cd "$FE_DIR"
  npm run build:vercel
  npm run start:vercel
) &
FE_PID=$!

echo "로컬 통합 실행 완료: http://localhost:3000"
wait "$FE_PID"
