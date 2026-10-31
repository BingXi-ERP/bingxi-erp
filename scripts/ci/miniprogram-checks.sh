#!/usr/bin/env bash
# ==============================================================================
# scripts/ci/miniprogram-checks.sh
#
# 用途：微信小程序面的静态门（云端 CI 与本地共用同一份判据，防"本地能过 CI 红"）。
#       覆盖七道：JS 语法校验、代码包体积校验（微信分包上限）、app.json 与磁盘页面
#       一一对账、调用点与本仓权威端点面对账、npm 依赖声明面、入库面凭据与主机暴露、
#       跳转路由字面量可解析性。
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
#   5 依赖声明：miniprogram_npm 下每个厂商包必须在 miniprogram/package.json 声明。
#   6 暴露面：git 可见面不得含公网 IP 字面量与服务端凭据字面量，手机号只点名不判红。
#   7 路由对账：源码 url 语境里以 /pages/ 或 /package加字母/ 开头的字面量必须落在
#     app.json 声明集内，等值命中或按段边界前缀命中（动态拼接）都算解析成功，
#     前缀放行逐条打印并计数；未命中逐条点名文件与行号并判红。带查询串的字面量
#     路径部分已写完，只许等值命中，否则 /packageA/pages/web?url= 这类真死链会被放过。
#
# 反向自证（--self-test）：每道各造已知违规夹具，全部必须报红；第七道另配绿向夹具，
#   要求等值放行与动态前缀放行两种口径都真的判绿。任一探针没被抓到就判 DETECTOR_BLIND
#   并退 9。判定器没检测力时，它的"绿"不可信。
#
# 用法：
#   bash scripts/ci/miniprogram-checks.sh                # 默认对当前仓根下的 miniprogram 目录跑七道
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
MP_EXPOSURE_FLOOR="${MP_EXPOSURE_FLOOR:-100}"
MP_ROUTE_FLOOR="${MP_ROUTE_FLOOR:-100}"

FAIL=0
TOOL_FAIL=0
say() { printf '%s\n' "$*"; }
red() { say "MP_CHECK_RED $*"; FAIL=1; }
tool_bug() { say "TOOL_BUG $*"; TOOL_FAIL=1; }

command -v node >/dev/null 2>&1 || { say "TOOL_BUG 取不到 node，七道全不可跑"; exit 9; }
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
  # 暴露面：公网 IP 字面量与服务端凭据字面量（203.0.113.0/24 是文档保留段，只用于夹具）
  printf 'module.exports = { bingxiHost: "https://203.0.113.10", appSecret: "abcdef0123456789" };\n' \
    > "$tmp/miniprogram/envConfig.js"

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
  # 暴露面用夹具自己的地板：小夹具只有几个文件，沿用生产地板会被"扫面过窄"抢先判 9，
  # 那样抓到的是地板而不是泄露点，自证就成了假证
  MP_EXPOSURE_FLOOR=2 mp_exposure "$tmp/miniprogram" >/dev/null 2>&1; rc_x=$?
  rm -rf "$tmp"

  # 第五道双向探针：暴露面判的是 git 可见面，不是文件系统。正反两侧必须同轮验住，
  # 因为只验正侧会放过"把扫描面收成零文件"的假绿，只验反侧会放过"入库面漏扫"的假红。
  # 正侧 入库文件带公网 IP 必判红 退 1；反侧 同一 IP 移进被 gitignore 的本地真值必判绿 退 0
  local gtmp rc_g1 rc_g2
  gtmp="$(mktemp -d "${TMPDIR:-/tmp}/mp-selftest-git.XXXXXX")" || { tool_bug "mktemp 失败"; return 1; }
  mkdir -p "$gtmp/miniprogram"
  printf 'module.exports = { bingxiHost: "https://203.0.113.10" };\n' > "$gtmp/miniprogram/envConfig.js"
  if git -C "$gtmp" init -q >/dev/null 2>&1 && git -C "$gtmp" status >/dev/null 2>&1; then
    printf '/miniprogram/mpHost.local.js\n' > "$gtmp/.gitignore"
    MP_EXPOSURE_FLOOR=1 mp_exposure "$gtmp/miniprogram" >/dev/null 2>&1; rc_g1=$?
    printf 'module.exports = { bingxiHost: require("./mpHost.local.js").host };\n' > "$gtmp/miniprogram/envConfig.js"
    printf 'module.exports = { host: "https://203.0.113.10" };\n' > "$gtmp/miniprogram/mpHost.local.js"
    MP_EXPOSURE_FLOOR=1 mp_exposure "$gtmp/miniprogram" >/dev/null 2>&1; rc_g2=$?
    if [ "$rc_g1" -eq 1 ] && [ "$rc_g2" -eq 0 ]; then
      caught=$((caught + 1))
    else
      missed="$missed exposure_scope(tracked=$rc_g1 ignored=$rc_g2)"
    fi
  else
    missed="$missed exposure_git夹具建不起来"
  fi
  rm -rf "$gtmp"

  # 第七道双向探针 同一棵临时树先跑绿侧再跑红侧，两侧调 mp_routes 同一谓词，不另写夹具专用分支。
  # 绿侧要求等值命中与动态前缀拼接两种放行都真的发生（计数行里 exactOk 与 prefixOk 都得为 1），
  #   否则"绿"可能来自扫空；红侧要求两条死链逐条被点名（dead=2）且退出码恰为 1，
  #   退 9 属于地板或谓词失效，不算抓到死链。
  # 红侧第一条刻意写成 /packageA/pages/b?x=1 形态，它是声明页 /packageA/pages/b/index 的前缀，
  #   若实现把带查询串的字面量也当前缀放行，这条夹具就判不出红，自证当场失效
  local rtmp routeg routered rc_route_g rc_route_r
  rtmp="$(mktemp -d "${TMPDIR:-/tmp}/mp-selftest-route.XXXXXX")" || { tool_bug "mktemp 失败"; return 1; }
  mkdir -p "$rtmp/miniprogram/pages/a" "$rtmp/miniprogram/packageA/pages/b" "$rtmp/miniprogram/libs" \
    || { tool_bug "mkdir 失败"; rm -rf "$rtmp"; return 1; }
  cat > "$rtmp/miniprogram/app.json" <<'JSON'
{
  "pages": ["pages/a/a"],
  "subPackages": [{ "root": "packageA/", "pages": ["pages/b/index"] }]
}
JSON
  printf 'Page({})\n' > "$rtmp/miniprogram/pages/a/a.js"
  printf 'Page({})\n' > "$rtmp/miniprogram/packageA/pages/b/index.js"
  cat > "$rtmp/miniprogram/libs/green.js" <<'JS'
Page({
  toExact: function () {
    wx.navigateTo({ url: "/pages/a/a?name=1" });
  },
  toDynamic: function (name) {
    wx.navigateTo({ url: "/packageA/pages/".concat(name, "/index") });
  },
});
JS
  routeg="$(MP_ROUTE_FLOOR=3 mp_routes "$rtmp/miniprogram" 2>&1)"; rc_route_g=$?
  say "$routeg"
  cat > "$rtmp/miniprogram/libs/dead.js" <<'JS'
Page({
  toQuery: function () {
    wx.navigateTo({ url: "/packageA/pages/b?x=1" });
  },
  toPlain: function () {
    wx.switchTab({ url: "/pages/component/index" });
  },
});
JS
  routered="$(MP_ROUTE_FLOOR=3 mp_routes "$rtmp/miniprogram" 2>&1)"; rc_route_r=$?
  say "$routered"
  rm -rf "$rtmp"

  if [ "$rc_route_g" -eq 0 ] && printf '%s\n' "$routeg" | grep -q 'exactOk=1' \
    && printf '%s\n' "$routeg" | grep -q 'prefixOk=1'; then
    caught=$((caught + 1))
  else
    missed="$missed routes绿向(rc=$rc_route_g)"
  fi
  if [ "$rc_route_r" -eq 1 ] && printf '%s\n' "$routered" | grep -q 'dead=2'; then
    caught=$((caught + 1))
  else
    missed="$missed routes红向(rc=$rc_route_r)"
  fi

  # 语法探针靠 node --check 的非零退出码；页面对账与端点对账靠判定器自己的非零退出码；
  # 暴露面必须恰好退 1（判红），退 9 说明是地板误伤，不算抓到泄露
  [ "$rc_s" -ne 0 ] && caught=$((caught + 1)) || missed="$missed syntax"
  [ "$rc_p" -ne 0 ] && caught=$((caught + 1)) || missed="$missed pages"
  [ "$rc_e" -ne 0 ] && caught=$((caught + 1)) || missed="$missed endpoints"
  [ "$rc_x" -eq 1 ] && caught=$((caught + 1)) || missed="$missed exposure(rc=$rc_x)"
  say "SELFTEST caught=$caught/7${missed:+ missed:$missed}"
  if [ "$caught" -eq 7 ]; then
    say "MP_DETECTOR_OK 七道反向探针全部被抓到"
    return 0
  fi
  tool_bug "反向探针有没被抓到的道，判定器无检测力，其绿不可信"
  return 1
}

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

# 暴露面点名校验：小程序面不得把真实服务器地址与后端凭据写进源码。
# 判红两类：一是公网 IPv4 字面量（微信"request 合法域名"本就只收备案域名，
#   写 IP 既是最常见的攻击面泄露，也让真机联调只能靠开发者工具"不校验合法域名"
#   才能通，等于把生产 IP 永久钉死在客户端里）；二是 appsecret / private key
#   这类服务端凭据字面量（小程序包可被任意解出，写进去等于公开）。
# 手机号只点名不判红：客服号是给客户看的界面文案，属正常内容，判红会逼人删掉
#   真实可用的联系入口；此处如实报告，交人判。
mp_exposure() {
  local root="$1"
  node - "$root" "$MP_EXPOSURE_FLOOR" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const floor = Number(process.argv[3]);
const skip = new Set(['miniprogram_npm', 'node_modules', '.git']);
const exts = new Set(['.js', '.wxs', '.json', '.wxml', '.wxss', '.md', '.html']);
// 私网与保留段不算泄露：10/127/0/169.254/192.0.0/192.168/172.16-31 与全 0
const PRIV = /^(?:10\.|127\.|0\.|169\.254\.|192\.0\.0\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const IPV4 = /(?<![\w.])(\d{1,3}\.){3}\d{1,3}(?![\w.])/g;
const SECRET_KEY = /(?:app_?secret|appsecret|private_?key|access_?key_?secret|secret_?key)\s*[:=]\s*['"]([^'"]{8,})['"]/i;
const PHONE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const files = [];
// 扫描面取 git 可见面而非文件系统：本道判的是「会不会把泄露物推进公开仓库」，而 gitignore
//   排除的本地真值（如 miniprogram/mpHost.local.js 里的后端主机）永不进仓库，CI 检出里也
//   根本没有该文件。按文件系统走会让「本地能跑」与「本地全绿」互斥，逼人把真值写回仓库面。
// 取不到 git 时退回文件系统全扫并点名退回，退回态的 scanned 仍受地板约束，不静默放宽。
let scope = 'git';
let gitFiles = null;
try {
  const { execFileSync } = require('child_process');
  gitFiles = execFileSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
    .split('\0')
    .filter((p) => p.length > 0);
} catch (e) {
  scope = 'filesystem';
}
if (scope === 'git') {
  for (const rel of gitFiles) {
    const base = rel.split('/').pop();
    if (rel.split('/').some((seg) => skip.has(seg))) continue;
    if (!exts.has(path.extname(base))) continue;
    const full = path.join(root, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) files.push(full);
  }
} else {
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (exts.has(path.extname(e.name))) files.push(full);
    }
  })(root);
}
const ipHits = [];
const secretHits = [];
const phoneHits = [];
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.match(IPV4) || []) {
      const parts = m.split('.');
      const octetsOk = parts.every((p) => Number(p) <= 255);
      if (octetsOk && !PRIV.test(m) && /^(\d{1,3}\.){3}\d{1,3}$/.test(m)) {
        ipHits.push(rel + ':' + (i + 1) + ' ' + m);
      }
    }
    const sm = line.match(SECRET_KEY);
    if (sm) secretHits.push(rel + ':' + (i + 1) + ' 键值形如 ' + sm[0].slice(0, 24) + '…');
    for (const p of line.match(PHONE) || []) phoneHits.push(rel + ':' + (i + 1) + ' ' + p);
  });
}
console.log(
  'MP_EXPOSURE scanned=' +
    files.length +
    ' scope=' +
    scope +
    ' publicIp=' +
    ipHits.length +
    ' secretLiteral=' +
    secretHits.length +
    ' phoneLiteral=' +
    phoneHits.length
);
if (scope === 'filesystem') {
  console.log('MP_EXPOSURE_NOTE scope=filesystem 取不到 git，本轮按文件系统全扫，泄露面只会判宽不会判窄');
}
if (files.length < floor) {
  console.log('TOOL_BUG 暴露面扫描只看到 ' + files.length + ' 个文件，低于地板 ' + floor + '，其"零命中"不可信');
  process.exit(9);
}
for (const h of ipHits) console.log('  EXPOSURE_PUBLIC_IP ' + h);
for (const h of secretHits) console.log('  EXPOSURE_SECRET ' + h);
for (const h of phoneHits) console.log('  EXPOSURE_NOTE_PHONE ' + h + '（界面文案可接受，仅点名）');
let fail = 0;
if (ipHits.length > 0) { console.log('MP_EXPOSURE_RED 有 ' + ipHits.length + ' 处公网 IP 字面量，须改为微信备案域名并由单点配置提供'); fail = 1; }
if (secretHits.length > 0) { console.log('MP_EXPOSURE_RED 有 ' + secretHits.length + ' 处服务端凭据字面量，小程序包内不得携带'); fail = 1; }
process.exit(fail);
NODE
  return $?
}

# 跳转路由字面量可解析性校验：源码里写死的跳转路径必须落在 app.json 声明集内。
# 功能 拦住两类真实故障，一是页面改名或分包搬家后引用方漏改，二是入口指向从未迁入本仓的页面
#   （点击后微信报 page not found，用户什么都不发生），后者尤其不能被当成健康。
# 调用方 主流程 run_step routes 与 mp_selftest 的第七道双向夹具，两处都调本函数，谓词只有一份。
# 入参 root 小程序根目录，须含 app.json，绝对或相对路径均可；扫描面为其下全部 .js 与 .wxml，
#   排除 miniprogram_npm 与 node_modules；文件数低于 MP_ROUTE_FLOOR 判扫空，抽到 0 条字面量判
#   谓词失效，两者都退 9 而不是退 0。
# 传给谁 计数行 MP_ROUTES 与明细行 ROUTE_PREFIX_OK 与 ROUTE_DEAD 进门禁日志，判红时由主流程
#   末行 MP_CHECK_RED 点名，不落任何基线文件。
# 存什么 不持久化任何数据，只读源码与 app.json 做静态对账。
# 存哪里 无落盘，判定口径写死在本函数与本段注释。
# 抽取口径 只认 url 后紧跟的字符串字面量，单引号双引号反引号三种都收，且只认以 /pages/ 或
#   /package加字母/ 开头的绝对路径；相对路径与变量整体拼接不在本道范围。
# 命中口径 字面量带问号或井号者，其路径部分已是完整值，必须等值命中声明页；不带问号者允许
#   是某条声明路由的前缀，即动态拼接场景，但前缀必须在段边界断开，且模板占位符 ${ 之前的部分
#   同样受段边界约束。前缀放行逐条打印并计数，不静默吞。
mp_routes() {
  local root="$1" out rc
  out="$(node - "$root" "$MP_ROUTE_FLOOR" <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.argv[2];
const floor = Number(process.argv[3]);
const appJsonPath = path.join(root, 'app.json');
if (!fs.existsSync(appJsonPath)) {
  console.log('TOOL_BUG 缺 app.json，第七道不可跑');
  process.exit(9);
}
let appJson;
try {
  appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
} catch (e) {
  console.log('TOOL_BUG app.json 不是合法 JSON，第七道不可跑 ' + e.message);
  process.exit(9);
}
// 归一化 去首尾斜杠并把连续斜杠折叠，分包 root 带尾斜杠与双斜杠都能并进同一集合
const norm = (s) => String(s).replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/{2,}/g, '/');
const declared = new Set();
for (const p of appJson.pages || []) declared.add('/' + norm(p));
for (const s of appJson.subPackages || appJson.subpackages || []) {
  const r = norm(s.root || '');
  for (const p of s.pages || []) declared.add('/' + (r ? r + '/' + norm(p) : norm(p)));
}
const declaredList = [...declared];
const skip = new Set(['miniprogram_npm', 'node_modules', '.git']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith('.js') || e.name.endsWith('.wxml')) files.push(full);
  }
})(root);
const URL_RE = /url\s*[:=]\s*(['"`])([^'"`]*)\1/g;
const ABSOLUTE = /^\/(?:pages|package[A-Za-z])\//;
// 段边界成立 前缀自身以斜杠收尾，或声明路由在断点处仍是斜杠，能挡住截半段的假前缀
function prefixHit(probe) {
  if (!probe || probe === '/') return null;
  for (const d of declaredList) {
    if (!d.startsWith(probe)) continue;
    if (probe.endsWith('/') || d[probe.length] === '/') return d;
  }
  return null;
}
let literals = 0;
let exactOk = 0;
const prefixOk = [];
const dead = [];
for (const f of files) {
  const rel = path.relative(root, f).replace(/\\/g, '/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(line)) !== null) {
      const raw = m[2];
      if (!ABSOLUTE.test(raw)) continue;
      literals += 1;
      const where = rel + ':' + (i + 1) + ' ' + raw;
      const terminated = /[?#]/.test(raw);
      const cut = raw.split(/[?#]/)[0];
      if (declared.has(cut)) {
        exactOk += 1;
        continue;
      }
      // 带查询串说明路径部分已写完，再当前缀放行就等于放过 /packageA/pages/web?url= 这类真死链
      if (terminated) {
        dead.push(where + ' 落点未声明，带查询串的字面量按完整路径要求等值命中');
        continue;
      }
      const dollar = raw.indexOf('${');
      const probe = dollar >= 0 ? raw.slice(0, dollar) : raw;
      const hit = prefixHit(probe);
      if (hit) {
        prefixOk.push(where + ' 前缀命中 ' + hit + (dollar >= 0 ? ' 模板占位截断' : ' 动态拼接'));
        continue;
      }
      dead.push(where + ' 落点未声明，等值与前缀两种口径都命不中');
    }
  });
}
console.log(
  'MP_ROUTES scanned=' +
    files.length +
    ' declared=' +
    declared.size +
    ' urlLiterals=' +
    literals +
    ' exactOk=' +
    exactOk +
    ' prefixOk=' +
    prefixOk.length +
    ' dead=' +
    dead.length
);
if (files.length < floor) {
  console.log('TOOL_BUG 路由面只扫到 ' + files.length + ' 个文件，低于地板 ' + floor + '，其"零死链"不可信');
  process.exit(9);
}
if (literals === 0) {
  console.log('TOOL_BUG 路由面扫到 ' + files.length + ' 个文件却抽到 0 条 url 字面量，抽取谓词失效');
  process.exit(9);
}
for (const h of prefixOk) console.log('  ROUTE_PREFIX_OK ' + h);
for (const d of dead) console.log('  ROUTE_DEAD ' + d);
if (dead.length > 0) {
  console.log('MP_ROUTE_RED 有 ' + dead.length + ' 处跳转路由落不到 app.json 声明页');
  process.exit(1);
}
console.log('MP_ROUTE_OK urlLiterals=' + literals + ' exactOk=' + exactOk + ' prefixOk=' + prefixOk.length);
process.exit(0);
NODE
)"
  rc=$?
  [ -n "$out" ] && printf '%s\n' "$out"
  # 判定器退 9 是它自己失效（app.json 不可读、扫空、抽到零条字面量），必须走 TOOL_BUG 通道，
  # 不能混进普通判红，否则末行哨兵会把"结论不可信"报成"有死链"
  if [ "$rc" -eq 9 ]; then
    tool_bug "路由对账判定器自身失效，第七道结论按不可信处理"
    return 1
  fi
  if [ "$rc" -ne 0 ]; then
    red "有跳转路由字面量落不到 app.json 声明页"
    return 1
  fi
  return 0
}

if [ "$SELF_TEST" = 1 ]; then
  mp_selftest
  rc=$?
  [ "$rc" -eq 0 ] && say "MP_SELFTEST_OK" || say "MP_SELFTEST_RED"
  exit $rc
fi

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
run_step exposure mp_exposure "$MP_ROOT"
run_step routes mp_routes "$MP_ROOT"

if [ "$TOOL_FAIL" = 1 ]; then
  say "MP_CHECK_TOOLBUG 判定器或工具链不可用，本道结论按不通过处理"
  exit 9
fi
if [ "$FAIL" = 1 ]; then
  say "MP_CHECK_RED miniprogram 静态门未过"
  exit 1
fi
say "MP_CHECK_GREEN miniprogram 七道全过"
exit 0
