// 4.22 主数据引用完整性 + 4.3 删除状态门：坯布被活染色批次引用时禁止删除，撤回引用后放行。
// 后端判据：handlers/greige_fabric_handler.rs:673-697 find_greige_reference_rejection
//   按 greige_fabric_id 查 dye_batch，活单据判据是 is_deleted=false OR is_deleted IS NULL
//   （NULL 视为未删，不能用 <> true，否则 SQL 三值逻辑漏掉 NULL 行）；
//   命中返回 "坯布 {fabric_no} 已被染色批次引用（缸号 {doc_list}），请先删除这些染色批次或把它们改配到其他坯布"；
//   :737-753 remaining_stock_rejection 只看 weight_kg/length_m，quantity 两列不参与；
//   :780-788 引用门先于库存门，:790-796 两门通过后软删 is_deleted=true；
//   business_displayable → 400 + BUSINESS_ERROR。
// 关键判据：坯布建为 weight_kg=0/length_m=0，故删除放行腿不受库存门干扰；
//   软删染色批次后同一 DELETE 成功，反证首腿拒绝确由活引用而非其它前置造成。
// 与既有覆盖分工：31b 删除矩阵只测有库存坯布先出库再删，未构造染色批次引用与拒因文案；
//   458/484 是调拨与盘点，442/449 是字段边界，均无该门断言。本例补零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
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

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface Row {
  id?: number;
  fabric_no?: string;
  batch_no?: string;
}

async function seedZeroStockGreige(page: Page, fabricNo: string): Promise<number> {
  const ctx = getCtx();
  expect(ctx.productIds?.[0], '[487] 前置：产品未就绪').toBeGreaterThan(0);
  expect(ctx.supplierId, '[487] 前置：供应商未就绪').toBeGreaterThan(0);
  expect(ctx.warehouseIds?.[0], '[487] 前置：仓库未就绪').toBeGreaterThan(0);

  const created = await apiCallRaw<Row>(page, 'POST', '/production/greige-fabrics', {
    fabric_no: fabricNo,
    fabric_name: `487零库存坯布_${fabricNo}`,
    fabric_type: '梭织',
    product_id: ctx.productIds[0],
    supplier_id: ctx.supplierId,
    warehouse_id: ctx.warehouseIds[0],
    weight_kg: 0,
    length_m: 0,
    quantity_meters: 0,
    quantity_kg: 0,
    status: '在库',
    remarks: '487 引用删除门造数',
  });
  const id = Number(created.id);
  expect(id, `[487] 建零库存坯布失败：${JSON.stringify(created)}`).toBeGreaterThan(0);
  CLEANUP.push({ path: `/production/greige-fabrics/${id}`, label: `[487] 坯布 ${id}` });
  return id;
}

async function seedDyeBatch(page: Page, greigeId: number, batchNo: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/production/dye-batches', {
    batch_no: batchNo,
    greige_fabric_id: greigeId,
    planned_quantity: 100,
    status: 'pending_schedule',
    dye_lot_no: genCode('E487-DL'),
  });
  const id = Number(created.id);
  expect(id, `[487] 建染色批次失败：${JSON.stringify(created)}`).toBeGreaterThan(0);
  return id;
}

test.describe('4.22 坯布引用删除门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('487-01 活染色批次引用时删除 400，软删批次后同一坯布删除放行', async ({ page }) => {
    const fabricNo = genCode('E487-GF');
    const batchNo = genCode('E487-DB');
    const greigeId = await seedZeroStockGreige(page, fabricNo);
    const batchId = await seedDyeBatch(page, greigeId, batchNo);
    const batchCleanup = {
      path: `/production/dye-batches/${batchId}`,
      label: `[487] 染色批次 ${batchId}`,
    };
    CLEANUP.push(batchCleanup);

    const rejected = await apiCallExpectFail(
      page,
      'DELETE',
      `/production/greige-fabrics/${greigeId}`
    );
    expect(rejected.status, '[487] 活引用下删坯布须 400').toBe(400);
    expect(
      failureCode(rejected),
      `[487] 机器码须 BUSINESS_ERROR，实际=${failureCode(rejected)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(rejected.message, '[487] 拒因须点名染色批次引用').toContain('已被染色批次引用（缸号');
    expect(rejected.message, '[487] 拒因须点名缸号').toContain(batchNo);

    await apiCall(page, 'DELETE', batchCleanup.path);
    const index = CLEANUP.indexOf(batchCleanup);
    if (index >= 0) CLEANUP.splice(index, 1);

    const deleted = await apiCall<unknown>(
      page,
      'DELETE',
      `/production/greige-fabrics/${greigeId}`
    );
    expect(deleted.code, '[487] 撤回引用后删坯布须 200').toBe(200);
  });
});
