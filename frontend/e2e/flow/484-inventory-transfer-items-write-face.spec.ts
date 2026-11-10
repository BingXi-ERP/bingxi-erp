// 调拨单明细写面两端点的 e2e 契约用例。
//
// 功能 钉调拨明细更新与删除两条写腿的三态语义、必填列拒清与删后回读。
// 调用方 CI 的 e2e 分片按文件粒度调度本文件，无其它调用方。
// 入参 无外部入参，前置由本用例自建白坯库存行与调拨单，不依赖库里既有行。
// 传给谁 断言结果只进 Playwright 报告，不写任何仓库文件。
// 存什么 不落盘制品，被测数据落 inventory_transfers 与 inventory_transfer_items。
// 存哪里 数据在 CI 现场数据库，报告在 Actions 制品。
//
// 覆盖面。本文件钉三段。
// 一、更新的三态语义。键缺席保持原值、有值覆盖、可空列显式 null 清空。可空列取
// 备注与单位成本两列，清空后从明细列表回读必须是 null 而不是旧值残留；覆盖腿
// 逐字段回读对齐，钉住"改了库里没变"的假保存形态不再现。
// 二、四个 NOT NULL 列显式 null 逐腿被拒。产品、调拨数量、色号、批次四列在任何
// DB 访问之前拒绝，文案外显不脱敏；每腿拒绝后再回读一次证明原值分毫不动。
// 白坯行色号本就是空串，空串是合法值而 null 不是，两者必须区分。
// 三、删除与不存在腿。删除成功后明细列表必须少掉该行，二次删除与更新一个不存在
// 的明细主键都必须 404，不接受只断言写接口自身返回成功。
//
// 事实来源。端点与方法对照 backend/src/routes/inventory.rs 的 transfers 路由族。
// 三态 DTO 与四个必填列的中文拒清文案取自 backend/src/services/inv/mod.rs 的
// UpdateInventoryTransferItemRequest 与 backend/src/services/inv/batch.rs 的
// update_item。出参键名以 backend/src/models/inventory_transfer_item.rs 为准，
// snake_case，DECIMAL 列序列化为十进制字符串。明细列表端点 data 直接是数组。
// 前置走白坯（色号空串）免缸号与匹号，与既有调拨用例同一范式，不依赖染色匹链。
// 全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallExpectFail,
  getCtx,
  genCode,
  seedGreigeStockIn,
  failureCode,
  APP_ERROR_CODES,
} from './helpers';

/** 调拨明细行形状，键名逐字对照 inventory_transfer_item 模型 */
interface TransferItemRow {
  id: number;
  transfer_id: number;
  product_id: number;
  quantity: string;
  shipped_quantity: string;
  received_quantity: string;
  unit_cost: string | null;
  notes: string | null;
  color_no: string;
  dye_lot_no: string | null;
  batch_no: string;
  piece_no: string | null;
}

/** 调拨建单出参只取主键与状态，其余键不在本文件断言面内 */
interface TransferHead {
  id: number;
  status: string;
}

test.describe('调拨明细写面 三态更新 必填拒清 删后回读', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  /** 自建白坯库存行与一张待审批调拨单，返回单头与本用例那一行明细 */
  async function seedTransferWithItem(
    page: import('@playwright/test').Page
  ): Promise<{ head: TransferHead; item: TransferItemRow; batchNo: string }> {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const fromWarehouseId = ctx.warehouseIds[0];
    const toWarehouseId = ctx.warehouseIds.find(id => id !== fromWarehouseId);
    if (productId === undefined || fromWarehouseId === undefined || toWarehouseId === undefined) {
      throw new Error(
        `[484] 前置不成立：需要产品与两个不同仓库，实际 warehouseIds=${ctx.warehouseIds.length}`
      );
    }
    const batchNo = `B-TRF-${genCode('484')}`;
    const seeded = await seedGreigeStockIn(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      quantityMeters: '200',
    });
    expect(Number(seeded.id), '白坯库存行主键必须为正整数').toBeGreaterThan(0);

    const created = await apiCall<TransferHead>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${batchNo}`,
      items: [{ product_id: productId, quantity: '30.00', batch_no: batchNo }],
    });
    expect(created.message).toBe('库存调拨单创建成功');
    expect(Number.isInteger(created.data.id) && created.data.id > 0).toBe(true);
    expect(created.data.status).toBe('pending');

    const items = await apiCall<TransferItemRow[]>(
      page,
      'GET',
      `/inventory/transfers/${created.data.id}/items`
    );
    expect(items.data).toHaveLength(1);
    const item = items.data[0];
    expect(item.transfer_id).toBe(created.data.id);
    expect(item.product_id).toBe(productId);
    expect(item.batch_no).toBe(batchNo);
    expect(typeof item.quantity).toBe('string');
    expect(Number(item.quantity)).toBe(30);
    // 白坯行色号是空串而不是 null，这是合法值，后面拒清腿要钉住两者不同
    expect(item.color_no).toBe('');
    return { head: created.data, item, batchNo };
  }

  /** 明细回读一律走列表端点按主键取行，不复用写腿自己的出参 */
  async function readItem(
    page: import('@playwright/test').Page,
    transferId: number,
    itemId: number
  ): Promise<TransferItemRow> {
    const res = await apiCall<TransferItemRow[]>(
      page,
      'GET',
      `/inventory/transfers/${transferId}/items`
    );
    const row = res.data.find(x => x.id === itemId);
    expect(row, `明细 ${itemId} 必须仍在调拨单 ${transferId} 的明细列表里`).toBeTruthy();
    return row as TransferItemRow;
  }

  test('484-01 更新 键缺席保持 有值覆盖 可空列显式 null 清空', async ({ page }) => {
    const { head, item } = await seedTransferWithItem(page);
    const before = await readItem(page, head.id, item.id);

    // 只传备注：其余键缺席，数量与批次必须分毫不动
    const noteText = `E2E-${genCode('N484')}`;
    const partial = await apiCall<TransferItemRow>(
      page,
      'PUT',
      `/inventory/transfers/items/${item.id}`,
      { notes: noteText }
    );
    expect(partial.message).toBe('调拨明细更新成功');
    const afterPartial = await readItem(page, head.id, item.id);
    expect(afterPartial.notes).toBe(noteText);
    expect(Number(afterPartial.quantity)).toBe(Number(before.quantity));
    expect(afterPartial.batch_no).toBe(before.batch_no);
    expect(afterPartial.product_id).toBe(before.product_id);
    expect(afterPartial.color_no).toBe(before.color_no);

    // 有值覆盖数量与单位成本：两列都必须真落库，钉住假保存形态
    await apiCall(page, 'PUT', `/inventory/transfers/items/${item.id}`, {
      quantity: '45.00',
      unit_cost: '12.50',
    });
    const afterSet = await readItem(page, head.id, item.id);
    expect(Number(afterSet.quantity)).toBe(45);
    expect(typeof afterSet.unit_cost).toBe('string');
    expect(Number(afterSet.unit_cost)).toBe(12.5);
    expect(afterSet.notes).toBe(noteText);

    // 可空列显式 null 清空：出参必须是 null，不是缺席键也不是旧值
    await apiCall(page, 'PUT', `/inventory/transfers/items/${item.id}`, {
      notes: null,
      unit_cost: null,
    });
    const afterNull = await readItem(page, head.id, item.id);
    expect(afterNull.notes).toBeNull();
    expect(afterNull.unit_cost).toBeNull();
    // 清空可空列不得连带改动必填列
    expect(Number(afterNull.quantity)).toBe(45);
    expect(afterNull.batch_no).toBe(before.batch_no);
    expect(afterNull.color_no).toBe('');
  });

  test('484-02 更新 四个必填列显式 null 逐腿被拒且原值不动', async ({ page }) => {
    const { head, item } = await seedTransferWithItem(page);
    const before = await readItem(page, head.id, item.id);

    const legs = [
      { field: 'product_id', message: '产品不能清空：该字段为必填项' },
      { field: 'quantity', message: '调拨数量不能清空：该字段为必填项' },
      { field: 'color_no', message: '色号不能清空：该字段为必填项' },
      { field: 'batch_no', message: '批次不能清空：该字段为必填项' },
    ];

    for (const leg of legs) {
      const res = await apiCallExpectFail(page, 'PUT', `/inventory/transfers/items/${item.id}`, {
        [leg.field]: null,
      });
      expect(res.status).toBe(400);
      expect(failureCode(res)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(res.message).toBe(leg.message);

      // 反向对照：拒绝发生在任何 DB 访问之前，原值必须一行未动
      const after = await readItem(page, head.id, item.id);
      expect(after.product_id).toBe(before.product_id);
      expect(after.quantity).toBe(before.quantity);
      expect(after.color_no).toBe(before.color_no);
      expect(after.batch_no).toBe(before.batch_no);
    }

    // 白坯改回白坯提交空串是合法覆盖，与显式 null 被拒必须区分开
    const emptyColor = await apiCall<TransferItemRow>(
      page,
      'PUT',
      `/inventory/transfers/items/${item.id}`,
      { color_no: '' }
    );
    expect(emptyColor.message).toBe('调拨明细更新成功');
    const afterEmpty = await readItem(page, head.id, item.id);
    expect(afterEmpty.color_no).toBe('');
  });

  test('484-03 删除 成功后明细列表少一行 二次删除 404', async ({ page }) => {
    const { head, item } = await seedTransferWithItem(page);
    const itemsBefore = await apiCall<TransferItemRow[]>(
      page,
      'GET',
      `/inventory/transfers/${head.id}/items`
    );
    expect(itemsBefore.data).toHaveLength(1);

    const del = await apiCall<null>(page, 'DELETE', `/inventory/transfers/items/${item.id}`);
    expect(del.message).toBe('调拨明细已删除');

    const itemsAfter = await apiCall<TransferItemRow[]>(
      page,
      'GET',
      `/inventory/transfers/${head.id}/items`
    );
    expect(itemsAfter.data.filter(x => x.id === item.id)).toHaveLength(0);
    expect(itemsAfter.data).toHaveLength(itemsBefore.data.length - 1);

    // 已删主键再删必须 404，不能幂等成功掩盖"其实没删"或"删了两次"
    const twice = await apiCallExpectFail(page, 'DELETE', `/inventory/transfers/items/${item.id}`);
    expect(twice.status).toBe(404);
    expect(failureCode(twice)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('484-04 更新 不存在的明细主键 404 且给出非空拒因', async ({ page }) => {
    const absentId = 2147483647;
    const res = await apiCallExpectFail(page, 'PUT', `/inventory/transfers/items/${absentId}`, {
      notes: 'E2E-ABSENT',
    });
    expect(res.status).toBe(404);
    expect(failureCode(res)).toBe(APP_ERROR_CODES.NOT_FOUND);
    // not_found 的出参文案恒为脱敏常量（只有 not_found_displayable 外显自定义详情），
    // 断"文案点名该主键"会把脱敏契约钉成业务契约，钉的只能是有非空拒因。
    expect(res.message ?? '', '更新不存在的主键必须给出非空拒因').not.toBe('');
  });
});
