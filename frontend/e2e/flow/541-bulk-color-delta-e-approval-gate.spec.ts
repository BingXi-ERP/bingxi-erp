// 4.37 色差深度专项：批色客户确认的 ΔE 阈值与交货门禁。
// 端点：POST /bulk-color-approvals/{id}/cut-sample、/{id}/send-to-customer、
// /{id}/approve；详情回读 GET /bulk-color-approvals/{id}。
// ΔE 阈值唯一事实来源是 services/bulk_color_approval_service.rs 的 evaluate_delta_e
// 与 customer_approve：≤1.2 同色通过、≤2.5 让步通过、>2.5 显式拒绝；
// 通过才把 delivery_blocking 从 true 改为 false，失败时状态与门禁零漂移。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  seedColorCardArchive,
  verifyStockFourDim,
} from './helpers';

interface DyeBatchRow {
  id?: number;
  batch_no?: string;
  dye_lot_no?: string;
  color_no?: string | null;
  status?: string;
}

interface BcaRow {
  id?: number;
  sales_order_id?: number;
  dye_batch_id?: number;
  customer_id?: number;
  product_id?: number | null;
  color_no?: string | null;
  dye_lot_no?: string | null;
  batch_no?: string | null;
  sample_type?: string;
  sample_piece_id?: number | null;
  sample_length_m?: string | null;
  approval_status?: string;
  approver_id?: number | null;
  approval_date?: string | null;
  sent_to_customer_at?: string | null;
  customer_feedback?: string | null;
  delta_e_value?: string | null;
  delivery_blocking?: boolean;
  reject_reason?: string | null;
}

interface BcaHistoryRow {
  id?: number;
  to_status?: string;
  reason?: string | null;
}

interface SentApproval {
  id: number;
  row: BcaRow;
  colorNo: string;
  dyeLotNo: string;
  batchNo: string;
}

async function seedSentApproval(page: Page): Promise<SentApproval> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  expect(ctx.salesOrderId, '前置：批色单需真实父销售订单').toBeGreaterThan(0);
  expect(ctx.customerId, '前置：批色单需真实客户').toBeGreaterThan(0);
  expect(ctx.productIds[0], '前置：合格大货库存需绑定真实产品').toBeGreaterThan(0);
  expect(ctx.warehouseIds[0], '前置：合格大货库存需绑定真实仓库').toBeGreaterThan(0);

  const archive = await seedColorCardArchive(page, { context: 'flow/541-delta-e' });
  const dyeLotNo = genDyeLotNo();
  const createdBatch = await apiCallRaw<DyeBatchRow>(page, 'POST', '/production/dye-batches', {
    color_no: archive.colorCode,
    dye_lot_no: dyeLotNo,
    planned_quantity: 100,
    status: 'stored',
    dye_date: new Date().toISOString().slice(0, 10),
  });
  expect(createdBatch.id, '染色批次应回真实主键').toBeGreaterThan(0);

  const batch = await apiCallRaw<DyeBatchRow>(
    page,
    'GET',
    `/production/dye-batches/${createdBatch.id}`
  );
  expect(batch.status, '剪样前置要求染色批次已到 stored').toBe('stored');
  expect(batch.dye_lot_no, '染色批次应回显本例缸号').toBe(dyeLotNo);
  expect(batch.color_no, '染色批次应回显本例入档色号').toBe(archive.colorCode);
  expect(batch.batch_no, '染色批号由后端生成，不得手工臆造').toBeTruthy();
  const batchNo = batch.batch_no as string;

  await apiCall(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: ctx.warehouseIds[0],
    product_id: ctx.productIds[0],
    batch_no: batchNo,
    color_no: archive.colorCode,
    dye_lot_no: dyeLotNo,
    grade: '一等品',
    quantity_meters: '100',
    quantity_kg: '50',
    width: '160',
    gram_weight: '185',
  });
  const stock = await verifyStockFourDim(page, ctx.productIds[0], archive.colorCode, dyeLotNo, {
    batchNo,
    warehouseId: ctx.warehouseIds[0],
  });
  expect(stock, '剪样前应回读到本例合格四维库存').toBeTruthy();

  const created = await apiCallRaw<BcaRow>(page, 'POST', '/bulk-color-approvals', {
    sales_order_id: ctx.salesOrderId,
    dye_batch_id: createdBatch.id,
    customer_id: ctx.customerId,
    product_id: ctx.productIds[0],
    color_no: archive.colorCode,
    dye_lot_no: dyeLotNo,
    batch_no: batchNo,
    sample_type: 'cut_sample',
    remark: genCode('BCA541'),
  });
  expect(created.id, '批色单应回真实主键').toBeGreaterThan(0);
  expect(created.approval_status, '新建批色单应为 pending').toBe('pending');
  expect(created.delivery_blocking, '新建批色单应阻断发货').toBe(true);

  const sampled = await apiCallRaw<BcaRow>(
    page,
    'POST',
    `/bulk-color-approvals/${created.id}/cut-sample`,
    { sample_length_m: '0.5' }
  );
  expect(sampled.approval_status, '剪样后应进入 sampled').toBe('sampled');
  expect(sampled.sample_length_m, '剪样米数应回显本例输入').toBeTruthy();
  expect(
    Number(sampled.sample_length_m),
    '剪样米数应回显本例输入（DECIMAL 出参固定两位小数字符串，按数值等价比较）'
  ).toBe(0.5);
  expect(sampled.sample_piece_id, '剪样应生成真实样布匹 id').toBeGreaterThan(0);

  const sent = await apiCallRaw<BcaRow>(
    page,
    'POST',
    `/bulk-color-approvals/${created.id}/send-to-customer`,
    {}
  );
  expect(sent.approval_status, '送客户后应进入 sent_to_customer').toBe('sent_to_customer');
  expect(sent.sent_to_customer_at, '送客户后应写入时间戳').toBeTruthy();
  expect(sent.delivery_blocking, '送客户但未确认时仍应阻断发货').toBe(true);
  return {
    id: created.id as number,
    row: sent,
    colorNo: archive.colorCode,
    dyeLotNo,
    batchNo,
  };
}

async function approveAndReadBack(
  page: Page,
  approval: SentApproval,
  deltaE: string
): Promise<{ response: BcaRow; detail: BcaRow }> {
  const historyBefore = await apiCallRaw<BcaHistoryRow[]>(
    page,
    'GET',
    `/bulk-color-approvals/${approval.id}/history`
  );
  expect(Array.isArray(historyBefore), '审批前应能读取时间线数组').toBe(true);
  const approved = await apiCallRaw<BcaRow>(
    page,
    'POST',
    `/bulk-color-approvals/${approval.id}/approve`,
    { feedback: 'E2E 客户确认通过', delta_e_value: deltaE }
  );
  const detail = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${approval.id}`);
  expect(detail, '审批后详情应可回读').toBeTruthy();
  expect(detail.id, '详情应命中本例批色单').toBe(approval.id);
  const historyAfter = await apiCallRaw<BcaHistoryRow[]>(
    page,
    'GET',
    `/bulk-color-approvals/${approval.id}/history`
  );
  expect(Array.isArray(historyAfter), '审批后应能读取时间线数组').toBe(true);
  expect(historyAfter.length, '通过审批应新增一条时间线').toBe(historyBefore.length + 1);
  expect(historyAfter[historyAfter.length - 1]?.to_status, '时间线末条应落 approved').toBe(
    'approved'
  );
  expect(historyAfter[historyAfter.length - 1]?.reason, '时间线应留存通过反馈').toBe(
    'E2E 客户确认通过'
  );
  return { response: approved, detail };
}

test.describe('541 批色客户确认 ΔE 阈值与交货门禁', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('ΔE=1.2 同色通过：状态 approved、门禁解除、色号缸号批次零漂移', async ({ page }) => {
    const approval = await seedSentApproval(page);
    const { response: approved, detail } = await approveAndReadBack(page, approval, '1.2');

    expect(approved.approval_status, 'ΔE=1.2 回包应判同色通过').toBe('approved');
    expect(detail.approval_status, 'ΔE=1.2 落库应为同色通过').toBe('approved');
    expect(approved.delivery_blocking, '回包应解除交货门禁').toBe(false);
    expect(detail.delivery_blocking, '详情页应确认门禁已解除').toBe(false);
    expect(Number(approved.delta_e_value), '回包 ΔE 应逐值回读').toBeCloseTo(1.2, 2);
    expect(Number(detail.delta_e_value), '落库 ΔE 应逐值回读').toBeCloseTo(1.2, 2);
    expect(approved.customer_feedback, '反馈文案应在回包回显').toBe('E2E 客户确认通过');
    expect(detail.customer_feedback, '反馈文案应落库').toBe('E2E 客户确认通过');
    expect(detail.approver_id, '通过应写入审批人').toBeGreaterThan(0);
    expect(detail.approval_date, '通过应写入审批时间').toBeTruthy();
    expect(detail.color_no, '落库色号不得漂移').toBe(approval.colorNo);
    expect(detail.dye_lot_no, '落库缸号不得漂移').toBe(approval.dyeLotNo);
    expect(detail.batch_no, '落库批次不得漂移').toBe(approval.batchNo);
  });

  test('ΔE=2.5 让步接收边界：等于阈值仍可通过并解除门禁', async ({ page }) => {
    const approval = await seedSentApproval(page);
    const { response: approved, detail } = await approveAndReadBack(page, approval, '2.5');

    expect(approved.approval_status, 'ΔE=2.5 回包应是让步接收边界').toBe('approved');
    expect(detail.approval_status, 'ΔE=2.5 落库应为让步接收').toBe('approved');
    expect(approved.delivery_blocking, '回包应解除交货门禁').toBe(false);
    expect(detail.delivery_blocking, '详情页应确认门禁已解除').toBe(false);
    expect(Number(approved.delta_e_value), '回包边界 ΔE 应逐值回读').toBeCloseTo(2.5, 2);
    expect(Number(detail.delta_e_value), '落库边界 ΔE 应逐值回读').toBeCloseTo(2.5, 2);
    expect(approved.reject_reason, '回包通过路径不得写入拒因').toBeNull();
    expect(detail.reject_reason, '落库通过路径不得写入拒因').toBeNull();
    expect(detail.approver_id, '让步接收应写入审批人').toBeGreaterThan(0);
    expect(detail.approval_date, '让步接收应写入审批时间').toBeTruthy();
  });

  test('ΔE=2.51 超容差：400 VALIDATION_ERROR 且状态/门禁/色差字段零漂移', async ({ page }) => {
    const approval = await seedSentApproval(page);
    const historyBefore = await apiCallRaw<BcaHistoryRow[]>(
      page,
      'GET',
      `/bulk-color-approvals/${approval.id}/history`
    );

    const rejected = await apiCallExpectFail(
      page,
      'POST',
      `/bulk-color-approvals/${approval.id}/approve`,
      { feedback: 'E2E 超容差提交', delta_e_value: '2.51' }
    );
    expect(rejected.status, '超容差应 400，不得放宽成通过').toBe(400);
    expect(failureCode(rejected), '业务校验失败码应为 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(rejected.message, '拒因应点名超 2.5 阈值').toContain('超过 2.5');

    const after = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${approval.id}`);
    expect(after.approval_status, '拒绝后应仍在 sent_to_customer').toBe('sent_to_customer');
    expect(after.delivery_blocking, '拒绝后门禁必须保持阻断').toBe(true);
    expect(after.delta_e_value, '拒绝不得写入 ΔE 值').toBeNull();
    expect(after.customer_feedback, '拒绝不得写入通过反馈').toBeNull();
    expect(after.approver_id, '拒绝不得写入审批人').toBeNull();
    expect(after.approval_date, '拒绝不得写入审批时间').toBeNull();
    expect(after.reject_reason, '超 ΔE 走校验族，不得写拒因字段').toBeNull();
    expect(after.color_no, '拒绝后色号不得漂移').toBe(approval.colorNo);
    expect(after.dye_lot_no, '拒绝后缸号不得漂移').toBe(approval.dyeLotNo);
    expect(after.batch_no, '拒绝后批次不得漂移').toBe(approval.batchNo);

    const historyAfter = await apiCallRaw<BcaHistoryRow[]>(
      page,
      'GET',
      `/bulk-color-approvals/${approval.id}/history`
    );
    expect(
      historyAfter.length,
      `超 ΔE 被拒不得写审批时间线，前=${historyBefore.length} 后=${historyAfter.length}`
    ).toBe(historyBefore.length);
  });
});
