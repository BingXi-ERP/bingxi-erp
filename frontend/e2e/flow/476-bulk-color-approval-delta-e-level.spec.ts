import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  seedColorCardArchive,
  testStorageStatePath,
  tryCleanup,
} from './helpers';

/**
 * 476 批色客户审批高光敏感阈值与判定等级留痕（bulk-color-approvals 域）。
 *
 * 被测行为（backend/src/services/bulk_color_approval_service.rs::customer_approve）：
 * evaluate_delta_e(de, high_light_sensitive) 的阈值开关经 approve 请求体
 * CustomerApproveDto.high_light_sensitive 接通（此前写死 false），高光敏感料
 * 通过阈值收紧为 ΔE≤0.8（普通料 1.2），让步接收阈值 2.5 不变；Pass 与
 * ConditionalAccept 均落 approved，判定 token 经 transition_to 写
 * bulk_color_approval.delta_e_result（词表 pass / conditional_accept，与写入方
 * DeltaEResult::as_str 逐字符一致），并随审批历史快照（build_history_active）
 * 留痕，详情/列表出参键为模型字段名 snake_case。
 *
 * 三条腿（每腿独立建批色单，共用同缸号 stored 染批与同一行合格大货库存，剪样各扣 0.5m）：
 * - ΔE=2.0 普通料（high_light_sensitive=false）→ approved + delta_e_result=conditional_accept
 * - ΔE=1.0 高光料（high_light_sensitive=true） → approved + delta_e_result=conditional_accept
 *   （判别腿：1.0 在普通料阈 ≤1.2 下会判 pass；高光阈收紧到 0.8 后 1.0>0.8 只能让步
 *   接收——若开关未接通、恒按普通料判，本腿将落 pass 而红，阈值生效由本腿单独钉死）
 *
 * 判定等级断言落在两条通道：GET /bulk-color-approvals/{id} 详情出参
 * delta_e_result，与 GET /{id}/history 时间线中 to_status=approved 行的
 * snapshot.delta_e_result（同一 token，来源 build_history_active 快照键）。
 *
 * 前置链（真实链路，非绕过状态机）：seedColorCardArchive 色号入档 →
 * POST /production/dye-batches（batch_no 由 DocumentNumberGenerator 事务内取号）→
 * PUT /production/dye-batches/{id} 按 dye_batch_state_machine_validation 内置流转表
 * 逐态推进到 stored（PUT 只允许单步流转，须走满 9 步）→ POST /inventory/stock
 * 建 (dye_lot_no, batch_no) 四维命中的合格大货库存（initial_stock_statuses 固定
 * quality_status=合格，剪样按该键命中扣减）→ POST /bulk-color-approvals 建单 →
 * cut-sample → send-to-customer → approve。
 *
 * high_light_sensitive 传参入口取审批请求（POST /{id}/approve 的
 * CustomerApproveDto.high_light_sensitive）而非建单请求：判定发生在客户确认时点，
 * 与业务时点一致；来源 backend/src/handlers/bulk_color_approval_handler.rs。
 */

/** 写入方 ApprovalStatus::Approved.as_str()（services/bulk_color_approval_service.rs） */
const APPROVAL_STATUS_APPROVED = 'approved';

interface BcaInfoRow {
  id?: number;
  approval_status?: string;
  high_light_sensitive?: boolean;
  delta_e_result?: string | null;
  delivery_blocking?: boolean;
}

interface HistoryRow {
  id?: number;
  from_status?: string | null;
  to_status?: string;
  snapshot?: {
    delta_e_result?: string | null;
    high_light_sensitive?: boolean | null;
  } | null;
}

interface DyeBatchRow {
  id?: number;
  batch_no?: string;
  dye_lot_no?: string;
  status?: string | null;
}

/** 本文件自建的批色单，供 afterAll 走真实删除通道回收 */
const createdApprovalIds: number[] = [];

/** 内置流转表（dye_batch_state_machine_validation::builtin_transition_rules）里
 * pending_schedule 到 stored 的唯一单步链；PUT update 只校验单步流转 */
const DYE_BATCH_LADDER = [
  'scheduled',
  'preparing',
  'dyeing',
  'washing',
  'fixing',
  'dehydrating',
  'drying',
  'inspecting',
  'stored',
] as const;

interface StoredBatchFixture {
  batchId: number;
  dyeLotNo: string;
  batchNo: string;
  colorNo: string;
}

/** 建专属色卡档案色号 + 染批并按内置流转表推到 stored，回读缸号与染色批号 */
async function seedStoredDyeBatch(page: Page): Promise<StoredBatchFixture> {
  const archive = await seedColorCardArchive(page, { context: '476/stored-dye-batch' });
  const dyeLotNo = genDyeLotNo();
  const created = await apiCall<{ id?: number }>(page, 'POST', '/production/dye-batches', {
    // batch_no 不手工传入：dye_batch_handler 对缺省缸号走 DocumentNumberGenerator
    // 事务内取号 + 23505 重试（helpers.ts ensureTestEntities 同口径）
    color_no: archive.colorCode,
    dye_lot_no: dyeLotNo,
    planned_quantity: 100,
    dye_date: new Date().toISOString().slice(0, 10),
  });
  const batchId = Number(created.data?.id);
  expect(
    Number.isInteger(batchId) && batchId > 0,
    `染色批次建档应返回主键 id，实际响应=${JSON.stringify(created.data)}`
  ).toBe(true);

  for (const nextStatus of DYE_BATCH_LADDER) {
    const step = await apiCall<DyeBatchRow>(page, 'PUT', `/production/dye-batches/${batchId}`, {
      status: nextStatus,
    });
    expect(
      String(step.data?.status),
      `染批 ${batchId} 生命周期推进到 ${nextStatus} 应成功（内置流转表单步），实际=${JSON.stringify(step.data)}`
    ).toBe(nextStatus);
  }

  const detail = await apiCall<DyeBatchRow>(page, 'GET', `/production/dye-batches/${batchId}`);
  expect(
    typeof detail.data?.batch_no === 'string' && detail.data.batch_no.length > 0,
    `染批 ${batchId} 详情应回 batch_no（缸号），实际=${JSON.stringify(detail.data)}`
  ).toBe(true);
  const batchNo = String(detail.data?.batch_no);
  expect(String(detail.data?.dye_lot_no), `染批 ${batchId} 详情 dye_lot_no 应与建档一致`).toBe(
    dyeLotNo
  );
  return { batchId, dyeLotNo, batchNo, colorNo: archive.colorCode };
}

/** 建 (dye_lot_no, batch_no) 四维命中的大货库存：initial_stock_statuses 固定
 * quality_status=合格，cut_sample 按（染色批号, 缸号, 合格）键命中本行扣减 */
async function seedQualifiedStock(page: Page, batch: StoredBatchFixture): Promise<void> {
  const ctx = getCtx();
  expect(
    Array.isArray(ctx.warehouseIds) && ctx.warehouseIds.length > 0,
    `仓库种子缺失，无法建大货库存：warehouseIds=${JSON.stringify(ctx.warehouseIds)}`
  ).toBe(true);
  expect(
    Array.isArray(ctx.productIds) && ctx.productIds.length > 0,
    `产品种子缺失，无法建大货库存：productIds=${JSON.stringify(ctx.productIds)}`
  ).toBe(true);
  await apiCall(page, 'POST', '/inventory/stock', {
    warehouse_id: ctx.warehouseIds[0],
    product_id: ctx.productIds[0],
    batch_no: batch.batchNo,
    dye_lot_no: batch.dyeLotNo,
    color_no: batch.colorNo,
    grade: '一等品',
    quantity_meters: '30',
    quantity_kg: '30',
  });
}

/** 单腿全链路：建批色单 → 剪样（扣大货库存 0.5m）→ 发送客户 → 客户批准。
 * 入参与出参键名来源：CustomerApproveDto / BulkColorApprovalInfo 序列化键（snake_case） */
async function approveViaChain(
  page: Page,
  batch: StoredBatchFixture,
  opts: { tag: string; deltaE: string; highLightSensitive: boolean }
): Promise<{ id: number; detail: BcaInfoRow; history: HistoryRow[] }> {
  const ctx = getCtx();
  expect(
    typeof ctx.salesOrderId === 'number' && ctx.salesOrderId > 0,
    `父销售订单缺失，无法建批色单：ctx.salesOrderId=${String(ctx.salesOrderId)}`
  ).toBe(true);

  const created = await apiCall<BcaInfoRow>(page, 'POST', '/bulk-color-approvals', {
    sales_order_id: ctx.salesOrderId,
    dye_batch_id: batch.batchId,
    customer_id: ctx.customerId,
    remark: genCode(`BCA476${opts.tag}`),
  });
  const id = Number(created.data?.id);
  expect(
    Number.isInteger(id) && id > 0,
    `批色单建档应返回主键 id，实际响应=${JSON.stringify(created.data)}`
  ).toBe(true);
  createdApprovalIds.push(id);

  const cut = await apiCall<BcaInfoRow>(page, 'POST', `/bulk-color-approvals/${id}/cut-sample`, {
    sample_length_m: '0.5',
  });
  expect(
    String(cut.data?.approval_status),
    `批色单 ${id} 剪样后应为 sampled（前置：stored 染批 + 合格大货库存），实际=${JSON.stringify(cut.data)}`
  ).toBe('sampled');

  const sent = await apiCall<BcaInfoRow>(
    page,
    'POST',
    `/bulk-color-approvals/${id}/send-to-customer`
  );
  expect(
    String(sent.data?.approval_status),
    `批色单 ${id} 发送客户后应为 sent_to_customer，实际=${JSON.stringify(sent.data)}`
  ).toBe('sent_to_customer');

  const approved = await apiCall<BcaInfoRow>(page, 'POST', `/bulk-color-approvals/${id}/approve`, {
    feedback: `E2E 476 客户确认（ΔE=${opts.deltaE}）`,
    delta_e_value: opts.deltaE,
    high_light_sensitive: opts.highLightSensitive,
  });
  expect(
    String(approved.data?.approval_status),
    `批色单 ${id} 客户批准后应为 approved，实际=${JSON.stringify(approved.data)}`
  ).toBe(APPROVAL_STATUS_APPROVED);

  const detail = await apiCallRaw<BcaInfoRow>(page, 'GET', `/bulk-color-approvals/${id}`);
  const history = await apiCallRaw<HistoryRow[]>(
    page,
    'GET',
    `/bulk-color-approvals/${id}/history`
  );
  expect(Array.isArray(history), `审批时间线应返回数组，实际=${JSON.stringify(history)}`).toBe(
    true
  );
  return { id, detail, history: history as HistoryRow[] };
}

/** 两条通道一致断言：详情出参与时间线 approved 行快照都携带同一判定等级与阈值标志 */
function expectDeltaELevel(detail: BcaInfoRow, history: HistoryRow[], expected: string): void {
  expect(
    detail.delta_e_result,
    `详情出参 delta_e_result 应为词表 ${expected}（写入方 DeltaEResult::as_str），实际=${JSON.stringify(detail)}`
  ).toBe(expected);
  const approvedRow = history.find(row => row.to_status === APPROVAL_STATUS_APPROVED);
  expect(
    approvedRow,
    `时间线应含 to_status=approved 行，实际=${JSON.stringify(history.map(r => r.to_status))}`
  ).toBeTruthy();
  expect(
    approvedRow?.snapshot?.delta_e_result,
    `approved 行快照应留痕判定等级 ${expected}，实际=${JSON.stringify(approvedRow?.snapshot)}`
  ).toBe(expected);
  expect(
    approvedRow?.snapshot?.high_light_sensitive,
    `approved 行快照应留痕高光敏感标志，实际=${JSON.stringify(approvedRow?.snapshot)}`
  ).toBe(detail.high_light_sensitive);
}

test.describe('476 批色客户审批高光敏感阈值与判定等级留痕', () => {
  let storedBatch: StoredBatchFixture;

  test.beforeAll(async ({ browser }) => {
    const browserCtx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await browserCtx.newPage();
    try {
      await loginViaUI(page);
      await ensureTestEntities(page);
      storedBatch = await seedStoredDyeBatch(page);
      await seedQualifiedStock(page, storedBatch);
    } finally {
      await browserCtx.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const browserCtx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await browserCtx.newPage();
    try {
      for (const id of createdApprovalIds) {
        await tryCleanup(
          page,
          'DELETE',
          `/bulk-color-approvals/${id}`,
          `bulk_color_approval#${id}`
        );
      }
    } finally {
      await browserCtx.close();
    }
  });

  test('476-01 ΔE=2.0 普通料批准：让步接收等级落库并随时间线留痕', async ({ page }) => {
    const { detail, history } = await approveViaChain(page, storedBatch, {
      tag: 'A',
      deltaE: '2.0',
      highLightSensitive: false,
    });
    expect(String(detail.approval_status)).toBe(APPROVAL_STATUS_APPROVED);
    expect(
      detail.high_light_sensitive,
      `普通料腿 high_light_sensitive 出参应为 false（请求未置标志），实际=${JSON.stringify(detail)}`
    ).toBe(false);
    expectDeltaELevel(detail, history, 'conditional_accept');
  });

  test('476-02 ΔE=1.0 高光料批准：超收紧阈 0.8 只能让步接收，证明阈值开关生效', async ({
    page,
  }) => {
    // 1.0 按普通料阈值（≤1.2）会判 pass；高光阈值收紧到 0.8 后 1.0>0.8 落让步接收，
    // 断言 conditional_accept 即钉死 high_light_sensitive 真实参与判定
    // （开关未接通、恒按普通料判时本腿会落 pass 而红）。
    const { detail, history } = await approveViaChain(page, storedBatch, {
      tag: 'B',
      deltaE: '1.0',
      highLightSensitive: true,
    });
    expect(String(detail.approval_status)).toBe(APPROVAL_STATUS_APPROVED);
    expect(
      detail.high_light_sensitive,
      `高光料腿 high_light_sensitive 出参应回显 true（approve 请求写入），实际=${JSON.stringify(detail)}`
    ).toBe(true);
    expectDeltaELevel(detail, history, 'conditional_accept');
  });

  test('476-03 ΔE=0.7 高光料批准：低于收紧阈 0.8 判通过等级 pass', async ({ page }) => {
    const { detail, history } = await approveViaChain(page, storedBatch, {
      tag: 'C',
      deltaE: '0.7',
      highLightSensitive: true,
    });
    expect(String(detail.approval_status)).toBe(APPROVAL_STATUS_APPROVED);
    expect(detail.high_light_sensitive).toBe(true);
    expectDeltaELevel(detail, history, 'pass');
  });
});
