// Wave3 生产委外：生产工单编辑口的 NOT NULL 三态门。
// 后端判据：handlers/production_order_handler.rs:77-96 对 planned_quantity/priority 使用
//   double_option（键缺席=保持、显式 null=Some(None)、有值=覆盖）；
//   services/production_order_ops/crud.rs:421-431 在任何 DB 读之前拒绝两列显式 null，
//   :452-471 只 Set 有值字段，可空列 remarks 显式 null 才清空。
// 本例自建 DRAFT 工单，负例断 400 + BUSINESS_ERROR + 外显文案，正例断零漂移与派生保持。
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const PATH = '/production/production-orders/orders';

interface OrderRow {
  id?: number;
  status?: string;
  planned_quantity?: string | number;
  priority?: number;
  remarks?: string | null;
  product_id?: number;
}

let orderId = 0;

test.afterEach(async ({ page }) => {
  if (orderId > 0) {
    await tryCleanup(page, 'DELETE', `${PATH}/${orderId}`, `production_order#${orderId}`);
  }
  orderId = 0;
});

async function readOrder(page: import('@playwright/test').Page): Promise<OrderRow> {
  const row = await apiCallRaw<OrderRow>(page, 'GET', `${PATH}/${orderId}`);
  expect(Number(row?.id), '[498] 详情回读 id 应与自建工单一致').toBe(orderId);
  return row;
}

async function expectUnchanged(page: import('@playwright/test').Page): Promise<void> {
  const row = await readOrder(page);
  expect(String(row.status), '[498] 负例后状态必须仍为 DRAFT').toBe('DRAFT');
  expect(Number(row.planned_quantity), '[498] 负例后计划数量不得漂移').toBe(500);
  expect(Number(row.priority), '[498] 负例后优先级不得漂移').toBe(5);
  expect(String(row.remarks), '[498] 负例后备注不得漂移').toBeTruthy();
}

test.describe('生产工单编辑 NOT NULL 三态门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('NOT NULL 列显式 null 被拒、键缺席保持、可空列显式 null 清空', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    expect(Boolean(productId), '[498] 夹具须有可复用的成品主键').toBe(true);
    const tag = genCode('W3PO498');

    const created = await apiCallRaw<{ id?: number }>(page, 'POST', PATH, {
      product_id: productId,
      planned_quantity: '500',
      remarks: tag,
    });
    orderId = Number(created?.id);
    expect(orderId, `[498] 建单应返回主键，实得：${JSON.stringify(created)}`).toBeGreaterThan(0);

    const initial = await readOrder(page);
    expect(String(initial.status), '[498] 新工单初始状态应为 DRAFT').toBe('DRAFT');
    expect(Number(initial.planned_quantity), '[498] 初始计划数量应等于建单值').toBe(500);
    expect(Number(initial.priority), '[498] 未提交优先级时应取库默认值 5').toBe(5);
    expect(String(initial.remarks), '[498] 初始备注应等于建单值').toBe(tag);
    expect(Number(initial.product_id), '[498] 回读产品应等于建单产品').toBe(Number(productId));

    const quantityNull = await apiCallExpectFail(page, 'PUT', `${PATH}/${orderId}`, {
      planned_quantity: null,
    });
    expect(
      quantityNull.status,
      `[498] 计划数量显式 null 应 400，实得：${JSON.stringify(quantityNull)}`
    ).toBe(400);
    expect(failureCode(quantityNull), '[498] 计划数量显式 null 机器码').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(quantityNull.message ?? ''), '[498] 计划数量显式 null 文案').toBe(
      '计划数量不能清空：该字段为必填项'
    );
    await expectUnchanged(page);

    const priorityNull = await apiCallExpectFail(page, 'PUT', `${PATH}/${orderId}`, {
      priority: null,
    });
    expect(
      priorityNull.status,
      `[498] 优先级显式 null 应 400，实得：${JSON.stringify(priorityNull)}`
    ).toBe(400);
    expect(failureCode(priorityNull), '[498] 优先级显式 null 机器码').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(priorityNull.message ?? ''), '[498] 优先级显式 null 文案').toBe(
      '优先级不能清空：该字段为必填项'
    );
    await expectUnchanged(page);

    const emptyUpdate = await apiCallRaw<OrderRow>(page, 'PUT', `${PATH}/${orderId}`, {});
    expect(Number(emptyUpdate?.id), '[498] 全键缺席更新应成功').toBe(orderId);
    await expectUnchanged(page);

    const updated = await apiCallRaw<OrderRow>(page, 'PUT', `${PATH}/${orderId}`, {
      planned_quantity: '600',
    });
    expect(Number(updated?.id), '[498] 计划数量覆盖应成功').toBe(orderId);
    const afterUpdate = await readOrder(page);
    expect(Number(afterUpdate.planned_quantity), '[498] 计划数量应更新为 600').toBe(600);
    expect(Number(afterUpdate.priority), '[498] 优先级键缺席必须保持 5').toBe(5);
    expect(String(afterUpdate.status), '[498] 计划数量覆盖不得改状态').toBe('DRAFT');
    expect(String(afterUpdate.remarks), '[498] 备注键缺席必须保持').toBe(tag);

    const cleared = await apiCallRaw<OrderRow>(page, 'PUT', `${PATH}/${orderId}`, {
      remarks: null,
    });
    expect(Number(cleared?.id), '[498] 可空列显式 null 应成功').toBe(orderId);
    const afterClear = await readOrder(page);
    expect(afterClear.remarks, '[498] 可空列显式 null 应真正清空').toBeNull();
    expect(Number(afterClear.planned_quantity), '[498] 清空备注不得影响计划数量').toBe(600);
    expect(Number(afterClear.priority), '[498] 清空备注不得影响优先级').toBe(5);
    expect(String(afterClear.status), '[498] 清空备注不得改状态').toBe('DRAFT');
  });
});
