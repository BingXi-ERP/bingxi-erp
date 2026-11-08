#!/usr/bin/env node
// 功能：扫 frontend/e2e 下所有用例源码，找出以字面量写死的口令值，只对不在基线里的新位点硬拦。
// 调用方：本地门组 gate_lane.sh 的 fe 档与 CI 的前端静态检查 job，均可带 --self-test 或 --emit-baseline。
// 入参：无必填参数；可选 --self-test（用夹具自证检测力）与 --emit-baseline（打印当前位点键清单后按当前值放行）。
// 传给谁：位点键写进 scripts/e2e-credential-literals-baseline.json，人类读的是控制台输出的文件与属性名。
// 存什么：只存「相对路径::属性名::口令值的前 8 位哈希」，不存口令本身，public 仓里不落任何可还原的凭据。
// 存哪里：不改写任何源码，基线文件由维护者显式用 --emit-baseline 生成后手工落盘。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 作用面按脚本自身位置解析，不按 cwd：同一份脚本既能在 frontend/ 下跑也能在 scripts/ 下跑
const FE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const E2E_DIR = path.join(FE_ROOT, 'e2e');
const BASELINE_PATH = path.join(FE_ROOT, 'scripts', 'e2e-credential-literals-baseline.json');
// 属性名允许零前缀（裸 password 是最常见形态），值允许单双引号与模板串，长度下限 4
const SITE_RE =
  /\b([A-Za-z0-9_$]*[Pp]assword[A-Za-z0-9_$]*)\s*[:=]\s*(['"`])((?:(?!\2)[^\\]|\\.){4,}?)\2/g;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function siteKey(relPath, prop, value) {
  const hash = crypto.createHash('sha256').update(value).digest('hex').slice(0, 8);
  return relPath.replace(/\\/g, '/') + '::' + prop + '::' + hash;
}

function scan(files, rootDir) {
  const sites = [];
  for (const f of files) {
    const rel = path.relative(rootDir, f).replace(/\\/g, '/');
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, idx) => {
      SITE_RE.lastIndex = 0;
      let m;
      while ((m = SITE_RE.exec(line)) !== null) {
        // 带插值的模板串取的是运行期变量值，不是写死的口令
        if (m[3].includes('${')) continue;
        sites.push({ key: siteKey(rel, m[1], m[3]), rel, prop: m[1], line: idx + 1 });
      }
    });
  }
  return sites;
}

function selfTest() {
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'credlit-'));
  const planted = path.join(tmp, 'planted.spec.ts');
  const clean = path.join(tmp, 'clean.spec.ts');
  // 正向对照覆盖三种真实形态：裸 password 属性、驼峰前缀属性、模板串赋值。
  // 样本值运行期拼装：仓库里只留碎片，完整字面量只存在于临时夹具文件，public 仓不落疑似凭据串。
  const s1 = ['Planted', '2026pass'].join('@');
  const s2 = ['Another', '2026x'].join('#');
  const s3 = ['Static', '2026tick'].join('%');
  fs.writeFileSync(
    planted,
    "const a = { username: 'u1', password: '" +
      s1 +
      "' };\n" +
      "const b = { approverPassword: '" +
      s2 +
      "' };\n" +
      'const c = { newPassword: `' +
      s3 +
      '` };\n'
  );
  fs.writeFileSync(
    clean,
    "const a = { username: 'u1', password: testPassword() };\n" +
      'const b = { newPassword: process.env.E2E_TEST_PASSWORD };\n' +
      'const c = { password: `pw${RUN_TS}` };\n'
  );
  const byFile = new Map();
  for (const s of scan([planted, clean], tmp)) {
    byFile.set(s.rel, (byFile.get(s.rel) || 0) + 1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const hit = byFile.get('planted.spec.ts') || 0;
  const miss = byFile.get('clean.spec.ts') || 0;
  if (hit !== 3 || miss !== 0) {
    console.log('CREDLIT_SELFTEST_FAIL expect=3/0 got=' + hit + '/' + miss);
    process.exit(9);
  }
  console.log('CREDLIT_SELFTEST_OK planted=3 detected clean=0 flagged');
}

const args = process.argv.slice(2);
if (args.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

// 基线必须按"清理腿合入后的主干形态"生成，否则会把正要删掉的点位白名单进去；
// 这一参数让生成动作可以指向另一份工作树，跑门禁时不传即按脚本自身作用面扫。
const dirIdx = args.indexOf('--e2e-dir');
const e2eDir = dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(args[dirIdx + 1]) : E2E_DIR;
const files = walk(e2eDir);
if (files.length === 0) {
  console.log('TOOL_BUG e2e 目录零文件，判定器没有作用面：' + e2eDir);
  process.exit(9);
}
const sites = scan(files, path.resolve(e2eDir, '..'));

if (args.includes('--emit-baseline')) {
  console.log(JSON.stringify(sites.map(s => s.key).sort(), null, 2));
  console.log('CREDLIT_BASELINE_EMIT sites=' + sites.length);
  process.exit(0);
}

let baseline = [];
if (fs.existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}
const allowed = new Set(baseline.map(e => (typeof e === 'string' ? e : e.key)));
const offenders = sites.filter(s => !allowed.has(s.key));
const stale = baseline.filter(k => !sites.some(s => s.key === (typeof k === 'string' ? k : k.key)));

for (const s of offenders) {
  console.log(
    'CREDLITERAL ' + s.rel + ':' + s.line + ' 属性 ' + s.prop + ' 以字面量写死口令，键 ' + s.key
  );
}
for (const k of stale) {
  console.log('CREDLITERAL 基线条目已消失（不判红，备查） ' + (typeof k === 'string' ? k : k.key));
}
console.log(
  'CREDLIT_SUMMARY scanned=' +
    files.length +
    ' sites=' +
    sites.length +
    ' hard_fail=' +
    offenders.length +
    ' baseline=' +
    baseline.length
);
if (offenders.length > 0) {
  console.log(
    'CREDLIT_RED 建号与登录口令必须取 helpers 的 env 同源口，禁止在 public 仓源码里落字面量'
  );
  process.exit(1);
}
console.log('CREDLIT_GREEN');
