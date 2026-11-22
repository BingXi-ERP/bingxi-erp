// 4.23 报表时间口径 + 4.30 账期边界：AR 账龄按注入的 baseline_date 分五桶，
//   只计 status 生效且 unpaid_amount>0 的票，桶边界 30/60/90 天归属正确。
// 后端判据：routes/finance.rs:949-950 挂 GET /ar/reports/aging；
//   handlers/ar_report_handler.rs:19-25 ArReportQuery 含 baseline_date，
//   :158 原样透传 service.get_aging_report；
//   services/ar_ops/report.rs:344 baseline 缺省取当天、注入则用注入值；
//   :404-425 (customer_id,None) 分支五桶 SQL：
//     due_date>=baseline → not_due；due_date<baseline 且 (baseline-due)<=30 → bucket_0_30；
//     31-60 → bucket_31_60；61-90 → bucket_61_90；>90 → bucket_90_plus；
//     WHERE status NOT IN (CANCELLED, DRAFT) AND unpaid_amount>0 AND customer_id=$4；
//   :489-506 出参 not_due/bucket_0_30/bucket_31_60/bucket_61_90/bucket_90_plus/
//     total_overdue/invoice_count，金额均 Decimal.to_string()。
// 缓存注意：handler 缓存键只含 customer_id+salesperson_id（不含 baseline_date），
//   故本例用全新客户且只查一次，避免与同客户不同基准日的查询串味。
// 与既有覆盖分工：459 验统计端点剔除与逾期、460 验月报 YYYY-MM 分桶，端点与桶判据均不同；
//   flow/125 的 aging 走 ar-reconciliations-enhanced 端点，非 /ar/reports/aging；
//   flow/160 只测 AP 账龄。全 e2e 无 /ar/reports/aging 断言。
// 检测力：基准日被当成当天则各桶归属即红；未剔除草稿/取消票则 count/金额红；
//   桶边界写错（如 <=30 写成 <30）则 30 天整票落错桶即红。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

interface ArRow {
  id?: number;
  status?: string;
}
interface Aging {
  not_due?: unknown;
  bucket_0_30?: unknown;
  bucket_31_60?: unknown;
  bucket_61_90?: unknown;
  bucket_90_plus?: unknown;
  total_overdue?: unknown;
  invoice_count?: number;
}

function toScaled(v: unknown, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw=${JSON.stringify(v)}`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.replace(/0+$/, '').length > 2) {
    throw new Error(`${label}：出参精度超过 2 位，raw="${s}"`);
  }
  const scaled = BigInt(intPart + frac.padEnd(2, '0').slice(0, 2));
  return sign === '-' ? -scaled : scaled;
}
const yuan = (s: string): bigint => toScaled(s, `金额 ${s}`);

const BASELINE = '2026-06-30';

async function seedApproved(
  page: Page,
  customerId: number,
  amount: string,
  dueDate: string
): Promise<number> {
  const created = await apiCallRaw<ArRow>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    customer_name: `E2E461客户${customerId}`,
    source_type: 'MANUAL',
    source_bill_no: genCode('E461'),
    invoice_date: '2026-01-01',
    due_date: dueDate,
    invoice_amount: amount,
  });
  const id = Number(created?.id);
  expect(id, `[461] 建票失败 due=${dueDate}`).toBeGreaterThan(0);
  const approved = await apiCallRaw<ArRow>(page, 'POST', `/ar/invoices/${id}/approve`);
  expect(approved.status, '[461] 须 approve 为 APPROVED').toBe('APPROVED');
  return id;
}

test.describe('4.23 AR账龄基准日分桶', () => {
  test('461-01 五桶按基准日归属，草稿/取消/已收讫票全部剔除', async ({ page }) => {
    await loginViaUI(page);

    const customer = await apiCallRaw<ArRow>(page, 'POST', '/crm/customers', {
      customer_name: `E2E461账龄客户${genCode('C')}`,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[461] 前置：自建客户失败').toBeGreaterThan(0);

    const ids: number[] = [];
    try {
      // 未到期：due 晚于基准日
      ids.push(await seedApproved(page, customerId, '100.00', '2026-07-15'));
      // 0-30 天：base-due=15
      ids.push(await seedApproved(page, customerId, '200.00', '2026-06-15'));
      // 31-60 天：base-due=41
      ids.push(await seedApproved(page, customerId, '300.00', '2026-05-20'));
      // 61-90 天：base-due=71
      ids.push(await seedApproved(page, customerId, '400.00', '2026-04-20'));
      // 90+ 天：base-due=180
      ids.push(await seedApproved(page, customerId, '500.00', '2026-01-01'));

      // 草稿票 999：不 approve，须被剔除
      const draft = await apiCallRaw<ArRow>(page, 'POST', '/ar/invoices', {
        customer_id: customerId,
        customer_name: `E2E461客户${customerId}`,
        source_type: 'MANUAL',
        source_bill_no: genCode('E461D'),
        invoice_date: '2026-01-01',
        due_date: '2026-06-15',
        invoice_amount: '999.00',
      });
      ids.push(Number(draft?.id ?? 0));

      // 取消票 888：approve 后 cancel，须被剔除
      const toCancel = await seedApproved(page, customerId, '888.00', '2026-06-15');
      ids.push(toCancel);
      const cancelled = await apiCallRaw<ArRow>(page, 'POST', `/ar/invoices/${toCancel}/cancel`, {
        reason: `E2E461-${genCode('R')}`,
      });
      expect(cancelled.status, '[461] 取消票状态须为 CANCELLED').toBe('CANCELLED');

      const aging = await apiCallRaw<Aging>(
        page,
        'GET',
        `/ar/reports/aging?customer_id=${customerId}&baseline_date=${BASELINE}`
      );
      expect(yuan(String(aging.not_due)), '[461] 未到期桶须为 100').toBe(yuan('100.00'));
      expect(yuan(String(aging.bucket_0_30)), '[461] 0-30 天桶须为 200').toBe(yuan('200.00'));
      expect(yuan(String(aging.bucket_31_60)), '[461] 31-60 天桶须为 300').toBe(yuan('300.00'));
      expect(yuan(String(aging.bucket_61_90)), '[461] 61-90 天桶须为 400').toBe(yuan('400.00'));
      expect(yuan(String(aging.bucket_90_plus)), '[461] 90+ 天桶须为 500').toBe(yuan('500.00'));
      expect(yuan(String(aging.total_overdue)), '[461] 逾期合计须为 200+300+400+500=1400').toBe(
        yuan('1400.00')
      );
      expect(
        Number(aging.invoice_count),
        '[461] 仅五张生效未收讫票计入，草稿/取消/已收讫票被剔除'
      ).toBe(5);
    } finally {
      for (const id of ids) {
        if (id > 0) {
          await tryCleanup(page, 'DELETE', `/ar/invoices/${id}`, `461 应收单 ${id}`);
        }
      }
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `461 客户 ${customerId}`);
    }
  });
});
