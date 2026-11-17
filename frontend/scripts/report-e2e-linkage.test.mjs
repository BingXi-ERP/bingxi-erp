// report-e2e-linkage.mjs 的检测力自证：固定输入 → 断言真实 CLI 输出含预期链路 id / spec 路径。
// 期望值在本文件里写死，不从矩阵反推，避免"用产物证明产物"的假绿自比。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const SCRIPT = path.join(HERE, 'report-e2e-linkage.mjs');
const MATRIX_FILE = path.join(HERE, 'e2e-linkage-matrix.json');

function runReport(changed) {
  return execFileSync(process.execPath, [SCRIPT, ...changed], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

test('改 sales/order 相关路径 → 报出链路① sale-to-cash 及其 spec', () => {
  const out = runReport(['backend/src/handlers/sales_order_handler.rs']);
  assert.ok(out.includes('链路 sale-to-cash'), out);
  assert.ok(out.includes('frontend/e2e/fullflow/21-sale-to-cash.spec.ts'), out);
  assert.ok(
    out.includes('frontend/e2e/flow/513-delivery-signoff-and-reconciliation-gate.spec.ts'),
    out
  );
});

test('改 purchase 相关路径 → 报出链路② purchase-to-pay 及其 spec', () => {
  const out = runReport([
    'backend/src/handlers/purchase_order_handler.rs',
    'backend/src/services/purchase_receipt_service.rs',
  ]);
  assert.ok(out.includes('链路 purchase-to-pay'), out);
  assert.ok(out.includes('frontend/e2e/fullflow/20-purchase-to-pay.spec.ts'), out);
  assert.ok(out.includes('frontend/e2e/flow/95-purchase-receipt-pay-chain.spec.ts'), out);
});

test('改 ar 相关路径 → 报出应收相关链路及其 spec', () => {
  const out = runReport(['backend/src/services/ar_reconciliation_service.rs']);
  assert.ok(out.includes('链路 sale-to-cash'), out);
  assert.ok(out.includes('链路 returns-to-report'), out);
  assert.ok(out.includes('frontend/e2e/flow/522-ar-recon-source-amount-redflush.spec.ts'), out);
});

test('改 ap 相关路径 → 报出链路② purchase-to-pay', () => {
  const out = runReport(['backend/src/handlers/ap_payment_handler.rs']);
  assert.ok(out.includes('链路 purchase-to-pay'), out);
  assert.ok(out.includes('frontend/e2e/flow/95-purchase-receipt-pay-chain.spec.ts'), out);
});

test('改 outsourcing 相关路径 → 报出链路③ outsource-to-cost 及其 spec', () => {
  const out = runReport(['backend/src/services/outsourcing_service.rs']);
  assert.ok(out.includes('链路 outsource-to-cost'), out);
  assert.ok(out.includes('frontend/e2e/fullflow/23-outsource-issue-receipt.spec.ts'), out);
});

test('改 sales_return 相关路径 → 报出链路④ returns-to-report 及其 spec', () => {
  const out = runReport(['backend/src/models/sales_return.rs']);
  assert.ok(out.includes('链路 returns-to-report'), out);
  assert.ok(out.includes('frontend/e2e/flow/11-returns.spec.ts'), out);
});

test('改无关路径 → 明确输出无已知联动链路，不静默', () => {
  const out = runReport(['docs/design/notes.md']);
  assert.ok(out.includes('无已知联动链路'), out);
  assert.ok(!out.includes('链路 sale-to-cash'), out);
  assert.ok(!out.includes('链路 purchase-to-pay'), out);
  assert.ok(!out.includes('链路 outsource-to-cost'), out);
  assert.ok(!out.includes('链路 returns-to-report'), out);
});

test('stdin 行输入与命令行参数同口径', () => {
  const out = execFileSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: 'backend\\src\\handlers\\sales_order_handler.rs\n',
  });
  assert.ok(out.includes('链路 sale-to-cash'), out);
  assert.ok(out.includes('frontend/e2e/fullflow/21-sale-to-cash.spec.ts'), out);
});

test('矩阵数据自洽：modules/chains 非空、引用的链路已定义、spec 真实存在', () => {
  const matrix = JSON.parse(readFileSync(MATRIX_FILE, 'utf8'));
  assert.ok(Array.isArray(matrix.modules) && matrix.modules.length >= 20);
  const defined = new Set(Object.keys(matrix.chains));
  assert.equal(defined.size, 4);
  for (const rule of matrix.modules) {
    assert.ok(rule.match && Array.isArray(rule.chains) && rule.chains.length > 0);
    for (const id of rule.chains) assert.ok(defined.has(id), `未定义链路 ${id}`);
  }
  let specCount = 0;
  for (const [id, chain] of Object.entries(matrix.chains)) {
    assert.ok(chain.description && chain.description.length > 0, id);
    assert.ok(Array.isArray(chain.specs) && chain.specs.length > 0, id);
    for (const spec of chain.specs) {
      specCount += 1;
      assert.ok(existsSync(path.join(REPO_ROOT, spec)), `spec 不存在：${spec}`);
    }
  }
  assert.ok(specCount >= 7);
});
