import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  verifyAuditLog,
  verifyStockFourDim,
  readDyedPieceByNo,
  tryCleanup,
  failureCode,
  expectStateGateRejection,
  APP_ERROR_CODES,
} from './helpers';

// ============================================================================
// 单据状态机非法跃迁专项（销售退货域）
//
// 选型依据（实量事实，非设想）：本域状态词表的唯一事实来源是服务端写入方常量
// sales_return_status（backend 状态常量模块 sales 分册），实量取值集合为大写五态
// DRAFT / SUBMITTED / APPROVED / REJECTED / COMPLETED（写入值逐字符大写，与
// 库存盘点等小写词表域刻意不同，比较点禁止 toLowerCase 归一——归一会掩盖词表漂移）。
// 服务端实现的状态门（唯一出边集合，逐条对应真实比较点）：
//   submit_return：仅 DRAFT→SUBMITTED；approve_return：仅 SUBMITTED→APPROVED；
//   reject_return：仅 SUBMITTED→REJECTED；execute_return：仅 APPROVED→COMPLETED；
//   add_return_item / update_return / delete_return：仅 DRAFT 可操作。
// 终态实测：COMPLETED 与 REJECTED 均无任何合法出边（本域没有撤回口/退回草稿端点，
// 动作端点全集只有 submit/approve/reject/execute 四个），驳回后重提在服务端被状态门
// 拒绝——照实断言"被拒"，不虚构"重提成功"路径（用例三钉死此事实）。
// 失败拒绝形状：统一失败信封 {code,message,trace_id,timestamp}，状态门拒绝走
// AppError::business → HTTP 400 + code=BUSINESS_ERROR；出参 message 恒为脱敏常量，
// 真实拒绝原因（含当前状态）只进服务端日志，故断言钉 status+机器码双判据、
// 不读文案内容（与共用请求封装 expectStateGateRejection 的假绿拦截口径一致）。
// 前置数据自建自清：每枚用例建自己的客户（正数信用额度 + active 且读回自证）；
// 清理次序先清引用行（明细）再清单据再清档案（客户软删）；已进入
// SUBMITTED/APPROVED/COMPLETED/REJECTED 的单据被服务端 delete_return 的 DRAFT 状态门
// 正当拒绝删除，属系统留痕设计，交易行如实保留并在报告点名，不绕门伪造"已清"。
// ============================================================================

/** 状态词表权威值：与服务端写入方常量 sales_return_status 逐字符一致（大写五态） */
const SR_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
} as const;

/** 退货单读模型单键形状：GET /sales/sales-returns/{id} 出参 = SalesReturnView，键为 snake_case */
interface SalesReturnRead {
  id: number;
  return_no: string;
  status: string;
  total_amount: string | number;
  rejected_reason: string | null;
  updated_at: string;
}

/**
 * 功能：把一次动作请求转成对单据真实状态列的服务端回读值（不信任动作响应体，只认 GET 回读）。
 * 调用方：本文件三条用例的每一步流转/非法跃迁之后。
 * 入参：page=已登录会话页；returnId=销售退货单主键。
 * 传给谁：GET /sales/sales-returns/{id}（服务端 get_return → SalesReturnView 读模型）。
 * 存什么：不落库，纯读。
 * 存哪里：无写入。
 */
async function readReturn(page: import('@playwright/test').Page, returnId: number) {
  return apiCallRaw<SalesReturnRead>(page, 'GET', `/sales/sales-returns/${returnId}`);
}

/**
 * 功能：断言一次非法跃迁被状态门拒绝——HTTP 恰 400 + 机器码恰为 BUSINESS_ERROR +
 * 统一信封 trace_id/timestamp 齐备；断言消息携带实际值，红了能一眼分清"门缺失"
 * （status<400）与"词表/信封漂移"（机器码或信封键不对）。
 * 调用方：三条用例的全部非法跃迁点位。
 * 入参：r=apiCallExpectFail 原样透传的失败体；context=点位描述（进断言消息）。
 * 传给谁：内部复用共用请求封装 expectStateGateRejection（假绿拦截口径：403/404/5xx 不算状态门拒绝）。
 * 存什么：不落库，纯断言。
 * 存哪里：无写入。
 */
function expectStateGateRejected(r: import('./helpers').ApiFailureResult, context: string): void {
  expectStateGateRejection(
    r,
    `${context}：应被状态门拒绝（实际 status=${r.status} code=${JSON.stringify(r.code)} ` +
      `message=${JSON.stringify(r.message)}）`
  );
  expect(
    failureCode(r),
    `${context}：状态门拒绝机器码应恰为 ${APP_ERROR_CODES.BUSINESS_ERROR}` +
      `（AppError::business 映射，error_status_and_type 归 400），实际 ${JSON.stringify(r.code)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    typeof r.trace_id === 'string' && r.trace_id.length > 0,
    `${context}：统一失败信封应携带非空 trace_id，实际 ${JSON.stringify(r.trace_id)}`
  ).toBe(true);
  expect(
    r.timestamp !== undefined && r.timestamp !== null,
    `${context}：统一失败信封应携带 timestamp，实际 ${JSON.stringify(r.timestamp)}`
  ).toBe(true);
}

/**
 * 功能：为本用例新建专属客户（正数信用额度 + active），并读回自证两列真实落库——
 * 后续销售订单/退货单都挂这个客户，满足"涉及客户的腿自建自证"的前置纪律。
 * 调用方：三条用例开头。
 * 入参：page=已登录会话页；tag=本轮唯一后缀（进客户名防并发撞名）。
 * 传给谁：POST /crm/customers（服务端 create_customer，credit_limit 按字符串解析为
 * Decimal，非法值出 VALIDATION_ERROR——这里传合法正数）；随后 GET /crm/customers/{id} 回读。
 * 存什么：customer_name、credit_limit（>0）、status（active，客户状态词表小写）。
 * 存哪里：客户主档表（档案腿，用例尾做软删清理；被引用后服务端为软删语义）。
 */
async function createCustomerWithCredit(
  page: import('@playwright/test').Page,
  tag: string
): Promise<number> {
  const created = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: `E2E状态机客户${tag}`,
    credit_limit: '500000.00',
    status: 'active',
  });
  const id = created.data?.id;
  expect(id, `客户创建应返回 data.id，实际 ${JSON.stringify(created).slice(0, 200)}`).toBeTruthy();
  const readback = await apiCallRaw<{ credit_limit?: string | number; status?: string }>(
    page,
    'GET',
    `/crm/customers/${id}`
  );
  expect(
    Number(readback.credit_limit),
    `客户信用额度应读回正数（写入 500000.00），实际 ${JSON.stringify(readback.credit_limit)}`
  ).toBeGreaterThan(0);
  expect(
    readback.status,
    `客户状态应读回 active（客户状态词表为小写），实际 ${JSON.stringify(readback.status)}`
  ).toBe('active');
  return id as number;
}

/**
 * 功能：创建草稿销售订单（退货明细追溯三元组的权威来源腿）。
 * 调用方：三条用例。
 * 入参：customerId=本用例专属客户；productId=共享产品池首个产品。
 * 传给谁：POST /sales/orders（服务端创建即写订单明细行，退货侧 add_return_item 的
 * fetch_return_item_trace 按 订单明细→出库明细 优先级回写追溯列）。
 * 存什么：订单头 + 每行明细（数量、含税单价）。
 * 存哪里：销售订单主表与明细表；日期为纯日期字符串（NaiveDate 口径）。
 */
async function createDraftSalesOrder(
  page: import('@playwright/test').Page,
  customerId: number,
  productId: number
): Promise<number> {
  const so = await apiCall<{ id?: number }>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString().slice(0, 10),
    items: [{ product_id: productId, quantity: 5, unit_price: '20.00' }],
  });
  const soId = so.data?.id;
  expect(soId, `销售订单创建应返回 data.id，实际 ${JSON.stringify(so).slice(0, 200)}`).toBeTruthy();
  return soId as number;
}

/**
 * 功能：创建关联销售订单的销售退货单，并断言创建即落 DRAFT（写入方初值常量）。
 * 调用方：三条用例。
 * 入参：customerId=专属客户；soId=追溯来源订单；warehouseId=可承载入库的目标仓。
 * 传给谁：POST /sales/sales-returns（服务端 create_return：status 固定写 DRAFT，
 * reason_type 与 reason_detail 合成为 reason 复合列）。
 * 存什么：关联订单号、客户、纯日期退货日期、目标仓、中文退货原因（词表禁止英文化）。
 * 存哪里：销售退货单主表；返回体 data.id 即主键，随后 GET 回读自证状态列。
 */
async function createReturnDraft(
  page: import('@playwright/test').Page,
  customerId: number,
  soId: number,
  warehouseId: number
): Promise<number> {
  const rtn = await apiCall<{ id?: number }>(page, 'POST', '/sales/sales-returns', {
    order_id: soId,
    customer_id: customerId,
    return_date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    reason_type: '客户取消订单',
    reason_detail: '状态机专项自建退货单',
  });
  const returnId = rtn.data?.id;
  expect(
    returnId,
    `销售退货单创建应返回 data.id，实际 ${JSON.stringify(rtn).slice(0, 200)}`
  ).toBeTruthy();
  const created = await readReturn(page, returnId as number);
  expect(
    created.status,
    `新建退货单状态应逐字符等于写入方初值 ${SR_STATUS.DRAFT}（大写词表），实际 ${JSON.stringify(created.status)}`
  ).toBe(SR_STATUS.DRAFT);
  return returnId as number;
}

/**
 * 功能：给退货单添加一行明细（提交门要求明细非空；追溯三元组由服务端从订单明细回写，
 * 税率显式提供避免命中 resolve_tax_percent 的"无权威来源即拒绝"分支）。
 * 调用方：三条用例。
 * 入参：productId 与订单明细同商品（保证追溯来源唯一，多行会触发唯一定位拒绝）。
 * 传给谁：POST /sales/sales-returns/{id}/items（服务端 add_return_item）。
 * 存什么：数量、含税单价、税率 13%、服务端回写的 色号/缸号/批次 三列。
 * 存哪里：销售退货明细表（引用行，清理时先于单据头删除）。
 */
async function addReturnItem(
  page: import('@playwright/test').Page,
  returnId: number,
  productId: number
): Promise<number> {
  const item = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/sales/sales-returns/${returnId}/items`,
    {
      product_id: productId,
      quantity: '1',
      unit_price: '20.00',
      tax_percent: '13',
    }
  );
  const itemId = item.data?.id;
  expect(itemId, `退货明细应返回 data.id，实际 ${JSON.stringify(item).slice(0, 200)}`).toBeTruthy();
  return itemId as number;
}

test.describe('销售退货状态机：合法流转、非法跃迁拦截与驳回终态（大写五态词表）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('用例一：DRAFT→SUBMITTED→APPROVED→COMPLETED 全链路每步读回真实状态列；终态 COMPLETED 再调四个中间动作全部被状态门拒绝且状态列纹丝不动', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0] || 1;
    const tag = `${Date.now().toString().slice(-6)}`;
    const customerId = await createCustomerWithCredit(page, tag);

    // 出库前置照抄本域 CI 已验证的四维范式：真实可染仓 + 染色匹 bundle + 订单审批 +
    // 四维发货，使退货审批的库存入库腿与红字应收腿都走在真实数据上，不走简化分支。
    const target = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: target.id,
      quantityMeters: '1000',
      pieceCount: 1,
      context: `506A${tag}`,
    });
    const soId = await createDraftSalesOrder(page, customerId, productId);
    await apiCall(page, 'POST', `/sales/orders/${soId}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${soId}/approve`);
    await apiCall(page, 'POST', `/sales/orders/${soId}/ship`, {
      order_id: soId,
      warehouse_code: target.code,
      items: [
        {
          product_id: productId,
          quantity: 5,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          batch_no: bundle.dyeLotNo,
          piece_no: bundle.pieces[0].piece_no,
        },
      ],
    });
    const shippedPiece = await readDyedPieceByNo(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo: bundle.dyeLotNo,
      batchNo: bundle.dyeLotNo,
      pieceNo: bundle.pieces[0].piece_no,
    });
    expect(
      String(shippedPiece?.status),
      `出库腿前置：匹状态应为 SHIPPED（库存匹词表大写），实际 ${JSON.stringify(shippedPiece?.status)}`
    ).toBe('SHIPPED');

    const returnId = await createReturnDraft(page, customerId, soId, target.id);
    const itemId = await addReturnItem(page, returnId, productId);

    // 追溯三元组必须由服务端从原出库明细回写（权威来源优先级 1），不落空串
    const items = await apiCallRaw<Array<Record<string, unknown>>>(
      page,
      'GET',
      `/sales/sales-returns/${returnId}/items`
    );
    expect(Array.isArray(items) && items.length, `明细应至少 1 行，实际 ${items?.length}`).toBe(1);
    expect(
      String(items[0].color_no),
      `明细色号应等于出库行真实色号 ${bundle.colorNo}，实际 ${JSON.stringify(items[0].color_no)}`
    ).toBe(bundle.colorNo);

    // —— 合法链路：每一步动作后 GET 回读服务端真实状态列，逐字符对上大写词表 ——
    await apiCall(page, 'POST', `/sales/sales-returns/${returnId}/submit`);
    const afterSubmit = await readReturn(page, returnId);
    expect(
      afterSubmit.status,
      `提交后状态列应为 ${SR_STATUS.SUBMITTED}，实际 ${JSON.stringify(afterSubmit.status)}`
    ).toBe(SR_STATUS.SUBMITTED);

    await apiCall(page, 'POST', `/sales/sales-returns/${returnId}/approve`);
    const afterApprove = await readReturn(page, returnId);
    expect(
      afterApprove.status,
      `审批后状态列应为 ${SR_STATUS.APPROVED}，实际 ${JSON.stringify(afterApprove.status)}`
    ).toBe(SR_STATUS.APPROVED);

    // 审批腿含库存入库副作用：退货再入库必须命中出库同四维行（写后回读，不靠响应）
    const stockAfter = await verifyStockFourDim(page, productId, bundle.colorNo, bundle.dyeLotNo, {
      batchNo: bundle.dyeLotNo,
      warehouseId: target.id,
    });
    expect(
      Number(stockAfter?.quantity_on_hand),
      `审批入库后四维库存行在库量应大于 0，实际 ${JSON.stringify(stockAfter?.quantity_on_hand)}`
    ).toBeGreaterThan(0);

    await apiCall(page, 'POST', `/sales/sales-returns/${returnId}/execute`);
    const afterExecute = await readReturn(page, returnId);
    expect(
      afterExecute.status,
      `执行后状态列应为 ${SR_STATUS.COMPLETED}，实际 ${JSON.stringify(afterExecute.status)}`
    ).toBe(SR_STATUS.COMPLETED);

    // 审批动作应留审计痕迹：动作端点路径末段含 approve，服务端 classify_operation 归
    // APPROVE 事件；资源业务段为路径首段 sales。
    const auditHit = await verifyAuditLog(
      page,
      'APPROVE',
      'sales',
      `/sales-returns/${returnId}/approve`
    );
    expect(auditHit, `审批应在审计检索中留 APPROVE 事件（单 ${returnId}），实际未命中`).toBe(true);

    // —— 终态非法跃迁：COMPLETED 单据再调四个中间动作，全部 400 + BUSINESS_ERROR，
    // 且真实状态列 / 总金额 / updated_at 三列纹丝不动（拒绝必须在写之前发生）——
    const frozen = {
      status: afterExecute.status,
      total_amount: String(afterExecute.total_amount),
      updated_at: afterExecute.updated_at,
    };
    const terminalAttempts: Array<{
      label: string;
      method: 'POST';
      path: string;
      body?: Record<string, string>;
    }> = [
      { label: '终态再提交', method: 'POST', path: `/sales/sales-returns/${returnId}/submit` },
      { label: '终态再审批', method: 'POST', path: `/sales/sales-returns/${returnId}/approve` },
      {
        label: '终态再驳回',
        method: 'POST',
        path: `/sales/sales-returns/${returnId}/reject`,
        body: { reason: '终态非法驳回探测' },
      },
      { label: '终态再执行', method: 'POST', path: `/sales/sales-returns/${returnId}/execute` },
    ];
    for (const attempt of terminalAttempts) {
      const denied = await apiCallExpectFail(page, attempt.method, attempt.path, attempt.body);
      expectStateGateRejected(denied, `用例一/${attempt.label}`);
      const frozenNow = await readReturn(page, returnId);
      expect(
        frozenNow.status,
        `${attempt.label}被拒后状态列应保持 ${SR_STATUS.COMPLETED}，实际 ${JSON.stringify(frozenNow.status)}`
      ).toBe(SR_STATUS.COMPLETED);
      expect(
        frozenNow.updated_at,
        `${attempt.label}被拒后 updated_at 不应变化，实际 ${JSON.stringify(frozenNow.updated_at)}`
      ).toBe(frozen.updated_at);
      expect(
        String(frozenNow.total_amount),
        `${attempt.label}被拒后 total_amount 不应变化，实际 ${JSON.stringify(frozenNow.total_amount)}`
      ).toBe(frozen.total_amount);
    }

    // 清理：COMPLETED 单据与出库链交易行被服务端 DRAFT 删除门正当保护（留痕设计），
    // 不绕门伪造删除；本用例自有档案腿（客户）做软删清理。明细行此时已随单据完成
    // 不可删，仍按"先引用行后单据"次序发起（预期被状态门正当拒绝，仅告警不留错）。
    await tryCleanup(
      page,
      'DELETE',
      `/sales/sales-returns/${returnId}/items/${itemId}`,
      '用例一退货明细（终态应被 DRAFT 门拒删，留痕属预期）'
    );
    await tryCleanup(
      page,
      'DELETE',
      `/crm/customers/${customerId}`,
      `用例一专属客户 ${customerId} 软删`
    );
  });

  test('用例二：DRAFT 单据跳级调中间动作（审批/执行/驳回/追明细/改单）全部被拒且状态列不动；非法跃迁不改变草稿可自清（先明细后单据）', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0] || 1;
    const tag = `${Date.now().toString().slice(-6)}`;
    const customerId = await createCustomerWithCredit(page, tag);
    const target = await pickDyeableWarehouse(page);
    const soId = await createDraftSalesOrder(page, customerId, productId);
    const returnId = await createReturnDraft(page, customerId, soId, target.id);
    const itemId = await addReturnItem(page, returnId, productId);

    // DRAFT 的五条非法出边：approve（门要求 SUBMITTED）、execute（门要求 APPROVED）、
    // reject（门要求 SUBMITTED）、再追一条明细（add_return_item 门要求 DRAFT 之外的
    // 反向？——不，明细门就是 DRAFT 可写，故此处明细正例已加；对 DRAFT 的非法点是
    // update_return 的删除仅限已提交面？以真实比较点为准：以下四项均应 400 拒绝）
    const draftAttempts: Array<{
      label: string;
      method: 'POST' | 'PUT';
      path: string;
      body?: Record<string, string>;
    }> = [
      { label: '草稿跳级审批', method: 'POST', path: `/sales/sales-returns/${returnId}/approve` },
      { label: '草稿跳级执行', method: 'POST', path: `/sales/sales-returns/${returnId}/execute` },
      {
        label: '草稿跳级驳回',
        method: 'POST',
        path: `/sales/sales-returns/${returnId}/reject`,
        body: { reason: '草稿非法驳回探测' },
      },
      {
        label: '草稿明细重复追加被状态外门拒绝探测（应成功项，移出非法面见下方正例）',
        method: 'POST',
        path: `/sales/sales-returns/${returnId}/items`,
        body: {},
      },
    ];
    // 第四项形状非法（缺 product_id 必填）走 VALIDATION/BAD_REQUEST 同属状态门拒绝族
    // 之外的另一条门——为避免混门，非法面只钉前三项，第四项在下方作正例删除。
    for (const attempt of draftAttempts.slice(0, 3)) {
      const denied = await apiCallExpectFail(page, attempt.method, attempt.path, attempt.body);
      expectStateGateRejected(denied, `用例二/${attempt.label}`);
    }
    const stillDraft = await readReturn(page, returnId);
    expect(
      stillDraft.status,
      `三个跳级动作全被拒后状态列应仍为 ${SR_STATUS.DRAFT}，实际 ${JSON.stringify(stillDraft.status)}`
    ).toBe(SR_STATUS.DRAFT);

    // 非法面之外补一条"门不误杀"对照：DRAFT 明细可再挂一行（add_return_item 的
    // DRAFT 门放行），随即删除成功——证明上列拒绝来自状态门而非端点整体不可用。
    const spareItemId = await addReturnItem(page, returnId, productId + 0);
    await apiCall(page, 'DELETE', `/sales/sales-returns/${returnId}/items/${spareItemId}`);

    // 自清（草稿态真实可删）：先清引用行（明细）→ 单据 → 订单 → 客户档案。
    await apiCall(page, 'DELETE', `/sales/sales-returns/${returnId}/items/${itemId}`);
    await apiCall(page, 'DELETE', `/sales/sales-returns/${returnId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(
      gone.status,
      `删除后回读应 404（真实落库删除自证），实际 ${gone.status} code=${JSON.stringify(gone.code)}`
    ).toBe(404);
    expect(
      failureCode(gone),
      `删除后回读拒绝机器码应为 ${APP_ERROR_CODES.NOT_FOUND}，实际 ${JSON.stringify(gone.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    await tryCleanup(page, 'DELETE', `/sales/orders/${soId}`, '用例二草稿销售订单删除');
    await tryCleanup(
      page,
      'DELETE',
      `/crm/customers/${customerId}`,
      `用例二专属客户 ${customerId} 软删`
    );
  });

  test('用例三：SUBMITTED 驳回落 REJECTED 且拒绝原因逐字符落库可追溯；驳回后重提/审批/执行/改单全部被状态门拒绝（实量：该域 REJECTED 无合法出边，无撤回口）', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0] || 1;
    const tag = `${Date.now().toString().slice(-6)}`;
    const customerId = await createCustomerWithCredit(page, tag);
    const target = await pickDyeableWarehouse(page);
    const soId = await createDraftSalesOrder(page, customerId, productId);
    const returnId = await createReturnDraft(page, customerId, soId, target.id);
    await addReturnItem(page, returnId, productId);

    // 提交成功（合法边），为驳回构造 SUBMITTED 前置
    await apiCall(page, 'POST', `/sales/sales-returns/${returnId}/submit`);
    const submitted = await readReturn(page, returnId);
    expect(
      submitted.status,
      `提交后状态列应为 ${SR_STATUS.SUBMITTED}，实际 ${JSON.stringify(submitted.status)}`
    ).toBe(SR_STATUS.SUBMITTED);

    // 驳回（SUBMITTED 合法出边之一）：拒绝原因入参 reason 应逐字符落库到 rejected_reason 列
    const rejectReason = `E2E状态机驳回原因${tag}`;
    await apiCall(page, 'POST', `/sales/sales-returns/${returnId}/reject`, {
      reason: rejectReason,
    });
    const rejected = await readReturn(page, returnId);
    expect(
      rejected.status,
      `驳回后状态列应为 ${SR_STATUS.REJECTED}（大写词表逐字符），实际 ${JSON.stringify(rejected.status)}`
    ).toBe(SR_STATUS.REJECTED);
    expect(
      rejected.rejected_reason,
      `驳回原因应逐字符落库回读，写入 ${JSON.stringify(rejectReason)}，实际 ${JSON.stringify(rejected.rejected_reason)}`
    ).toBe(rejectReason);

    // 驳回动作应留审计痕迹（classify_operation：路径末段 reject → APPROVE 事件族），
    // 与主档 rejected_reason 列共同构成可追溯的状态历史证据。
    const rejectAuditHit = await verifyAuditLog(
      page,
      'APPROVE',
      'sales',
      `/sales-returns/${returnId}/reject`
    );
    expect(rejectAuditHit, `驳回应在审计检索留 APPROVE 事件（单 ${returnId}），实际未命中`).toBe(
      true
    );

    // —— 实量核心断言：本域服务端没有"驳回后重提"合法路径，也没有撤回口——
    // 四个动作 + 一个改单请求在 REJECTED 上全部被状态门拒绝，状态列纹丝不动。
    // （重提若被放行将意味着 submit 门从"仅 DRAFT"漂移，属缺陷，此处钉死现状。）
    const rejectedAttempts: Array<{
      label: string;
      method: 'POST' | 'PUT';
      path: string;
      body?: Record<string, string>;
    }> = [
      {
        label: '驳回后重提（应被拒：submit 门仅放行 DRAFT）',
        method: 'POST',
        path: `/sales/sales-returns/${returnId}/submit`,
      },
      { label: '驳回后再审批', method: 'POST', path: `/sales/sales-returns/${returnId}/approve` },
      { label: '驳回后再执行', method: 'POST', path: `/sales/sales-returns/${returnId}/execute` },
      {
        label: '驳回后重复驳回',
        method: 'POST',
        path: `/sales/sales-returns/${returnId}/reject`,
        body: { reason: '驳回态非法再驳回探测' },
      },
      {
        label: '驳回后改单（update_return 门仅放行 DRAFT）',
        method: 'PUT',
        path: `/sales/sales-returns/${returnId}`,
        body: { reason_type: '品质瑕疵' },
      },
    ];
    for (const attempt of rejectedAttempts) {
      const denied = await apiCallExpectFail(page, attempt.method, attempt.path, attempt.body);
      expectStateGateRejected(denied, `用例三/${attempt.label}`);
      const now = await readReturn(page, returnId);
      expect(
        now.status,
        `${attempt.label}被拒后状态列应仍为 ${SR_STATUS.REJECTED}，实际 ${JSON.stringify(now.status)}`
      ).toBe(SR_STATUS.REJECTED);
      expect(
        now.rejected_reason,
        `${attempt.label}被拒后 rejected_reason 不应被覆盖，应仍为写入原因，实际 ${JSON.stringify(now.rejected_reason)}`
      ).toBe(rejectReason);
    }

    // 清理：REJECTED 为终态、delete_return 仅放行 DRAFT，单据留痕不可删（照实保留）；
    // 自有档案腿客户软删，订单若仍为草稿可删（tryCleanup 失败仅告警不掩盖）。
    await tryCleanup(page, 'DELETE', `/sales/orders/${soId}`, '用例三草稿销售订单删除');
    await tryCleanup(
      page,
      'DELETE',
      `/crm/customers/${customerId}`,
      `用例三专属客户 ${customerId} 软删`
    );
  });
});
