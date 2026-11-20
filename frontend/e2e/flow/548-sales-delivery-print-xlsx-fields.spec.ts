// 功能：钉销售发货单 xlsx 打印的缸号、匹号、批次与米数合计不丢列不串值；调用方 CI e2e flow 分片；
// 入参仅真实登录会话与 HTTP 建单、发货、打印响应；传给 xlsx 解包断言，比较对象为同链订单号、发货单号与库存四维；
// 存什么为一次性订单、发货单与染色匹，靠唯一缸号隔离，存哪里为业务库；不写本地文件、不做删除清理。
// 检测力自证：任一目标列被删、被换位或汇总米数错算，逐行解析出的对应单元格断言即红。
import JSZip from 'jszip';
import { test, expect, type Page } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
} from './helpers';

type Row = Record<string, unknown>;
type SheetRows = string[][];

function readPositiveNumber(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} 非正数：${JSON.stringify(value)}`);
  return n;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} 非非空字符串：${JSON.stringify(value)}`);
  }
  return value;
}

function expectStatusChar(value: unknown, expected: string, label: string): void {
  expect(value, `${label} 逐字符比对`).toBe(expected);
}

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|quot|apos|amp);/g, (raw, entity: string) => {
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity === 'amp') return '&';
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  });
}

function parseSharedStrings(xml: string): string[] {
  const items = xml.match(/<si>[\s\S]*?<\/si>/g);
  if (!items) throw new Error('xlsx 缺 sharedStrings 条目，无法逐格解析打印文本');
  return items.map(item => {
    const runs = item.match(/<t[^>]*>[\s\S]*?<\/t>/g);
    if (!runs) throw new Error(`xlsx sharedStrings 条目缺文本节点：${item.slice(0, 120)}`);
    return runs
      .map(run => decodeXmlText(run.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '')))
      .join('');
  });
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref);
  if (!letters) throw new Error(`xlsx 单元格坐标非法：${ref}`);
  return letters[0].split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

function cellText(body: string, attrs: string, shared: string[]): string {
  const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
  if (type === 's') {
    const indexMatch = /<v>(\d+)<\/v>/.exec(body);
    if (!indexMatch) throw new Error(`xlsx 共享字符串单元格缺索引：${attrs}`);
    const value = shared[Number(indexMatch[1])];
    if (value === undefined) throw new Error(`xlsx 共享字符串索引越界：${indexMatch[1]}`);
    return value;
  }
  const inlineRuns = body.match(/<t[^>]*>[\s\S]*?<\/t>/g);
  if (inlineRuns) {
    return inlineRuns
      .map(run => decodeXmlText(run.replace(/^<t[^>]*>/, '').replace(/<\/t>$/, '')))
      .join('');
  }
  const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  return value === undefined ? '' : decodeXmlText(value);
}

async function parseSheetRows(body: Buffer): Promise<SheetRows> {
  const zip = await JSZip.loadAsync(body);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (!sharedXml) throw new Error('xlsx 缺 xl/sharedStrings.xml，打印文本无法逐格读取');
  const shared = parseSharedStrings(sharedXml);
  const sheetXml = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
  if (!sheetXml) throw new Error('xlsx 缺 xl/worksheets/sheet1.xml，打印主表不可读');
  const rowXmls = sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g);
  if (!rowXmls) throw new Error('xlsx 主表没有数据行');

  const byNumber = new Map<number, string[]>();
  for (const rowXml of rowXmls) {
    const rowNo = Number(/<row\b[^>]*\br="(\d+)"/.exec(rowXml)?.[1]);
    if (!Number.isInteger(rowNo)) throw new Error(`xlsx 行号解析失败：${rowXml.slice(0, 120)}`);
    const cells: string[] = [];
    const cellXmls = rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g);
    if (!cellXmls) continue;
    for (const cellXml of cellXmls) {
      const attrs = /<c\b([^>]*?)(?:\/>|>)/.exec(cellXml)?.[1];
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!attrs || !ref) throw new Error(`xlsx 单元格坐标解析失败：${cellXml.slice(0, 120)}`);
      if (/<c\b[^>]*\/>$/.test(cellXml)) {
        cells[columnIndex(ref)] = '';
        continue;
      }
      const innerMatch = /<c\b[^>]*>([\s\S]*?)<\/c>/.exec(cellXml);
      if (!innerMatch) throw new Error(`xlsx 单元格体解析失败：${cellXml.slice(0, 120)}`);
      cells[columnIndex(ref)] = cellText(innerMatch[1], attrs, shared);
    }
    byNumber.set(rowNo, cells);
  }
  const maxRow = Math.max(...byNumber.keys());
  const rows: SheetRows = [];
  for (let i = 1; i <= maxRow; i += 1) {
    const row = byNumber.get(i);
    if (row) rows.push(row);
    else rows.push([]);
  }
  return rows;
}

function findHeaderIndex(rows: SheetRows, label: string): number {
  for (const row of rows) {
    const index = row.indexOf(label);
    if (index >= 0) return index;
  }
  throw new Error(`xlsx 缺表头「${label}」`);
}

function findKvRow(rows: SheetRows, label: string): string[] {
  const row = rows.find(candidate => candidate[0] === label);
  if (!row) throw new Error(`xlsx 缺 KV 行「${label}」`);
  return row;
}

async function readDelivery(
  page: Page,
  orderId: number
): Promise<{ id: number; deliveryNo: string }> {
  const res = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}/deliveries`);
  if (!Array.isArray(res.list))
    throw new Error(`发货单列表缺 list 数组：${JSON.stringify(res).slice(0, 200)}`);
  const rows = res.list as Row[];
  const total = Number(res.total);
  if (!Number.isFinite(total))
    throw new Error(`发货单列表 total 非数：${JSON.stringify(res.total)}`);
  expect(total, '发货单列表 total 应等于实际行数').toBe(rows.length);
  expect(rows.length, '本用例订单全额发货应只生成一张发货单').toBe(1);
  const delivery = rows[0];
  expectStatusChar(delivery.status, 'shipped', '发货单状态');
  expect(readPositiveNumber(delivery.order_id, '发货单归属订单'), '发货单应归属本用例订单').toBe(
    orderId
  );
  return {
    id: readPositiveNumber(delivery.id, '发货单 id'),
    deliveryNo: readNonEmptyString(delivery.delivery_no, '发货单号'),
  };
}

test.describe('548 销售发货单 xlsx 打印字段级回归', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('真实发货后打印 xlsx，缸号匹号批次与米数合计逐格同源于库存四维', async ({ page }) => {
    test.setTimeout(300_000);
    const ctx = getCtx();
    if (!ctx.quotationProductId || !ctx.customerId) {
      throw new Error('夹具未提供本例所需的产品或客户');
    }
    const productId = ctx.quotationProductId;
    const warehouse = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: warehouse.id,
      quantityMeters: '40',
      pieceCount: 1,
      context: '548-SHIP-XLSX',
    });
    const piece = bundle.pieces[0];
    if (!piece) throw new Error('染色匹链未产出可发货匹');

    const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      order_date: new Date().toISOString(),
      items: [{ product_id: productId, quantity: 40, unit_price: '25.00' }],
      remarks: 'E2E 548 发货单打印字段级回归',
    });
    const orderId = readPositiveNumber(created.id, '销售订单 id');
    const orderNo = readNonEmptyString(created.order_no, '销售订单号');
    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
    const approved = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expectStatusChar(approved.status, 'approved', '审批后订单状态');

    await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
      order_id: orderId,
      warehouse_code: warehouse.code,
      items: [
        {
          product_id: productId,
          quantity: 40,
          batch_no: bundle.dyeLotNo,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          piece_no: piece.piece_no,
        },
      ],
    });
    const delivery = await readDelivery(page, orderId);

    const print = await page.request.get(
      `${API_BASE}${API_PREFIX}/sales/orders/${orderId}/deliveries/${delivery.id}/print-xlsx`,
      { headers: { 'X-Requested-With': 'XMLHttpRequest' }, timeout: 60_000 }
    );
    expect(print.status(), '发货单 print-xlsx 应返回 200').toBe(200);
    expect(print.headers()['content-type'], '打印响应应为 xlsx 工作簿内容类型').toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const rows = await parseSheetRows(await print.body());
    const detailRow = rows.find(row => {
      const batchIndex = findHeaderIndex(rows, '批次');
      return row[batchIndex] === bundle.dyeLotNo;
    });
    if (!detailRow) {
      throw new Error(
        `xlsx 明细区未找到本例缸号批次行 ${bundle.dyeLotNo}，实际行数=${rows.length}`
      );
    }
    expect(detailRow[findHeaderIndex(rows, '缸号')], '明细缸号应逐字等于库存四维缸号').toBe(
      bundle.dyeLotNo
    );
    expect(detailRow[findHeaderIndex(rows, '匹号')], '明细匹号应逐字等于实际出库匹号').toBe(
      piece.piece_no
    );
    expect(
      readPositiveNumber(detailRow[findHeaderIndex(rows, '数量(米)')], '明细发货米数'),
      '明细米数应与发货请求一致'
    ).toBe(40);

    expect(findKvRow(rows, '单号')[1], '主表发货单号应与读回发货单号一致').toBe(
      delivery.deliveryNo
    );
    expect(findKvRow(rows, '来源销售订单号')[1], '主表来源订单号应与真实建单号一致').toBe(orderNo);
    expect(findKvRow(rows, '总匹数')[1], '汇总总匹数应与实际发货匹数一致').toBe('1');
    expect(
      readPositiveNumber(findKvRow(rows, '总米数')[1], '汇总总米数'),
      '汇总米数应与明细发货米数一致'
    ).toBe(40);
  });
});
