// 4.21 审批阈值分支 + 4.16 精度：色号价批量调价 10% 阈值的等值边界分派。
// 后端判据：services/color_price_batch_service.rs:46 APPROVAL_THRESHOLD=0.10；
//   :120-133 change_percent=((new_price-base)/base).round_dp(4)，
//   approval_threshold=Decimal::new((0.10*10000).round() as i64,4)=0.1000，
//   need_approval=change_percent.abs() > approval_threshold（严格大于，非 >=）；
//   :274-289 percentage 的 new_price=(base*(1+value)).round_dp(6)；
//   未越阈走 auto 分支落新价并置 APPROved，越阈走 pending 分支保持 base_price 原值仅
//   置 approval_status=PENDING（见 115 用例同域范式与 models/status/approval 大写词表）。
// 关键判据：base_price=100 时 +0.10 → change_percent=0.1000 恰等于阈值，不越阈走 auto 落 110；
//   +0.1001 → 0.1001 严格大于阈值走 pending，base_price 保持 100 原值不改。
// 与既有覆盖分工：115 测 +5%/+20%/fixed 等档但无 10% 等值点；本例专补等值边界零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

type Row = Record<string, unknown>;
const ymd = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const toNum = (v: unknown): number => Number(String(v));
const near = (v: unknown, target: number): boolean => Math.abs(toNum(v) - target) < 0.0001;

async function seedHost(page: Page, tag: string): Promise<{ productId: number; colorId: number }> {
  const category = await apiCallRaw<Row>(page, 'POST', '/categories', {
    name: `482类${tag}`,
    code: `482CAT${tag}`,
  });
  const categoryId = Number(category.id);
  expect(categoryId, '[482] 分类须回真实主键').toBeGreaterThan(0);

  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    name: `482产品${tag}`,
    code: `482P${tag}`,
    category_id: categoryId,
    unit: 'm',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product.id);
  expect(productId, '[482] 产品须回真实主键').toBeGreaterThan(0);

  const color = await apiCallRaw<Row>(page, 'POST', `/products/${productId}/colors`, {
    color_no: `482CN${tag}`,
    color_name: `482色${tag}`,
    color_type: 'STANDARD',
    extra_cost: 0,
  });
  const colorId = Number(color.id);
  expect(colorId, '[482] 色号须回真实主键').toBeGreaterThan(0);
  return { productId, colorId };
}

async function seedPrice(
  page: Page,
  host: { productId: number; colorId: number },
  tag: string,
  base: string
) {
  const row = await apiCallRaw<Row>(page, 'POST', '/color-prices', {
    product_id: host.productId,
    color_id: host.colorId,
    currency: 'CNY',
    base_price: base,
    effective_from: ymd(0),
    notes: `482初建${tag}`,
  });
  const id = Number(row.id);
  expect(id, '[482] 建价须回真实主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/color-prices/${id}`, label: `price-${tag}` });
  return row;
}

interface BatchResp {
  auto_approved: number[];
  pending_approval: number[];
  total: number;
}

test.describe('4.21 批量调价阈值等值门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('482-01 +0.10 等值走 auto 落 110，+0.1001 越阈走 pending 保持 100', async ({ page }) => {
    const tag = genCode('E482');
    const host = await seedHost(page, tag);
    const equal = await seedPrice(page, host, '等', '100.00');
    const over = await seedPrice(page, host, '越', '100.00');
    const equalId = Number(equal.id);
    const overId = Number(over.id);

    const batch = await apiCallRaw<BatchResp>(page, 'POST', '/color-prices/batch-adjust', {
      items: [
        { price_id: equalId, adjustment_type: 'percentage', adjustment_value: '0.10' },
        { price_id: overId, adjustment_type: 'percentage', adjustment_value: '0.1001' },
      ],
      change_reason: `482阈值等值${tag}`,
    });
    expect(batch.auto_approved.map(Number), '[482] +0.10 恰等阈值须走 auto').toContain(equalId);
    expect(batch.pending_approval.map(Number), '[482] +0.1001 超阈值须走 pending').toContain(
      overId
    );

    const equalAfter = await apiCallRaw<Row>(page, 'GET', `/color-prices/${equalId}`);
    expect(near(equalAfter.base_price, 110), '[482] auto 分支须落新价 110').toBe(true);
    expect(equalAfter.approval_status, '[482] auto 分支须置 APPROVED').toBe('APPROVED');

    const overAfter = await apiCallRaw<Row>(page, 'GET', `/color-prices/${overId}`);
    expect(near(overAfter.base_price, 100), '[482] pending 分支须保持原价 100 不改').toBe(true);
    expect(overAfter.approval_status, '[482] pending 分支须置 PENDING').toBe('PENDING');
  });
});
