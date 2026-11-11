// 库存批次写面三端点的 e2e 契约用例。
//
// 功能 钉批次更新、批次删除、批次转移三条写腿的真实落库与拒绝方向。
// 调用方 CI 的 e2e 分片按文件粒度调度本文件，无其它调用方。
// 入参 无外部入参，前置由本用例经 POST /inventory/batches 自建，不依赖库里既有行。
// 传给谁 断言结果只进 Playwright 报告，不写任何仓库文件。
// 存什么 不落盘制品，被测数据落 inventory_stocks 与其审计表。
// 存哪里 数据在 CI 现场数据库，报告在 Actions 制品。
//
// 覆盖面。本文件钉三段。
// 一、更新的三态语义。请求体按 RFC 7386 JSON Merge Patch 解释，键缺席保持原值、
// 显式 null 清空可空列、有值覆盖。可空列取缸号、克重、幅宽三列做清空后回读；
// NOT NULL 列取色号、等级、库存状态、质量状态四列做显式 null 拒绝，每腿拒绝后
// 再回读一次证明原值未被改动，避免"拒绝了但顺手写坏"的半成品。remarks 是幽灵键，
// 模型无该列，发送后必须成功但出参里不得出现该键，钉住服务端不假造落库。
// 二、删除。删除成功后详情必须 404、按批次号过滤的列表必须零行，两侧都回读，
// 不接受只断言删除接口自身返回成功。
// 三、转移。源批次扣减、目标仓同批次号累加或新建，两侧数量按米数精确核对；
// 超量转移必须在事务内被拒且源批次数量分毫不动，拒绝后回读作反向对照。
//
// 事实来源。端点与方法对照 backend/src/routes/inventory.rs 的 batches 路由族。
// 出参键名以 backend/src/models/inventory_stock.rs 实体字段为准，snake_case，
// DECIMAL 列序列化为十进制字符串，断言先钉类型再钉数值。三态门控与四条拒绝文案
// 取自 backend/src/services/inventory_stock_service.rs 的 update_batch_fields，
// 超量腿钉"有非空拒因"而不钉拒因字面：bad_request 的出参走脱敏常量，具体文案不进契约。
// 中文词表（一等品、正常、合格）是写入侧字面值，不英文化。
// 全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallExpectFail,
  getCtx,
  genCode,
  failureCode,
  APP_ERROR_CODES,
} from './helpers';

/** 批次详情与更新出参共用的实体形状，键名逐字对照 inventory_stock 模型 */
interface BatchRow {
  id: number;
  warehouse_id: number;
  product_id: number;
  batch_no: string;
  color_no: string;
  dye_lot_no: string | null;
  grade: string;
  quantity_meters: string;
  quantity_kg: string;
  gram_weight: string | null;
  width: string | null;
  stock_status: string;
  quality_status: string;
}

/** 批次列表信封，分页四键由 PaginatedResponse 产出 */
interface BatchPage {
  items: BatchRow[];
  total: number;
  page: number;
  page_size: number;
}

test.describe('库存批次写面 更新三态 删除回读 转移守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  /** 自建一枚批次作为写腿前置，返回落库后的真实行 */
  async function seedBatch(
    page: import('@playwright/test').Page,
    warehouseId: number,
    meters: number,
    kg: number
  ): Promise<BatchRow> {
    const ctx = getCtx();
    const res = await apiCall<BatchRow>(page, 'POST', '/inventory/batches', {
      batch_no: genCode('B483'),
      product_id: ctx.productIds[0],
      warehouse_id: warehouseId,
      color_no: ctx.colorNos[0],
      dye_lot_no: genCode('DY483'),
      grade: '一等品',
      quantity_meters: meters,
      quantity_kg: kg,
      gram_weight: 180,
      width: 150,
    });
    expect(res.data).toBeTruthy();
    expect(typeof res.data.id).toBe('number');
    expect(res.data.batch_no).toMatch(/^B483-/);
    expect(res.data.grade).toBe('一等品');
    expect(typeof res.data.quantity_meters).toBe('string');
    expect(Number(res.data.quantity_meters)).toBe(meters);
    return res.data;
  }

  /** 详情回读，写腿之后一律走它而不是复用写腿自己的出参 */
  async function readBatch(page: import('@playwright/test').Page, id: number): Promise<BatchRow> {
    const res = await apiCall<BatchRow>(page, 'GET', `/inventory/batches/${id}`);
    expect(res.data.id).toBe(id);
    return res.data;
  }

  test('483-01 更新 键缺席保持原值 有值覆盖后可空列显式 null 清空', async ({ page }) => {
    const ctx = getCtx();
    const row = await seedBatch(page, ctx.warehouseIds[0], 100, 50);
    const originalColor = row.color_no;
    const originalDyeLot = row.dye_lot_no;
    expect(originalDyeLot).toBeTruthy();

    // 只传幅宽：其余键缺席，色号与缸号必须分毫不动
    const partial = await apiCall<BatchRow>(page, 'PUT', `/inventory/batches/${row.id}`, {
      width: 160,
    });
    expect(partial.message).toBe('批次更新成功');
    const afterPartial = await readBatch(page, row.id);
    expect(afterPartial.color_no).toBe(originalColor);
    expect(afterPartial.dye_lot_no).toBe(originalDyeLot);
    expect(afterPartial.grade).toBe('一等品');
    expect(Number(afterPartial.width)).toBe(160);
    expect(Number(afterPartial.gram_weight)).toBe(180);

    // 有值覆盖缸号与克重，再回读对齐
    const newDyeLot = genCode('DY483N');
    await apiCall(page, 'PUT', `/inventory/batches/${row.id}`, {
      dye_lot_no: newDyeLot,
      gram_weight: 200,
    });
    const afterSet = await readBatch(page, row.id);
    expect(afterSet.dye_lot_no).toBe(newDyeLot);
    expect(Number(afterSet.gram_weight)).toBe(200);

    // 可空列显式 null 清空：出参必须是 null 而不是缺席键，也不是旧值残留
    await apiCall(page, 'PUT', `/inventory/batches/${row.id}`, {
      dye_lot_no: null,
      gram_weight: null,
      width: null,
    });
    const afterNull = await readBatch(page, row.id);
    expect(afterNull.dye_lot_no).toBeNull();
    expect(afterNull.gram_weight).toBeNull();
    expect(afterNull.width).toBeNull();
    // 清空可空列不得连带改动 NOT NULL 列
    expect(afterNull.color_no).toBe(originalColor);
    expect(afterNull.grade).toBe('一等品');
  });

  test('483-02 更新 四个 NOT NULL 列显式 null 逐腿被拒且原值不动', async ({ page }) => {
    const ctx = getCtx();
    const row = await seedBatch(page, ctx.warehouseIds[0], 100, 50);
    const before = await readBatch(page, row.id);

    const legs = [
      { field: 'color_no', message: '色号不能清空：该字段为必填项' },
      { field: 'grade', message: '等级不能清空：该字段为必填项' },
      { field: 'stock_status', message: '库存状态不能清空：该字段为必填项' },
      { field: 'quality_status', message: '质量状态不能清空：该字段为必填项' },
    ];

    for (const leg of legs) {
      const res = await apiCallExpectFail(page, 'PUT', `/inventory/batches/${row.id}`, {
        [leg.field]: null,
      });
      expect(res.status).toBe(400);
      expect(failureCode(res)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(res.message).toBe(leg.message);

      // 反向对照：拒绝之后原值必须仍在，证明不是"先写坏再拒绝"
      const after = await readBatch(page, row.id);
      expect(after.color_no).toBe(before.color_no);
      expect(after.grade).toBe(before.grade);
      expect(after.stock_status).toBe(before.stock_status);
      expect(after.quality_status).toBe(before.quality_status);
    }
  });

  test('483-03 更新 remarks 幽灵键成功但不落库 出参不得出现该键', async ({ page }) => {
    const ctx = getCtx();
    const row = await seedBatch(page, ctx.warehouseIds[0], 100, 50);
    const res = await apiCall<BatchRow>(page, 'PUT', `/inventory/batches/${row.id}`, {
      remarks: genCode('RM483'),
    });
    expect(res.message).toBe('批次更新成功');
    const after = await readBatch(page, row.id);
    expect(Object.prototype.hasOwnProperty.call(after, 'remarks')).toBe(false);
    expect(after.color_no).toBe(row.color_no);
    expect(after.grade).toBe(row.grade);
  });

  test('483-04 删除 成功后详情 404 且按批次号过滤列表零行', async ({ page }) => {
    const ctx = getCtx();
    const row = await seedBatch(page, ctx.warehouseIds[0], 100, 50);

    const del = await apiCall<null>(page, 'DELETE', `/inventory/batches/${row.id}`);
    expect(del.message).toBe('批次删除成功');

    const gone = await apiCallExpectFail(page, 'GET', `/inventory/batches/${row.id}`);
    expect(gone.status).toBe(404);
    expect(failureCode(gone)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const listed = await apiCall<BatchPage>(
      page,
      'GET',
      `/inventory/batches?batch_no=${encodeURIComponent(row.batch_no)}&page=1&page_size=20`
    );
    expect(listed.data.items.filter(x => x.id === row.id)).toHaveLength(0);
    expect(listed.data.items.every(x => x.batch_no !== row.batch_no)).toBe(true);
  });

  test('483-05 转移 源扣目标加两侧守恒 超量被拒后源数量不动', async ({ page }) => {
    const ctx = getCtx();
    expect(ctx.warehouseIds.length).toBeGreaterThanOrEqual(2);
    const fromWh = ctx.warehouseIds[0];
    const toWh = ctx.warehouseIds[1];
    const row = await seedBatch(page, fromWh, 100, 50);

    const move = await apiCall<null>(page, 'POST', `/inventory/batches/${row.id}/transfer`, {
      from_warehouse_id: fromWh,
      to_warehouse_id: toWh,
      quantity_meters: 40,
      quantity_kg: 20,
    });
    expect(move.message).toBe('批次转移成功');

    const source = await readBatch(page, row.id);
    expect(Number(source.quantity_meters)).toBe(60);
    expect(Number(source.quantity_kg)).toBe(30);
    expect(source.warehouse_id).toBe(fromWh);

    // 目标仓按同批次号过滤后求和：服务可能累加到既有行也可能新建行，两种都必须守恒
    const target = await apiCall<BatchPage>(
      page,
      'GET',
      `/inventory/batches?warehouse_id=${toWh}&batch_no=${encodeURIComponent(row.batch_no)}&page=1&page_size=100`
    );
    expect(target.data.items.length).toBeGreaterThanOrEqual(1);
    const targetMeters = target.data.items.reduce((s, x) => s + Number(x.quantity_meters), 0);
    const targetKg = target.data.items.reduce((s, x) => s + Number(x.quantity_kg), 0);
    expect(targetMeters).toBe(40);
    expect(targetKg).toBe(20);
    expect(target.data.items.every(x => x.warehouse_id === toWh)).toBe(true);

    // 超量转移：米数与公斤数都远超源在库量，必须整笔被拒
    const over = await apiCallExpectFail(page, 'POST', `/inventory/batches/${row.id}/transfer`, {
      from_warehouse_id: fromWh,
      to_warehouse_id: toWh,
      quantity_meters: 99999,
      quantity_kg: 99999,
    });
    expect(over.status).toBe(400);
    expect(failureCode(over)).toBe(APP_ERROR_CODES.BAD_REQUEST);
    // bad_request 的出参文案恒为脱敏常量，只有 *_displayable 变体才外显自定义详情，
    // 所以这里钉"有拒因"而不钉拒因具体字面，钉字面等于把脱敏契约当业务文案契约。
    expect(over.message ?? '', '超量转移被拒时必须给出非空拒因').not.toBe('');

    // 反向对照：被拒后源批次三列不得出现半成品扣减
    const afterReject = await readBatch(page, row.id);
    expect(Number(afterReject.quantity_meters)).toBe(60);
    expect(Number(afterReject.quantity_kg)).toBe(30);
    const targetAfter = await apiCall<BatchPage>(
      page,
      'GET',
      `/inventory/batches?warehouse_id=${toWh}&batch_no=${encodeURIComponent(row.batch_no)}&page=1&page_size=100`
    );
    expect(targetAfter.data.items.reduce((s, x) => s + Number(x.quantity_meters), 0)).toBe(40);
  });
});
