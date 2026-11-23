// 4.14 日期边界 E2E — enhanced/602-ap-invoice-cross-month-boundary
// 功能：应付单列表按发票日期闭区间筛选，跨月端点与未来空区间均返回正确信封与行集合。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；供应商与两票应付单均自建唯一标识，日期固定为 2031-01-31 与 2031-02-01。
// 传给谁：POST /purchase/suppliers 建供应商 → POST /ap/invoices 建两票 →
//   GET /ap/invoices?supplier_id=&start_date=&end_date=&page=1&page_size=100 逐区间读取 →
//   DELETE /ap/invoices/{id}、DELETE /purchase/suppliers/{id} 清理。
// 存什么：suppliers 一行；ap_invoice 两行（invoice_date 分别为月末与次月首日）。
// 存哪里：suppliers 表、ap_invoice 表。
// 口径说明：服务层用 gte(start_date) 与 lte(end_date) 组成闭区间，本例只比较本批两票的主键归属，
//   不与 446 的同日/跨年重复；2099 区间要求 items=[]、total=0 且分页四键齐全。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';

interface SupplierRow {
  id: number;
}

interface InvoiceRow {
  id: number;
}

interface InvoicePage {
  items: InvoiceRow[];
  total: number;
  page: number;
  page_size: number;
}

const createdInvoiceIds: number[] = [];
const createdSupplierIds: number[] = [];

test.afterEach(async ({ page }) => {
  for (const id of createdInvoiceIds.splice(0)) {
    await tryCleanup(page, 'DELETE', `/ap/invoices/${id}`, `602 应付单 ${id}`);
  }
  for (const id of createdSupplierIds.splice(0)) {
    await tryCleanup(page, 'DELETE', `/purchase/suppliers/${id}`, `602 供应商 ${id}`);
  }
});

async function readRange(
  page: Page,
  supplierId: number,
  start: string,
  end: string
): Promise<InvoicePage> {
  const data = await apiCallRaw<InvoicePage>(
    page,
    'GET',
    `/ap/invoices?supplier_id=${supplierId}&start_date=${start}&end_date=${end}&page=1&page_size=100`
  );
  expect(Array.isArray(data.items), '应付单列表 items 必须是数组').toBe(true);
  expect(Number.isSafeInteger(data.total), '应付单列表 total 必须是整数').toBe(true);
  expect(data.page === 1, '应付单列表页码必须回显请求值 1').toBe(true);
  expect(data.page_size === 100, '应付单列表页宽必须回显请求值 100').toBe(true);
  return data;
}

function hasId(rows: InvoiceRow[], id: number): boolean {
  return rows.some(row => row.id === id);
}

test('602-01 应付单跨月闭区间与未来空区间按发票日期收敛', async ({ page }: { page: Page }) => {
  await loginViaUI(page);

  const tag = genCode('AP602').replace(/-/g, '');
  const supplier = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `602应付供应商-${tag}`,
    supplier_short_name: `A602-${tag.slice(-4)}`,
    contact_phone: '13800000000',
    credit_code: `91${Date.now().toString().slice(-12)}${tag.slice(-4)}`,
  });
  expect(Number.isSafeInteger(supplier.id) && supplier.id > 0, '建供应商必须返回正整数主键').toBe(
    true
  );
  createdSupplierIds.push(supplier.id);

  const seedInvoice = async (invoiceDate: string): Promise<number> => {
    const created = await apiCallRaw<InvoiceRow>(page, 'POST', '/ap/invoices', {
      supplier_id: supplier.id,
      invoice_type: 'PURCHASE',
      invoice_date: invoiceDate,
      due_date: invoiceDate,
      amount: '1000.00',
      tax_amount: '0',
      payment_terms: 0,
      currency: 'CNY',
      exchange_rate: '1',
      notes: `602-${tag}-${invoiceDate}`,
    });
    expect(Number.isSafeInteger(created.id) && created.id > 0, '建应付单必须返回正整数主键').toBe(
      true
    );
    createdInvoiceIds.push(created.id);
    return created.id;
  };

  const monthEndId = await seedInvoice('2031-01-31');
  const nextMonthId = await seedInvoice('2031-02-01');
  console.warn('[602] 已建跨月两票', { monthEndId, nextMonthId });

  const sameDay = await readRange(page, supplier.id, '2031-01-31', '2031-01-31');
  expect(hasId(sameDay.items, monthEndId), '起止同为月末当日必须包含该日应付单').toBe(true);
  expect(hasId(sameDay.items, nextMonthId), '月末当日区间不得包含次月首日应付单').toBe(false);

  const crossMonth = await readRange(page, supplier.id, '2031-01-31', '2031-02-01');
  expect(hasId(crossMonth.items, monthEndId), '跨月闭区间必须包含起始日应付单').toBe(true);
  expect(hasId(crossMonth.items, nextMonthId), '跨月闭区间必须包含截止日应付单').toBe(true);

  const afterRange = await readRange(page, supplier.id, '2031-02-02', '2031-02-28');
  expect(hasId(afterRange.items, monthEndId), '区间后查询不得包含月末应付单').toBe(false);
  expect(hasId(afterRange.items, nextMonthId), '区间后查询不得包含次月首日应付单').toBe(false);

  const future = await readRange(page, supplier.id, '2099-01-01', '2099-01-31');
  expect(future.items.length === 0, '未来空区间必须返回零行').toBe(true);
  expect(future.total === 0, '未来空区间总数必须为 0').toBe(true);
  console.warn('[602] 跨月与未来区间断言完成', { supplierId: supplier.id });
});
