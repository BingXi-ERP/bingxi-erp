// 4.3 单据状态机 + 4.25 错误码：库存调拨主单建单初始状态与编辑保存不驱动流转的门。
// 后端判据：models/status/purchase_inventory.rs:73-101 inventory_transfer 五值小写闭合词表
//   ALL=[pending,approved,rejected,shipped,completed]；
//   services/inv/inventory_move.rs:248-263 词表门外值一律 business_displayable；
//   :277-289 建单 status 显式非 pending 拒绝；:475-477 门在 begin() 与仓库/明细校验前；
//   :309-324 编辑口 target≠current 拒绝、同值幂等放行；:683-687 显式 null 拒绝；
//   :535-555 状态门打在事务内 lock_exclusive 重读值上，拒时整笔回滚 notes 不改；
//   business_displayable → 400 + BUSINESS_ERROR 且 message 为真实可外显文案。
// 与既有覆盖分工：inventory/03 只测 UI 建单与审批正向、flow/484 测明细写面、458 测调拨持久化；
//   全 e2e 无主单 PUT 状态与建单非法初始态断言；本例专补零覆盖门。
import { test, expect, type Page } from '../diagnose-fixture';
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

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface Transfer {
  id?: number;
  status?: string;
  notes?: string | null;
}

const INITIAL_REJECT = '新建调拨单的初始状态只能是待审批，建单后请通过审批、发货、收货操作推进状态';
const TOKEN_REJECT =
  '调拨状态取值无效（允许的调拨状态：pending、approved、rejected、shipped、completed）';
const WRITE_REJECT = '调拨单状态只能通过审批、发货、收货操作变更，编辑保存不改变状态';
const NULL_REJECT = '调拨状态不能清空：该字段为必填项';

async function reject(
  page: Page,
  method: 'POST' | 'PUT',
  path: string,
  body: Record<string, unknown>,
  reason: string
) {
  const r = await apiCallExpectFail(page, method, path, body);
  expect(r.status, `[484] ${reason} 须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[484] ${reason} 机器码须 BUSINESS_ERROR，实际=${failureCode(r)}`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
  expect(r.message, `[484] ${reason} 拒因须点名业务规则`).toBe(reason);
}

test.describe('4.3 库存调拨主单状态门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('484-01 建单非初始态与词表外值拒绝、pending 建单放行', async ({ page }) => {
    const ctx = getCtx();
    const from = ctx.warehouseIds[0];
    const to = ctx.warehouseIds[1];
    expect(from, '[484] 前置：调出仓未就绪').toBeGreaterThan(0);
    expect(to, '[484] 前置：调入仓未就绪').toBeGreaterThan(0);
    expect(from === to, '[484] 前置：调出调入仓须不同').toBe(false);

    await reject(
      page,
      'POST',
      '/inventory/transfers',
      { from_warehouse_id: from, to_warehouse_id: to, status: 'approved', items: [] },
      INITIAL_REJECT
    );
    await reject(
      page,
      'POST',
      '/inventory/transfers',
      { from_warehouse_id: from, to_warehouse_id: to, status: 'PENDING', items: [] },
      TOKEN_REJECT
    );

    const initialNotes = `484初态_${genCode('E484')}`;
    const created = await apiCallRaw<Transfer>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: from,
      to_warehouse_id: to,
      status: 'pending',
      notes: initialNotes,
      items: [],
    });
    const id = Number(created.id);
    expect(id, `[484] pending 建单须回真实主键：${JSON.stringify(created)}`).toBeGreaterThan(0);
    expect(created.status, '[484] 建单回读初始态须 pending').toBe('pending');
    CLEANUP.push({ path: `/inventory/transfers/${id}`, label: `[484] 调拨单 ${id}` });

    const read = await apiCallRaw<Transfer>(page, 'GET', `/inventory/transfers/${id}`);
    expect(read.status, '[484] 详情初始态须 pending').toBe('pending');
    expect(read.notes, '[484] 详情备注须等于建单值').toBe(initialNotes);
  });

  test('484-02 编辑口异值/词表外/null 拒绝且零半成品写入，同值幂等放行', async ({ page }) => {
    const ctx = getCtx();
    const from = ctx.warehouseIds[0];
    const to = ctx.warehouseIds[1];
    expect(from, '[484] 前置：调出仓未就绪').toBeGreaterThan(0);
    expect(to, '[484] 前置：调入仓未就绪').toBeGreaterThan(0);

    const initialNotes = `484幂等_${genCode('E484')}`;
    const created = await apiCallRaw<Transfer>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: from,
      to_warehouse_id: to,
      status: 'pending',
      notes: initialNotes,
      items: [],
    });
    const id = Number(created.id);
    expect(id, `[484] 建单须回真实主键：${JSON.stringify(created)}`).toBeGreaterThan(0);
    CLEANUP.push({ path: `/inventory/transfers/${id}`, label: `[484] 调拨单 ${id}` });

    const badNotes = `484越权改态_${genCode('E484')}`;
    await reject(
      page,
      'PUT',
      `/inventory/transfers/${id}`,
      { status: 'approved', notes: badNotes },
      WRITE_REJECT
    );
    await reject(page, 'PUT', `/inventory/transfers/${id}`, { status: 'DRAFT' }, TOKEN_REJECT);
    await reject(page, 'PUT', `/inventory/transfers/${id}`, { status: null }, NULL_REJECT);

    const afterRejects = await apiCallRaw<Transfer>(page, 'GET', `/inventory/transfers/${id}`);
    expect(afterRejects.status, '[484] 三次拒绝后状态须仍为 pending').toBe('pending');
    expect(afterRejects.notes, '[484] 拒绝须整笔回滚，备注不得改半截').toBe(initialNotes);

    const nextNotes = `484同值放行_${genCode('E484')}`;
    const updated = await apiCallRaw<Transfer>(page, 'PUT', `/inventory/transfers/${id}`, {
      status: 'pending',
      notes: nextNotes,
    });
    expect(updated.status, '[484] 同值幂等后状态仍为 pending').toBe('pending');
    expect(updated.notes, '[484] 同值幂等须放行备注更新').toBe(nextNotes);

    const afterUpdate = await apiCallRaw<Transfer>(page, 'GET', `/inventory/transfers/${id}`);
    expect(afterUpdate.status, '[484] 回读状态仍为 pending').toBe('pending');
    expect(afterUpdate.notes, '[484] 回读备注须更新').toBe(nextNotes);
  });
});
