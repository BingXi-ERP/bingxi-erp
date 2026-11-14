import { execSync } from 'child_process';
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  ensureTestEntities,
  getCtx,
} from './helpers';

/**
 * 报价转单客户确认样门（R 节第 6 条时序约束的转单腿）。
 *
 * 被测门。POST /api/v1/erp/quotations/{id}/convert 的校验序列
 * （backend/src/services/quotation_convert_service.rs validate_quotation_for_convert）：
 *   1. 状态门 approved（既有）；
 *   2. 有效期门 valid_until（既有）；
 *   3. 确认样门：报价关联了定制订单（custom_orders.quotation_id 反查命中）且该定制
 *      订单关联了打样通知单时，approved_sample_id 必须非空，否则拒绝转单
 *      （D-52 新增腿，本 spec 的被测面）。
 * 门口径：常规大货报价（无 custom_order 关联）不拦；定制订单链上无打样通知单
 * （lab_dip_request_id 为空）也不拦——只有「报价 ↔ 定制订单 ↔ 打样通知单」
 * 全链命中且 OK 样未确认才拒绝。
 *
 * 拒绝形状（逐条读后端源非推测）：AppError::business_displayable
 * → utils/error.rs:384 映射 HTTP 400 + error_code() "BUSINESS_ERROR"（:824-825），
 * message 走 Displayable 直通（:851）外显中文文案「该报价关联的打样单尚未确认
 * OK 样，不能转大货订单」。三判据（status=400 + code∈状态门拒绝族 + 中文文案）
 * 全部真实断言，缺一即红，无恒过假绿。
 *
 * 前置造数形态（照抄 511 号已钉的真实链路，非虚构）：打样腿
 * POST /production/lab-dip/requests → start-sampling → samples ×2 → matching ×2
 * → submit → approve {sample_id}；approve_ok_sample（lab_dip_ops/request.rs:328）
 * 置 approved_sample_id，受状态机保护不可伪造，是全仓唯一写点。
 *
 * 关联链路事实：custom_orders.quotation_id / lab_dip_request_id 两列在此基线
 * 无任何 API 写点（create 恒 Set(None)、UpdateCustomOrderDto 无这两列），故
 * 关联腿用 psql 直连 UPDATE 打通（psql 通道已有先例：global-setup.ts 本位币
 * 种子、setup-wizard 00 号数据级断言；ci-e2e job 经 e2e-runtime 动作安装
 * postgresql-client，DATABASE_URL 同源注入）。直连只用于打通前置关联与状态
 * 回读取证，被测行为（转单被拒/放行）全部走真实 API。
 *
 * 调用面（配对门登记，整串含挂载前缀）。
 * POST /api/v1/erp/quotations、/{id}/submit、/{id}/approve、/{id}/convert
 * GET  /api/v1/erp/quotations/{id}
 * POST /api/v1/erp/production/lab-dip/requests 与 start-sampling/samples/matching/submit/approve 各腿
 */
type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => (v == null ? '' : String(v));

/** psql 目标串：DATABASE_URL 单引号包裹并对内部单引号做 shell 标准转义（照抄 global-setup.ts）。 */
function psqlTarget(): string {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('[517] DATABASE_URL 未设置——关联列无 API 写点，直连 DB 是唯一造数路径');
  }
  return `'${dbUrl.replace(/'/g, `'\\''`)}'`;
}

/** psql 直连执行写语句（SQL 经 stdin 传入，规避内嵌引号的 shell 转义问题，同 global-setup.ts）。 */
function psqlExec(sql: string): void {
  execSync(`psql -d ${psqlTarget()} -v ON_ERROR_STOP=1 -q -f -`, {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  });
}

/** psql 直连查询回读首行首列（-tA 无装饰输出，SQL 同样经 stdin 传入）。 */
function psqlQuery(sql: string): string {
  return execSync(`psql -d ${psqlTarget()} -v ON_ERROR_STOP=1 -tA -f -`, {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
  })
    .toString()
    .trim();
}

/**
 * 报价造数到 approved（照抄 quotations/02-approval.spec.ts createDraftQuotation 与
 * submit→approve 既有 URL 序列）。产品引用 ensureTestEntities 自建的报价专用产品，
 * unit 取后端落库真值，满足 validate_item_units_against_products 单位一致性门。
 */
async function seedApprovedQuotation(page: Page, tag: string): Promise<number> {
  await ensureTestEntities(page);
  const c = getCtx();
  if (!c.customerId || !c.quotationProductId || !c.userIds.length) {
    throw new Error(
      `[${tag}] ensureTestEntities 前置缺失：${JSON.stringify({
        customerId: c.customerId,
        quotationProductId: c.quotationProductId,
        userIds: c.userIds.length,
      })}`
    );
  }
  const created = await apiCallRaw<Row>(page, 'POST', '/quotations', {
    customer_id: c.customerId,
    sales_user_id: c.userIds[0],
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: false,
    tax_rate: '13',
    items: [
      {
        product_id: c.quotationProductId,
        unit: c.quotationProductUnit,
        quantity: '1',
        unit_price: '1',
        unit_price_with_tax: '1.13',
      },
    ],
    notes: `E2E 517 确认样门报价${tag}`,
  });
  const id = num(created.id);
  expect(id, `[${tag}] 报价单创建应返回 id`).toBeTruthy();

  await apiCallRaw<Row>(page, 'POST', `/quotations/${id}/submit`);
  const afterSubmit = await apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
  if (str(afterSubmit.status) !== 'approved') {
    await apiCallRaw<Row>(page, 'POST', `/quotations/${id}/approve`, {
      approval_reason: `E2E 517 转单前置批准${tag}`,
    });
  }
  const detail = await apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
  expect(
    str(detail.status),
    `[${tag}] 转单前置：报价单应为 approved，实际 ${str(detail.status)}`
  ).toBe('approved');
  return id;
}

/**
 * 打样通知单腿造数（链路照抄 511 号 seedApprovedRequestWithSelectedSample）：
 * 建单 → 开始打样 → 建两版小样 → 对色 → 提交 → 确认 OK 样。
 * confirmOk=true 时把 B 版确认为 OK 样（approved_sample_id 唯一写点生效）；
 * confirmOk=false 时只推进到 sampling 留住合法中间态，不建样不提交，
 * 链上留一枚 approved_sample_id 为 NULL 的打样通知单。
 */
async function seedLabDipChain(page: Page, stamp: string, confirmOk: boolean): Promise<number> {
  const LIP = '/production/lab-dip';
  const created = await apiCallRaw<Row>(page, 'POST', `${LIP}/requests`, {
    light_source: 'D65',
    required_date: '2027-06-30',
    customer_color_no: `E2E-517-${stamp}`,
    customer_color_name: `确认样门链色${stamp}`,
    fabric_component: '棉 100',
    sample_type: 'lab_dip',
    sample_size: '25*25',
    sample_versions: 2,
  });
  const requestId = num(created.id);
  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/start-sampling`);

  if (!confirmOk) {
    return requestId;
  }

  const sampleBase = {
    request_id: requestId,
    formula: '活性三原配色',
    formula_detail: [
      { dye_name: '活性红 195', amount: '1.25', unit: '%(o.w.f)', percentage: '1.25' },
    ],
    temperature: '60.00',
    time_minutes: 45,
    liquor_ratio: '1:5',
    ph_value: '6.50',
    dyeing_method: 'dip',
    dye_cost: '12.3456',
    auxiliary_cost: '1.0555',
    total_cost: '13.4011',
  };
  const sampleA = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
    ...sampleBase,
    recipe_no: `E2E-517-A-${stamp}`,
    color_difference_grade: 3,
    color_difference_value: '4.20',
  });
  const sampleB = await apiCallRaw<Row>(page, 'POST', `${LIP}/samples`, {
    ...sampleBase,
    recipe_no: `E2E-517-B-${stamp}`,
    color_difference_grade: 4,
    color_difference_value: '2.60',
  });
  await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${num(sampleA.id)}/matching`, {
    color_difference_grade: 3,
    color_difference_value: '4.20',
    approval_comment: '色差不足需重打',
  });
  await apiCallRaw<Row>(page, 'POST', `${LIP}/samples/${num(sampleB.id)}/matching`, {
    color_difference_grade: 4,
    color_difference_value: '2.60',
    approval_comment: '达 4 级可送客户',
  });
  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/submit`);
  await apiCallRaw<Row>(page, 'POST', `${LIP}/requests/${requestId}/approve`, {
    sample_id: num(sampleB.id),
    comment: `确认 B 版为 OK 样${stamp}`,
  });
  return requestId;
}

/**
 * psql 打通报价 ↔ 定制订单 ↔ 打样通知单关联：为该报价插入一行定制订单，
 * 两列关联一次落位（幂等守卫 WHERE NOT EXISTS，重跑不产生重复行）。
 * customer_id 取报价行自证归属，product_id 取报价明细首行，不写死 id。
 * 插入后直连回读 lab_dip_request_id 取证，关联未生效即判红（前置造假零容忍）。
 */
function linkQuotationToChain(
  quotationId: number,
  labDipRequestId: number,
  tag: string
): void {
  psqlExec(
    `INSERT INTO custom_orders (order_no, customer_id, product_id, spec, quantity, unit, ` +
      `custom_requirements, status, currency, created_at, updated_at, lab_dip_request_id, quotation_id) ` +
      `SELECT 'CO-E2E-517-${tag}-${quotationId}', ` +
      `(SELECT customer_id FROM sales_quotations WHERE id = ${quotationId}), ` +
      `(SELECT product_id FROM sales_quotation_items WHERE quotation_id = ${quotationId} LIMIT 1), ` +
      `'E2E 517 关联腿规格', 1, 'm', '{}'::jsonb, 'draft', 'CNY', now(), now(), ` +
      `${labDipRequestId}, ${quotationId} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM custom_orders WHERE quotation_id = ${quotationId});`
  );
  const back = psqlQuery(
    `SELECT lab_dip_request_id FROM custom_orders WHERE quotation_id = ${quotationId} LIMIT 1`
  );
  expect(
    num(back),
    `[${tag}] 关联写入后回读 lab_dip_request_id 应命中 ${labDipRequestId}，实际 ${back}`
  ).toBe(labDipRequestId);
}

test('517-01 常规报价（无定制订单关联）转单不拦：200 回销售订单草稿', async ({ page }) => {
  const tag = '517-01';
  const quotationId = await seedApprovedQuotation(page, tag);

  // 前置自证：psql 反查 custom_orders 无 quotation_id 命中（门的关联判据真实为空）
  const linked = psqlQuery(
    `SELECT count(*) FROM custom_orders WHERE quotation_id = ${quotationId}`
  );
  expect(num(linked), `[${tag}] 前置自证：该报价不应有关联定制订单，实际 ${linked}`).toBe(0);

  const order = await apiCallRaw<Row>(page, 'POST', `/quotations/${quotationId}/convert`);
  expect(num(order.id), `[${tag}] 无关联报价转单应放行并返回销售订单 id`).toBeTruthy();
  expect(
    str(order.order_no).startsWith('SO'),
    `[${tag}] 转出订单号应以 SO 前缀（统一取号器），实际 ${str(order.order_no)}`
  ).toBe(true);
  expect(
    str(order.status),
    `[${tag}] 转出销售订单应为词表 draft，实际 ${str(order.status)}`
  ).toBe('draft');

  const q = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  expect(
    str(q.status),
    `[${tag}] 放行后报价单应推进 converted，实际 ${str(q.status)}`
  ).toBe('converted');
});

test('517-02 关联打样单未确认 OK 样：转单被拒 400 BUSINESS_ERROR + 中文文案', async ({ page }) => {
  const tag = '517-02';
  const stamp = `${String(Date.now()).slice(-6)}2`;
  const quotationId = await seedApprovedQuotation(page, tag);
  // 打样链只建到 sampling：链上存在通知单，approved_sample_id 恒 NULL（真实状态机路径）
  const labDipId = await seedLabDipChain(page, stamp, false);
  const nullProof = psqlQuery(
    `SELECT approved_sample_id FROM lab_dip_request WHERE id = ${labDipId}`
  );
  expect(
    nullProof,
    `[${tag}] 前置自证：未确认腿 approved_sample_id 应为空，实际 ${nullProof}`
  ).toBe('');
  linkQuotationToChain(quotationId, labDipId, tag);

  const fail = await apiCallExpectFail(page, 'POST', `/quotations/${quotationId}/convert`);
  expectStateGateRejection(
    fail,
    `[${tag}] 关联打样单未确认 OK 样，转单应被状态门拒绝（HTTP 400 + BUSINESS_ERROR）`
  );
  expect(
    str(fail.message),
    `[${tag}] 可外显文案应直通 message，实际 ${str(fail.message)}`
  ).toContain('尚未确认 OK 样');
  expect(
    str(fail.message),
    `[${tag}] 文案应点名不能转大货订单，实际 ${str(fail.message)}`
  ).toContain('不能转大货订单');

  // 拒后取证：报价单不得被推进 converted（转单事务整体回滚）
  const q = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  expect(
    str(q.status),
    `[${tag}] 被拒后报价单应仍是 approved（不得偷跑成 converted），实际 ${str(q.status)}`
  ).toBe('approved');
});

test('517-03 确认 OK 样后同链转单放行：200 回销售订单草稿', async ({ page }) => {
  const tag = '517-03';
  const stamp = `${String(Date.now()).slice(-6)}3`;
  const quotationId = await seedApprovedQuotation(page, tag);
  // 打样链走完整 approve 腿：approved_sample_id 由唯一写点置值（状态机保护，不可伪造）
  const labDipId = await seedLabDipChain(page, stamp, true);
  const approvedSample = psqlQuery(
    `SELECT approved_sample_id FROM lab_dip_request WHERE id = ${labDipId}`
  );
  expect(
    num(approvedSample),
    `[${tag}] 前置自证：确认后 approved_sample_id 应非空，实际 ${approvedSample}`
  ).toBeTruthy();
  linkQuotationToChain(quotationId, labDipId, tag);

  const order = await apiCallRaw<Row>(page, 'POST', `/quotations/${quotationId}/convert`);
  expect(
    num(order.id),
    `[${tag}] OK 样已确认的关联报价转单应放行并返回销售订单 id`
  ).toBeTruthy();
  expect(
    str(order.order_no).startsWith('SO'),
    `[${tag}] 转出订单号应以 SO 前缀，实际 ${str(order.order_no)}`
  ).toBe(true);
  expect(
    str(order.status),
    `[${tag}] 转出销售订单应为词表 draft，实际 ${str(order.status)}`
  ).toBe('draft');

  const q = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  expect(
    str(q.status),
    `[${tag}] 放行后报价单应推进 converted，实际 ${str(q.status)}`
  ).toBe('converted');
});
