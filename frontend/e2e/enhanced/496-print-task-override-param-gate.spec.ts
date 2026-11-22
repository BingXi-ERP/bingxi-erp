// 4.19 打印适配 + 4.25 错误码：打印任务逐任务覆盖维度的前置参数门。
// 后端判据：handlers/print_task_handler.rs:279-309 validate_overrides 只接受 orientation
//   portrait/landscape、copies 1..=99、四边边距 0..=50；:317-322 该门在模板解析、目标解析、
//   单据存在性检查之前执行，越界即 AppError::bad_request（400 + BAD_REQUEST + 脱敏文案）。
// 与既有覆盖分工：flow/79 只测无目标、单据不存在与模板缺省目标生效；全 e2e 无越界方向、
//   份数上下界、四边边距越界与边界内放行断言；本例先建自有订单、目标、模板作合法基线。
import { expect, test } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

interface PrintTaskRef {
  id?: unknown;
  job_code?: unknown;
}

interface PrintTemplateRef {
  id?: unknown;
  default_target_name?: unknown;
}

const PATH = '/print-tasks';

let orderId = 0;
let targetId = 0;
let templateId = 0;

test.afterEach(async ({ page }) => {
  if (templateId > 0) {
    await apiCall(page, 'PUT', `/print-templates/${templateId}`, { status: 'inactive' });
  }
  if (targetId > 0) {
    await tryCleanup(page, 'DELETE', `/print-targets/${targetId}`, `print_target#${targetId}`);
  }
  if (orderId > 0) {
    await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `sales_order#${orderId}`);
  }
  orderId = 0;
  targetId = 0;
  templateId = 0;
});

async function createOrder(page: Page): Promise<number> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  expect(Boolean(ctx.customerId) && ctx.productIds.length > 0, '[496] 夹具须有客户与产品主键').toBe(
    true
  );
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: ctx.productIds[0], quantity: 1, unit_price: '1.00' }],
  });
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[496] 销售订单须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  return id;
}

async function createTargetAndTemplate(page: Page, tag: string): Promise<string> {
  const targetCode = genCode(`E496PRN${tag}`);
  const target = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/print-targets', {
    target_code: targetCode,
    display_name: `e2e打印目标${targetCode}`,
    kind: 'network',
    host: '127.0.0.1',
    port: 9100,
    enabled: true,
  });
  targetId = Number(target.id);
  expect(Number.isInteger(targetId) && targetId > 0, '[496] 打印目标须回真实主键').toBe(true);

  const templateCode = genCode(`E496TPL${tag}`);
  const template = await apiCallRaw<PrintTemplateRef>(page, 'POST', '/print-templates', {
    template_name: `e2e打印模板${templateCode}`,
    template_code: templateCode,
    doc_type: 'sales_order',
    module: 'sales',
    type: 'order',
    copies_default: 1,
    default_target_name: targetCode,
    content: '<div>{order_no}</div>',
    is_default: false,
    status: 'active',
  });
  templateId = Number(template.id);
  expect(Number.isInteger(templateId) && templateId > 0, '[496] 打印模板须回真实主键').toBe(true);
  expect(String(template.default_target_name), '[496] 模板须回显缺省目标').toBe(targetCode);
  return targetCode;
}

async function expectAccepted(
  page: Page,
  body: Record<string, unknown>,
  reason: string
): Promise<void> {
  const accepted = await apiCallRaw<PrintTaskRef>(page, 'POST', PATH, body);
  expect(
    Number(accepted.id),
    `[496] ${reason} 须受理并返回主键，实际 ${JSON.stringify(accepted)}`
  ).toBeGreaterThan(0);
  expect(String(accepted.job_code), `[496] ${reason} 须返回任务号`).not.toBe('');
}

async function expectRejected(
  page: Page,
  body: Record<string, unknown>,
  reason: string
): Promise<void> {
  const rejected = await apiCallExpectFail(page, 'POST', PATH, body);
  expect(rejected.status, `[496] ${reason} 须 400，实际 ${rejected.status}`).toBe(400);
  expect(
    failureCode(rejected),
    `[496] ${reason} 机器码须 BAD_REQUEST，实际 ${String(failureCode(rejected))}`
  ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  expect(String(rejected.message), `[496] ${reason} 须脱敏，实际 ${String(rejected.message)}`).toBe(
    '请求参数错误'
  );
}

test.describe('4.19 打印任务覆盖维度门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('496-01 方向份数与四边边距越界先拒，边界内逐项受理', async ({ page }) => {
    const tag = genCode('E496');
    orderId = await createOrder(page);
    await createTargetAndTemplate(page, tag);
    const baseline = { doc_type: 'sales_order', doc_id: orderId, template_id: templateId };

    await expectAccepted(page, baseline, '缺省覆盖基线');

    const invalid: Array<{ body: Record<string, unknown>; reason: string }> = [
      { body: { ...baseline, orientation: 'PORTRAIT' }, reason: '方向大小写变体' },
      { body: { ...baseline, orientation: 'landscape ' }, reason: '方向带尾空格' },
      { body: { ...baseline, copies: 0 }, reason: '份数 0' },
      { body: { ...baseline, copies: 100 }, reason: '份数 100' },
      { body: { ...baseline, margin_top_mm: -1 }, reason: '上边距 -1' },
      { body: { ...baseline, margin_bottom_mm: 51 }, reason: '下边距 51' },
      { body: { ...baseline, margin_left_mm: 51 }, reason: '左边距 51' },
      { body: { ...baseline, margin_right_mm: -1 }, reason: '右边距 -1' },
    ];
    for (const item of invalid) {
      await expectRejected(page, item.body, item.reason);
    }

    const valid: Array<{ body: Record<string, unknown>; reason: string }> = [
      { body: { ...baseline, orientation: 'landscape' }, reason: '合法方向' },
      { body: { ...baseline, copies: 1 }, reason: '份数下界' },
      { body: { ...baseline, copies: 99 }, reason: '份数上界' },
      {
        body: {
          ...baseline,
          margin_top_mm: 0,
          margin_bottom_mm: 0,
          margin_left_mm: 0,
          margin_right_mm: 0,
        },
        reason: '四边边距下界',
      },
      {
        body: {
          ...baseline,
          margin_top_mm: 50,
          margin_bottom_mm: 50,
          margin_left_mm: 50,
          margin_right_mm: 50,
        },
        reason: '四边边距上界',
      },
    ];
    for (const item of valid) {
      await expectAccepted(page, item.body, item.reason);
    }
  });
});
