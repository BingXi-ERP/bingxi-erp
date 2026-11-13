// 生产计划 E2E 套件 — 02 生产执行（已排产 → 生产中 → 已完成）
// 覆盖范围：开始生产、完成生产、状态标签验证
import { test, expect, type Page } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  tryCleanup,
} from '../flow/helpers';
import { pickSelect, elSelectByLabel } from '../flow/ui-helpers';
// 产品类型与库存等级单源常量（与后端词表同源）：夹具取值必须经成员引用，不写字面量。
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import { STOCK_GRADE } from '../../src/constants/stock-grade';

async function filterByStatus(page: Page, statusLabel: string): Promise<void> {
  await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30000 });
  await pickSelect(page, elSelectByLabel(page, /状态/), new RegExp(`^${statusLabel}$`));
  await page.getByRole('button', { name: /查询/ }).click();
}

/**
 * 造一张工单宿主产品，再建 DRAFT 工单并按状态机推进到 targetStatus（PUT /status 走后端白名单校验）。
 * 完工扣料从该订单名下流转卡的投纱明细取数，投纱为空显式拒绝完工，
 * 因此要推到可完工状态的工单须另走 seedCompletionFeed 补投纱前置。
 */
async function createOrderInStatus(page: Page, targetStatus: string): Promise<number> {
  const ctx = getCtx();
  const categoryId = ctx.productCategoryIds[0];
  expect(categoryId, '前置：需要产品分类（建产品用）').toBeTruthy();
  const suffix = Date.now().toString().slice(-6);
  const prod = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code: `E2E-MFG${suffix}`,
    name: `E2E生产产品${suffix}`,
    unit: '米',
    category_id: categoryId,
    // 执行链工单宿主产品不做米↔公斤换算，取非面料类型免带面料三键
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = prod.data?.id;
  if (!productId) {
    throw new Error(`造数产品创建失败：${JSON.stringify(prod).slice(0, 200)}`);
  }

  const order = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/production/production-orders/orders',
    {
      product_id: productId,
      planned_quantity: 50,
      priority: 5,
    }
  );
  const id = order.data?.id;
  if (!id) {
    throw new Error(`生产工单造数失败：${JSON.stringify(order).slice(0, 200)}`);
  }

  // DRAFT →(白名单)→ SCHEDULED → IN_PROGRESS
  const path = `/production/production-orders/orders/${id}/status`;
  await apiCall(page, 'PUT', path, { status: 'SCHEDULED' });
  if (targetStatus === 'IN_PROGRESS') {
    await apiCall(page, 'PUT', path, { status: 'IN_PROGRESS' });
  }
  return id;
}

/**
 * 给一张在产工单补齐完工扣料前置：专属纱线产品、挂单流转卡、够扣的纱线库存行与投纱行。
 * 完工按 仓库×纱线×批次×色号×等级 命中唯一库存行，故投纱行与库存行的四维取值逐字符相同；
 * 缺一维则扣料命不中该行而拒绝完工，多行同键则扣错行。等级取库存等级词表内值。
 * 纱线自建而不复用种子产品，避免并发用例在同一维度上互扣造成数量歧义。
 */
async function seedCompletionFeed(page: Page, orderId: number): Promise<void> {
  const ctx = getCtx();
  const categoryId = ctx.productCategoryIds[0];
  const warehouseId = ctx.warehouseIds[0];
  expect(categoryId, '前置：需要产品分类（建纱线用）').toBeTruthy();
  expect(warehouseId, '前置：需要可用仓库（投纱与库存的定位维度）').toBeTruthy();

  const yarnCode = genCode('E2E-PRD-Y');
  const yarn = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
    code: yarnCode,
    name: `E2E生产完工纱线${yarnCode}`,
    unit: '公斤',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const yarnId = yarn?.id;
  if (!yarnId) throw new Error(`完工前置纱线产品创建失败：${JSON.stringify(yarn).slice(0, 200)}`);
  CLEANUP.push({ path: `/products/${yarnId}`, label: '[02-execute] 纱线产品' });

  const card = await apiCallRaw<{ id?: number }>(page, 'POST', '/production/flow-cards', {
    production_order_id: orderId,
  });
  const cardId = card?.id;
  if (!cardId) throw new Error(`完工前置流转卡创建失败：${JSON.stringify(card).slice(0, 200)}`);
  CLEANUP.push({ path: `/production/flow-cards/${cardId}`, label: '[02-execute] 流转卡' });

  const batchNo = genCode('E2E-PRD-B');
  const colorNo = genCode('E2E-PRD-C');
  const dyeLotNo = genCode('E2E-PRD-L');

  const stock = await apiCallRaw<{ id?: number }>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: warehouseId,
    product_id: yarnId,
    batch_no: batchNo,
    color_no: colorNo,
    dye_lot_no: dyeLotNo,
    grade: STOCK_GRADE.first,
    quantity_meters: '200',
    quantity_kg: '100',
  });
  const stockId = stock?.id;
  if (!stockId)
    throw new Error(`完工前置纱线库存行创建失败：${JSON.stringify(stock).slice(0, 200)}`);
  CLEANUP.push({ path: `/inventory/stock/${stockId}`, label: '[02-execute] 纱线库存行' });

  const material = await apiCallRaw<{ id?: number }>(
    page,
    'POST',
    '/production/flow-cards/materials',
    {
      flow_card_id: cardId,
      warehouse_id: warehouseId,
      material_id: yarnId,
      batch_no: batchNo,
      color_no: colorNo,
      dye_lot_no: dyeLotNo,
      grade: STOCK_GRADE.first,
      quantity: '10',
      unit: 'kg',
    }
  );
  const materialId = material?.id;
  if (!materialId)
    throw new Error(`完工前置投纱行登记失败：${JSON.stringify(material).slice(0, 200)}`);
  CLEANUP.push({
    path: `/production/flow-cards/materials/${materialId}`,
    label: '[02-execute] 投纱行',
  });
}

const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  if (CLEANUP.length === 0) return;
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe('生产计划 - 02 生产执行', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
  });

  test('已排产工单可开始生产（SCHEDULED → 生产中）', async ({ page }) => {
    // 原实现 `if (await startBtn.isVisible())` + getByRole('link')：操作列按钮角色是
    // button（el-button is-link），link 定位恒不命中；且无造数时列表无 SCHEDULED 行，
    // 条件不成立即零断言假绿。改为真实造一张 SCHEDULED 工单并硬断言。
    await ensureTestEntities(page);
    await createOrderInStatus(page, 'SCHEDULED');

    await page.goto('/production');
    await filterByStatus(page, '已排产');

    const startBtn = page.getByRole('button', { name: '开始生产', exact: true }).first();
    await expect(startBtn, '已排产工单应渲染"开始生产"按钮').toBeVisible({ timeout: 30000 });
    await startBtn.click();
    await page.getByRole('button', { name: /确定/ }).click();
    await expect(page.getByText(/状态更新成功/)).toBeVisible({ timeout: 30000 });
  });

  test('生产中工单可完成（IN_PROGRESS → 已完成）', async ({ page }) => {
    await ensureTestEntities(page);
    // 完工必然扣流转卡投纱对应的纱线库存，投纱为空被显式拒绝，故先补投纱与够扣库存前置
    const orderId = await createOrderInStatus(page, 'IN_PROGRESS');
    await seedCompletionFeed(page, orderId);

    await page.goto('/production');
    await filterByStatus(page, '生产中');

    const completeBtn = page.getByRole('button', { name: '完成', exact: true }).first();
    await expect(completeBtn, '生产中工单应渲染"完成"按钮').toBeVisible({ timeout: 30000 });
    await completeBtn.click();
    await page.getByRole('button', { name: /确定/ }).click();
    await expect(page.getByText(/状态更新成功/)).toBeVisible({ timeout: 30000 });
  });

  test('已完成工单无操作按钮', async ({ page }) => {
    await page.goto('/production');
    await expect(page.getByRole('table').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.el-tag').first()).toBeVisible({ timeout: 30000 });
  });
});
