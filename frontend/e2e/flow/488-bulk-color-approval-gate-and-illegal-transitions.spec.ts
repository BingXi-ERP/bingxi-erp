import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  expectBusinessRejection,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  testStorageStatePath,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';

/**
 * 488 批色单建档门禁与状态机非法跃迁断言集（bulk-color-approvals 域）。
 *
 * 调用面（backend/src/routes 注册，前缀 /api/v1/erp）：
 * POST /bulk-color-approvals 建单、GET /bulk-color-approvals 列表、
 * GET /bulk-color-approvals/{id} 详情、DELETE /bulk-color-approvals/{id} 删除、
 * GET /bulk-color-approvals/{id}/history 审批时间线、GET /bulk-color-approvals/report、
 * GET /bulk-color-approvals/statistics、
 * POST /bulk-color-approvals/{id}/send-to-customer 与 approve 与 reject 与 rework 与
 * downgrade 与 scrap 六条反馈跃迁。
 *
 * 入参与出参键名来源：backend/src/handlers/bulk_color_approval_handler.rs 的
 * CreateBulkColorApprovalDto 与 CustomerApproveDto 与 CustomerRejectDto 与
 * CustomerReworkDto 与 DowngradeDto 与 ScrapDto 及 BulkColorApprovalInfo 序列化键
 * （snake_case）。列表出参是 PaginatedResponse 信封（data.items 与 data.total），
 * history 与 report 出参是数组，statistics 出参是对象。
 *
 * 状态词表唯一事实来源是写入方 services/bulk_color_approval_service.rs 的 ApprovalStatus
 * （pending / sampled / sent_to_customer / approved / rejected / rework / downgraded /
 * scrapped，均小写）。终态为 approved 与 rejected 与 downgraded 与 scrapped；
 * 发货门禁仅 approved 解除，建单时 delivery_blocking 恒为 true。
 * 跃迁门：send_to_customer 要求当前为 sampled；scrap 允许 approved 与 pending 与
 * sampled 三个来源（pending 与 sampled 属直接报废，不要求先剪样发送）。
 *
 * 拒因到 HTTP 的映射（handlers/bulk_color_approval_handler.rs 的 bca_err）：
 * Validation 族走 validation_displayable，出参 message 携带真实可操作拒因，
 * 机器码属 VALIDATION_ERROR 族，本文件对这些点断文案；
 * InvalidState 族走脱敏的 AppError::business，出参 message 不外显真实文案，
 * 因此这些点只断 HTTP 400 与 BUSINESS_ERROR 机器码，不据文案判责。
 *
 * 本文件不覆盖剪大货样与 approve 与 reject 与 rework 与 downgrade 的正向路径：剪样要求
 * 大货已入库且质检通过且生产订单 completed 并联动扣减生成样品匹，前置链属另一条夹具通道，
 * 另文登记；scrap 的 pending 直接报废正向已由 488-05d 覆盖。
 */

interface BcaRow {
  id?: number;
  sales_order_id?: number;
  sales_order_item_id?: number | null;
  dye_batch_id?: number;
  customer_id?: number;
  product_id?: number | null;
  color_no?: string | null;
  sample_type?: string;
  approval_status?: string;
  delivery_blocking?: boolean;
  remark?: string | null;
}

interface BcaListPage {
  items?: BcaRow[];
  total?: number;
  page?: number;
  page_size?: number;
}

interface BcaHistoryRow {
  id?: number;
  approval_status?: string;
}

interface SalesOrderItemRow {
  id?: number;
  product_id?: number;
  color_no?: string | null;
}

interface SalesOrderDetailRow {
  items?: SalesOrderItemRow[];
}

/** 本文件建的批色单与销售订单，供 afterAll 走真实删除通道回收 */
const createdApprovalIds: number[] = [];
const createdSalesOrderIds: number[] = [];

/** 建一张属于本会话用户的销售订单（批色单的父单，归属门按父单 created_by 判定） */
async function createSalesOrder(page: Page, productId: number): Promise<number> {
  const ctx = getCtx();
  const created = await apiCall<{ id?: number }>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: productId, quantity: 2, unit_price: '12.50' }],
  });
  const id = Number(created?.data?.id);
  expect(
    Number.isFinite(id) && id > 0,
    `销售订单建档应回主键 id，实际响应=${JSON.stringify(created?.data)}`
  ).toBe(true);
  createdSalesOrderIds.push(id);
  return id;
}

async function readSalesOrderItem(page: Page, orderId: number): Promise<SalesOrderItemRow> {
  const detail = await apiCallRaw<SalesOrderDetailRow>(page, 'GET', `/sales/orders/${orderId}`);
  const items = detail?.items;
  expect(
    Array.isArray(items),
    `销售订单详情应装配 items 明细数组，实际=${JSON.stringify(detail)}`
  ).toBe(true);
  expect(items && items.length > 0, `销售订单应至少含一条明细行，实际行数=${items?.length}`).toBe(
    true
  );
  return items![0];
}

/** 批色单建档：入参可覆盖，成功与否交调用方判（负例要钉拒因，不在此处断成功） */
async function postCreate(
  page: Page,
  body: Record<string, unknown>
): Promise<{ ok: boolean; row?: BcaRow; code: number; message: string }> {
  const res = await apiCall<BcaRow>(page, 'POST', '/bulk-color-approvals', body);
  return { ok: res.code === 200, row: res.data, code: res.code, message: res.message };
}

async function createApproval(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<BcaRow> {
  const ctx = getCtx();
  const body: Record<string, unknown> = {
    sales_order_id: ctx.salesOrderId,
    dye_batch_id: ctx.dyeBatchId,
    customer_id: ctx.customerId,
    color_no: genCode('BC'),
    dye_lot_no: ctx.dyeLotNo ?? genCode('LOT'),
    batch_no: genCode('BATCH'),
    remark: genCode('BCA488'),
    ...overrides,
  };
  const res = await postCreate(page, body);
  expect(res.ok, `批色单建档应成功，实际 code=${res.code} message=${res.message}`).toBe(true);
  const row = res.row;
  const id = row?.id;
  expect(typeof id, `批色单建档应返回数字主键 id，实际响应=${JSON.stringify(row)}`).toBe('number');
  createdApprovalIds.push(id as number);
  return row as BcaRow;
}

test.describe('488 批色单建档门禁与状态机非法跃迁', () => {
  test.beforeAll(async ({ browser }) => {
    // page 与 context fixture 按用例创建，beforeAll 取不到会整片抛错；共享前置自建上下文，
    // 与本文件 afterAll 同型。前置 ID 落在模块级 ctx，上下文关闭后各用例仍读得到。
    const browserCtx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await browserCtx.newPage();
    try {
      await loginViaUI(page);
      await ensureTestEntities(page);
      const seeded = getCtx();
      expect(
        typeof seeded.salesOrderId === 'number' && seeded.salesOrderId > 0,
        `批色单父单缺失，无法建前置：ctx.salesOrderId=${String(seeded.salesOrderId)}`
      ).toBe(true);
      expect(
        typeof seeded.dyeBatchId === 'number' && seeded.dyeBatchId > 0,
        `染色批次缺失，无法建前置：ctx.dyeBatchId=${String(seeded.dyeBatchId)}`
      ).toBe(true);
    } finally {
      await browserCtx.close();
    }
  });

  test('488-01 建档缺省态为 pending 且发货门禁默认阻断并读回一致', async ({ page }) => {
    const row = await createApproval(page);
    const id = row.id as number;

    expect(row.approval_status, `新建批色单状态应为词表 pending，实际=${row.approval_status}`).toBe(
      'pending'
    );
    expect(row.delivery_blocking, '新建批色单应默认阻断发货（delivery_blocking 恒为 true）').toBe(
      true
    );
    expect(row.sample_type, `样布类型缺省应归一为 cut_sample，实际=${row.sample_type}`).toBe(
      'cut_sample'
    );

    const detail = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(detail?.id, `详情读回主键应为 ${id}，实际=${detail?.id}`).toBe(id);
    expect(detail?.approval_status, `详情读回应仍为 pending，实际=${detail?.approval_status}`).toBe(
      'pending'
    );
    expect(detail?.delivery_blocking, '详情读回发货门禁应仍为阻断').toBe(true);
    expect(detail?.sales_order_id, '详情读回父单应等于建档父单').toBe(row.sales_order_id);

    const list = await apiCallRaw<BcaListPage>(page, 'GET', '/bulk-color-approvals');
    expect(
      Array.isArray(list?.items),
      `列表出参应为 items 数组，实际=${JSON.stringify(list)}`
    ).toBe(true);
    expect(
      list?.items?.some(r => r.id === id),
      `新建批色单 ${id} 应出现在列表首屏，实际 total=${list?.total}`
    ).toBe(true);
  });

  test('488-02 样布类型非法值被拒且拒因点名两个合法取值', async ({ page }) => {
    const bad = await apiCallExpectFail(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: getCtx().salesOrderId,
      dye_batch_id: getCtx().dyeBatchId,
      customer_id: getCtx().customerId,
      sample_type: 'unknown_sample_type',
      remark: genCode('BCA488BAD'),
    });
    expect(bad.status, `非法样布类型应返回 400，实际=${bad.status}`).toBe(400);
    expect(
      failureCode(bad),
      `非法样布类型机器码应为 VALIDATION_ERROR 族，实际=${failureCode(bad)}`
    ).toContain('VALIDATION');
    expect(
      typeof bad.message === 'string' && bad.message.includes('cut_sample'),
      `校验族拒因可外显，应点名合法取值 cut_sample，实际 message=${JSON.stringify(bad.message)}`
    ).toBe(true);
  });

  test('488-03 明细行不属于所选订单被拒（跨单错挂拦截）', async ({ page }) => {
    const orderA = await createSalesOrder(page, getCtx().productIds[0]);
    const orderB = await createSalesOrder(page, getCtx().productIds[0]);
    const itemA = await readSalesOrderItem(page, orderA);
    const itemAId = Number(itemA.id);
    expect(
      Number.isFinite(itemAId) && itemAId > 0,
      `订单 ${orderA} 明细行主键应可用，实际=${JSON.stringify(itemA)}`
    ).toBe(true);

    const fail = await apiCallExpectFail(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: orderB,
      sales_order_item_id: itemAId,
      dye_batch_id: getCtx().dyeBatchId,
      customer_id: getCtx().customerId,
      remark: genCode('BCA488CROSS'),
    });
    expect(fail.status, `跨单错挂明细行应返回 400，实际=${fail.status}`).toBe(400);
    expect(
      typeof fail.message === 'string' && fail.message.includes('不属于'),
      `跨单错挂应给出可外显的归属拒因，实际 message=${JSON.stringify(fail.message)}`
    ).toBe(true);

    await tryCleanup(page, 'DELETE', `/sales/orders/${orderA}`, `sales-order#${orderA}`);
    await tryCleanup(page, 'DELETE', `/sales/orders/${orderB}`, `sales-order#${orderB}`);
  });

  test('488-04 明细行不存在被拒（不静默忽略）', async ({ page }) => {
    const fail = await apiCallExpectFail(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: getCtx().salesOrderId,
      sales_order_item_id: 99999999,
      dye_batch_id: getCtx().dyeBatchId,
      customer_id: getCtx().customerId,
      remark: genCode('BCA488NOITEM'),
    });
    expect(fail.status, `不存在的明细行应返回 400，实际=${fail.status}`).toBe(400);
    expect(
      typeof fail.message === 'string' && fail.message.includes('不存在'),
      `明细行缺席应给出可外显拒因，实际 message=${JSON.stringify(fail.message)}`
    ).toBe(true);
  });

  test('488-05 带合法明细行时产品与色号以行值为准而非请求体手填值', async ({ page }) => {
    const orderId = await createSalesOrder(page, getCtx().productIds[0]);
    const item = await readSalesOrderItem(page, orderId);
    const itemId = Number(item.id);
    const itemProductId = Number(item.product_id);

    const created = await apiCall<BcaRow>(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: orderId,
      sales_order_item_id: itemId,
      dye_batch_id: getCtx().dyeBatchId,
      customer_id: getCtx().customerId,
      product_id: itemProductId + 987654,
      color_no: 'ZZZ-E2E-FAKE',
      remark: genCode('BCA488ITEM'),
    });
    const row = created.data;
    const id = row?.id;
    expect(
      typeof id,
      `带行建档应返回数字主键 id，实际响应=${JSON.stringify(row)} message=${created.message}`
    ).toBe('number');
    createdApprovalIds.push(id as number);

    expect(row?.sales_order_item_id, `建档应保留明细行 id ${itemId}`).toBe(itemId);
    expect(
      row?.product_id,
      `产品应以明细行为准（请求体手填 ${itemProductId + 987654} 不生效），实际=${row?.product_id}`
    ).toBe(itemProductId);
    expect(
      row?.color_no,
      `色号不得保留请求体伪造值 ZZZ-E2E-FAKE，实际=${JSON.stringify(row?.color_no)}`
    ).not.toBe('ZZZ-E2E-FAKE');

    const detail = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(detail?.product_id, `详情读回产品应与行一致，实际=${detail?.product_id}`).toBe(
      itemProductId
    );

    await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `sales-order#${orderId}`);
  });

  test('488-05b 已剪样之前的五条跃迁在 pending 态全被状态机拒绝', async ({ page }) => {
    const row = await createApproval(page);
    const id = row.id as number;

    const rejectBody = { reject_reason: 'E2E 色差偏差过大' };
    const cases: { label: string; method: 'POST'; path: string; body?: Record<string, unknown> }[] =
      [
        {
          label: '发送客户批色',
          method: 'POST',
          path: `/bulk-color-approvals/${id}/send-to-customer`,
        },
        { label: '客户批准', method: 'POST', path: `/bulk-color-approvals/${id}/approve` },
        {
          label: '客户拒绝',
          method: 'POST',
          path: `/bulk-color-approvals/${id}/reject`,
          body: rejectBody,
        },
        {
          label: '客户返工',
          method: 'POST',
          path: `/bulk-color-approvals/${id}/rework`,
          body: rejectBody,
        },
        {
          label: '降级处理',
          method: 'POST',
          path: `/bulk-color-approvals/${id}/downgrade`,
          body: rejectBody,
        },
      ];

    for (const c of cases) {
      const fail = await apiCallExpectFail(page, c.method, c.path, c.body);
      expectBusinessRejection(fail, `pending 态 ${c.label} 应被状态机拒绝`);
      expect(
        failureCode(fail),
        `pending 态 ${c.label} 的机器码应为 BUSINESS_ERROR（状态门走脱敏构造器），实际=${failureCode(
          fail
        )}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    }

    const after = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(
      after?.approval_status,
      `五条非法跃迁均不得改状态，读回应仍为 pending，实际=${after?.approval_status}`
    ).toBe('pending');
    expect(after?.delivery_blocking, '非法跃迁后发货门禁应仍为阻断').toBe(true);
  });

  test('488-05c 非法跃迁不写审批时间线且读面形状成立', async ({ page }) => {
    const row = await createApproval(page);
    const id = row.id as number;

    const before = await apiCallRaw<BcaHistoryRow[]>(
      page,
      'GET',
      `/bulk-color-approvals/${id}/history`
    );
    expect(Array.isArray(before), `history 应返回数组，实际=${JSON.stringify(before)}`).toBe(true);

    const fail = await apiCallExpectFail(page, 'POST', `/bulk-color-approvals/${id}/reject`, {
      reject_reason: 'E2E 非法跃迁不留痕',
    });
    expectBusinessRejection(fail, 'pending 态拒绝应被状态机拦下');

    const after = await apiCallRaw<BcaHistoryRow[]>(
      page,
      'GET',
      `/bulk-color-approvals/${id}/history`
    );
    expect(
      Array.isArray(after) && after.length === (before as BcaHistoryRow[]).length,
      `被拒的跃迁不得写入审批时间线，前=${(before as BcaHistoryRow[]).length} 后=${after?.length}`
    ).toBe(true);

    const report = await apiCallRaw<unknown[]>(page, 'GET', '/bulk-color-approvals/report');
    expect(Array.isArray(report), `report 应返回数组，实际类型=${typeof report}`).toBe(true);

    const stats = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      '/bulk-color-approvals/statistics'
    );
    expect(
      !!stats && typeof stats === 'object' && !Array.isArray(stats),
      `statistics 应返回聚合对象，实际=${JSON.stringify(stats)?.slice(0, 120)}`
    ).toBe(true);
  });

  test('488-05d pending 态直接报废是状态机明文允许的终态跃迁', async ({ page }) => {
    // 服务层状态机把 pending 与 sampled 列为报废合法来源（直接报废），只有剪样发送后的
    // 反馈跃迁才要求前置态；本腿钉合法跃迁真落库且终态仍阻断发货。
    const row = await createApproval(page);
    const id = row.id as number;

    await apiCallRaw(page, 'POST', `/bulk-color-approvals/${id}/scrap`, {
      reject_reason: 'E2E 胚布瑕疵直接报废',
    });

    const after = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(
      after?.approval_status,
      `pending 直接报废应落 scrapped 终态，实际=${after?.approval_status}`
    ).toBe('scrapped');
    expect(after?.delivery_blocking, 'scrapped 终态仍须阻断发货（需重新生产或换缸）').toBe(true);
  });

  test('488-06 删除腿生效后详情与再删均判 404', async ({ page }) => {
    const row = await createApproval(page);
    const id = row.id as number;

    const deleted = await apiCall(page, 'DELETE', `/bulk-color-approvals/${id}`);
    expect(deleted.code, `删除批色单应成功，实际=${deleted.code}`).toBe(200);
    const idx = createdApprovalIds.indexOf(id);
    if (idx >= 0) createdApprovalIds.splice(idx, 1);

    const readback = await apiCallExpectFail(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(readback.status, `删除后详情读回应 404，实际=${readback.status}`).toBe(404);
    expect(
      failureCode(readback),
      `删除后读回机器码应为 NOT_FOUND，实际=${failureCode(readback)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    const deleteAgain = await apiCallExpectFail(page, 'DELETE', `/bulk-color-approvals/${id}`);
    expect(deleteAgain.status, `重复删除应 404，实际=${deleteAgain.status}`).toBe(404);

    const list = await apiApiList(page);
    expect(
      list?.items?.some(r => r.id === id),
      `删除后列表不得仍含批色单 ${id}`
    ).toBe(false);
  });

  test('488-07 不存在的批色单 id 在详情与跃迁与时间线上均判 404', async ({ page }) => {
    const detail = await apiCallExpectFail(page, 'GET', '/bulk-color-approvals/99999999');
    expect(detail.status, `不存在 id 的详情应 404，实际=${detail.status}`).toBe(404);
    expect(failureCode(detail), `不存在 id 详情机器码应为 NOT_FOUND`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );

    const approve = await apiCallExpectFail(page, 'POST', '/bulk-color-approvals/99999999/approve');
    expect(approve.status, `不存在 id 的批准应 404，实际=${approve.status}`).toBe(404);

    const history = await apiCallExpectFail(page, 'GET', '/bulk-color-approvals/99999999/history');
    expect(history.status, `不存在 id 的时间线应 404，实际=${history.status}`).toBe(404);
  });

  test.afterAll(async ({ browser }) => {
    // 批色单删除腿无状态门（服务层只校验存在性后硬删），故本文件建档记录可全量回收；
    // 销售订单只在草稿态可删，跃迁未动过它，删除失败仅告警不掩盖。
    const ctx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdApprovalIds) {
        await tryCleanup(page, 'DELETE', `/bulk-color-approvals/${id}`, `bca#${id}`);
      }
      for (const id of createdSalesOrderIds) {
        await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `sales-order#${id}`);
      }
    } finally {
      await ctx.close();
    }
  });
});

async function apiApiList(page: Page): Promise<BcaListPage> {
  return await apiCallRaw<BcaListPage>(page, 'GET', '/bulk-color-approvals');
}
