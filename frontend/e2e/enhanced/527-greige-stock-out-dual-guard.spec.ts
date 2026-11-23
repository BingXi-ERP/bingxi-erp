// 4.527 坯布出库双门拦截：当前库存门 + 累计入库门。
//
// 后端判据（逐字段核源）：
// - 路由 backend/src/routes/production.rs:90-93 `POST /production/greige-fabrics/{id}/stock-out`，
//   顶层挂载 backend/src/routes/mod.rs:570 `/api/v1/erp/production`。
// - handler backend/src/handlers/greige_fabric_handler.rs:903-1007：
//   :923-935 要求 `weight_kg`/`length_m` 至少一项且为正有限值；
//   :947-965 先扣当前 `weight_kg`，再扣累计 `quantity_kg`，两处负值门均为
//     `AppError::business_displayable`；:967-983 对 `length_m`/`quantity_meters` 同理；
//   :985-994 按扣减后真实 DECIMAL 判定状态；:1002-1006 返回 `ApiResponse`。
// - 请求 DTO `StockOutRequest`（:229-235）键为 `weight_kg`、`length_m`、`remarks`；
//   响应直接序列化 `greige_fabric::Model`（backend/src/models/greige_fabric.rs:11-52），
//   DECIMAL 出参为字符串线格式，断言先钉类型再用 `Number(String(v))` 归一。
// - 状态词唯一来源 backend/src/models/status/purchase_inventory.rs:378-386：
//   `在库` / `已出库` 中文逐字符比较。
// - 错误族：business_displayable → HTTP 400 + `BUSINESS_ERROR` + 真实拒因
//   （backend/src/utils/error.rs:209-211,375-385,815-825,843-851）。
//
// 覆盖面与避让：
// - 527-01 当前库存门（长度/重量两维）+ 拒绝后四列与状态零写入 + 合法部分出库守恒。
// - 527-02 累计入库门（长度/重量两维，用 API 可建的“当前量 > 累计量”脏行命中）
//   + 拒绝后零写入 + 不超累计量的合法出库守恒。
// - 避让：flow/400 已覆盖全额出库转“已出库”、软删、拆匹零头守恒；enhanced/437
//   已覆盖入库双单位一致性；fabric/01 已覆盖入库→出库正向守恒。本例只钉两条
//   此前无负例的超量门与拒绝后零写入，不重复全额出库/拆匹腿。
//
// 造数与清理：每例用 ensureTestEntities 的 product/supplier/warehouse，唯一 fabric_no，
// 不锚共享行、不写死主键。清理用真实 PUT 把当前两列归零（删除门只看在架实物与引用，
// 见 greige_fabric_handler.rs:737-752）后 DELETE /production/greige-fabrics/{id}。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
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

const STATUS_IN_STOCK = '在库';
const MSG_CURRENT_LENGTH = '出库长度不能大于现有长度';
const MSG_CURRENT_WEIGHT = '出库重量不能大于现有重量';
const MSG_CUM_LENGTH = '出库长度不能大于累计入库米数';
const MSG_CUM_WEIGHT = '出库重量不能大于累计入库重量';

const DECIMAL_KEYS = ['length_m', 'weight_kg', 'quantity_meters', 'quantity_kg'] as const;
type DecimalKey = (typeof DECIMAL_KEYS)[number];
type FourColumns = Record<DecimalKey, number>;

interface GreigeRow {
  id: number;
  fabric_no: string;
  length_m: string;
  weight_kg: string;
  quantity_meters: string;
  quantity_kg: string;
  status: string;
}

const CREATED_IDS: number[] = [];

/** DECIMAL 出参必须是字符串线格式；归一后按实体键与两位小数期望值比较。 */
function decimalNumber(value: unknown, label: string): number {
  expect(typeof value, `${label} DECIMAL 出参应为字符串线格式`).toBe('string');
  const n = Number(String(value));
  expect(Number.isFinite(n), `${label} 不是有效十进制数：${String(value)}`).toBe(true);
  return n;
}

function expectFourColumns(row: GreigeRow, expected: FourColumns, label: string): void {
  for (const key of DECIMAL_KEYS) {
    expect(decimalNumber(row[key], `${label} ${key}`), `${label} ${key}`).toBe(expected[key]);
  }
}

test.afterEach(async ({ page }) => {
  for (const id of CREATED_IDS.reverse()) {
    // 删除门按当前在架实物判（greige_fabric_handler.rs:737-752），故先把两列真实清零。
    try {
      await apiCall(page, 'PUT', `/production/greige-fabrics/${id}`, {
        length_m: 0,
        weight_kg: 0,
      });
    } catch (e) {
      console.warn(`[527] 清理前归零坯布 ${id} 失败：${(e as Error).message}`);
    }
    await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${id}`, `[527] 坯布 ${id}`);
  }
  CREATED_IDS.length = 0;
});

async function createGreige(
  page: Page,
  tag: string,
  columns: FourColumns
): Promise<{ id: number; row: GreigeRow }> {
  const ctx = getCtx();
  const productId = Number(ctx.productIds?.[0]);
  const supplierId = Number(ctx.supplierId);
  const warehouseId = Number(ctx.warehouseIds?.[0]);
  if (
    !Number.isInteger(productId) ||
    productId <= 0 ||
    !Number.isInteger(supplierId) ||
    supplierId <= 0 ||
    !Number.isInteger(warehouseId) ||
    warehouseId <= 0
  ) {
    throw new Error(
      `[${tag}] 前置实体缺失：product=${productId} supplier=${supplierId} warehouse=${warehouseId}`
    );
  }

  // 不填 gram_weight/width_cm：create 的双单位门在缺线密度时跳过（greige_fabric_handler.rs:284-294），
  // 使“当前量 > 累计量”的 defensive dirty row 可经正规 API 建出，专用于累计门。
  const created = await apiCall<{ id?: number }>(page, 'POST', '/production/greige-fabrics', {
    fabric_no: `${tag}-GF`,
    fabric_name: `E527 双门测试 ${tag}`,
    fabric_type: 'woven',
    product_id: productId,
    supplier_id: supplierId,
    warehouse_id: warehouseId,
    batch_no: `${tag}-BATCH`,
    // 数量四列按 f64 数字入参发送（CreateGreigeFabricRequest 全 f64，serde 不收字符串），
    // 出参 DECIMAL 才是字符串线格式；入参发字符串会被 Json 提取器拒成脱敏 VALIDATION_ERROR。
    length_m: columns.length_m,
    weight_kg: columns.weight_kg,
    quantity_meters: columns.quantity_meters,
    quantity_kg: columns.quantity_kg,
  });
  const id = Number(created.data?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`[${tag}] 建坯布未返回有效 id：${JSON.stringify(created)}`);
  }
  CREATED_IDS.push(id);

  const row = await apiCallRaw<GreigeRow>(page, 'GET', `/production/greige-fabrics/${id}`);
  expectFourColumns(row, columns, `[${tag}] 建单回读`);
  expect(row.status, `[${tag}] 建单缺省状态`).toBe(STATUS_IN_STOCK);
  return { id, row };
}

async function readRow(page: Page, id: number): Promise<GreigeRow> {
  return apiCallRaw<GreigeRow>(page, 'GET', `/production/greige-fabrics/${id}`);
}

async function expectOutboundGate(
  page: Page,
  id: number,
  body: Record<string, unknown>,
  messageFragment: string,
  label: string
): Promise<void> {
  const denied = await apiCallExpectFail(
    page,
    'POST',
    `/production/greige-fabrics/${id}/stock-out`,
    body
  );
  expect(denied.status, `${label} HTTP 状态`).toBe(400);
  expect(failureCode(denied), `${label} 机器码`).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    typeof denied.message === 'string' && denied.message.includes(messageFragment),
    `${label} 拒因须含稳定前缀「${messageFragment}」，实际 ${JSON.stringify(denied.message)}`
  ).toBe(true);
}

test.describe('527 坯布出库当前库存门与累计入库门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('527-01 当前库存超量被拒且零写入，合法部分出库守恒并保持在库', async ({ page }) => {
    const tag = genCode('E527CUR');
    const before: FourColumns = {
      length_m: 100,
      weight_kg: 20,
      quantity_meters: 100,
      quantity_kg: 20,
    };
    const { id } = await createGreige(page, tag, before);

    await expectOutboundGate(
      page,
      id,
      { length_m: 100.01 },
      MSG_CURRENT_LENGTH,
      '[527-01] 当前长度超量'
    );
    await expectOutboundGate(
      page,
      id,
      { weight_kg: 20.01 },
      MSG_CURRENT_WEIGHT,
      '[527-01] 当前重量超量'
    );

    const afterRejects = await readRow(page, id);
    expectFourColumns(afterRejects, before, '[527-01] 两次拒绝后');
    expect(afterRejects.status, '[527-01] 两次拒绝后状态未被改写').toBe(STATUS_IN_STOCK);

    const out = await apiCall<Partial<GreigeRow>>(
      page,
      'POST',
      `/production/greige-fabrics/${id}/stock-out`,
      { length_m: 25, weight_kg: 5 }
    );
    const expected: FourColumns = {
      length_m: 75,
      weight_kg: 15,
      quantity_meters: 75,
      quantity_kg: 15,
    };
    expectFourColumns(out.data as GreigeRow, expected, '[527-01] 出库响应');
    const afterOut = await readRow(page, id);
    expectFourColumns(afterOut, expected, '[527-01] 出库回读');
    expect(afterOut.status, '[527-01] 仍有余量，状态保持在库').toBe(STATUS_IN_STOCK);
  });

  test('527-02 累计入库超量被拒且零写入，不超累计的合法出库守恒', async ({ page }) => {
    const tag = genCode('E527CUM');
    const before: FourColumns = {
      // 当前量 100/20 > 累计量 50/10：当前门先过，累计门必拦。
      length_m: 100,
      weight_kg: 20,
      quantity_meters: 50,
      quantity_kg: 10,
    };
    const { id } = await createGreige(page, tag, before);

    await expectOutboundGate(page, id, { length_m: 60 }, MSG_CUM_LENGTH, '[527-02] 累计长度超量');
    await expectOutboundGate(page, id, { weight_kg: 11 }, MSG_CUM_WEIGHT, '[527-02] 累计重量超量');

    const afterRejects = await readRow(page, id);
    expectFourColumns(afterRejects, before, '[527-02] 两次拒绝后');
    expect(afterRejects.status, '[527-02] 两次拒绝后状态未被改写').toBe(STATUS_IN_STOCK);

    const out = await apiCall<Partial<GreigeRow>>(
      page,
      'POST',
      `/production/greige-fabrics/${id}/stock-out`,
      { length_m: 20, weight_kg: 4 }
    );
    const expected: FourColumns = {
      length_m: 80,
      weight_kg: 16,
      quantity_meters: 30,
      quantity_kg: 6,
    };
    expectFourColumns(out.data as GreigeRow, expected, '[527-02] 出库响应');
    const afterOut = await readRow(page, id);
    expectFourColumns(afterOut, expected, '[527-02] 出库回读');
    expect(afterOut.status, '[527-02] 仍有余量，状态保持在库').toBe(STATUS_IN_STOCK);
  });
});
