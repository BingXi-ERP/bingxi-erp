/**
 * 报价驳回→改单→重提闭环：rejected 态可改且可从 rejected 再次 submit
 *
 * 唯一事实源：
 *   - backend/src/services/quotation_approval_service.rs:214 submit 状态门仅允许
 *     draft / rejected；:319/:399 写 pending_approval 与 submitted_by；
 *   - backend/src/services/quotation_ops/update.rs:27/:53 load_for_update 状态门
 *     仅允许 draft / rejected，改单后重算合计；
 *   - backend/src/handlers/quotation_handler.rs:338 reject 要求 reason trim 非空，
 *     落 rejection_reason 专列（02-approval 已钉状态翻转与理由逐字回读）。
 * 本例构造 12 万经理档（数量 120000×单价 1.00），折扣 0 不叠加超折扣门：
 *   提交→pending_approval→带理由驳回→rejected→PUT 改备注→再提交→pending_approval。
 * 断言每次翻转的真实落库字段，不用页面文案充当状态证据。
 * 状态词表：quotation_ext 小写 pending_approval / rejected。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

const AMOUNT = '120000';

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

interface Seed {
  customerId: number;
  productId: number;
  productUnit: string;
  meId: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

async function seed(page: import('@playwright/test').Page): Promise<Seed> {
  const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
  const meId = Number(me?.id);
  expect(meId, 'GET /auth/me 应返回当前用户 id').toBeGreaterThan(0);

  const code = genCode('E2E-RESUB-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E驳回重提产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product?.id);
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = String(detail?.unit ?? '');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-RESUB-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = Number(customer?.id);
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `驳回重提客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

test.describe.serial('591 报价驳回改单重提闭环', () => {
  test('591-01 pending_approval 驳回→rejected 改备注→再提交回 pending_approval', async ({
    page,
  }) => {
    await loginViaUI(page);
    const ctx = await seed(page);

    const created = await apiCall<Row>(page, 'POST', '/quotations', {
      customer_id: ctx.customerId,
      sales_user_id: ctx.meId,
      quotation_date: isoDate(0),
      valid_until: isoDate(30),
      currency: 'CNY',
      exchange_rate: '1',
      base_currency: 'CNY',
      price_terms: 'FOB',
      tax_inclusive: false,
      tax_rate: '0',
      items: [
        {
          product_id: ctx.productId,
          unit: ctx.productUnit,
          quantity: AMOUNT,
          unit_price: '1.00',
          unit_price_with_tax: '1.00',
          discount_rate: '0',
        },
      ],
      notes: 'E2E-591-驳回重提初始稿',
    });
    const quotationId = Number(created.data?.id);
    expect(quotationId, '建报价单应返回有效 id').toBeGreaterThan(0);
    const stored = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    expect(Number(stored.total_amount), '金额变量须回读为 120000，确保走经理档而非自批档').toBe(
      Number(AMOUNT)
    );

    const firstSubmit = await apiCall<Row>(page, 'POST', `/quotations/${quotationId}/submit`);
    expect(firstSubmit.data?.status, '12 万经理档首次提交应 pending_approval').toBe(
      'pending_approval'
    );

    const reason = `E2E-591-驳回理由-${Date.now()}`;
    const rejected = await apiCall<Row>(page, 'POST', `/quotations/${quotationId}/reject`, {
      reason,
    });
    expect(rejected.data?.status, '带理由驳回应落 rejected').toBe('rejected');
    expect(rejected.data?.rejection_reason, '驳回理由应逐字落 rejection_reason 专列').toBe(reason);

    const revisedNotes = `E2E-591-改价重提稿-${Date.now()}`;
    const updated = await apiCall<Row>(page, 'PUT', `/quotations/${quotationId}`, {
      notes: revisedNotes,
    });
    expect(updated.data?.notes, 'rejected 态改单应落新备注，证明状态门放行').toBe(revisedNotes);
    const afterUpdate = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    expect(afterUpdate.status, '改单不得重置审批状态，应仍为 rejected').toBe('rejected');

    const resubmit = await apiCall<Row>(page, 'POST', `/quotations/${quotationId}/submit`);
    expect(resubmit.data?.status, 'rejected 态改单后重提应再进 pending_approval').toBe(
      'pending_approval'
    );
    expect(Number(resubmit.data?.submitted_by), '重提的 submitted_by 应留痕为当前操作人').toBe(
      ctx.meId
    );
    const finalRow = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    expect(finalRow.status, '回读应确认重提后状态持久化').toBe('pending_approval');
    expect(finalRow.notes, '回读应确认改单备注持久化').toBe(revisedNotes);
  });
});
