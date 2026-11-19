// check-e2e-linkage-gate.mjs 的检测力自证：每个断言的期望值写死在本文件，
// 不从矩阵或判定器产物反推，避免"用产物证明产物"的假绿自比。
// 覆盖四态：GREEN（命中/不命中）、RED（spec 损坏/矩阵拆空）、UNVERIFIED（工具取 diff 失败），
// 以及内置正向对照的命中数自证。临时损坏矩阵写在系统临时目录，不碰仓内矩阵。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(HERE, 'check-e2e-linkage-gate.mjs');
const MATRIX_FILE = path.join(HERE, 'e2e-linkage-matrix.json');

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
}

function tempMatrix(mutate) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'linkage-gate-'));
  const file = path.join(dir, 'matrix.json');
  const raw = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'));
  mutate(raw);
  writeFileSync(file, JSON.stringify(raw));
  return { dir, file };
}

test('内置正向对照固定命中 7/7，退出 0', () => {
  const r = run(['--self-test']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('SELFTEST_OK 7/7'), r.stdout);
});

test('仓内真实矩阵当前完整，默认判定为 GREEN 且不声称已跑 E2E', () => {
  const r = run(['--json', 'README.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'GREEN');
  assert.equal(j.e2eExecution, 'NOT_RUN');
  assert.equal(j.reds.length, 0);
  assert.equal(j.affected.chains.length, 0);
});

test('改 sales 路由命中 sale-to-cash 与 returns-to-report 两条链', () => {
  const r = run(['--json', 'backend/src/routes/sales.rs']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.deepEqual(j.affected.chains, ['sale-to-cash', 'returns-to-report']);
  assert.ok(
    j.affected.specs.includes('frontend/e2e/fullflow/21-sale-to-cash.spec.ts'),
    JSON.stringify(j.affected.specs)
  );
  assert.ok(
    j.affected.specs.includes('frontend/e2e/flow/11-returns.spec.ts'),
    JSON.stringify(j.affected.specs)
  );
});

test('文本报告必须声明 E2E 未执行', () => {
  const r = run(['README.md']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(r.stdout.includes('E2E_EXECUTION=NOT_RUN'), r.stdout);
  assert.ok(r.stdout.includes('VERDICT=GREEN'), r.stdout);
});

test('多个位置参数全部纳入影响面，首个位置参数不再漏检', () => {
  const r = run(['--json', 'README.md', 'backend/src/routes/sales.rs']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.changedCount, 2);
  assert.deepEqual(j.affected.chains, ['sale-to-cash', 'returns-to-report']);
});

test('--changed-from 与位置参数混用 → UNVERIFIED，退出 2，不判红', () => {
  const r = run(['--json', '--changed-from', 'HEAD', 'README.md']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'UNVERIFIED');
  assert.equal(j.e2eExecution, 'NOT_RUN');
  assert.ok(
    j.unverified.some(x => x.includes('不能与位置参数混用')),
    JSON.stringify(j.unverified)
  );
});

test('无效布尔参数仍按 JSON 形式输出 UNVERIFIED', () => {
  const r = run(['--json=true', 'README.md']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.verdict, 'UNVERIFIED');
  assert.equal(j.e2eExecution, 'NOT_RUN');
});

test('矩阵注入不存在的 spec → RED，退出 1，点名该 spec', () => {
  const { dir, file } = tempMatrix(m => {
    m.chains['sale-to-cash'].specs.push('frontend/e2e/flow/不存在自证.spec.ts');
  });
  try {
    const r = run(['--json', '--matrix', file]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.verdict, 'RED');
    assert.ok(
      j.reds.some(x => x.includes('不存在自证')),
      JSON.stringify(j.reds)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('矩阵被拆空 → RED，退出 1', () => {
  const { dir, file } = tempMatrix(m => {
    m.chains = {};
    m.modules = [];
  });
  try {
    const r = run(['--json', '--matrix', file]);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const j = JSON.parse(r.stdout);
    assert.equal(j.verdict, 'RED');
    assert.ok(j.reds.length >= 2, JSON.stringify(j.reds));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('取变更清单失败 → UNVERIFIED，退出 2，不判红', () => {
  const r = run(['--json', '--changed-from', 'NoSuchRefForSelfTest___']);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.ok(!r.stdout.includes('"verdict":"RED"'), r.stdout);
});
