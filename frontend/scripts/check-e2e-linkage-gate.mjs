#!/usr/bin/env node
// 联动影响矩阵门禁：校验矩阵结构完整性（fail-closed）并报告本支变更的受影响链路与应回归用例。
// 调用方：.github/workflows/e2e-linkage-gate.yml 的 pull_request 腿；本地推送前人工执行；
//         --self-test 由同一文件跑内置正向对照，证明判定器有检测力。
// 入参：位置参数为仓库相对变更文件路径；--changed-from <ref> 从该 ref 到 HEAD 的 git diff 取变更；
//       --matrix <path> 覆盖矩阵文件（自证注入损坏矩阵用）；--self-test 跑夹具并核对命中数；
//       --json 以机器可读形式输出结论；--specs-out <path> 把受影响 spec 清单写到调用方指定路径。
// 传给谁：只写标准输出与退出码：0=绿（含仅报告）、1=矩阵完整性破坏判红、2=工具或矩阵故障未验证；
//       CI 按退出码判负，报告正文供 step summary 采信，不回调任何服务。
// 存什么：默认不写仓内文件；仅 --specs-out 明确指定时写清单，正向对照夹具只在内存构造。
// 存哪里：无持久化；唯一读源是 frontend/scripts/e2e-linkage-matrix.json。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const MATRIX_FILE = path.join(HERE, 'e2e-linkage-matrix.json');
const CHAIN_ORDER = ['sale-to-cash', 'purchase-to-pay', 'outsource-to-cost', 'returns-to-report'];
const SELF_CHECKS = 7;
const say = line => process.stdout.write(line + '\n');
const wantsJson = () =>
  process.argv.slice(2).some(arg => arg === '--json' || arg.startsWith('--json='));

function normalize(raw) {
  return String(raw).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function orderChains(ids) {
  const rank = id => {
    const i = CHAIN_ORDER.indexOf(id);
    return i === -1 ? CHAIN_ORDER.length : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

// 规则命中真实性：modules[].match 拼错时矩阵结构照样合法、却永不触发，是静默假绿。
// 只扫判定相关的四棵源树并剪掉依赖产物，避免 CI 安装 node_modules 后遍历爆炸。
function repoFileList(diskRoot) {
  const out = [];
  const skip = new Set([
    'node_modules',
    '.git',
    'dist',
    'coverage',
    'test-results',
    'playwright-report',
  ]);
  const walk = dir => {
    let ents;
    try {
      ents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name));
      } else {
        out.push(path.relative(diskRoot, path.join(dir, e.name)).split(path.sep).join('/'));
      }
    }
  };
  for (const sub of ['backend/src', 'frontend/src', 'frontend/e2e', 'frontend/scripts']) {
    walk(path.join(diskRoot, sub));
  }
  return out;
}

// 完整性判定：矩阵结构损坏意味着"该跑的联动用例"无从谈起，必须 fail-closed。
// 每条红都点名到具体对象，禁止只报一个总数掩盖是哪条链断了。
function integrity(matrix, diskRoot) {
  const reds = [];
  if (
    !matrix ||
    !Array.isArray(matrix.modules) ||
    !matrix.chains ||
    typeof matrix.chains !== 'object'
  ) {
    return ['矩阵结构缺 modules 数组或 chains 对象'];
  }
  if (matrix.modules.length === 0) reds.push('矩阵 modules 为空，联动约束被整体拆掉');
  const chainIds = Object.keys(matrix.chains);
  if (chainIds.length === 0) reds.push('矩阵 chains 为空，联动链路被整体拆掉');
  for (const [id, chain] of Object.entries(matrix.chains)) {
    if (!chain || !Array.isArray(chain.specs) || chain.specs.length === 0) {
      reds.push(`链路 ${id} 无 specs，命中后无用例可跑`);
      continue;
    }
    for (const spec of chain.specs) {
      if (typeof spec !== 'string' || spec.length === 0) {
        reds.push(`链路 ${id} 含空 spec 路径`);
        continue;
      }
      if (!existsSync(path.join(diskRoot, normalize(spec)))) {
        reds.push(`链路 ${id} 的 spec 不存在：${normalize(spec)}`);
      }
    }
  }
  for (const rule of matrix.modules) {
    if (!rule || typeof rule.match !== 'string' || !Array.isArray(rule.chains)) {
      reds.push(`模块规则结构非法：${JSON.stringify(rule)}`);
      continue;
    }
    for (const id of rule.chains) {
      if (!Object.prototype.hasOwnProperty.call(matrix.chains, id)) {
        reds.push(`模块规则 ${rule.match} 引用未定义链路：${id}`);
      }
    }
  }
  // 规则命中真实性：match 拼错时矩阵结构照样合法、却永不触发，属静默假绿，fail-closed 判红。
  const repoFiles = repoFileList(diskRoot);
  for (const rule of matrix.modules) {
    if (!rule || typeof rule.match !== 'string') continue;
    if (!repoFiles.some(f => f.includes(rule.match))) {
      reds.push(`模块规则 ${rule.match} 在当前仓库零命中（路径拼错或模块已下线），须修正矩阵`);
    }
  }
  return reds;
}

// 影响面计算：与报告工具同口径（按子串命中规则），但在本文件内独立实现，
// 避免"用被测产物证明被测产物"的自比假绿。
function impact(changed, matrix) {
  const hitRules = new Set();
  const hitChains = new Set();
  for (const rule of matrix.modules) {
    if (!rule || typeof rule.match !== 'string' || !Array.isArray(rule.chains)) continue;
    if (changed.some(p => p.includes(rule.match))) {
      hitRules.add(rule.match);
      for (const id of rule.chains) hitChains.add(id);
    }
  }
  const chains = orderChains([...hitChains]);
  const specs = [];
  for (const id of chains) for (const spec of matrix.chains[id].specs) specs.push(normalize(spec));
  return { hitRules: [...hitRules], chains, specs: [...new Set(specs)] };
}

function changedFrom(ref) {
  const out = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', `${ref}...HEAD`, '--'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  return out.split('\0').filter(Boolean).map(normalize);
}

function report(matrix, changed, affected, reds, unverified) {
  say('联动影响矩阵静态检查（结构校验与影响面报告）');
  say('E2E_EXECUTION=NOT_RUN，本检查未执行业务 E2E');
  say(`变更文件：${changed.length} 个`);
  say(
    `命中模块规则：${affected.hitRules.length} 条${affected.hitRules.length ? '：' + affected.hitRules.join('、') : ''}`
  );
  say(
    `受影响链路：${affected.chains.length} 条${affected.chains.length ? '：' + affected.chains.join('、') : '（无已知联动链路）'}`
  );
  for (const id of affected.chains) {
    say(`  链路 ${id} 应回归用例：`);
    for (const spec of matrix.chains[id].specs) say(`    - ${normalize(spec)}`);
  }
  if (unverified.length) {
    say(`未验证项（不判红、不判绿）：`);
    for (const u of unverified) say(`  - ${u}`);
  }
  if (reds.length) {
    say(`矩阵完整性红（阻断合并）：`);
    for (const r of reds) say(`  - ${r}`);
  }
}

function verdict(reds, unverified) {
  if (reds.length) return 1;
  if (unverified.length) return 2;
  return 0;
}

function selfTest() {
  let hits = 0;
  const ok = (cond, name) => {
    if (!cond) throw new Error(`正向对照失败：${name}`);
    hits++;
  };
  const fixture = {
    version: 1,
    chains: {
      'sale-to-cash': {
        specs: [
          'frontend/e2e/fullflow/21-sale-to-cash.spec.ts',
          'frontend/e2e/flow/513-delivery-signoff-and-reconciliation-gate.spec.ts',
        ],
      },
      'purchase-to-pay': {
        specs: ['frontend/e2e/fullflow/20-purchase-to-pay.spec.ts'],
      },
    },
    modules: [
      { match: 'backend/src/routes/sales.rs', chains: ['sale-to-cash'] },
      { match: 'backend/src/handlers/purchase_', chains: ['purchase-to-pay'] },
    ],
  };
  const diskRoot = REPO_ROOT;

  const a = impact(['backend/src/routes/sales.rs'], fixture);
  ok(a.chains.length === 1 && a.chains[0] === 'sale-to-cash', 'sales 变更命中单一链路');
  ok(
    a.specs.includes('frontend/e2e/fullflow/21-sale-to-cash.spec.ts'),
    'sales 变更带出真实 spec 路径'
  );

  const b = impact(['backend/src/handlers/purchase_order_handler.rs'], fixture);
  ok(b.chains.length === 1 && b.chains[0] === 'purchase-to-pay', 'purchase 变更命中采购链');

  const c = impact(['README.md'], fixture);
  ok(c.chains.length === 0 && c.specs.length === 0, '无关文件不产生联动影响');

  const brokenSpec = JSON.parse(JSON.stringify(fixture));
  brokenSpec.chains['sale-to-cash'].specs.push('frontend/e2e/flow/不存在-自证夹具.spec.ts');
  const redsSpec = integrity(brokenSpec, diskRoot);
  ok(
    redsSpec.some(r => r.includes('不存在-自证夹具')),
    '损坏的 spec 路径被判红并点名'
  );

  const brokenChain = JSON.parse(JSON.stringify(fixture));
  brokenChain.modules[0].chains.push('未定义链路自证');
  const redsChain = integrity(brokenChain, diskRoot);
  ok(
    redsChain.some(r => r.includes('未定义链路自证')),
    '未定义的链路引用被判红并点名'
  );

  const empty = { version: 1, chains: {}, modules: [] };
  const redsEmpty = integrity(empty, diskRoot);
  ok(redsEmpty.length >= 2, '空矩阵被判红（门不可被整体拆掉）');

  if (hits !== SELF_CHECKS) {
    say(`SELFTEST_MISMATCH expected=${SELF_CHECKS} actual=${hits}，本轮结论作废`);
    process.exit(3);
  }
  say(`SELFTEST_OK ${hits}/${SELF_CHECKS}`);
  process.exit(0);
}

function unverifiedResult(asJson, message) {
  if (asJson) {
    say(
      JSON.stringify({
        verdict: 'UNVERIFIED',
        e2eExecution: 'NOT_RUN',
        reds: [],
        unverified: [message],
      })
    );
  } else {
    say('E2E_EXECUTION=NOT_RUN');
    say(`VERDICT=UNVERIFIED ${message}`);
  }
  process.exit(2);
}

function main() {
  let args;
  try {
    args = parseArgs({
      allowPositionals: true,
      options: {
        json: { type: 'boolean' },
        'self-test': { type: 'boolean' },
        'changed-from': { type: 'string' },
        matrix: { type: 'string' },
        'specs-out': { type: 'string' },
      },
    });
  } catch (e) {
    unverifiedResult(wantsJson(), `参数无效：${e.message}`);
  }
  const { values, positionals } = args;
  if (values['self-test']) return selfTest();
  const asJson = values.json === true;
  if (values['changed-from'] !== undefined && positionals.length > 0) {
    unverifiedResult(asJson, '--changed-from 不能与位置参数混用');
  }
  let changed = positionals.map(normalize);
  const unverified = [];
  if (values['changed-from'] !== undefined) {
    if (!values['changed-from'].trim()) {
      unverifiedResult(asJson, '--changed-from 缺少有效 ref');
    }
    try {
      changed = changedFrom(values['changed-from']);
    } catch (e) {
      unverifiedResult(asJson, `取变更清单失败：${e.message}`);
    }
  }

  let matrix;
  try {
    matrix = JSON.parse(readFileSync(values.matrix ?? MATRIX_FILE, 'utf8'));
  } catch (e) {
    unverifiedResult(asJson, `读取矩阵失败：${e.message}`);
  }
  const reds = integrity(matrix, REPO_ROOT);
  const affected = reds.length ? { hitRules: [], chains: [], specs: [] } : impact(changed, matrix);
  const code = verdict(reds, unverified);

  if (values['specs-out'] !== undefined && code === 0) {
    try {
      const list = affected.specs.map(normalize).join('\n');
      writeFileSync(values['specs-out'], list ? `${list}\n` : '', 'utf8');
    } catch (e) {
      unverifiedResult(asJson, `写 spec 清单失败：${e.message}`);
    }
  }

  if (asJson) {
    process.stdout.write(
      JSON.stringify({
        verdict: ['GREEN', 'RED', 'UNVERIFIED'][code],
        e2eExecution: 'NOT_RUN',
        reds,
        unverified,
        affected,
        changedCount: changed.length,
      }) + '\n'
    );
  } else {
    report(matrix, changed, affected, reds, unverified);
    say(`VERDICT=${['GREEN', 'RED', 'UNVERIFIED'][code]}`);
  }
  process.exit(code);
}

main();
