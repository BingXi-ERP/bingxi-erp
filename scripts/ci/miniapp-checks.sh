#!/usr/bin/env bash
# 新小程序静态门：同一套判定器供 CI 与本地定向验证使用。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

record_gate() {
  local name="$1"
  shift
  local rc=0
  "$@" || rc=$?
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    if [[ "$rc" -eq 0 ]]; then
      printf '%s=success\n%s_rc=0\n' "$name" "$name" >>"$GITHUB_OUTPUT"
    else
      printf '%s=failure\n%s_rc=%s\n' "$name" "$name" "$rc" >>"$GITHUB_OUTPUT"
    fi
  fi
  return "$rc"
}

if [[ "${1:-}" == "--self-test" ]]; then
  if [[ "$#" -ne 1 ]]; then
    echo "TOOL_BUG --self-test does not accept additional arguments" >&2
    exit 2
  fi

  node scripts/ci/miniapp-contract-check.mjs --self-test
  node scripts/ci/miniapp-gap-inventory.mjs --self-test
  node scripts/ci/miniapp-architecture-check.mjs --self-test
  node scripts/ci/miniapp-source-scan.mjs --self-test

  page_output=
  page_rc=0
  if page_output="$(node scripts/ci/miniapp-check-pages.mjs scripts/ci/fixtures/miniapp/invalid-page/src 2>&1)"; then
    echo "DETECTOR_BLIND invalid-page fixture passed: $page_output" >&2
    exit 9
  else
    page_rc=$?
  fi
  if [[ "$page_rc" -ne 1 ]] || ! grep -q '^MISSING_PAGE pages/missing/index$' <<<"$page_output"; then
    echo "DETECTOR_BLIND invalid-page fixture failed for the wrong reason (rc=$page_rc): $page_output" >&2
    exit 9
  fi
  node scripts/ci/miniapp-check-pages.mjs scripts/ci/fixtures/miniapp/valid/src

  legacy_output=
  legacy_rc=0
  if legacy_output="$(node scripts/ci/miniapp-contract-check.mjs --root scripts/ci/fixtures/miniapp/invalid-legacy/src --snapshot frontend/scripts/route-snapshot.txt 2>&1)"; then
    echo "DETECTOR_BLIND invalid-legacy fixture passed: $legacy_output" >&2
    exit 9
  else
    legacy_rc=$?
  fi
  if [[ "$legacy_rc" -ne 1 ]] || ! grep -q 'FORBIDDEN legacy-endpoint:/app-api/' <<<"$legacy_output"; then
    echo "DETECTOR_BLIND invalid-legacy fixture failed for the wrong reason (rc=$legacy_rc): $legacy_output" >&2
    exit 9
  fi

  size_tmp=
  size_tmp="$(mktemp -d)"
  trap 'rm -rf "$size_tmp"' EXIT
  mkdir -p "$size_tmp/nested"
  node -e 'require("node:fs").writeFileSync(process.argv[1], Buffer.alloc(1025))' "$size_tmp/nested/payload.bin"
  node scripts/ci/miniapp-check-size.mjs "$size_tmp" 2
  size_output=
  size_rc=0
  if size_output="$(node scripts/ci/miniapp-check-size.mjs "$size_tmp" 1 2>&1)"; then
    echo "DETECTOR_BLIND oversized fixture passed: $size_output" >&2
    exit 9
  else
    size_rc=$?
  fi
  if [[ "$size_rc" -ne 1 ]] || ! grep -q '^MINIAPP_SIZE totalKb=2 limitKb=1$' <<<"$size_output"; then
    echo "DETECTOR_BLIND oversized fixture failed for the wrong reason (rc=$size_rc): $size_output" >&2
    exit 9
  fi
  if node scripts/ci/miniapp-check-size.mjs "$size_tmp/missing" 1 >/dev/null 2>&1; then
    echo "DETECTOR_BLIND missing size root passed" >&2
    exit 9
  else
    size_rc=$?
  fi
  if [[ "$size_rc" -ne 2 ]]; then
    echo "DETECTOR_BLIND missing size root must be a tool error, got rc=$size_rc" >&2
    exit 9
  fi

  github_output="$size_tmp/github-output"
  GITHUB_OUTPUT="$github_output" record_gate summary_success true
  if GITHUB_OUTPUT="$github_output" record_gate summary_failure false; then
    echo "DETECTOR_BLIND failed gate returned success" >&2
    exit 9
  else
    summary_rc=$?
  fi
  if [[ "$summary_rc" -ne 1 ]] || ! grep -q '^summary_failure=failure$' "$github_output" || ! grep -q '^summary_failure_rc=1$' "$github_output"; then
    echo "DETECTOR_BLIND gate outcome propagation failed (rc=$summary_rc)" >&2
    exit 9
  fi

  echo "MINIAPP_STATIC_SELFTEST_OK"
  exit 0
fi

if [[ "$#" -ne 0 ]]; then
  echo "TOOL_BUG unknown arguments: $*" >&2
  exit 2
fi

if [[ "${MINIAPP_SKIP_INSTALL:-}" != "1" ]]; then
  npm --prefix miniapp ci
fi
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npm --prefix miniapp exec -- prettier --check miniapp/src miniapp/tests miniapp/*.ts miniapp/*.json
npm --prefix miniapp run test:run
record_gate contract node scripts/ci/miniapp-contract-check.mjs --root miniapp/src --snapshot frontend/scripts/route-snapshot.txt
record_gate pages node scripts/ci/miniapp-check-pages.mjs miniapp/src
record_gate architecture node scripts/ci/miniapp-architecture-check.mjs
record_gate source node scripts/ci/miniapp-source-scan.mjs
npm --prefix miniapp run build:mp-weixin
record_gate size node scripts/ci/miniapp-check-size.mjs miniapp/dist/build/mp-weixin 2048
echo "MINIAPP_STATIC_GREEN"
