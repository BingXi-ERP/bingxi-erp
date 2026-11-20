// Wave5 打印任务逐任务覆盖维度门：纯 API 受理、详情回读与越界拒绝。
// 后端判据：routes/mod.rs:329-335 POST/GET /print-tasks；handlers/print_task_handler.rs:74-97
//   CreatePrintTaskRequest 的 orientation/copies/四边边距均为可空覆盖项；:279-309 validate_overrides
//   只认 portrait/landscape、copies 1..=99、四边 0..=50，且 :322 在模板/目标/单据解析之前执行；
//   :360-386 合法值直取请求值（clamp 对合法区间无副作用），:112-142 详情按模型 snake_case 回读。
//   拒绝走 AppError::bad_request（error.rs:229/378/819/854）→ 400 / BAD_REQUEST / 脱敏「请求参数错误」。
// print-tasks 无删除腿，受理行不可清理：自建订单/目标/模板全部带 genCode 唯一标记，
//   详情只按自建 id 回读，不做全局列表/总数断言；afterEach 停用模板并清理目标与订单。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
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

const PATH = '/print-tasks';
const MASKED_BAD_REQUEST = '请求参数错误';

interface PrintTaskRecord {
  id?: number;
  job_code?: string;
  doc_type?: string;
  doc_id?: number;
  template_id?: number;
  target_name?: string;
  orientation?: string;
  copies?: number;
  margin_top_mm?: number;
  margin_bottom_mm?: number;
  margin_left_mm?: number;
  margin_right_mm?: number;
}

interface OverrideValues {
  orientation: string;
  copies: number;
  margin_top_mm: number;
  margin_bottom_mm: number;
  margin_left_mm: number;
  margin_right_mm: number;
}

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
  expect(
    typeof ctx.customerId === 'number' && ctx.productIds.length > 0,
    '[524] 夹具须有客户与产品主键，无法自建销售订单'
  ).toBe(true);
  const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: ctx.productIds[0], quantity: 1, unit_price: '1.00' }],
  });
  const id = Number(created?.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[524] 销售订单须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  return id;
}

async function createTargetAndTemplate(page: Page, tag: string): Promise<string> {
  const targetCode = genCode(`E524PRN${tag}`);
  const target = await apiCallRaw<{ id?: number }>(page, 'POST', '/print-targets', {
    target_code: targetCode,
    display_name: `e2e打印目标${targetCode}`,
    kind: 'network',
    host: '127.0.0.1',
    port: 9100,
    enabled: true,
  });
  targetId = Number(target?.id);
  expect(Number.isInteger(targetId) && targetId > 0, '[524] 打印目标须回真实主键').toBe(true);

  const templateCode = genCode(`E524TPL${tag}`);
  const template = await apiCallRaw<{ id?: number; default_target_name?: string }>(
    page,
    'POST',
    '/print-templates',
    {
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
    }
  );
  templateId = Number(template?.id);
  expect(Number.isInteger(templateId) && templateId > 0, '[524] 打印模板须回真实主键').toBe(true);
  expect(String(template?.default_target_name), '[524] 模板须回显本例专属缺省目标').toBe(
    targetCode
  );
  return targetCode;
}

async function submitTask(
  page: Page,
  body: Record<string, unknown>,
  reason: string
): Promise<number> {
  const created = await apiCallRaw<{ id?: number; job_code?: string }>(page, 'POST', PATH, body);
  const id = Number(created?.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[524] ${reason} 须受理并回主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  expect(
    typeof created?.job_code === 'string' && created.job_code.length > 0,
    `[524] ${reason} 须回非空任务号，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  return id;
}

async function readTask(
  page: Page,
  id: number,
  targetCode: string,
  reason: string
): Promise<PrintTaskRecord> {
  const row = await apiCallRaw<PrintTaskRecord>(page, 'GET', `${PATH}/${id}`);
  expect(Number(row?.id), `[524] ${reason} 详情 id 应为 ${id}`).toBe(id);
  expect(Number(row?.doc_id), `[524] ${reason} 详情须指向自建订单`).toBe(orderId);
  expect(Number(row?.template_id), `[524] ${reason} 详情须指向自建模板`).toBe(templateId);
  expect(String(row?.target_name), `[524] ${reason} 详情须指向自建目标`).toBe(targetCode);
  return row;
}

function expectOverrides(row: PrintTaskRecord, want: OverrideValues, reason: string): void {
  expect(String(row.orientation), `[524] ${reason} orientation 须原样落库`).toBe(want.orientation);
  expect(Number(row.copies), `[524] ${reason} copies 须原样落库`).toBe(want.copies);
  expect(Number(row.margin_top_mm), `[524] ${reason} 上边距须原样落库`).toBe(want.margin_top_mm);
  expect(Number(row.margin_bottom_mm), `[524] ${reason} 下边距须原样落库`).toBe(
    want.margin_bottom_mm
  );
  expect(Number(row.margin_left_mm), `[524] ${reason} 左边距须原样落库`).toBe(want.margin_left_mm);
  expect(Number(row.margin_right_mm), `[524] ${reason} 右边距须原样落库`).toBe(
    want.margin_right_mm
  );
}

async function expectRejected(
  page: Page,
  baseline: Record<string, unknown>,
  overrides: Record<string, unknown>,
  reason: string
): Promise<void> {
  const rejected = await apiCallExpectFail(page, 'POST', PATH, { ...baseline, ...overrides });
  expect(rejected.status, `[524] ${reason} 须 400，实际 ${rejected.status}`).toBe(400);
  expect(
    failureCode(rejected),
    `[524] ${reason} 机器码须 BAD_REQUEST，实际 ${String(failureCode(rejected))}`
  ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  expect(String(rejected.message), `[524] ${reason} 须脱敏，实际 ${String(rejected.message)}`).toBe(
    MASKED_BAD_REQUEST
  );
}

test.describe('524 打印任务覆盖参数门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('524-01 方向与份数四边距边界内逐字段回读，越界全部前置拒绝', async ({ page }) => {
    orderId = await createOrder(page);
    const targetCode = await createTargetAndTemplate(page, genCode('E524'));
    const baseline = {
      doc_type: 'sales_order',
      doc_id: orderId,
      template_id: templateId,
      target_name: targetCode,
    };

    const upper: OverrideValues = {
      orientation: 'landscape',
      copies: 99,
      margin_top_mm: 0,
      margin_bottom_mm: 50,
      margin_left_mm: 0,
      margin_right_mm: 50,
    };
    const upperId = await submitTask(page, { ...baseline, ...upper }, '上界组合');
    const upperRow = await readTask(page, upperId, targetCode, '上界组合');
    expectOverrides(upperRow, upper, '上界组合');

    const lower: OverrideValues = {
      orientation: 'portrait',
      copies: 1,
      margin_top_mm: 50,
      margin_bottom_mm: 0,
      margin_left_mm: 50,
      margin_right_mm: 0,
    };
    const lowerId = await submitTask(page, { ...baseline, ...lower }, '下界组合');
    const lowerRow = await readTask(page, lowerId, targetCode, '下界组合');
    expectOverrides(lowerRow, lower, '下界组合');

    const invalid: Array<{ overrides: Record<string, unknown>; reason: string }> = [
      { overrides: { orientation: 'PORTRAIT' }, reason: '方向大写变体' },
      { overrides: { orientation: 'landscape ' }, reason: '方向带尾空格' },
      { overrides: { orientation: 'diagonal' }, reason: '方向白名单外' },
      { overrides: { copies: 0 }, reason: '份数 0' },
      { overrides: { copies: 100 }, reason: '份数 100' },
      { overrides: { margin_top_mm: -1 }, reason: '上边距 -1' },
      { overrides: { margin_top_mm: 51 }, reason: '上边距 51' },
      { overrides: { margin_bottom_mm: -1 }, reason: '下边距 -1' },
      { overrides: { margin_bottom_mm: 51 }, reason: '下边距 51' },
      { overrides: { margin_left_mm: -1 }, reason: '左边距 -1' },
      { overrides: { margin_left_mm: 51 }, reason: '左边距 51' },
      { overrides: { margin_right_mm: -1 }, reason: '右边距 -1' },
      { overrides: { margin_right_mm: 51 }, reason: '右边距 51' },
    ];
    for (const item of invalid) {
      await expectRejected(page, baseline, item.overrides, item.reason);
    }
  });
});
