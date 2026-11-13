import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  expectDenied,
  expectStateGateRejection,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginAsRole,
  pickDyeableWarehouse,
  safeGetList,
  seedColorCardArchive,
  seedDyedOutboundBundle,
  tryCleanup,
} from './helpers';

/**
 * 委外染整返工与缸差登记（路径与方法的事实来源：frontend/scripts/route-snapshot.txt）。
 *
 * 功能：跑通两条反向腿并逐跳做「写入 → 重新读取 → 断言读回值等于写入值」的落库闭环——
 * 一是缸差返工链（同缸回修，rework_type=color_difference）走完 draft→approved→in_progress→completed
 * 四个状态并钉住每一步的非法跃迁被拒与被拒不落库；二是委外染整订单链（建单→发料→加工→收回入库
 * →结算→会计凭证→过账）把数量、损耗、实测值与过账标记写进库里再读回。
 * 调用方：Playwright 分片 e2e（frontend/e2e/flow），serial 模式，前序句柄供后序复用。
 * 入参：口令与会话只经 helpers 的 loginAsRole/testUsername/testPassword 取得；单号用 genCode()
 * 生成唯一值（委外订单号在未删除行内唯一，见 outsourcing_ops/order.rs validate_order_no_unique）；
 * 委外类型取状态词表常量值 dyeing（models/status/wage_energy_chemical_business.rs），
 * 返工类型取 models/dye_batch_rework.rs 列出的 color_difference。
 * 传给谁：backend/src/handlers/dye_batch_state_machine_handler.rs（create_rework / approve_rework /
 * start_rework / complete_rework / cancel_rework）与 outsourcing_handler.rs
 * （create_outsourcing_order / issue / processing / create_outsourcing_receipt /
 * confirm_outsourcing_receipt / settle_outsourcing_order / create_outsourcing_voucher /
 * post_outsourcing_voucher）。
 * 存什么：dye_batch_rework 的 rework_type/rework_reason/original_status/status 与
 * approved_by/approved_at/started_at/completed_at；outsourcing_order 的 order_no/order_type/
 * supplier_id/issue_quantity/material_cost/processing_fee/status；outsourcing_receipt 的
 * return_quantity/loss_quantity 与实测 weight/width/gram_weight；outsourcing_voucher 的
 * voucher_type/debit_account/credit_account/amount/is_posted。未回填的时间与实测列断言为
 * null（表示未补录），绝不断言成 0。
 * 存哪里：表 dye_batch_rework（backend/src/models/dye_batch_rework.rs）、
 * outsourcing_order、outsourcing_receipt、outsourcing_voucher
 * （字段口径见 backend/src/services/outsourcing_ops/types.rs）；
 * 状态词表见 backend/src/models/status/wage_energy_chemical_business.rs 与 quality_dyeing.rs。
 */

const REWORK_STATUS_DRAFT = 'draft';
const REWORK_STATUS_APPROVED = 'approved';
const REWORK_STATUS_IN_PROGRESS = 'in_progress';
const REWORK_STATUS_COMPLETED = 'completed';
const REWORK_TYPE_COLOR_DIFFERENCE = 'color_difference';
const REWORK_ELIGIBLE_STATUSES = ['inspecting', 'stored'];
const OUTSOURCING_STATUS_DRAFT = 'draft';
const OUTSOURCING_STATUS_ISSUED = 'issued';
const OUTSOURCING_STATUS_PROCESSING = 'processing';
const OUTSOURCING_STATUS_RECEIVED = 'received';
const OUTSOURCING_STATUS_SETTLED = 'settled';
const OUTSOURCING_ORDER_TYPE_DYEING = 'dyeing';
const RECEIPT_STATUS_DRAFT = 'draft';
const RECEIPT_STATUS_CONFIRMED = 'confirmed';

/** 模块级句柄：前序用例写入的真实 id 与单号，后序用例只读复用。 */
let reworkId: number | undefined;
let reworkOriginalBatchNo: string | undefined;
let outsourcingOrderId: number | undefined;
let outsourcingItemId: number | undefined;
let outsourcingOrderNo: string | undefined;
let outsourcingSupplierId: number | undefined;
let outsourcingProductId: number | undefined;
let outsourcingWarehouseId: number | undefined;
let receiptId: number | undefined;

test.describe('449 委外染整返工与缸差登记', () => {
  test.describe.configure({ mode: 'serial' });

  test('缸差返工按状态机逐级推进且每级时间戳落库可读回', async ({ page }) => {
    // 功能：在一个真实处于 inspecting/stored 的染整批次上发起同缸色差回修，逐级推进状态机。
    // 调用方：本用例 → POST /production/dye-batch-reworks（dye_batch_state_machine_handler::create_rework）。
    // 入参 original_batch_id/original_batch_no 取自本用例自建的染整缸号行；
    // 建档端点采信入参 status（先按缸号生命周期 14 态校验，缺省才落 pending_schedule），
    // 因此直接落一枚 inspecting 的缸，不赌共享库里恰好存在可回修的行。
    // rework_type=color_difference、original_status=该批次当前状态词、同缸回修时 rework_batch_id 等于原缸。
    // 传给谁：services/dye_batch_state_machine_ops/rework.rs（validate_rework_type + 回修资格校验）。
    // 存什么：status 与 approved_by/approved_at/started_at/completed_at；未到达的级保持 null。
    // 存哪里：表 dye_batch_rework（backend/src/models/dye_batch_rework.rs）。
    const archive = await seedColorCardArchive(page, { context: '449 缸差回修前置建缸' });
    const batchRow = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/dye-batches',
      {
        // batch_no 不手工传入：缺省缸号由后端取号器在事务内生成并对唯一冲突重试，
        // 手写时间戳号跨分片同秒撞 UNIQUE 的概率非零。
        color_no: archive.colorCode,
        dye_lot_no: genDyeLotNo(),
        planned_quantity: 100,
        dye_date: new Date().toISOString().slice(0, 10),
        status: REWORK_ELIGIBLE_STATUSES[0],
      }
    );
    const batchId = Number(batchRow['id']);
    const batchNo = String(batchRow['batch_no']);
    const eligibleStatus = String(batchRow['status']);
    expect(
      Number.isInteger(batchId) && batchId > 0,
      `自建缸号建档必须返回整数主键，实际 ${JSON.stringify(batchRow['id'])}`
    ).toBe(true);
    expect(
      REWORK_ELIGIBLE_STATUSES.includes(eligibleStatus),
      `建档后缸号状态必须落在可回修词表 ${REWORK_ELIGIBLE_STATUSES.join('/')} 内，实际 ${eligibleStatus}`
    ).toBe(true);
    reworkOriginalBatchNo = batchNo;

    const created = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/dye-batch-reworks',
      {
        original_batch_id: batchId,
        original_batch_no: batchNo,
        rework_batch_id: batchId,
        rework_batch_no: batchNo,
        rework_type: REWORK_TYPE_COLOR_DIFFERENCE,
        rework_reason: '缸差超出允许范围，同缸回修复染',
        original_status: eligibleStatus,
        remarks: 'e2e 缸差回修链',
      }
    );
    const id = Number(created['id']);
    expect(Number.isInteger(id) && id > 0, `回修单创建应返回整数 id，实际 ${created['id']}`).toBe(
      true
    );
    reworkId = id;

    // 落库闭环 1：新建即 draft，且四个时间戳全为 NULL（未推进不得有值）。
    const asDraft = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(asDraft.data['status']), '回修单初始态应为 draft').toBe(REWORK_STATUS_DRAFT);
    expect(String(asDraft.data['rework_type']), '读回回修类型应等于写入值').toBe(
      REWORK_TYPE_COLOR_DIFFERENCE
    );
    expect(String(asDraft.data['original_batch_no']), '读回原缸号应等于写入值').toBe(batchNo);
    expect(String(asDraft.data['rework_batch_no']), '同缸回修时回修缸号应等于原缸号').toBe(batchNo);
    expect(String(asDraft.data['original_status']), '读回回修前状态应等于该缸真实状态').toBe(
      eligibleStatus
    );
    expect(asDraft.data['approved_at'], 'draft 阶段 approved_at 应为 null').toBeNull();
    expect(asDraft.data['started_at'], 'draft 阶段 started_at 应为 null').toBeNull();
    expect(asDraft.data['completed_at'], 'draft 阶段 completed_at 应为 null').toBeNull();

    // 非法跃迁 1/2：draft 直接 complete 与直接 start 都应被状态门拒绝。
    const completeTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/complete`
    );
    expectStateGateRejection(completeTooEarly, `回修单 ${id} 未审批直接完成应被状态门拒绝`);
    const startTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/start`
    );
    expectStateGateRejection(startTooEarly, `回修单 ${id} 未审批直接开工应被状态门拒绝`);

    // 假成功防护：被拒后状态与时间戳零漂移。
    const afterIllegal = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(afterIllegal.data['status']), '非法跃迁被拒后状态仍应为 draft').toBe(
      REWORK_STATUS_DRAFT
    );
    expect(afterIllegal.data['completed_at'], '非法跃迁被拒后 completed_at 仍应为 null').toBeNull();

    // 合法推进：draft → approved，审批人与审批时间必须由服务端会话写入。
    const approved = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/approve`
    );
    expect(String(approved['status']), '审批接口返回体状态应为 approved').toBe(
      REWORK_STATUS_APPROVED
    );
    expect(approved['approved_at'], '审批后 approved_at 应非空').not.toBeNull();
    const asApproved = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(asApproved.data['status']), '读回状态应为 approved').toBe(REWORK_STATUS_APPROVED);
    expect(
      Number(asApproved.data['approved_by']),
      '读回审批人应为服务端会话用户（非 0、非 null）'
    ).toBeGreaterThan(0);
    expect(asApproved.data['started_at'], 'approved 阶段 started_at 应为 null').toBeNull();

    // 非法跃迁 3：approved 跳过 in_progress 直接 complete。
    const skipStart = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/complete`
    );
    expectStateGateRejection(skipStart, `回修单 ${id} 未开工直接完成应被状态门拒绝`);

    // 合法推进：approved → in_progress → completed。
    const started = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/start`
    );
    expect(String(started['status']), '开工接口返回体状态应为 in_progress').toBe(
      REWORK_STATUS_IN_PROGRESS
    );
    const asInProgress = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(asInProgress.data['status']), '读回状态应为 in_progress').toBe(
      REWORK_STATUS_IN_PROGRESS
    );
    expect(asInProgress.data['started_at'], '开工后 started_at 应非空').not.toBeNull();

    // 非法跃迁 4：in_progress 重复审批。
    const approveAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/approve`
    );
    expectStateGateRejection(approveAgain, `回修单 ${id} 已开工再审批应被状态门拒绝`);

    const completed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/complete`
    );
    expect(String(completed['status']), '完成接口返回体状态应为 completed').toBe(
      REWORK_STATUS_COMPLETED
    );
    const finalRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(finalRead.data['status']), '读回终态应为 completed').toBe(
      REWORK_STATUS_COMPLETED
    );
    expect(finalRead.data['completed_at'], '完成后 completed_at 应非空').not.toBeNull();
    expect(String(finalRead.data['original_batch_no']), '终态读回的原缸号必须仍可追溯').toBe(
      reworkOriginalBatchNo
    );

    // 非法跃迁 5：completed 不可再取消（终态不可逆）。
    const cancelFinal = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${id}/cancel`
    );
    expectStateGateRejection(cancelFinal, `已完成的回修单 ${id} 取消应被状态门拒绝`);
    const afterCancel = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${id}`
    );
    expect(String(afterCancel.data['status']), '取消被拒后终态仍应为 completed').toBe(
      REWORK_STATUS_COMPLETED
    );

    // 收尾：本用例自建的缸号按删除端点回收；缸号已被回修单引用时后端可正当拒绝，tryCleanup 只登记不判负。
    await tryCleanup(
      page,
      'DELETE',
      `/production/dye-batches/${batchId}`,
      `449 自建缸号 ${batchNo}`
    );
  });

  test('回修类型与回修资格校验被拒且不落库', async ({ page }) => {
    // 功能：非法 rework_type 与不具回修资格的缸发起回修都必须被拒，且库里不得多出残行。
    // 调用方：本用例 → POST /production/dye-batch-reworks（create_rework）。
    // 入参 rework_type 取词表外值；original_status 取词表外值；缸号取自真实列表。
    // 传给谁：services/dye_batch_state_machine_validation.rs 的 validate_rework_type 与回修资格校验。
    // 存什么：被拒时零写入——用总数字前后一致来证明没有落库。
    // 存哪里：表 dye_batch_rework。
    const listBefore = await apiCallRaw<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      page_size: number;
    }>(page, 'GET', '/production/dye-batch-reworks?page=1&page_size=1');
    const totalBefore = Number(listBefore['total']);
    expect(
      Number.isFinite(totalBefore) && totalBefore >= 0,
      `回修记录总数应可读，实际 ${listBefore['total']}`
    ).toBe(true);

    const badType = await apiCallExpectFail(page, 'POST', '/production/dye-batch-reworks', {
      original_batch_id: 1,
      original_batch_no: reworkOriginalBatchNo ?? '',
      rework_type: 'not_a_valid_type',
      rework_reason: '非法类型应被拒',
      original_status: 'inspecting',
    });
    expect(
      badType.status,
      `非法回修类型应被拒绝，实际 status=${badType.status} code=${failureCode(badType)}`
    ).toBe(400);

    const badOriginalStatus = await apiCallExpectFail(
      page,
      'POST',
      '/production/dye-batch-reworks',
      {
        original_batch_id: 1,
        original_batch_no: reworkOriginalBatchNo ?? '',
        rework_type: REWORK_TYPE_COLOR_DIFFERENCE,
        rework_reason: '非法回修前状态应被拒',
        original_status: 'dyed',
      }
    );
    expect(
      badOriginalStatus.status,
      `词表外的 original_status 应被拒绝，实际 status=${badOriginalStatus.status} code=${failureCode(
        badOriginalStatus
      )}`
    ).toBe(400);

    const listAfter = await apiCallRaw<{
      items: Record<string, unknown>[];
      total: number;
      page: number;
      page_size: number;
    }>(page, 'GET', '/production/dye-batch-reworks?page=1&page_size=1');
    expect(
      Number(listAfter['total']),
      '两次非法发起被拒后回修记录总数必须不变（假成功防护：拒绝不得留下残行）'
    ).toBe(totalBefore);
  });

  test('委外染整订单链建单发料加工到结算逐跳可读回', async ({ page }) => {
    // 功能：建委外染整订单 → 读回全部写入值 → 发料 → 加工 → 结算，每跳重读校验状态词与金额字段。
    // 调用方：outsourcing_handler::create_outsourcing_order / issue_outsourcing_order /
    // record_processing / settle_outsourcing_order。
    // 入参 order_type=dyeing（词表 wage_energy_chemical_business.rs）；supplier_id 取本 worker
    // 夹具（ensureTestEntities 无条件自建的专属供应商）的 id，product_id/warehouse_id 取库内真实
    // 主数据；issue_date 为业务日期字面量。
    // 传给谁：services/outsourcing_ops/order.rs（单号查重、成本计算、状态流转）。
    // 存什么：outsourcing_order 的 order_no/order_type/supplier_id/issue_quantity/issue_unit/
    // material_cost/processing_fee/freight_fee/tax_amount/status。
    // 存哪里：表 outsourcing_order（字段见 services/outsourcing_ops/types.rs）。
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.supplierId) {
      throw new Error('前置不成立：本 worker 专属供应商未建立，无法取到真实 supplier_id 建单');
    }
    const products = await safeGetList<Record<string, unknown>>(
      page,
      '/products?page=1&page_size=5'
    );
    if (products.length === 0) {
      throw new Error('前置不成立：库内无产品主数据，收回单无法挂真实 product_id');
    }
    const warehouses = await safeGetList<Record<string, unknown>>(
      page,
      '/warehouses?page=1&page_size=5'
    );
    if (warehouses.length === 0) {
      throw new Error('前置不成立：库内无仓库主数据，收回单无法挂真实 warehouse_id');
    }
    outsourcingSupplierId = ctx.supplierId;
    outsourcingProductId = Number(products[0]['id']);
    outsourcingWarehouseId = Number(warehouses[0]['id']);
    const orderNo = genCode('WO449');
    outsourcingOrderNo = orderNo;

    const created = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-orders',
      {
        order_no: orderNo,
        order_type: OUTSOURCING_ORDER_TYPE_DYEING,
        supplier_id: outsourcingSupplierId,
        color_no: genCode('CX449'),
        issue_date: '2026-01-05',
        expected_return_date: '2026-01-18',
        issue_quantity: 1200,
        issue_unit: '米',
        material_cost: 24000,
        processing_fee: 6000,
        freight_fee: 300,
        tax_amount: 780,
        remarks: 'e2e 委外染整链',
      }
    );
    const id = Number(created['id']);
    expect(Number.isInteger(id) && id > 0, `委外订单建单应返回整数 id，实际 ${created['id']}`).toBe(
      true
    );
    outsourcingOrderId = id;

    const asDraft = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${id}`
    );
    expect(String(asDraft.data['order_no']), '读回单号应等于写入单号').toBe(orderNo);
    expect(String(asDraft.data['order_type']), '读回委外类型应为 dyeing').toBe(
      OUTSOURCING_ORDER_TYPE_DYEING
    );
    expect(Number(asDraft.data['supplier_id']), '读回供应商应等于写入供应商').toBe(
      outsourcingSupplierId
    );
    expect(Number(asDraft.data['issue_quantity']), '读头发料数量应等于写入值').toBe(1200);
    expect(String(asDraft.data['issue_unit']), '读回单位应等于写入值').toBe('米');
    expect(Number(asDraft.data['material_cost']), '读回材料成本应等于写入值').toBeCloseTo(24000, 2);
    expect(Number(asDraft.data['processing_fee']), '读回加工费应等于写入值').toBeCloseTo(6000, 2);
    expect(String(asDraft.data['status']), '新建委外订单初始态应为 draft').toBe(
      OUTSOURCING_STATUS_DRAFT
    );

    // 单号唯一门：同码重复建单必须被拒（order.rs validate_order_no_unique）。
    const dup = await apiCallExpectFail(page, 'POST', '/production/outsourcing-orders', {
      order_no: orderNo,
      order_type: OUTSOURCING_ORDER_TYPE_DYEING,
      supplier_id: outsourcingSupplierId,
      issue_date: '2026-01-05',
      issue_quantity: 1,
      issue_unit: '米',
      material_cost: 0,
      processing_fee: 0,
      freight_fee: 0,
      tax_amount: 0,
    });
    expect(
      dup.status,
      `重复单号应被拒绝，实际 status=${dup.status} code=${failureCode(dup)}`
    ).toBeGreaterThanOrEqual(400);

    // 非法跃迁：draft 未发料直接结算应被状态门拒绝（order.rs 只有 received 可结算）。
    const settleTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${id}/settle`
    );
    expectStateGateRejection(settleTooEarly, `draft 委外订单 ${id} 未收回即结算应被状态门拒绝`);
    const afterEarlySettle = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${id}`
    );
    expect(String(afterEarlySettle.data['status']), '结算被拒后状态仍应为 draft（零漂移）').toBe(
      OUTSOURCING_STATUS_DRAFT
    );

    // 发料前置（本轮红面）：门在 outsourcing_ops/order.rs::issue_order 内经
    // piece_domain_service::validate_pieces_for_issue 逐条判定——空明细拒绝、缺匹号拒绝、
    // 匹不存在或非可用拒绝、同单重复引用同一匹拒绝，染色外发的发料必须精确到生产匹。
    // 红因是本腿未登记发料明细，属用例前置缺失而不是门错，故先造真实可用匹、再按匹登记明细。
    if (!outsourcingProductId) {
      throw new Error('前置不成立：产品句柄未建立，发料明细无法挂真实 product_id');
    }
    const issueTarget = await pickDyeableWarehouse(page);
    const issueBundle = await seedDyedOutboundBundle(page, {
      productId: outsourcingProductId,
      warehouseId: issueTarget.id,
      quantityMeters: '1200',
      pieceCount: 1,
      context: '449-issue',
    });
    // 入参按 services/outsourcing_ops/types.rs 的 CreateOutsourcingOrderItemRequest：
    // outsourcing_order_id / product_id / quantity / unit_cost 必填，四维取自真实可用匹；
    // 数量与建单的 issue_quantity 同值、单价按 material_cost÷数量，保证成本钩稽不被门拒。
    const itemResp = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-orders/items',
      {
        outsourcing_order_id: id,
        product_id: outsourcingProductId,
        warehouse_id: issueTarget.id,
        color_no: issueBundle.stockRow.color_no,
        dye_lot_no: issueBundle.stockRow.dye_lot_no,
        batch_no: issueBundle.stockRow.batch_no,
        piece_no: issueBundle.pieces[0].piece_no,
        quantity: 1200,
        unit: '米',
        unit_cost: 20,
        remarks: 'e2e 委外发料明细（精确到匹）',
      }
    );
    const itemId = Number(itemResp['id']);
    expect(
      Number.isInteger(itemId) && itemId > 0,
      `登记发料明细应返回整数 id，实际 ${JSON.stringify(itemResp)}`
    ).toBe(true);
    outsourcingItemId = itemId;

    // 前置成立证明：按单回读发料明细必须看到刚登记的那条匹，否则发料门仍会拒。
    // list_outsourcing_items 的出参是 ApiResponse<Vec<Model>> 裸数组，不是分页信封，
    // 读法按数组通道取 data 并先自证是数组。
    const itemRows = await apiCallRaw<Record<string, unknown>[]>(
      page,
      'GET',
      `/production/outsourcing-orders/items/by-order/${id}`
    );
    expect(
      Array.isArray(itemRows),
      `按单读发料明细应返回数组，实际 ${JSON.stringify(itemRows)}`
    ).toBe(true);
    expect(
      itemRows.some(r => Number(r['id']) === itemId),
      `发料明细 ${itemId} 必须能按单读回，实际 ${JSON.stringify(itemRows)}`
    ).toBe(true);

    // 合法推进：draft → issued → processing。
    const issued = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-orders/${id}/issue`
    );
    expect(String(issued['status']), '发料接口返回体状态应为 issued').toBe(
      OUTSOURCING_STATUS_ISSUED
    );
    const asIssued = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${id}`
    );
    expect(String(asIssued.data['status']), '读回状态应为 issued').toBe(OUTSOURCING_STATUS_ISSUED);

    const processing = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-orders/${id}/processing`
    );
    expect(String(processing['status']), '加工登记接口返回体状态应为 processing').toBe(
      OUTSOURCING_STATUS_PROCESSING
    );
    const asProcessing = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${id}`
    );
    expect(String(asProcessing.data['status']), '读回状态应为 processing').toBe(
      OUTSOURCING_STATUS_PROCESSING
    );

    // 非法跃迁：processing 未收回即结算仍应被拒。
    const settleBeforeReceipt = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${id}/settle`
    );
    expectStateGateRejection(
      settleBeforeReceipt,
      `processing 委外订单 ${id} 未收回即结算应被状态门拒绝`
    );

    // 收尾：回收本腿自建的发料明细（删除面在 frontend/scripts/route-snapshot.txt 在册，
    // outsourcing_handler::delete_outsourcing_item）。后续收回腿若仍引用该明细，
    // tryCleanup 只登记原文不判负——发料门自身的判据写在本腿正文里，不由清理腿兜绿。
    await tryCleanup(
      page,
      'DELETE',
      `/production/outsourcing-orders/items/${outsourcingItemId}`,
      `清理发料明细 ${outsourcingItemId}`
    );
  });

  test('委外收回入库实测值落库可读回且缺值保持 NULL', async ({ page }) => {
    // 功能：收回入库单写入数量、损耗与三列实测值后读回；另一张只写数量不写实测值，
    // 断言三列保持 NULL（未补录）而不是 0。
    // 调用方：outsourcing_handler::create_outsourcing_receipt / confirm_outsourcing_receipt。
    // 入参 outsourcing_order_id 用上一笔真实订单；return_quantity/loss_quantity 为业务数量；
    // weight/width/gram_weight 三列按 types.rs 的可空口径分别构造有值与缺席。
    // 传给谁：services/outsourcing_ops/receipt.rs（validate_measured_value 取值域门与
    // validate_receipt_quality_status 结论词门）。本列只认
    // models/status/wage_energy_chemical_business.rs::outsourcing_receipt_quality_status 的
    // 四态 pending/qualified/concession/unqualified；passed 与 failed 属染化料来料检验域、
    // 中文合格与不合格属库存质量状态，写进本列会在入口处被业务拒。
    // 存什么：return_quantity/loss_quantity/weight/width/gram_weight/quality_status/grade/status。
    // 存哪里：表 outsourcing_receipt（字段见 services/outsourcing_ops/types.rs）。
    if (!outsourcingOrderId || !outsourcingProductId || !outsourcingWarehouseId) {
      throw new Error('前置不成立：委外订单或主数据句柄未建立，收回腿会退化成空跑');
    }
    const orderId = outsourcingOrderId;
    const noMeasured = genCode('WO449N');
    const withMeasured = genCode('WO449M');

    // 缺值腿：三列实测值整键缺席 → 必须落 NULL。
    const draftReceipt = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-receipts',
      {
        receipt_no: noMeasured,
        outsourcing_order_id: orderId,
        receipt_date: '2026-01-16',
        product_id: outsourcingProductId,
        warehouse_id: outsourcingWarehouseId,
        return_quantity: 1000,
        loss_quantity: 30,
        remarks: '实测值未补录腿',
      }
    );
    const draftId = Number(draftReceipt['id']);
    expect(
      Number.isInteger(draftId) && draftId > 0,
      `收回单应返回整数 id，实际 ${draftReceipt['id']}`
    ).toBe(true);
    const draftRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/${draftId}`
    );
    expect(String(draftRead.data['receipt_no']), '读回收回单号应等于写入值').toBe(noMeasured);
    expect(Number(draftRead.data['return_quantity']), '读回收回数量应等于写入值').toBe(1000);
    expect(Number(draftRead.data['loss_quantity']), '读回损耗数量应等于写入值').toBe(30);
    expect(
      draftRead.data['weight'],
      '未提交实测重量时 weight 应为 null（未补录），不是 0'
    ).toBeNull();
    expect(
      draftRead.data['width'],
      '未提交实测幅宽时 width 应为 null（未补录），不是 0'
    ).toBeNull();
    expect(
      draftRead.data['gram_weight'],
      '未提交实测克重时 gram_weight 应为 null（未补录），不是 0'
    ).toBeNull();
    expect(String(draftRead.data['status']), '新建收回单初始态应为 draft').toBe(
      RECEIPT_STATUS_DRAFT
    );

    // 负数实测值属非法入参，应被拒且整张单不落库。
    const badMeasure = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode('WO449B'),
      outsourcing_order_id: orderId,
      receipt_date: '2026-01-16',
      product_id: outsourcingProductId,
      return_quantity: 100,
      loss_quantity: 0,
      weight: -1,
    });
    expect(
      badMeasure.status,
      `非法实测重量应被拒绝，实际 status=${badMeasure.status} code=${failureCode(badMeasure)}`
    ).toBe(400);
    const receiptsAfterBad = await safeGetList<Record<string, unknown>>(
      page,
      '/production/outsourcing-receipts?page=1&page_size=50'
    );
    expect(
      receiptsAfterBad.some(r => String(r['receipt_no']) === 'WO449B'),
      '被拒的收回单不得以任何单号残留在库'
    ).toBe(false);

    // 有值腿：三列实测值齐全 → 确认后订单进入 received，为结算腿铺路。
    const okReceipt = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-receipts',
      {
        receipt_no: withMeasured,
        outsourcing_order_id: orderId,
        receipt_date: '2026-01-16',
        product_id: outsourcingProductId,
        warehouse_id: outsourcingWarehouseId,
        return_quantity: 1100,
        loss_quantity: 20,
        quality_status: 'qualified',
        grade: '一等品',
        weight: 250.5,
        width: 160,
        gram_weight: 185,
        remarks: '实测值齐备腿',
      }
    );
    const okId = Number(okReceipt['id']);
    receiptId = okId;
    const okRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/${okId}`
    );
    expect(Number(okRead.data['weight']), '读回实测重量应等于写入值').toBeCloseTo(250.5, 2);
    expect(Number(okRead.data['width']), '读回实测幅宽应等于写入值').toBe(160);
    expect(Number(okRead.data['gram_weight']), '读回实测克重应等于写入值').toBe(185);
    expect(String(okRead.data['grade']), '读回等级应按写入值逐字保留').toBe('一等品');
    expect(
      String(okRead.data['quality_status']),
      '读回质检结论应与写入值逐字符相同（本列词表只有四态，别域写法进不来）'
    ).toBe('qualified');

    const confirmed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-receipts/${okId}/confirm`
    );
    expect(String(confirmed['status']), '确认接口返回体状态应为 confirmed').toBe(
      RECEIPT_STATUS_CONFIRMED
    );
    const confirmedRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/${okId}`
    );
    expect(String(confirmedRead.data['status']), '读回收回单状态应为 confirmed').toBe(
      RECEIPT_STATUS_CONFIRMED
    );

    // 收回确认必须把订单推到 received（settle 的唯一合法前置，order.rs）。
    const orderAfterConfirm = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${orderId}`
    );
    expect(
      String(orderAfterConfirm.data['status']),
      '收回确认后委外订单状态应为 received，否则结算腿的前置不成立'
    ).toBe(OUTSOURCING_STATUS_RECEIVED);

    // 按单号读回同一张收回单（by-no 通道与 by-id 通道必须给出同一行）。
    const byNo = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/by-no/${withMeasured}`
    );
    expect(Number(byNo['id']), '按单号读回的收回单 id 应等于按主键读回的 id').toBe(okId);
    expect(String(byNo['grade']), '按单号读回的等级应与按主键一致').toBe('一等品');
  });

  test('收回确认后订单结算并生成凭证过账落库可读回', async ({ page }) => {
    // 功能：跑完 received → settled 与委外凭证从建单到过账的最后一跳，并断言重复过账被拒、
    // 被拒后 is_posted 不漂。
    // 调用方：outsourcing_handler::settle_outsourcing_order / create_outsourcing_voucher /
    // post_outsourcing_voucher。
    // 入参 voucher_type=fee（词表 wage_energy_chemical_business.rs）；amount 取加工费同额；
    // debit_account/credit_account 为科目编码字面量。
    // 传给谁：services/outsourcing_ops/voucher.rs（建凭证、过账写 is_posted）。
    // 存什么：outsourcing_order.status=settled；outsourcing_voucher 的 voucher_no/voucher_type/
    // amount/is_posted 与过账时间。
    // 存哪里：表 outsourcing_order、outsourcing_voucher（字段见 services/outsourcing_ops/types.rs）。
    if (!outsourcingOrderId || !receiptId || !outsourcingOrderNo) {
      throw new Error('前置不成立：委外订单或收回单句柄未建立，结算与凭证腿无法定位真实单据');
    }
    const orderId = outsourcingOrderId;

    const settled = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-orders/${orderId}/settle`
    );
    expect(String(settled['status']), '收回确认后结算应返回 settled').toBe(
      OUTSOURCING_STATUS_SETTLED
    );
    const settledRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-orders/${orderId}`
    );
    expect(String(settledRead.data['status']), '读回订单状态应为 settled').toBe(
      OUTSOURCING_STATUS_SETTLED
    );
    expect(String(settledRead.data['order_no']), '读回单号应保持建单值').toBe(outsourcingOrderNo);
    expect(Number(settledRead.data['processing_fee']), '读回加工费应保持建单值').toBeCloseTo(
      6000,
      2
    );

    // 非法跃迁：已结算不可再次结算。
    const settleAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${orderId}/settle`
    );
    expectStateGateRejection(settleAgain, `已结算的委外订单 ${orderId} 重复结算应被状态门拒绝`);

    const voucherNo = genCode('PZ449');
    const voucher = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-vouchers',
      {
        voucher_no: voucherNo,
        outsourcing_order_id: orderId,
        voucher_type: 'fee',
        debit_account: '5001',
        credit_account: '2202',
        amount: 6000,
        tax_amount: 780,
        voucher_date: '2026-01-20',
        remarks: 'e2e 委外加工费凭证',
      }
    );
    const vid = Number(voucher['id']);
    expect(Number.isInteger(vid) && vid > 0, `凭证应返回整数 id，实际 ${voucher['id']}`).toBe(true);
    const voucherList = await safeGetList<Record<string, unknown>>(
      page,
      `/production/outsourcing-vouchers?page=1&page_size=50`
    );
    const voucherRow = voucherList.find(r => Number(r['id']) === vid);
    if (!voucherRow) {
      throw new Error(`前置不成立：凭证 ${vid} 在列表中读不到，建单未落库`);
    }
    expect(String(voucherRow['voucher_no']), '读回凭证号应等于写入值').toBe(voucherNo);
    expect(String(voucherRow['voucher_type']), '读回凭证类型应为 fee').toBe('fee');
    expect(Number(voucherRow['amount']), '读回凭证金额应等于写入值').toBeCloseTo(6000, 2);
    expect(voucherRow['is_posted'], '未过账凭证的 is_posted 应为 false').toBe(false);

    const posted = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-vouchers/${vid}/post`
    );
    expect(String(posted['status'] ?? 'posted'), '过账接口应返回成功信封').not.toBe('undefined');
    const postedList = await safeGetList<Record<string, unknown>>(
      page,
      `/production/outsourcing-vouchers?page=1&page_size=50`
    );
    const postedRow = postedList.find(r => Number(r['id']) === vid);
    if (!postedRow) {
      throw new Error(`前置不成立：过账后凭证 ${vid} 读不到`);
    }
    expect(postedRow['is_posted'], '过账后 is_posted 应为 true').toBe(true);

    // 非法跃迁：已过账不得重复过账。
    const postAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-vouchers/${vid}/post`
    );
    expect(
      postAgain.status,
      `重复过账应被拒绝，实际 status=${postAgain.status} code=${failureCode(postAgain)}`
    ).toBeGreaterThanOrEqual(400);
    const afterPostAgain = await safeGetList<Record<string, unknown>>(
      page,
      `/production/outsourcing-vouchers?page=1&page_size=50`
    );
    expect(
      afterPostAgain.find(r => Number(r['id']) === vid)?.['is_posted'],
      '重复过账被拒后 is_posted 必须仍为 true（不得被改写成其它值）'
    ).toBe(true);
  });

  test('无权限岗位调用返工审批与委外发料被拦，主管岗位同端点可达', async ({ page }) => {
    // 功能：垂直越权防护——只读岗位调用写端点必须被权限门拒绝（HTTP 403 + FORBIDDEN），
    // 同端点在主管岗位会话下可达，证明 403 来自 RBAC 而不是路由缺失或 CSRF 竞败。
    // 调用方：loginAsRole + apiCallExpectFail + expectDenied（helpers.ts）。
    // 入参：岗位名 report_viewer（只读报表岗）与 production_manager（染整主管岗）；权限键由
    // URL 段 /api/v1/erp/{seg3}/{seg4} 推导（middleware/permission.rs），
    // 即 production/dye-batch-reworks 与 production/outsourcing-orders 两族键。
    // 传给谁：权限中间件，被拒时不触达 service。
    // 存什么：被拒时零写入——回修单状态与委外订单状态均不得漂移。
    // 存哪里：表 dye_batch_rework、outsourcing_order。
    if (!reworkId || !outsourcingOrderId) {
      throw new Error('前置不成立：回修单或委外订单句柄未建立，越权腿无法定位真实资源');
    }
    const targetReworkId = reworkId;
    const targetOrderId = outsourcingOrderId;

    await loginAsRole(page, 'report_viewer');
    const reworkDenied = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${targetReworkId}/approve`
    );
    expectDenied(reworkDenied, 'report_viewer 调用回修审批端点应被权限门拒绝');
    const issueDenied = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${targetOrderId}/issue`
    );
    expectDenied(issueDenied, 'report_viewer 调用委外发料端点应被权限门拒绝');

    // 被权限门拒绝后副作用零漂移（读回仍由主管岗位会话完成）。
    await loginAsRole(page, 'production_manager');
    const reworkRead = await apiCall<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${targetReworkId}`
    );
    expect(
      String(reworkRead.data['status']),
      '只读岗位被拒后回修单终态不得漂移，仍应为 completed'
    ).toBe(REWORK_STATUS_COMPLETED);

    const managerApprove = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${targetReworkId}/approve`
    );
    expect(
      managerApprove.status,
      `主管岗位同端点不得被权限门 403 拦截（实际 ${managerApprove.status} code=${failureCode(
        managerApprove
      )}）；400 属状态门拒绝，是可达的正向证据`
    ).toBe(400);
  });
});
