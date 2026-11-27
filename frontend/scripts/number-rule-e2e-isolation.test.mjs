import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditNumberRuleIsolationGroup,
  auditNumberRuleSpecSource,
} from './number-rule-e2e-isolation.mjs';

const LOCK_NAME = 'withNumberRuleConfigLock';

function violation(source, filePath = 'e2e/system/586-number-rules.spec.ts') {
  return auditNumberRuleSpecSource(source, filePath);
}

test('直接 POST 销售订单未进入编码规则锁时判红', () => {
  const errors = violation(`
    async function createOrder(page) {
      return apiCallRaw(page, 'POST', '/sales/orders', { customer_id: 1 });
    }
  `);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /sales\/orders/);
  assert.match(errors[0], /withNumberRuleConfigLock/);
});

test('销售订单创建位于编码规则锁内时通过', () => {
  const errors = violation(`
    async function createOrder(page) {
      return ${LOCK_NAME}(async () => {
        return apiCallRaw(page, 'POST', '/sales/orders', { customer_id: 1 });
      });
    }
  `);
  assert.deepEqual(errors, []);
});

test('编码规则 PUT 与页面保存未进入锁内时分别判红', () => {
  const errors = violation(`
    async function update(page) {
      await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
      await page.getByTestId('number-rule-save').click();
    }
  `);
  assert.equal(errors.length, 2);
  assert.ok(errors.some(message => message.includes('/system/number-rules/1')));
  assert.ok(errors.some(message => message.includes('number-rule-save')));
});

test('模板路径中的编码规则常量可解析，未持锁仍判红', () => {
  const errors = violation(`
    const LIST_PATH = '/system/number-rules';
    async function update(page, snapshot) {
      await apiCall(page, 'PUT', \`\${LIST_PATH}/\${snapshot.rule.id}\`, { version: 2 });
    }
  `);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\/system\/number-rules\//);
});

test('编码规则写操作位于锁内时通过', () => {
  const errors = violation(`
    async function update(page) {
      await ${LOCK_NAME}(async () => {
        await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
        await page.getByTestId('number-rule-save').click();
      });
    }
  `);
  assert.deepEqual(errors, []);
});

test('编码规则专用 test 包装器提供真实持锁语义时通过', () => {
  const errors = violation(`
    numberRuleConfigTest('修改规则', async page => {
      await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
    });
  `);
  assert.deepEqual(errors, []);
});

test('注定被权限拒绝的编码规则写尝试不要求持锁', () => {
  const errors = violation(`
    async function denied(page) {
      await apiCallExpectFail(page, 'PUT', '/system/number-rules/1', { version: 2 });
      await apiCallExpectFail(page, 'POST', '/system/number-rules/1/rollback', { revision_id: 1 });
    }
  `);
  assert.deepEqual(errors, []);
});

test('报价 API 转订单与 UI 转订单按钮未持锁时判红', () => {
  const apiErrors = violation(
    `async function convert(page) { await apiCall(page, 'POST', '/quotations/7/convert'); }`,
    'e2e/quotations/13-quotation-translation-readback.spec.ts'
  );
  const uiErrors = violation(
    `async function convert(page) { await convertBtn.click(); }`,
    'e2e/quotations/02-approval.spec.ts'
  );
  assert.equal(apiErrors.length, 1);
  assert.equal(uiErrors.length, 1);
  assert.match(apiErrors[0], /quotations\/7\/convert/);
  assert.match(uiErrors[0], /convertBtn/);
});

test('同一无 hash 分片内的无锁订单创建者污染编码规则用例时判红', () => {
  const errors = auditNumberRuleIsolationGroup({
    targets: ['e2e/ai/', 'e2e/quotations/', 'e2e/system/'],
    total: 1,
    files: [
      {
        path: 'e2e/system/586-number-rules.spec.ts',
        source: `async function update(page) { await ${LOCK_NAME}(async () => {
          await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
        }); }`,
      },
      {
        path: 'e2e/quotations/13-quotation-translation-readback.spec.ts',
        source: `async function convert(page) { await apiCall(page, 'POST', '/quotations/7/convert'); }`,
      },
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /13-quotation-translation-readback/);
});

test('同一分片的订单创建者全部持锁时通过', () => {
  const errors = auditNumberRuleIsolationGroup({
    targets: ['e2e/system/'],
    total: 1,
    files: [
      {
        path: 'e2e/system/586-number-rules.spec.ts',
        source: `async function update(page) { await ${LOCK_NAME}(async () => {
          await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
          await apiCallRaw(page, 'POST', '/sales/orders', { customer_id: 1 });
        }); }`,
      },
    ],
  });
  assert.deepEqual(errors, []);
});

test('编码规则写者落在 hash 分片组时拒绝证明跨文件互斥', () => {
  const errors = auditNumberRuleIsolationGroup({
    targets: ['e2e/system/'],
    total: 2,
    files: [
      {
        path: 'e2e/system/586-number-rules.spec.ts',
        source: `async function update(page) { await ${LOCK_NAME}(async () => {
          await apiCall(page, 'PUT', '/system/number-rules/1', { version: 2 });
        }); }`,
      },
    ],
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /hash/);
});
