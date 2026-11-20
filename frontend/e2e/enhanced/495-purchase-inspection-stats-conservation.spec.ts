// 4.23 统计口径 + 4.29 勾稽 + 4.41 联动守恒：采购质检四桶守恒与结论回写入库单。
// 后端判据：services/purchase_inspection_service.rs:427-445 pending+passed+failed==total，
//   :469-510 pending 按小写 pending、passed 按 pass、failed 按 fail/partial 分桶；
//   :215-223 结论先过 pass/fail/partial 白名单，越界在 begin() 前拒绝、零写入；
//   :266-285 同事务把结论映射回入库单：pass→PASSED，fail/partial→REJECTED。
// 与既有覆盖分工：flow/99 只断空供应商四键全 0，flow/107 与 fullflow/22 只测单据结论，
//   全 e2e 无非零分桶守恒、无 partial 计入 failed、无越界结论零写入断言。
import { expect, test } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface Stats {
  total?: unknown;
  pending?: unknown;
  passed?: unknown;
  failed?: unknown;
}

interface Inspection {
  id?: unknown;
  inspection_status?: unknown;
  inspection_result?: unknown;
  quality_score?: unknown;
}

interface Receipt {
  id?: unknown;
  inspection_status?: unknown;
}

interface ProductRef {
  id: number;
  code: string;
  name: string;
  unit: string;
}

function num(value: unknown, label: string): number {
  const n = Number(value);
  expect(Number.isFinite(n), `${label} 必须是可比对数值，实际 ${String(value)}`).toBe(true);
  return n;
}

function requireId(value: unknown, label: string): number {
  const id = Number(value);
  expect(
    Number.isInteger(id) && id > 0,
    `${label} 必须回真实主键，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return id;
}

async function ownSupplier(page: Page, tag: string): Promise<number> {
  const code = genCode(`E495S${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E495供方${code}`,
    supplier_short_name: `E495-${code.slice(-6)}`,
  });
  return requireId(created.id, '[495] 专属供应商');
}

async function ownProduct(page: Page, tag: string): Promise<ProductRef> {
  const ctx = getCtx();
  const categoryId = Number(ctx.productCategoryIds[0]);
  expect(Number.isInteger(categoryId) && categoryId > 0, '[495] 夹具须有产品分类主键').toBe(true);
  const code = genCode(`E495P${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/products', {
    code,
    name: `E495面料${code}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = requireId(created.id, '[495] 专属产品');
  const readback = await apiCallRaw<ProductRef>(page, 'GET', `/products/${id}`);
  expect(String(readback.code), '[495] 产品编码须回读').toBe(code);
  return { id, code, name: String(readback.name), unit: String(readback.unit) };
}

async function createReceipt(
  page: Page,
  supplierId: number,
  product: ProductRef,
  warehouseId: number,
  departmentId: number,
  suffix: string
): Promise<number> {
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/receipts', {
    supplier_id: supplierId,
    order_id: null,
    receipt_date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    department_id: departmentId,
    notes: `E495收货${suffix}`,
    items: [
      {
        line_no: 1,
        material_id: product.id,
        material_code: product.code,
        material_name: product.name,
        batch_no: genCode(`E495B${suffix}`),
        grade: '一等品',
        quantity: '1',
        quantity_alt: '0',
        unit_master: product.unit,
        unit_price: '10.00',
      },
    ],
  });
  return requireId(created.id, `[495] 收货单${suffix}`);
}

async function createInspection(
  page: Page,
  supplierId: number,
  receiptId: number,
  suffix: string
): Promise<number> {
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/inspections', {
    receipt_id: receiptId,
    supplier_id: supplierId,
    inspection_date: new Date().toISOString().slice(0, 10),
    notes: `E495质检${suffix}`,
  });
  return requireId(created.id, `[495] 质检单${suffix}`);
}

async function readInspection(page: Page, id: number): Promise<Inspection> {
  return await apiCallRaw<Inspection>(page, 'GET', `/purchase/inspections/${id}`);
}

async function readReceipt(page: Page, id: number): Promise<Receipt> {
  return await apiCallRaw<Receipt>(page, 'GET', `/purchase/receipts/${id}`);
}

async function readStats(page: Page, supplierId: number): Promise<Stats> {
  return await apiCallRaw<Stats>(
    page,
    'GET',
    `/purchase/inspections/stats?supplier_id=${supplierId}`
  );
}

async function expectStats(
  page: Page,
  supplierId: number,
  expected: { total: number; pending: number; passed: number; failed: number }
): Promise<void> {
  const stats = await readStats(page, supplierId);
  expect(num(stats.total, '[495] stats.total'), '[495] total 不符').toBe(expected.total);
  expect(num(stats.pending, '[495] stats.pending'), '[495] pending 不符').toBe(expected.pending);
  expect(num(stats.passed, '[495] stats.passed'), '[495] passed 不符').toBe(expected.passed);
  expect(num(stats.failed, '[495] stats.failed'), '[495] failed 不符').toBe(expected.failed);
  expect(
    num(stats.pending, '[495] 守恒 pending') +
      num(stats.passed, '[495] 守恒 passed') +
      num(stats.failed, '[495] 守恒 failed'),
    '[495] pending+passed+failed 必须等于 total'
  ).toBe(num(stats.total, '[495] 守恒 total'));
}

test.describe('4.23 采购质检统计守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('495-01 四张质检单分桶守恒且 partial 回写 REJECTED，越界结论零写入', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    const warehouseId = Number(ctx.warehouseIds[0]);
    const departmentId = Number(ctx.departmentIds[0]);
    expect(Number.isInteger(warehouseId) && warehouseId > 0, '[495] 夹具须有仓库主键').toBe(true);
    expect(Number.isInteger(departmentId) && departmentId > 0, '[495] 夹具须有部门主键').toBe(true);

    const tag = genCode('E495');
    const supplierId = await ownSupplier(page, tag);
    const product = await ownProduct(page, tag);

    const legs: Array<{
      suffix: string;
      result?: 'pass' | 'fail' | 'partial';
      passQuantity: string;
      rejectQuantity: string;
      expectedResult: string | null;
      expectedScore: number | null;
      expectedReceiptStatus: string;
    }> = [
      {
        suffix: 'A',
        result: 'pass',
        passQuantity: '1',
        rejectQuantity: '0',
        expectedResult: 'pass',
        expectedScore: 100,
        expectedReceiptStatus: 'PASSED',
      },
      {
        suffix: 'B',
        result: 'fail',
        passQuantity: '0',
        rejectQuantity: '1',
        expectedResult: 'fail',
        expectedScore: 0,
        expectedReceiptStatus: 'REJECTED',
      },
      {
        suffix: 'C',
        result: 'partial',
        passQuantity: '1',
        rejectQuantity: '1',
        expectedResult: 'partial',
        expectedScore: 50,
        expectedReceiptStatus: 'REJECTED',
      },
      {
        suffix: 'D',
        result: undefined,
        passQuantity: '1',
        rejectQuantity: '0',
        expectedResult: null,
        expectedScore: null,
        expectedReceiptStatus: 'PENDING',
      },
    ];

    const ids: Record<string, { receiptId: number; inspectionId: number }> = {};
    for (const leg of legs) {
      const receiptId = await createReceipt(
        page,
        supplierId,
        product,
        warehouseId,
        departmentId,
        leg.suffix
      );
      const inspectionId = await createInspection(page, supplierId, receiptId, leg.suffix);
      ids[leg.suffix] = { receiptId, inspectionId };
      if (leg.result !== undefined) {
        await apiCall(page, 'POST', `/purchase/inspections/${inspectionId}/complete`, {
          pass_quantity: leg.passQuantity,
          reject_quantity: leg.rejectQuantity,
          inspection_result: leg.result,
        });
      }
    }

    await expectStats(page, supplierId, { total: 4, pending: 1, passed: 1, failed: 2 });

    const list = await apiCallRaw<{ total?: unknown; items?: unknown }>(
      page,
      'GET',
      `/purchase/inspections?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(num(list.total, '[495] 列表 total'), '[495] 列表与统计须同分母').toBe(4);
    expect(Array.isArray(list.items), '[495] 列表须回 items 数组').toBe(true);
    expect((list.items as unknown[]).length, '[495] 单页须含四张自建质检单').toBe(4);

    for (const leg of legs) {
      const pair = ids[leg.suffix];
      const inspection = await readInspection(page, pair.inspectionId);
      expect(String(inspection.inspection_status), `[495] ${leg.suffix} 质检状态不符`).toBe(
        leg.expectedResult === null ? 'pending' : 'completed'
      );
      expect(
        inspection.inspection_result === null || inspection.inspection_result === undefined
          ? null
          : String(inspection.inspection_result),
        `[495] ${leg.suffix} 质检结论不符`
      ).toBe(leg.expectedResult);
      if (leg.expectedScore !== null) {
        expect(
          num(inspection.quality_score, `[495] ${leg.suffix} quality_score`),
          `[495] ${leg.suffix} 质量得分不符`
        ).toBe(leg.expectedScore);
      } else {
        expect(inspection.quality_score, `[495] ${leg.suffix} 未质检不得有得分`).toBeNull();
      }
      const receipt = await readReceipt(page, pair.receiptId);
      expect(
        String(receipt.inspection_status),
        `[495] ${leg.suffix} 入库单检验状态须逐字符联动`
      ).toBe(leg.expectedReceiptStatus);
    }

    const pending = ids.D;
    const bad = await apiCallExpectFail(
      page,
      'POST',
      `/purchase/inspections/${pending.inspectionId}/complete`,
      { pass_quantity: '1', reject_quantity: '0', inspection_result: 'passed' }
    );
    expect(bad.status, '[495] 别域结论词 passed 须 400').toBe(400);
    expect(failureCode(bad), '[495] 越界结论机器码须 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(bad.message, '[495] 拒因须点名三值白名单').toContain('质检结果只能是pass/fail/partial');
    const pendingAfterBad = await readInspection(page, pending.inspectionId);
    expect(String(pendingAfterBad.inspection_status), '[495] 越界结论不得推进状态').toBe('pending');
    expect(
      String((await readReceipt(page, pending.receiptId)).inspection_status),
      '[495] 越界结论不得回写入库单'
    ).toBe('PENDING');
    await expectStats(page, supplierId, { total: 4, pending: 1, passed: 1, failed: 2 });

    const terminal = ids.A;
    const repeated = await apiCallExpectFail(
      page,
      'POST',
      `/purchase/inspections/${terminal.inspectionId}/complete`,
      { pass_quantity: '1', reject_quantity: '0', inspection_result: 'pass' }
    );
    expect(repeated.status, '[495] 已完结质检单重复完成须 400').toBe(400);
    expect(failureCode(repeated), '[495] 重复完成机器码须 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      String((await readInspection(page, terminal.inspectionId)).inspection_result),
      '[495] 重复完成不得改结论'
    ).toBe('pass');
    await expectStats(page, supplierId, { total: 4, pending: 1, passed: 1, failed: 2 });
  });
});
