// 4.503 缸号回修单 DELETE 状态门与软删可见性。
// 后端判据：services/dye_batch_state_machine_ops/rework.rs:99-115 仅 in_progress/completed
//   被 business_displayable 拒绝，其余状态写 is_deleted=true；:118-124 详情过滤软删行；
//   :199-232 列表同样过滤 is_deleted=false，并按 original_batch_id 精确筛选；
//   :126-196 审批/开始/完成/取消的状态前置；状态词小写且逐字符固定（status/quality_dyeing.rs）。
// completed 无合法取消路径，该行按唯一批次号留存，不断言全局总数。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const REWORK_PATH = '/production/dye-batch-reworks';
const REWORK_TYPE_COLOR_DIFFERENCE = 'color_difference';
const ORIGINAL_STATUS_INSPECTING = 'inspecting';
const STATUS_DRAFT = 'draft';
const STATUS_APPROVED = 'approved';
const STATUS_IN_PROGRESS = 'in_progress';
const STATUS_COMPLETED = 'completed';
const STATUS_CANCELLED = 'cancelled';
const DELETE_REJECT_MESSAGE = '回修中或已完成的回修单不可删除';

interface ReworkRow {
  id?: unknown;
  original_batch_id?: unknown;
  status?: unknown;
  is_deleted?: unknown;
}

interface ReworkList {
  items?: unknown;
  total?: unknown;
}

const createdIds = new Set<number>();
const softDeletedIds = new Set<number>();
const retainedIds = new Set<number>();

/** 生成 i32 正向上限内的专属批次主键，四条腿各取相邻整数。 */
function batchIdSeed(): number {
  return Number(Date.now().toString().slice(-6)) * 1000 + Math.floor(Math.random() * 1000);
}

function asRow(value: unknown, label: string): ReworkRow {
  expect(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `[503] ${label} 必须返回回修单对象，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return value as ReworkRow;
}

async function createRework(page: Page, batchId: number, tag: string): Promise<number> {
  const row = asRow(
    await apiCallRaw<unknown>(page, 'POST', REWORK_PATH, {
      original_batch_id: batchId,
      original_batch_no: `${tag}-${batchId}`,
      rework_batch_id: batchId,
      rework_batch_no: `${tag}-${batchId}-RW`,
      rework_type: REWORK_TYPE_COLOR_DIFFERENCE,
      rework_reason: `${tag}-回修原因`,
      original_status: ORIGINAL_STATUS_INSPECTING,
      remarks: tag,
    }),
    `创建批次 ${batchId} 的回修单`
  );
  const id = Number(row.id);
  expect(
    Number.isSafeInteger(id) && id > 0,
    `[503] 回修单应返回真实主键，实际 ${JSON.stringify(row)}`
  ).toBe(true);
  createdIds.add(id);
  return id;
}

/** 走真实状态机端点推进状态，并逐字段核对回包。 */
async function transition(
  page: Page,
  id: number,
  action: 'approve' | 'cancel' | 'start' | 'complete',
  expectedStatus: string
): Promise<void> {
  const row = asRow(
    await apiCallRaw<unknown>(page, 'POST', `${REWORK_PATH}/${id}/${action}`),
    `${action} 回修单 ${id}`
  );
  expect(Number(row.id), `[503] ${action} 回包 id 应为 ${id}，实际 ${JSON.stringify(row)}`).toBe(
    id
  );
  expect(
    String(row.status),
    `[503] ${action} 后状态应为 ${expectedStatus}，实际 ${JSON.stringify(row)}`
  ).toBe(expectedStatus);
}

async function readDetail(page: Page, id: number): Promise<ReworkRow> {
  const row = asRow(await apiCallRaw<unknown>(page, 'GET', `${REWORK_PATH}/${id}`), `详情 ${id}`);
  expect(Number(row.id), `[503] 详情应按 ${id} 回读，实际 ${JSON.stringify(row)}`).toBe(id);
  return row;
}

async function expectListAbsent(
  page: Page,
  id: number,
  batchId: number,
  label: string
): Promise<void> {
  const value = await apiCallRaw<unknown>(
    page,
    'GET',
    `${REWORK_PATH}?original_batch_id=${batchId}&page=1&page_size=20`
  );
  expect(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    `[503] ${label} 列表应返回分页对象，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const list = value as ReworkList;
  expect(
    Array.isArray(list.items),
    `[503] ${label} 列表 items 应为数组，实际 ${JSON.stringify(list)}`
  ).toBe(true);
  expect(
    Number(list.total),
    `[503] ${label} 按唯一批次过滤后总数应为 0，实际 ${JSON.stringify(list)}`
  ).toBe(0);
  expect(
    (list.items as ReworkRow[]).some(item => Number(item.id) === id),
    `[503] ${label} 列表不得再含回修单 ${id}，实际 ${JSON.stringify(list.items)}`
  ).toBe(false);
}

async function expectSoftDeletedInvisible(
  page: Page,
  id: number,
  batchId: number,
  label: string
): Promise<void> {
  const fail = await apiCallExpectFail(page, 'GET', `${REWORK_PATH}/${id}`);
  expect(
    fail.status,
    `[503] ${label} 软删后详情应 404，实际 ${fail.status} ${JSON.stringify(fail)}`
  ).toBe(404);
  expect(
    failureCode(fail),
    `[503] ${label} 软删后详情失败码应为 NOT_FOUND，实际 ${JSON.stringify(fail)}`
  ).toBe(APP_ERROR_CODES.NOT_FOUND);
  await expectListAbsent(page, id, batchId, label);
}

async function expectDeleteRejected(
  page: Page,
  id: number,
  expectedStatus: string,
  label: string
): Promise<void> {
  const fail = await apiCallExpectFail(page, 'DELETE', `${REWORK_PATH}/${id}`);
  expect(
    fail.status,
    `[503] ${label} 删除应 400，实际 ${fail.status} ${JSON.stringify(fail)}`
  ).toBe(400);
  expect(
    failureCode(fail),
    `[503] ${label} 删除失败码应为 BUSINESS_ERROR，实际 ${JSON.stringify(fail)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    fail.message,
    `[503] ${label} 应外显真实拒绝文案，实际 ${JSON.stringify(fail.message)}`
  ).toBe(DELETE_REJECT_MESSAGE);

  const detail = await readDetail(page, id);
  expect(
    String(detail.status),
    `[503] ${label} 拒删后状态应保持 ${expectedStatus}，实际 ${JSON.stringify(detail)}`
  ).toBe(expectedStatus);
  expect(
    detail.is_deleted,
    `[503] ${label} 拒删后不得置软删标记，实际 ${JSON.stringify(detail)}`
  ).toBe(false);
}

async function softDelete(page: Page, id: number, batchId: number, label: string): Promise<void> {
  const data = await apiCallRaw<unknown>(page, 'DELETE', `${REWORK_PATH}/${id}`);
  expect(data === null, `[503] ${label} 删除成功只回空 data，实际 ${JSON.stringify(data)}`).toBe(
    true
  );
  softDeletedIds.add(id);
  await expectSoftDeletedInvisible(page, id, batchId, label);
}

test.afterEach(async ({ page }) => {
  for (const id of createdIds) {
    if (softDeletedIds.has(id) || retainedIds.has(id)) continue;
    await tryCleanup(page, 'POST', `${REWORK_PATH}/${id}/cancel`, `[503] 回修单 ${id} 取消清理`);
    await tryCleanup(page, 'DELETE', `${REWORK_PATH}/${id}`, `[503] 回修单 ${id} 软删清理`);
  }
  createdIds.clear();
  softDeletedIds.clear();
  retainedIds.clear();
});

test.describe('缸号回修单删除状态门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('503-01 in_progress/completed 拒删且状态与软删标记不变', async ({ page }) => {
    const tag = genCode('W3RW503GATE');
    const seed = batchIdSeed();
    const inProgressBatchId = seed;
    const completedBatchId = seed + 1;

    const inProgressId = await createRework(page, inProgressBatchId, tag);
    await transition(page, inProgressId, 'approve', STATUS_APPROVED);
    await transition(page, inProgressId, 'start', STATUS_IN_PROGRESS);
    await expectDeleteRejected(page, inProgressId, STATUS_IN_PROGRESS, 'in_progress');

    const completedId = await createRework(page, completedBatchId, tag);
    await transition(page, completedId, 'approve', STATUS_APPROVED);
    await transition(page, completedId, 'start', STATUS_IN_PROGRESS);
    await transition(page, completedId, 'complete', STATUS_COMPLETED);
    await expectDeleteRejected(page, completedId, STATUS_COMPLETED, 'completed');
    // completed 不可取消也不可删，保留该唯一批次行，后续用例按各自批次隔离。
    retainedIds.add(completedId);

    await transition(page, inProgressId, 'cancel', STATUS_CANCELLED);
    await softDelete(page, inProgressId, inProgressBatchId, '取消后清理');

    const missing = await apiCallExpectFail(page, 'DELETE', `${REWORK_PATH}/2100000000`);
    expect(
      missing.status,
      `[503] 不存在主键删除应 404，实际 ${missing.status} ${JSON.stringify(missing)}`
    ).toBe(404);
    expect(
      failureCode(missing),
      `[503] 不存在主键删除码应为 NOT_FOUND，实际 ${JSON.stringify(missing)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('503-02 draft/approved/cancelled 可软删，详情 404 且列表消失', async ({ page }) => {
    const tag = genCode('W3RW503SOFT');
    const seed = batchIdSeed();
    const draftBatchId = seed;
    const approvedBatchId = seed + 1;
    const cancelledBatchId = seed + 2;

    const draftId = await createRework(page, draftBatchId, tag);
    const draftDetail = await readDetail(page, draftId);
    expect(
      String(draftDetail.status),
      `[503] 新建回修单应为 draft，实际 ${JSON.stringify(draftDetail)}`
    ).toBe(STATUS_DRAFT);
    expect(
      draftDetail.is_deleted,
      `[503] 新建回修单不得预置软删，实际 ${JSON.stringify(draftDetail)}`
    ).toBe(false);
    await softDelete(page, draftId, draftBatchId, 'draft');

    const approvedId = await createRework(page, approvedBatchId, tag);
    await transition(page, approvedId, 'approve', STATUS_APPROVED);
    await softDelete(page, approvedId, approvedBatchId, 'approved');

    const cancelledId = await createRework(page, cancelledBatchId, tag);
    await transition(page, cancelledId, 'cancel', STATUS_CANCELLED);
    await softDelete(page, cancelledId, cancelledBatchId, 'cancelled');
  });
});
