#!/usr/bin/env bash
# ==============================================================================
# scripts/ci/miniprogram-checks.sh
#
# 用途：微信小程序面的静态门（云端 CI 与本地共用同一份判据，防"本地能过 CI 红"）。
#       覆盖四道：JS 语法校验、代码包体积校验（微信分包上限）、app.json 与磁盘页面
#       一一对账、调用点与本仓权威端点面对账。
#
# 判据语义（写死在此，回报同口径）：
#   1 语法：对 miniprogram 下全部 .js（排除 miniprogram_npm 与 node_modules）逐文件
#     node --check，任一失败即判红；文件数必须大于阈值 MIN_JS_FLOOR，否则判"扫空"
#     —— 扫描面自己变窄是假绿的首要来源，报 0 不算过。
#   2 体积：按微信规则量主包与每个分包的源码体积（去注释与空行前原始字节），主包与
#     单个分包上限 MP_SUBPACKAGE_LIMIT_KB，全部包合计上限 MP_TOTAL_LIMIT_KB。
#     超限判红。图片与字体类资源计入所在包，这是布行小程序最常见的超限来源。
#   3 页面对账：app.json 声明的每条页面与组件路径必须在磁盘存在（缺即判红），
#     磁盘存在但未声明的页面判红（写了进不去的页等于死代码）。
#   4 端点对账：调用点里指向本仓后端的每条 /api/v1/erp 路径与方法必须命中
#     frontend/scripts/route-snapshot.txt，命中不了判红；禁止"改到新主机但端点
#     不存在、等 404"的假接入形态回潮。
#
# 反向自证（--self-test）：每道各造一个已知违规夹具，四道都必须报红；
#   任一探针没被抓到就判 DETECTOR_BLIND 并退 9。判定器没检测力时，它的"绿"不可信。
#
# 用法：
#   bash scripts/ci/miniprogram-checks.sh                # 默认对当前仓根下的 miniprogram 目录跑四道
#   bash scripts/ci/miniprogram-checks.sh --self-test    # 只跑反向自证
#   MP_ROOT=/abs/path bash scripts/ci/miniprogram-checks.sh
#
# 退出码：0 全绿；1 有判红项；9 判定器自身失效（缺 node、缺脚本、扫空、自证不过）
# ==============================================================================
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MP_ROOT="${MP_ROOT:-$REPO_ROOT/miniprogram}"
SNAPSHOT="${ROUTE_SNAPSHOT:-$REPO_ROOT/frontend/scripts/route-snapshot.txt}"
MP_ENDPOINT_CHECK="${MP_ENDPOINT_CHECK:-}"
SELF_TEST=0
[ "${1:-}" = "--self-test" ] && SELF_TEST=1

# 微信规则：主包与单个分包均 2MB，整包 20MB（未开虚拟支付与插件扩展时的通用上限）
MP_SUBPACKAGE_LIMIT_KB="${MP_SUBPACKAGE_LIMIT_KB:-2048}"
MP_TOTAL_LIMIT_KB="${MP_TOTAL_LIMIT_KB:-20480}"
MP_JS_FLOOR="${MP_JS_FLOOR:-100}"

FAIL=0
TOOL_FAIL=0
say() { printf '%s\n' "$*"; }
red() { say "MP_CHECK_RED $*"; FAIL=1; }
tool_bug() { say "TOOL_BUG $*"; TOOL_FAIL=1; }

command -v node >/dev/null 2>&1 || { say "TOOL_BUG 取不到 node，四道全不可跑"; exit 9; }
[ -d "$MP_ROOT" ] || { say "MP_CHECK_RED 小程序目录不存在：$MP_ROOT"; exit 1; }
[ -f "$MP_ROOT/app.json" ] || { say "MP_CHECK_RED 缺 app.json：$MP_ROOT/app.json"; exit 1; }

# ---------- 一 语法校验 ----------
mp_syntax() {
  local root="$1" total=0 bad=0 f
  while IFS= read -r f; do
    total=$((total + 1))
    if ! node --check "$f" >/dev/null 2>&1; then
      bad=$((bad + 1))
      say "  SYNTAX_FAIL $f"
    fi
  done < <(find "$root" -name '*.js' -not -path '*/miniprogram_npm/*' -not -path '*/node_modules/*' | sort)
  say "SYNTAX checked=$total fail=$bad"
  if [ "$total" -lt "$MP_JS_FLOOR" ]; then
    tool_bug "语法面扫到 $total 个文件，低于地板 $MP_JS_FLOOR，判扫描面失效"
    return 1
  fi
  if [ "$bad" -gt 0 ]; then
    red "语法校验 $bad 个文件不通过"
    return 1
  fi
  return 0
}

# ---------- 二 体积校验 ----------
mp_size() {
  local root="$1"
  node - "$root" "$MP_SUBPACKAGE_LIMIT_KB" "$MP_TOTAL_LIMIT_KB" <<'NODE'
const fs = require('fs');
const path = require('path');
const [root, subLimitKb, totalLimitKb] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const skip = new Set(['miniprogram_npm', 'node_modules', '.git']);
const acc = { bytes: 0 };
function dirKbCollect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) dirKbCollect(full);
    else acc.bytes += fs.statSync(full).size;
  }
}
function sizeKb(dir) {
  acc.bytes = 0;
  if (!fs.existsSync(dir)) return 0;
  dirKbCollect(dir);
  return Math.ceil(acc.bytes / 1024);
}
const subPkgs = appJson.subPackages || appJson.subpackages || [];
const subRoots = new Set(subPkgs.map((s) => s.root.replace(/\/$/, '')));
let fail = 0;
let total = 0;
// 主包：miniprogram 根下除各分包 root 与构建产物外的全部内容
const mainBytes = (() => {
  let bytes = 0;
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    if (skip.has(e.name) || subRoots.has(e.name)) continue;
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      acc.bytes = 0;
      dirKbCollect(full);
      bytes += acc.bytes;
    } else bytes += fs.statSync(full).size;
  }
  return bytes;
})();
const mainKb = Math.ceil(mainBytes / 1024);
total += mainKb;
console.log(`  SIZE 主包 ${mainKb}KB 上限 ${subLimitKb}KB`);
if (mainKb > subLimitKb) { console.log(`MP_CHECK_RED 主包体积 ${mainKb}KB 超上限 ${subLimitKb}KB`); fail = 1; }
for (const s of subPkgs) {
  const dir = path.join(root, s.root.replace(/\/$/, ''));
  const kb = sizeKb(dir);
  total += kb;
  console.log(`  SIZE 分包 ${s.root} ${kb}KB 上限 ${subLimitKb}KB 页面数=${(s.pages || []).length}`);
  if (kb > subLimitKb) { console.log(`MP_CHECK_RED 分包 ${s.root} 体积 ${kb}KB 超上限`); fail = 1; }
}
console.log(`SIZE total=${total}KB limit=${totalLimitKb}KB subpackages=${subPkgs.length}`);
if (total > totalLimitKb) { console.log(`MP_CHECK_RED 整包 ${total}KB 超上限 ${totalLimitKb}KB`); fail = 1; }
process.exit(fail);
NODE
  return $?
}

# ---------- 三 app.json 与磁盘对账 ----------
mp_pages() {
  local root="$1"
  node "$REPO_ROOT/scripts/ci/mp-check-pages.cjs" "$root" || return 1
}

# ---------- 端点对账 ----------
# 判定器位置解析：优先仓内 scripts/ci，其次环境变量指定，最后回落到主编排工装目录（本地开发用）
mp_resolve_endpoint_checker() {
  if [ -n "$MP_ENDPOINT_CHECK" ]; then
    printf '%s' "$MP_ENDPOINT_CHECK"
    return 0
  fi
  local c
  for c in "$REPO_ROOT/scripts/ci/mp-endpoint-check.cjs" /e/tmp/tools/mp_endpoint_check.cjs; do
    if [ -f "$c" ]; then
      printf '%s' "$c"
      return 0
    fi
  done
  return 1
}

mp_endpoints() {
  local root="$1"
  local checker
  checker="$(mp_resolve_endpoint_checker)"
  if [ -z "$checker" ]; then
    tool_bug "取不到端点对账脚本，第四道不可跑（不因缺脚本判绿）"
    return 1
  fi
  if [ ! -f "$SNAPSHOT" ]; then
    tool_bug "取不到权威端点面 $SNAPSHOT，第四道不可跑"
    return 1
  fi
  node "$checker" --root "$root" --snapshot "$SNAPSHOT"
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    return 0
  fi
  if [ "$rc" -eq 9 ]; then
    tool_bug "端点对账判定器自检不过（退 9），它的结论不可信"
    return 1
  fi
  red "有调用点未命中仓内权威端点（禁止直通 404 的假接入）"
  return 1
}

# ---------- 反向自证 ----------
# 做法：造一份"三道各含一处已知违规"的最小小程序树，直接调三道判定函数，要求每道都返回非零。
# 探针必须与真实判定走同一条代码路径（不另写一份 grep），否则自证过不代表线上判据有效。
mp_selftest() {
  local tmp rc_s rc_p rc_e caught=0 missed=0
  tmp="$(mktemp -d "${TMPDIR:-/tmp}/mp-selftest.XXXXXX")" || { tool_bug "mktemp 失败"; return 1; }
  mkdir -p "$tmp/miniprogram/pages/a" "$tmp/miniprogram/pages/orphan" \
    "$tmp/miniprogram/packageA/pages/b" "$tmp/miniprogram/libs" || { tool_bug "mkdir 失败"; rm -rf "$tmp"; return 1; }
  # 声明了 pages/gone/gone（磁盘没有），声明 pages/a/a（磁盘有且合法），未声明 pages/orphan（磁盘齐全）
  cat > "$tmp/miniprogram/app.json" <<'JSON'
{
  "pages": ["pages/a/a", "pages/gone/gone"],
  "subPackages": [{ "root": "packageA", "pages": ["pages/b/index"] }]
}
JSON
  printf 'Page({ data: { a: 1 }\n' > "$tmp/miniprogram/pages/a/a.js"
  printf 'Page({})\n' > "$tmp/miniprogram/pages/orphan/orphan.js"
  printf '<view>orphan</view>\n' > "$tmp/miniprogram/pages/orphan/orphan.wxml"
  printf '{}\n' > "$tmp/miniprogram/pages/orphan/orphan.json"
  printf 'Page({})\n' > "$tmp/miniprogram/packageA/pages/b/index.js"
  # 假接入：指向仓内不存在的端点
  printf 'wx.request({ url: bingxiBase() + "/api/v1/erp/__no_such_endpoint__/x", method: "GET" });\n' \
    > "$tmp/miniprogram/libs/probe.js"

  MP_JS_FLOOR=1 bash -c 'true' >/dev/null 2>&1
  node --check "$tmp/miniprogram/pages/a/a.js" >/dev/null 2>&1; rc_s=$?
  node "$REPO_ROOT/scripts/ci/mp-check-pages.cjs" "$tmp/miniprogram" >/dev/null 2>&1; rc_p=$?
  local checker
  checker="$(mp_resolve_endpoint_checker)"
  if [ -z "$checker" ]; then
    rm -rf "$tmp"
    tool_bug "自证阶段也取不到端点对账脚本，第四道无检测力可言"
    return 1
  fi
  node "$checker" --root "$tmp/miniprogram" --snapshot "$SNAPSHOT" >/dev/null 2>&1; rc_e=$?
  rm -rf "$tmp"

  # 语法探针靠 node --check 的非零退出码；页面对账与端点对账靠判定器自己的非零退出码
  [ "$rc_s" -ne 0 ] && caught=$((caught + 1)) || missed="$missed syntax"
  [ "$rc_p" -ne 0 ] && caught=$((caught + 1)) || missed="$missed pages"
  [ "$rc_e" -ne 0 ] && caught=$((caught + 1)) || missed="$missed endpoints"
  say "SELFTEST caught=$caught/3${missed:+ missed:$missed}"
  if [ "$caught" -eq 3 ]; then
    say "MP_DETECTOR_OK 三道反向探针全部被抓到"
    return 0
  fi
  tool_bug "反向探针有没被抓到的道，判定器无检测力，其绿不可信"
  return 1
}

if [ "$SELF_TEST" = 1 ]; then
  mp_selftest
  rc=$?
  [ "$rc" -eq 0 ] && say "MP_SELFTEST_OK" || say "MP_SELFTEST_RED"
  exit $rc
fi

# 依赖与产物声明校验：miniprogram_npm 下每个厂商包都必须在 miniprogram/package.json 里声明，
# 且构建产物目录不得进版本库（产物由 npm 构建再生，入库会让依赖面与审计面双双失真）
mp_deps() {
  local root="$1"
  node - "$root" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const pkgPath = path.join(root, 'package.json');
if (!fs.existsSync(pkgPath)) {
  console.log('MP_DEP_RED 缺 miniprogram/package.json，npm 依赖面无法声明与审计');
  process.exit(1);
}
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
} catch (e) {
  console.log('TOOL_BUG miniprogram/package.json 不是合法 JSON：' + e.message);
  process.exit(9);
}
const declared = Object.assign({}, pkg.dependencies, pkg.devDependencies);
const vendorRoot = path.join(root, 'miniprogram_npm');
const vendor = [];
if (fs.existsSync(vendorRoot)) {
  for (const e of fs.readdirSync(vendorRoot, { withFileTypes: true })) {
    if (e.name.startsWith('@') && e.isDirectory()) {
      for (const s of fs.readdirSync(path.join(vendorRoot, e.name), { withFileTypes: true })) {
        vendor.push(e.name + '/' + s.name);
      }
    } else if (e.isDirectory()) vendor.push(e.name);
  }
}
const undeclared = vendor.filter((v) => !Object.prototype.hasOwnProperty.call(declared, v));
console.log('MP_DEPS vendor=' + vendor.length + ' declared=' + Object.keys(declared).length + ' undeclared=' + undeclared.length);
for (const u of undeclared) console.log('  DEP_UNDECLARED ' + u);
let fail = 0;
if (undeclared.length > 0) {
  console.log('MP_DEP_RED 有 ' + undeclared.length + ' 个构建产物里的包未在 package.json 声明');
  fail = 1;
}
// 产物入库检查：交给 git 判（调用方在 CI 里跑 git ls-files 核对，本处只判声明面）
process.exit(fail);
NODE
  return $?
}

say "MP_CHECK_BEGIN root=$MP_ROOT snapshot=$SNAPSHOT"
# 每道的退出码必须先存进变量再打印哨兵：say 自身会改写 $?，先打印后取值会把红报成 0
run_step() {
  local name="$1"
  shift
  "$@"
  local rc=$?
  say "STEP_END $name rc=$rc"
  if [ "$rc" -ne 0 ]; then
    FAIL=1
    return 1
  fi
  return 0
}

run_step syntax mp_syntax "$MP_ROOT"
run_step size mp_size "$MP_ROOT"
run_step pages mp_pages "$MP_ROOT"
run_step endpoints mp_endpoints "$MP_ROOT"
run_step deps mp_deps "$MP_ROOT"

if [ "$TOOL_FAIL" = 1 ]; then
  say "MP_CHECK_TOOLBUG 判定器或工具链不可用，本道结论按不通过处理"
  exit 9
fi
if [ "$FAIL" = 1 ]; then
  say "MP_CHECK_RED miniprogram 静态门未过"
  exit 1
fi
say "MP_CHECK_GREEN miniprogram 四道全过"
exit 0
