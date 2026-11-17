#!/usr/bin/env node
// E2E 链路联动影响报告：输入变更文件路径（命令行参数或 stdin 行），输出受影响链路
// 与应回归 spec 清单，供人工/评审参考。
//
// 定位：信息工具，不是门禁。只读矩阵文件、只写标准输出；不写仓内任何文件，
// 不设置非零退出码。判定器检测力由 report-e2e-linkage.test.mjs 的 node:test 断言证明，
// 与 check-e2e-feature-pairing.mjs 的端点级棘轮、ci-e2e 分片判绿完全无关。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const MATRIX_FILE = path.join(HERE, 'e2e-linkage-matrix.json');
const NO_LINKAGE = '无已知联动链路';
const CHAIN_ORDER = ['sale-to-cash', 'purchase-to-pay', 'outsource-to-cost', 'returns-to-report'];

const say = line => process.stdout.write(line + '\n');

// 统一分隔符、去掉 ./ 前缀：Windows 传入的反斜杠路径与 git diff 输出同口径。
function normalize(raw) {
  return String(raw).replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function loadMatrix() {
  const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'));
  if (!Array.isArray(matrix.modules) || !matrix.chains || typeof matrix.chains !== 'object')
    throw new Error('矩阵结构缺 modules 数组或 chains 对象');
  return matrix;
}

function orderChains(ids) {
  const rank = id => {
    const i = CHAIN_ORDER.indexOf(id);
    return i === -1 ? CHAIN_ORDER.length : i;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

function collect(changed, matrix) {
  const hitRules = new Set();
  const hitChains = new Set();
  for (const rule of matrix.modules) {
    if (changed.some(p => p.includes(rule.match))) {
      hitRules.add(rule.match);
      for (const id of rule.chains) hitChains.add(id);
    }
  }
  return { hitRules: [...hitRules], hitChains: orderChains(hitChains) };
}

function report(changed, matrix) {
  say('E2E 链路联动影响报告（信息工具，非 CI 门禁；不判绿/判红）');
  say(`变更文件：${changed.length} 个`);
  for (const p of changed) say(`  - ${p}`);
  const { hitRules, hitChains } = collect(changed, matrix);
  if (hitChains.length === 0) {
    say(NO_LINKAGE);
    return;
  }
  say(`命中模块规则（${hitRules.length}）：${hitRules.join(', ')}`);
  for (const id of hitChains) {
    const chain = matrix.chains[id];
    say('');
    say(`链路 ${id}`);
    if (!chain) {
      say('  矩阵缺该链路定义（数据不一致，请修正矩阵）');
      continue;
    }
    say(`  描述：${chain.description}`);
    say('  应回归 spec：');
    if (!Array.isArray(chain.specs) || chain.specs.length === 0) {
      say('    矩阵未登记 spec（数据不一致，请修正矩阵）');
      continue;
    }
    for (const spec of chain.specs) {
      const exists = existsSync(path.join(REPO_ROOT, spec));
      say(`    - ${spec}${exists ? '' : '  [文件不存在，请核对矩阵]'}`);
    }
  }
}

function readInputs() {
  const args = process.argv.slice(2).map(normalize).filter(Boolean);
  if (args.length > 0) return args;
  if (process.stdin.isTTY) return [];
  return readFileSync(0, 'utf8').split(/\r?\n/).map(normalize).filter(Boolean);
}

function main() {
  if (process.argv.slice(2).length === 0 && process.stdin.isTTY) {
    say('用法：node frontend/scripts/report-e2e-linkage.mjs <变更文件路径...>');
    say(
      '      git diff --name-only origin/main...HEAD | node frontend/scripts/report-e2e-linkage.mjs'
    );
    return;
  }
  const changed = readInputs();
  let matrix;
  try {
    matrix = loadMatrix();
  } catch (e) {
    say('矩阵不可用，无法计算联动链路：' + e.message);
    return;
  }
  report(changed, matrix);
}

main();
