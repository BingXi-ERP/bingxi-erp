// 512 B 级降级销售处置门与库存等级/售价联动（纯 API E2E）。
// 源码判据：services/quality_inspection_service.rs:75-113 只允许 B 级 downgrade_sale；
//   :543-553 仅 handling_method=downgrade_sale 且 grade=B 才调 sync_stock_grade_for_downgrade；
//   :661-704 按 product_id+batch_no 定位库存并写 grade=二等品，再同步标 stock_grade_synced/stock_id；
//   :726-751 取 approved 且 price_level=一等品 或 NULL 的当期标准价，二等品价=standard×0.8 保留 4 位小数。
// 端点键与状态词来自 handlers/quality_inspection_handler.rs、models/unqualified_product.rs、
//   models/quality_inspection_record.rs、models/status/purchase_inventory.rs（一等品/二等品）。
// DECIMAL 出参按字符串读回后 Number 归一比较；错误体为 code/message/trace_id/timestamp 统一信封。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

const STOCK_GRADE_FIRST = '一等品';
const STOCK_GRADE_SECOND = '二等品';
const STANDARD_PRICE = '1234.5600';
const EXPECTED_DOWNGRADE_PRICE = 987.648;
const HANDLING_RESULT = 'B级降级销售单价=987.6480';
const STANDARD_EFFECTIVE_DATE = '2026-01-01';

function todayStr(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function requireId(value: unknown, label: string): number {
  const id = Number(value);
  expect(
    Number.isInteger(id) && id > 0,
    `${label} 须回真实正整数主键，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return id;
}

function str(value: unknown, label: string): string {
  expect(typeof value === 'string', `${label} 须字符串，实际 ${JSON.stringify(value)}`).toBe(true);
  return value as string;
}

function dec(value: unknown, label: string): number {
  expect(
    typeof value === 'string' || typeof value === 'number',
    `${label} 须字符串或整数形态 DECIMAL，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const n = Number(value);
  expect(Number.isFinite(n), `${label} 非数值，实际 ${JSON.stringify(value)}`).toBe(true);
  return n;
}

interface RecordInput {
  inspectionNo: string;
  productId: number;
  batchNo: string;
  qualificationRate: string;
  grade?: string;
}

async function createRecord(page: Page, input: RecordInput): Promise<Row> {
  const body: Record<string, unknown> = {
    inspection_no: input.inspectionNo,
    inspection_type: 'finished',
    product_id: input.productId,
    batch_no: input.batchNo,
    inspection_date: todayStr(),
    total_qty: '100',
    inspected_qty: '100',
    qualified_qty: input.qualificationRate,
    unqualified_qty: '10',
    qualification_rate: input.qualificationRate,
    inspection_result: '待检',
  };
  if (input.grade !== undefined) {
    body.grade = input.grade;
  }
  const created = await apiCallRaw<Row>(
    page,
    'POST',
    '/production/quality-inspection/records',
    body
  );
  requireId(created.id, `建质检记录 ${input.inspectionNo}`);
  return created;
}

async function readRecord(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/production/quality-inspection/records/${id}`);
}

async function readStock(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
}

async function readPrices(page: Page, productId: number): Promise<Row[]> {
  return apiCallRaw<Row[]>(
    page,
    'GET',
    `/sales/sales-prices?product_id=${productId}&page=1&page_size=100`
  );
}

async function readDefects(page: Page, recordId: number): Promise<Row[]> {
  return apiCallRaw<Row[]>(
    page,
    'GET',
    `/production/quality-inspection/defects?record_id=${recordId}&page=1&page_size=100`
  );
}

function assertDisplayableBusinessFailure(
  fail: {
    status?: number;
    code?: string | number;
    message?: string | null;
    trace_id?: string;
    timestamp?: string | number;
  },
  label: string
): void {
  expect(fail.status, `${label} HTTP 状态须 400`).toBe(400);
  expect(failureCode(fail), `${label} 机器码`).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(fail.message, `${label} business_displayable 文案须逐字外显`).toBe(
    '该质检记录已存在未处置完的不合格品单，不允许重复开单；如需更新处置结果请在台账行上使用原地更新入口'
  );
  expect(
    typeof fail.trace_id === 'string' && fail.trace_id.length > 0,
    `${label} trace_id 须存在`
  ).toBe(true);
  expect(
    typeof fail.timestamp === 'number' || typeof fail.timestamp === 'string',
    `${label} timestamp 须存在`
  ).toBe(true);
}

function assertMaskedBusinessFailure(
  fail: {
    status?: number;
    code?: string | number;
    message?: string | null;
    trace_id?: string;
    timestamp?: string | number;
  },
  label: string
): void {
  expect(fail.status, `${label} HTTP 状态须 400`).toBe(400);
  expect(failureCode(fail), `${label} 机器码`).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(fail.message, `${label} 非 displayable 文案须脱敏`).toBe('业务处理失败');
  expect(
    typeof fail.trace_id === 'string' && fail.trace_id.length > 0,
    `${label} trace_id 须存在`
  ).toBe(true);
  expect(
    typeof fail.timestamp === 'number' || typeof fail.timestamp === 'string',
    `${label} timestamp 须存在`
  ).toBe(true);
}

test.describe('512 B 级降级销售处置门与库存等级/售价联动', () => {
  test('512-01 B 级 downgrade_sale 同步库存二等品及 80% 售价，C 级与非法等级不触发联动', async ({
    page,
  }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const categoryId = Number(ctx.productCategoryIds[0]);
    const warehouseId = Number(ctx.warehouseIds[0]);
    expect(Number.isInteger(categoryId) && categoryId > 0, '夹具须有产品分类主键').toBe(true);
    expect(Number.isInteger(warehouseId) && warehouseId > 0, '夹具须有仓库主键').toBe(true);

    const tag = genCode('E512');
    const productCode = `E512P${tag}`;
    let productId = 0;
    let stockId = 0;
    let standardPriceId = 0;
    let downgradedPriceId = 0;
    try {
      const product = await apiCallRaw<Row>(page, 'POST', '/products', {
        code: productCode,
        name: `E512隔离面料${tag}`,
        unit: '米',
        category_id: categoryId,
        product_type: PRODUCT_TYPE.auxiliary,
      });
      productId = requireId(product.id, '建隔离产品');
      const productRead = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
      expect(str(productRead.code, '隔离产品编码'), '产品编码回读').toBe(productCode);
      console.log(`[512] 隔离产品 id=${productId} code=${productCode}`);

      const batchNo = `B-${tag}`;
      const stock = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
        warehouse_id: warehouseId,
        product_id: productId,
        batch_no: batchNo,
        color_no: '',
        grade: STOCK_GRADE_FIRST,
        quantity_meters: '100.00',
        quantity_kg: '100.00',
      });
      stockId = requireId(stock.id, '建隔离库存行');
      const initialStock = await readStock(page, stockId);
      expect(str(initialStock.grade, '联动前库存等级'), '初始等级须为一等品').toBe(
        STOCK_GRADE_FIRST
      );
      console.log(`[512] 隔离库存 id=${stockId} batch_no=${batchNo} grade=${initialStock.grade}`);

      const standard = await apiCallRaw<Row>(page, 'POST', '/sales/sales-prices', {
        product_id: productId,
        price: STANDARD_PRICE,
        unit: '米',
        price_type: 'STANDARD',
        price_level: STOCK_GRADE_FIRST,
        effective_date: STANDARD_EFFECTIVE_DATE,
      });
      standardPriceId = requireId(standard.id, '建 A 级标准价');
      await apiCallRaw(page, 'POST', `/sales/sales-prices/${standardPriceId}/approve`, {
        approved: true,
        approval_reason: `E512 标准价审批 ${tag}`,
      });
      const standardRead = await apiCallRaw<Row>(
        page,
        'GET',
        `/sales/sales-prices/${standardPriceId}`
      );
      expect(str(standardRead.status, '标准价状态'), '标准价须 approved 才会被联动选中').toBe(
        'approved'
      );
      expect(dec(standardRead.price, '标准价'), '标准价 DECIMAL').toBe(1234.56);
      console.log(`[512] 标准价 id=${standardPriceId} price=${standardRead.price}`);

      const bRecord = await createRecord(page, {
        inspectionNo: `E512B-${tag}`,
        productId,
        batchNo,
        qualificationRate: '90',
      });
      const bRecordId = requireId(bRecord.id, '建 B 级质检记录');
      expect(str(bRecord.grade, '建单响应等级'), '90% 应自动判 B 级').toBe('B');
      const bRead = await readRecord(page, bRecordId);
      expect(str(bRead.grade, 'B 级详情等级'), '详情等级').toBe('B');
      expect(dec(bRead.qualification_rate, 'B 级合格率'), '详情合格率').toBe(90);
      console.log(`[512] B 级质检记录 id=${bRecordId} grade=${bRead.grade}`);

      const processed = await apiCallRaw<Row>(
        page,
        'POST',
        `/production/quality-inspection/defects/${bRecordId}/process`,
        {
          unqualified_qty: '10',
          unqualified_reason: `E512-B-${tag}`,
          handling_method: 'downgrade_sale',
          remark: `E512 降级处置 ${tag}`,
          handling_result: HANDLING_RESULT,
        }
      );
      const defectId = requireId(processed.id, 'B 级处置台账行');
      expect(str(processed.grade, '台账行等级'), '台账等级').toBe('B');
      expect(str(processed.handling_method, '台账处理方式')).toBe('downgrade_sale');
      expect(str(processed.handling_status, '台账处理状态'), '处理状态词表为小写 pending').toBe(
        'pending'
      );
      expect(str(processed.handling_result, '台账处理结果'), '处理结果逐字回读').toBe(
        HANDLING_RESULT
      );
      expect(dec(processed.unqualified_qty, '台账不合格数'), '不合格数 DECIMAL').toBe(10);
      // process_unqualified 返回 insert 时的模型，同步字段由 sync_stock_grade_for_downgrade 就地更新库行，
      // 故以 defects 回读判同步结果，不把插入前模型误当同步后快照。
      expect(processed.stock_grade_synced, '写入响应仍是插入前模型').toBe(false);
      expect(processed.stock_id, '写入响应 stock_id 尚未回填').toBeNull();
      expect(processed.inspection_id, 'inspection_id 须指回本轮质检记录').toBe(bRecordId);
      expect(str(processed.unqualified_no, '不合格品单号')).toBe(
        `UQ${String(bRecordId).padStart(8, '0')}`
      );
      console.log(
        `[512] B 级处置台账 id=${defectId} status=${processed.handling_status} synced=${processed.stock_grade_synced}`
      );

      const syncedStock = await readStock(page, stockId);
      expect(str(syncedStock.grade, '联动后库存等级'), '库存等级须同步为二等品').toBe(
        STOCK_GRADE_SECOND
      );
      const defectRows = await readDefects(page, bRecordId);
      const ownDefect = defectRows.find(row => Number(row.id) === defectId);
      expect(ownDefect, `record_id 筛选须回读本轮台账行 ${defectId}`).toBeDefined();
      if (ownDefect === undefined) {
        throw new Error(`[512] record_id=${bRecordId} 未回读台账行 ${defectId}`);
      }
      expect(str(ownDefect.handling_result, '台账详情处理结果')).toBe(HANDLING_RESULT);
      expect(ownDefect.stock_grade_synced, '台账详情同步标记').toBe(true);
      expect(ownDefect.stock_id, '台账详情 stock_id').toBe(stockId);

      const pricesAfter = await readPrices(page, productId);
      const downgraded = pricesAfter.find(
        row =>
          str(row.price_level, '价目等级') === STOCK_GRADE_SECOND &&
          Number(row.id) !== standardPriceId
      );
      expect(downgraded, '降级联动须生成或更新二等品销售价').toBeDefined();
      if (downgraded === undefined) {
        throw new Error('[512] 未找到二等品销售价');
      }
      downgradedPriceId = requireId(downgraded.id, '二等品销售价');
      expect(str(downgraded.status, '二等品价状态'), '联动价直接 approved').toBe('approved');
      expect(dec(downgraded.price, '二等品价'), '标准价 1234.5600 × 0.8 = 987.6480').toBe(
        EXPECTED_DOWNGRADE_PRICE
      );
      console.log(`[512] 二等品价 id=${downgradedPriceId} price=${downgraded.price}`);

      const beforeNegativeStock = str((await readStock(page, stockId)).grade, '负例前库存等级');
      const beforeNegativePrices = await readPrices(page, productId);

      const cRecord = await createRecord(page, {
        inspectionNo: `E512C-${tag}`,
        productId,
        batchNo,
        qualificationRate: '60',
      });
      const cRecordId = requireId(cRecord.id, '建 C 级质检记录');
      expect(str(cRecord.grade, 'C 级自动判级')).toBe('C');
      const cFail = await apiCallExpectFail(
        page,
        'POST',
        `/production/quality-inspection/defects/${cRecordId}/process`,
        {
          unqualified_qty: '10',
          unqualified_reason: `E512-C-${tag}`,
          handling_method: 'downgrade_sale',
          handling_result: HANDLING_RESULT,
        }
      );
      assertMaskedBusinessFailure(cFail, 'C 级 downgrade_sale 门');
      expect(await readDefects(page, cRecordId), 'C 级拒绝须零台账行').toEqual([]);
      expect(
        str((await readStock(page, stockId)).grade, 'C 级负例后库存等级'),
        'C 级不得改库存'
      ).toBe(beforeNegativeStock);
      expect(await readPrices(page, productId), 'C 级负例不得改价').toEqual(beforeNegativePrices);
      console.log(`[512] C 级 id=${cRecordId} 拒绝 code=${failureCode(cFail)}`);

      const badRecord = await createRecord(page, {
        inspectionNo: `E512X-${tag}`,
        productId,
        batchNo,
        qualificationRate: '90',
        grade: 'X',
      });
      const badRecordId = requireId(badRecord.id, '建非法等级质检记录');
      expect(str(badRecord.grade, '显式非法等级原值回读')).toBe('X');
      const badFail = await apiCallExpectFail(
        page,
        'POST',
        `/production/quality-inspection/defects/${badRecordId}/process`,
        {
          unqualified_qty: '10',
          unqualified_reason: `E512-X-${tag}`,
          handling_method: 'downgrade_sale',
          handling_result: HANDLING_RESULT,
        }
      );
      assertMaskedBusinessFailure(badFail, '非法等级 downgrade_sale 门');
      expect(await readDefects(page, badRecordId), '非法等级拒绝须零台账行').toEqual([]);
      expect(
        str((await readStock(page, stockId)).grade, '非法等级负例后库存等级'),
        '非法等级不得改库存'
      ).toBe(beforeNegativeStock);
      expect(await readPrices(page, productId), '非法等级负例不得改价').toEqual(
        beforeNegativePrices
      );
      console.log(`[512] 非法等级 id=${badRecordId} 拒绝 code=${failureCode(badFail)}`);

      const duplicate = await apiCallExpectFail(
        page,
        'POST',
        `/production/quality-inspection/defects/${bRecordId}/process`,
        {
          unqualified_qty: '1',
          unqualified_reason: `E512-DUP-${tag}`,
          handling_method: 'downgrade_sale',
          handling_result: HANDLING_RESULT,
        }
      );
      assertDisplayableBusinessFailure(duplicate, '同质检记录重复开单门');
      expect(await readDefects(page, bRecordId), '重复开单拒绝后仍只有本轮台账行').toHaveLength(1);
      console.log(`[512] 重复开单拒绝 code=${failureCode(duplicate)}`);
    } finally {
      if (downgradedPriceId > 0) {
        await tryCleanup(
          page,
          'DELETE',
          `/sales/sales-prices/${downgradedPriceId}`,
          `[512] 二等品价 ${downgradedPriceId}`
        );
      }
      if (standardPriceId > 0) {
        await tryCleanup(
          page,
          'DELETE',
          `/sales/sales-prices/${standardPriceId}`,
          `[512] 标准价 ${standardPriceId}`
        );
      }
      if (stockId > 0) {
        await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `[512] 库存 ${stockId}`);
      }
      // 质检记录与不合格品台账无 DELETE 路由；产品删除预检只覆盖销售价，
      // 上述价目已先行清理，这里尝试清产品，失败由 tryCleanup 记告警，不伪装成功。
      if (productId > 0) {
        await tryCleanup(page, 'DELETE', `/products/${productId}`, `[512] 隔离产品 ${productId}`);
      }
    }
  });
});
