#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
RESULTS_DIR="$ROOT/miniapp/test-results"
BACKEND_LOG="$RESULTS_DIR/backend.log"
BACKEND_ERROR_LOG="$RESULTS_DIR/backend.stderr.log"
BACKEND_PID_FILE="$RESULTS_DIR/backend.pid"
BACKEND_URL=${E2E_BASE_URL:-}

require_env() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    echo "::error::缺少必需环境变量：$name" >&2
    exit 1
  fi
}

for name in DATABASE_URL E2E_BASE_URL E2E_USERNAME E2E_PASSWORD INIT_TOKEN; do
  require_env "$name"
done

if [[ "$BACKEND_URL" != http://127.0.0.1:8082 ]]; then
  echo "::error::E2E_BASE_URL 必须是 Windows CI 本机后端地址 http://127.0.0.1:8082" >&2
  exit 1
fi

mkdir -p "$RESULTS_DIR"
INIT_PAYLOAD_DIR=$(node - <<'NODE'
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const base = process.env.RUNNER_TEMP || tmpdir()
process.stdout.write(mkdtempSync(join(base, 'miniapp-e2e-init-')))
NODE
)
INIT_PAYLOAD_FILE="$INIT_PAYLOAD_DIR/init-request.json"
INIT_RESPONSE_FILE="$INIT_PAYLOAD_DIR/init-response.json"
cleanup_init_payload() {
  rm -rf "$INIT_PAYLOAD_DIR"
}
trap cleanup_init_payload EXIT

BIN_SUFFIX=''
if [[ "${OS:-}" == 'Windows_NT' ]]; then
  BIN_SUFFIX='.exe'
fi

MIGRATE_BIN="$ROOT/backend/target/release/bingxi$BIN_SUFFIX"
SERVER_BIN="$ROOT/backend/target/release/server$BIN_SUFFIX"
for binary in "$MIGRATE_BIN" "$SERVER_BIN"; do
  if [[ ! -f "$binary" ]]; then
    echo "::error::后端二进制不存在：$binary" >&2
    exit 1
  fi
done

echo 'MINIAPP_E2E_MIGRATE_START'
"$MIGRATE_BIN" migrate run
echo 'MINIAPP_E2E_MIGRATE_OK'

echo 'MINIAPP_E2E_BACKEND_START'
node - "$SERVER_BIN" "$ROOT" "$BACKEND_LOG" "$BACKEND_ERROR_LOG" "$BACKEND_PID_FILE" <<'NODE'
const { spawn } = require('node:child_process')
const { openSync, writeFileSync } = require('node:fs')

const [serverBin, root, stdoutPath, stderrPath, pidPath] = process.argv.slice(2)
const stdout = openSync(stdoutPath, 'a')
const stderr = openSync(stderrPath, 'a')
const child = spawn(serverBin, [], {
  cwd: `${root}/backend`,
  detached: true,
  stdio: ['ignore', stdout, stderr],
})
writeFileSync(pidPath, `${child.pid}\n`, 'utf8')
child.unref()
console.info(`MINIAPP_E2E_BACKEND_PID=${child.pid}`)
NODE

READY=false
for attempt in $(seq 1 90); do
  if curl --fail --silent --show-error --max-time 3 \
    "$BACKEND_URL/api/v1/erp/health/readiness" \
    -o "$RESULTS_DIR/readiness.json" 2>/dev/null; then
    if node -e "const fs=require('node:fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.exit(body.status === 'healthy' ? 0 : 1)" \
      "$RESULTS_DIR/readiness.json"; then
      READY=true
      echo "MINIAPP_E2E_BACKEND_READY attempt=$attempt"
      break
    fi
  fi
  sleep 1
done

if [[ "$READY" != 'true' ]]; then
  echo '::error::后端未在 90 秒内就绪' >&2
  echo '--- backend.log ---' >&2
  cat "$BACKEND_LOG" >&2 || true
  echo '--- backend.stderr.log ---' >&2
  cat "$BACKEND_ERROR_LOG" >&2 || true
  exit 1
fi

node - "$INIT_PAYLOAD_FILE" <<'NODE'
const { writeFileSync } = require('node:fs')
const payload = {
  admin_username: process.env.E2E_USERNAME,
  admin_password: process.env.E2E_PASSWORD,
}
writeFileSync(process.argv[2], JSON.stringify(payload), { mode: 0o600 })
NODE

echo 'MINIAPP_E2E_INITIALIZE_START'
HTTP_CODE=$(curl --silent --show-error --max-time 120 \
  -o "$INIT_RESPONSE_FILE" \
  -w '%{http_code}' \
  -X POST "$BACKEND_URL/api/v1/erp/init/initialize" \
  -H 'Content-Type: application/json' \
  -H "X-Init-Token: $INIT_TOKEN" \
  --data-binary "@$INIT_PAYLOAD_FILE")
rm -f "$INIT_PAYLOAD_FILE"

if [[ "$HTTP_CODE" != '200' ]]; then
  echo "::error::系统初始化失败，HTTP $HTTP_CODE；响应内容已脱敏且不写入制品" >&2
  exit 1
fi

node - "$INIT_RESPONSE_FILE" <<'NODE'
const { readFileSync } = require('node:fs')
const body = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (body.code !== 200 || body.data?.success !== true) {
  throw new Error('系统初始化响应未确认 success=true')
}
if (body.data.admin_username !== process.env.E2E_USERNAME) {
  throw new Error('系统初始化账号与 E2E_USERNAME 不一致')
}
console.info('MINIAPP_E2E_INITIALIZE_OK')
NODE

INIT_STATUS_CODE=$(curl --silent --show-error --max-time 10 \
  -o "$RESULTS_DIR/init-status.json" \
  -w '%{http_code}' \
  "$BACKEND_URL/api/v1/erp/init/status")
if [[ "$INIT_STATUS_CODE" != '200' ]]; then
  echo "::error::读取初始化状态失败，HTTP $INIT_STATUS_CODE" >&2
  exit 1
fi
node -e "const fs=require('node:fs'); const body=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); if (body.code !== 200 || body.data?.initialized !== true) process.exit(1); console.info('MINIAPP_E2E_INIT_STATUS_OK initialized=true')" \
  "$RESULTS_DIR/init-status.json"
