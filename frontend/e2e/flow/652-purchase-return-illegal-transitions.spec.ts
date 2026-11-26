// 采购退货状态机：draft/submitted/approved/rejected 四态的真实 API 负例回归。
// 状态词表以 backend/src/models/status/purchase_inventory.rs 为准，逐字符小写。
// 所有拒绝必须同时满足 HTTP 400、BUSINESS_ERROR 与统一失败信封，并在动作后回读主单和明细零漂移。
import { test, expect, type Page } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  getCtx,
  tryCleanup,
  failureCode,
  expectStateGateRejection,
  APP_ERROR_CODES,
  type ApiFailureResult,
} from './helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface PurchaseReturnRead {
  id: number;
  return_no: string;
  return_status: string;
  reason_detail: string | null;
  notes: string | null;
  total_quantity: string | number | null;
  total_amount: string | number | null;
  approved_by: number | null;
  approved_at: string | null;
  rejected_reason: string | null;
  updated_at: string;
}

interface ReturnItemRead {
  id: number;
  return_id: number;
  line_no: number;
  material_id: number;
  quantity_returned: string | number;
  unit_price: string | number;
  notes: string | null;
  color_no: string;
  dye_lot_no: string;
  batch_no: string;
}

async function readReturn(page: Page, id: number): Promise<PurchaseReturnRead> {
  return apiCallRaw<PurchaseReturnRead>(page, 'GET', `/purchase/returns/${id}`);
}

async function readItems(page: Page, id: number): Promise<ReturnItemRead[]> {
  return apiCallRaw<ReturnItemRead[]>(page, 'GET', `/purchase/returns/${id}/items`);
}

function expectStateGateRejected(result: ApiFailureResult, context: string): void {
  expectStateGateRejection(
    result,
    `${context}（实际 status=${result.status} code=${JSON.stringify(result.code)}）`
  );
  expect(failureCode(result), `${context}：机器码应恰为 BUSINESS_ERROR`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
  expect(
    typeof result.trace_id === 'string' && result.trace_id.length > 0,
    `${context}：失败信封应含非空 trace_id`
  ).toBe(true);
  expect(result.timestamp, `${context}：失败信封应含 timestamp`).not.toBeNull();
  expect(result.timestamp, `${context}：失败信封应含 timestamp`).not.toBeUndefined();
}

async function seedReturnWithItem(
  page: Page,
  tag: string
): Promise<{ id: number; itemId: number }> {
  const ctx = getCtx();
  if (!ctx.supplierId) throw new Error('前置缺失：ctx.supplierId 未就绪');
  const productId = ctx.productIds[0];
  if (!productId) throw new Error('前置缺失：ctx.productIds[0] 未就绪');

  const created = await apiCall<{ id?: number; return_status?: string }>(
    page,
    'POST',
    '/purchase/returns',
    {
      // 仓库为可选项；本例只验证状态门，库存扣减由 purchase/14 独立覆盖。
      supplier_id: ctx.supplierId,
      return_date: new Date().toISOString().slice(0, 10),
      reason_type: '色差',
      reason_detail: `652-${tag}-退货原因`,
      notes: `652-${tag}-备注`,
    }
  );
  const id = created.data?.id;
  if (!id) throw new Error(`建采购退货单未返回 id：${JSON.stringify(created)}`);
  expect(created.data.return_status, '新建采购退货单应为 draft').toBe('draft');
  CLEANUP.push({ path: `/purchase/returns/${id}`, label: `652 采购退货 ${id}` });

  const item = await apiCall<{ id?: number }>(page, 'POST', `/purchase/returns/${id}/items`, {
    line_no: 1,
    material_id: productId,
    quantity_returned: '5',
    unit_price: '10.00',
    notes: `652-${tag}-明细`,
  });
  const itemId = item.data?.id;
  if (!itemId) throw new Error(`建退货明细未返回 id：${JSON.stringify(item)}`);
  return { id, itemId };
}

async function expectUnchanged(
  page: Page,
  id: number,
  beforeReturn: PurchaseReturnRead,
  beforeItems: ReturnItemRead[],
  context: string
): Promise<void> {
  expect(await readReturn(page, id), `${context}：主单应零漂移`).toEqual(beforeReturn);
  expect(await readItems(page, id), `${context}：明细应零漂移`).toEqual(beforeItems);
}

async function expectNonDraftMutationsRejected(
  page: Page,
  id: number,
  itemId: number,
  context: string
): Promise<void> {
  const productId = getCtx().productIds[0];
  if (!productId) throw new Error('前置缺失：ctx.productIds[0] 未就绪');
  const attempts: Array<{
    label: string;
    method: 'PUT' | 'DELETE' | 'POST';
    path: string;
    body?: Record<string, unknown>;
  }> = [
    {
      label: '修改主单',
      method: 'PUT',
      path: `/purchase/returns/${id}`,
      body: { notes: '652-非法改单' },
    },
    { label: '删除主单', method: 'DELETE', path: `/purchase/returns/${id}` },
    {
      label: '新增明细',
      method: 'POST',
      path: `/purchase/returns/${id}/items`,
      body: { line_no: 2, material_id: productId, quantity_returned: '1', unit_price: '10.00' },
    },
    {
      label: '修改明细',
      method: 'PUT',
      path: `/purchase/returns/${id}/items/${itemId}`,
      body: { quantity_returned: '999' },
    },
    { label: '删除明细', method: 'DELETE', path: `/purchase/returns/${id}/items/${itemId}` },
  ];

  for (const attempt of attempts) {
    const result = await apiCallExpectFail(page, attempt.method, attempt.path, attempt.body);
    expectStateGateRejected(result, `${context}-${attempt.label}`);
  }
}

async function expectTerminalActionsRejected(
  page: Page,
  id: number,
  context: string
): Promise<void> {
  const actions: Array<{ label: string; path: string; body?: Record<string, unknown> }> = [
    { label: '重复提交', path: `/purchase/returns/${id}/submit` },
    { label: '重复审批', path: `/purchase/returns/${id}/approve` },
    {
      label: '终态拒绝',
      path: `/purchase/returns/${id}/reject`,
      body: { reason: '652-终态非法拒绝' },
    },
  ];
  for (const action of actions) {
    const result = await apiCallExpectFail(page, 'POST', action.path, action.body);
    expectStateGateRejected(result, `${context}-${action.label}`);
  }
}

test.describe('652 采购退货非法状态跃迁', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
    await ensureTestEntities(page);
  });

  test('652-01 DRAFT 不能跳级审批或拒绝，合法提交后进入 SUBMITTED', async ({ page }) => {
    const { id } = await seedReturnWithItem(page, 'draft');
    const before = await readReturn(page, id);

    const approve = await apiCallExpectFail(page, 'POST', `/purchase/returns/${id}/approve`);
    expectStateGateRejected(approve, 'DRAFT 直接审批');
    const reject = await apiCallExpectFail(page, 'POST', `/purchase/returns/${id}/reject`, {
      reason: '652-DRAFT-非法拒绝',
    });
    expectStateGateRejected(reject, 'DRAFT 直接拒绝');
    expect(await readReturn(page, id), '两次跳级拒绝后主单应零漂移').toEqual(before);

    await apiCall(page, 'POST', `/purchase/returns/${id}/submit`);
    expect((await readReturn(page, id)).return_status, '合法提交后应为 submitted').toBe(
      'submitted'
    );
  });

  test('652-02 SUBMITTED 重复提交与改单/改明细/删除全部拒绝且零漂移', async ({ page }) => {
    const { id, itemId } = await seedReturnWithItem(page, 'submitted');
    await apiCall(page, 'POST', `/purchase/returns/${id}/submit`);
    const beforeReturn = await readReturn(page, id);
    const beforeItems = await readItems(page, id);
    expect(beforeReturn.return_status).toBe('submitted');

    const resubmit = await apiCallExpectFail(page, 'POST', `/purchase/returns/${id}/submit`);
    expectStateGateRejected(resubmit, 'SUBMITTED 重复提交');
    await expectNonDraftMutationsRejected(page, id, itemId, 'SUBMITTED');
    await expectUnchanged(page, id, beforeReturn, beforeItems, 'SUBMITTED 全部非法动作后');
  });

  test('652-03 REJECTED 不能重提、审批、再拒绝或修改明细', async ({ page }) => {
    const { id, itemId } = await seedReturnWithItem(page, 'rejected');
    await apiCall(page, 'POST', `/purchase/returns/${id}/submit`);
    const reason = '652-首次拒绝理由';
    await apiCall(page, 'POST', `/purchase/returns/${id}/reject`, { reason });
    const beforeReturn = await readReturn(page, id);
    const beforeItems = await readItems(page, id);
    expect(beforeReturn.return_status).toBe('rejected');
    expect(beforeReturn.rejected_reason).toBe(reason);

    await expectTerminalActionsRejected(page, id, 'REJECTED');
    await expectNonDraftMutationsRejected(page, id, itemId, 'REJECTED');
    await expectUnchanged(page, id, beforeReturn, beforeItems, 'REJECTED 全部非法动作后');
  });

  test('652-04 APPROVED 终态无出边，主单与明细不可再改删', async ({ page }) => {
    const { id, itemId } = await seedReturnWithItem(page, 'approved');
    await apiCall(page, 'POST', `/purchase/returns/${id}/submit`);
    await apiCall(page, 'POST', `/purchase/returns/${id}/approve`);
    const beforeReturn = await readReturn(page, id);
    const beforeItems = await readItems(page, id);
    expect(beforeReturn.return_status).toBe('approved');

    await expectTerminalActionsRejected(page, id, 'APPROVED');
    await expectNonDraftMutationsRejected(page, id, itemId, 'APPROVED');
    await expectUnchanged(page, id, beforeReturn, beforeItems, 'APPROVED 全部非法动作后');
  });
});
