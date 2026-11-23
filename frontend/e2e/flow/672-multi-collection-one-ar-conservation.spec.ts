// 672 多笔收款核销同一张应收单：逐笔金额守恒、结清状态与超额拒绝。
//
// 功能：先建并审批一张应收单，连续两笔 collection 各关联该单（部分→结清），逐笔断言 received 累加、
//       unpaid 递减、第二笔后 status=PAID；超额核销被 400 BUSINESS_ERROR 拒且账面零漂移。
// 判据来源（写入方为准）：services/ar_ops/collection.rs:294-295 按 invoice_ids 顺序逐票扣减，
//       :361-367 allocate=min(remaining, unpaid)、received+=allocate、unpaid=max(invoice-received,0)，
//       :375-378 unpaid==0 → PAYMENT_PAID(PAID)、received>0 且仍有未收 → PARTIAL_PAID；
//       models/status/general.rs:43,46 词表逐字为 PAID/PARTIAL_PAID（大写）。
// 超额腿判据：collection.rs:361-366 对已结清票 allocate=0 且不校验剩余，收款建单侧并无超额拒绝；
//       真正的「未收不足」业务门在 ar_ops/verification_ops/manual.rs:165-180 的 AppError::business_displayable，
//       故超额 400 断言落在该写入门（POST /ar/verifications/manual），不虚构收款建单面的拒绝语义。
// 调用方与端点：POST /crm/customers|/ar/invoices 造数，/ar/invoices/{id}/approve 审批，
//       POST /ar/payments 建两笔关联收款，POST /ar/verifications/manual 做超额核销，GET /ar/invoices/{id} 回读。
// 数据形状与存储：ar_invoices 金额列为 DECIMAL，JSON 字符串，按百分位整数比较禁浮点等号；
//       付款请求 amount/invoice_ids 与响应 data.id 均来自真实写入方，不臆造集合键。
// 失败信封：失败仅 AppError 字符串码；超额负例逐条钉 BUSINESS_ERROR，不判「小于 500」的假绿。
// 与 463 分工：463 是「一笔收款分摊多票」，本例是「多笔收款核销一票」，方向相反不重复。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
interface CleanupEntry {
  path: string;
  label: string;
}
const CLEANUP: CleanupEntry[] = [];

/** 功能：DECIMAL 定点转分；入参：JSON 值+字段名；出参：bigint 分；异常：非数字或超两位有效尾数抛错。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} 非 DECIMAL 出参：${JSON.stringify(value)}`);
  }
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!matched) throw new Error(`${label} 无法定点解析：${String(value)}`);
  const fraction = (matched[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超过两位：${String(value)}`);
  }
  return BigInt(`${matched[1]}${matched[2]}${fraction.slice(0, 2)}`);
}

/** 功能：必填正整数 id；入参：未知值+标签；出参：number；异常：非正整数抛错。 */
function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} 非法：${JSON.stringify(value)}`);
  return id;
}

/** 功能：应收金额三元组回读；入参：page+应收 id；出参：invoice/received/unpaid(分) 与 status；异常：字段缺失抛错。 */
async function readInvoice(
  page: Page,
  invoiceId: number
): Promise<{ invoice: bigint; received: bigint; unpaid: bigint; status: string }> {
  const row = await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${invoiceId}`);
  const status = row.status;
  if (typeof status !== 'string') throw new Error(`应收状态缺失：${JSON.stringify(row)}`);
  return {
    invoice: decimalCents(row.invoice_amount, 'invoice_amount'),
    received: decimalCents(row.received_amount, 'received_amount'),
    unpaid: decimalCents(row.unpaid_amount, 'unpaid_amount'),
    status,
  };
}

/** 功能：建一笔关联该应收单的收款；入参：page+客户/应收/金额/日期/标签；出参：收款单 id；异常：未返回 id 抛错。 */
async function collect(
  page: Page,
  customerId: number,
  invoiceId: number,
  amount: string,
  paymentDate: string,
  label: string
): Promise<number> {
  const res = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/ar/payments', {
    customer_id: customerId,
    amount,
    payment_method: '银行转账',
    payment_date: paymentDate,
    invoice_ids: [invoiceId],
  });
  const id = requireId(res.data?.id, `${label} 建收款单`);
  CLEANUP.push({ path: `/ar/payments/${id}`, label: `payment#${id}` });
  return id;
}

test.describe.serial('672 多笔收款核销同一张应收单', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    while (CLEANUP.length > 0) {
      const entry = CLEANUP.pop();
      if (entry) await tryCleanup(page, 'DELETE', entry.path, entry.label);
    }
  });

  test('两笔收款部分→结清逐笔守恒，超额核销 400 拒且账面零漂移', async ({ page }) => {
    const tag = genCode('672');
    const paymentDate = new Date().toISOString().slice(0, 10);
    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `E2E672-CUST-${tag}`,
      status: 'active',
    });
    const customerId = requireId(customer.id, '建客户');
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `customer#${customerId}` });

    const created = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      customer_name: `E2E672-CUST-${tag}`,
      invoice_amount: 1000,
      invoice_date: paymentDate,
      due_date: paymentDate,
    });
    const invoiceId = requireId(created.id, '建应收单');
    CLEANUP.push({ path: `/ar/invoices/${invoiceId}`, label: `ar#${invoiceId}` });
    await apiCall(page, 'POST', `/ar/invoices/${invoiceId}/approve`);

    const baseline = await readInvoice(page, invoiceId);
    expect(baseline.received, '审批后已收应为 0').toBe(0n);
    expect(baseline.unpaid, '审批后未收应等于票面 1000.00').toBe(baseline.invoice);
    expect(baseline.invoice, '票面应按传入值落库').toBe(100000n);

    await collect(page, customerId, invoiceId, '400.00', paymentDate, '第一笔部分收款');
    const first = await readInvoice(page, invoiceId);
    expect(first.received, '第一笔后 received 应累加 400.00').toBe(40000n);
    expect(first.unpaid, '第一笔后 unpaid 应递减为 600.00').toBe(60000n);
    expect(first.invoice, '票面金额不得随收款变化').toBe(baseline.invoice);
    expect(first.invoice - first.received, '票面减已收应等于未收').toBe(first.unpaid);
    expect(first.status, '部分收款状态须逐字符等于大写 PARTIAL_PAID').toBe('PARTIAL_PAID');

    const secondPaymentId = await collect(
      page,
      customerId,
      invoiceId,
      '600.00',
      paymentDate,
      '第二笔结清收款'
    );
    const second = await readInvoice(page, invoiceId);
    expect(second.received, '第二笔后 received 应累加至 1000.00').toBe(100000n);
    expect(second.unpaid, '第二笔后 unpaid 应归零').toBe(0n);
    expect(second.status, '结清状态须逐字符等于大写 PAID').toBe('PAID');
    expect(second.received, '两笔收款合计须守恒等于票面').toBe(baseline.invoice);

    const overLimit = await apiCallExpectFail(page, 'POST', '/ar/verifications/manual', {
      invoice_id: invoiceId,
      payment_id: secondPaymentId,
      amount: 400,
      remark: `E2E672 超额核销 ${tag}`,
    });
    expect(overLimit.status, '超额核销应 400').toBe(400);
    expect(failureCode(overLimit), '超额核销应归 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterOverLimit = await readInvoice(page, invoiceId);
    expect(afterOverLimit.received, '超额被拒后已收零漂移').toBe(second.received);
    expect(afterOverLimit.unpaid, '超额被拒后未收零漂移').toBe(second.unpaid);
    expect(afterOverLimit.status, '超额被拒后状态零漂移').toBe(second.status);
  });
});
