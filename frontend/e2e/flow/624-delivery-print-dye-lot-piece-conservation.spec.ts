// 624 销售发货单打印缸号/卷号/数量守恒与非法四维事务性
//
// 六要素·功能：按真实染色匹四维发货后，从打印 docx 正文按栏名逐行取回缸号/卷号/数量，
//   与发货请求逐行核对，并证明非法四维被拒后不生成任何发货单、库存匹不被消耗。
// 六要素·调用方：E2E 回归套件（diagnose-fixture 注入 worker 独立登录态），由 CI 联动专项腿执行。
// 六要素·入参：worker 自建染色布产品、可承载染色匹的成品/未设类型仓、真实 AVAILABLE 缸/匹
//   （seedDyedOutboundBundle 经委外染色回仓链产出）、两张 approved 销售订单（80 米与 40 米）。
// 六要素·存什么：发货单头 total_quantity、发货行 dye_lot_no/piece_no/quantity、
//   打印 word/document.xml 明细表按栏名取出的值、非法请求的 AppError 码/文案、库存匹状态。
// 六要素·存哪里：sales_deliveries / sales_delivery_items / inventory_pieces
//   （只读经 GET /sales/orders/{id}/deliveries、GET /orders/{id}/deliveries/{id}/print、
//   GET /inventory/pieces）。
// 六要素·检测力自证：一次发货用两匹（各自长度 40 米）、两行不同卷号；打印取值按栏名映射而不是
//   固定列序，任一缸号/卷号/数量漂移即判红；非法匹号请求必须 4xx 且发货单列表行数与匹状态不变。
//   数量一律 Decimal 字符串折 BigInt 整数分逐位相等，不用浮点、不用 toBeCloseTo，不用于金额断言。
//
// 源码判据（逐条对照写入方，不改口径）：
// - services/so/delivery_ops/ship.rs:425-451 build_delivery_item 把实际扣减行的
//   color_no/dye_lot_no/batch_no/piece_no 与 quantity 直接写入发货明细；
//   :248 单头 total_quantity = Σ 本次发货明细 quantity。
// - routes/sales.rs:69 GET /orders/{id}/deliveries/{delivery_id}/print（经 routes/mod.rs:518
//   /api/v1/erp/sales nest）；:36 GET /orders/{id}/deliveries 出参为手搓信封，数组键 list。
// - services/print_service/sales.rs:1138-1191 打印明细按行输出 缸号/卷号/数量 等栏，
//   services/print_service/docx.rs:100-113 明细表头按列名字典序排序后写表，
//   utils/docx_export.rs 生成标准 w:tbl/w:tr/w:tc/w:t；解析按栏名取值，不假设列序。
// - 事务性：services/so/delivery_ops/inventory.rs:196 先 validate_dyed_piece_for_outbound；
//   services/piece_domain_service.rs:737-751 未命中 AVAILABLE 四维 tuple 即 AppError::business，
//   文案点名匹号；建单校验期失败，整单不落库。
// - 错误体只有 AppError：字符串码 BUSINESS_ERROR（utils/error.rs），无数字 code 旁路。
// - 108 号 spec :893-945/:993-1019 的 docx 解析范式（JSZip + word/document.xml）复用，
//   本例扩展到按表头栏名取值，不复用其金额断言。
import { test, expect } from '../diagnose-fixture';
import JSZip from 'jszip';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  readDyedPieceByNo,
  seedDyedOutboundBundle,
} from './helpers';

type Row = Record<string, unknown>;
type PrintedLine = { dyeLotNo: string; pieceNo: string; quantity: bigint };

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRow(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new Error(`${label} 必须是 JSON 对象，实际 ${JSON.stringify(value)?.slice(0, 200)}`);
  }
  return value;
}

function readRows(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组，实际 ${typeof value}`);
  return value.map((row, i) => requireRow(row, `${label}[${i}]`));
}

function positiveId(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${label} 非正整数，实际 ${JSON.stringify(value)}`);
  return n;
}

/** Decimal 出参折 BigInt 分位；拒收非线格式与超精度，不做截断，不引入浮点比较。 */
function cents(value: unknown, label: string): bigint {
  const s =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label} 非 Decimal 线格式，raw=${JSON.stringify(value)}`);
  const fraction = (m[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超两位，raw=${s}`);
  }
  const n = BigInt(m[2] ?? '0') * 100n + BigInt(fraction.slice(0, 2) || '0');
  return m[1] === '-' ? -n : n;
}

function eqCents(actual: bigint, expected: bigint, label: string): void {
  expect(actual, `${label}（BigInt 分位）实际 ${actual}，期望 ${expected}`).toBe(expected);
}

function decodeXmlText(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function cellText(cellXml: string): string {
  const runs = [...cellXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1] ?? '');
  return decodeXmlText(runs.join('')).trim();
}

/**
 * 解 docx 明细表：逐 w:tbl/w:tr/w:tc 取文本，找到同时含 缸号/卷号/数量 三栏的表，
 * 按表头文字映射列位再逐行取值（表头字典序随实现可能变化，禁按固定下标取）。
 */
function parsePrintedLines(docXml: string): PrintedLine[] {
  const tables = [...docXml.matchAll(/<w:tbl(?:\s[^>]*)?>([\s\S]*?)<\/w:tbl>/g)].map(
    m => m[1] ?? ''
  );
  for (const table of tables) {
    const rows = [...table.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)].map(tr =>
      [...(tr[1] ?? '').matchAll(/<w:tc(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g)].map(tc =>
        cellText(tc[1] ?? '')
      )
    );
    const header = rows[0];
    if (
      !header ||
      !header.includes('缸号') ||
      !header.includes('卷号') ||
      !header.includes('数量')
    ) {
      continue;
    }
    const lotIdx = header.indexOf('缸号');
    const pieceIdx = header.indexOf('卷号');
    const qtyIdx = header.indexOf('数量');
    return rows
      .slice(1)
      .filter(row => row.some(cell => cell !== ''))
      .map(row => {
        if (row.length <= Math.max(lotIdx, pieceIdx, qtyIdx)) {
          throw new Error(`打印明细表行列数不足：${JSON.stringify(row)}`);
        }
        return {
          dyeLotNo: row[lotIdx] ?? '',
          pieceNo: row[pieceIdx] ?? '',
          quantity: cents(row[qtyIdx], '打印明细 数量 栏'),
        };
      });
  }
  throw new Error('打印 docx 未找到含 缸号/卷号/数量 的明细表，表头口径已漂移');
}

async function readPrintedLines(
  page: import('@playwright/test').Page,
  orderId: number,
  deliveryId: number
): Promise<PrintedLine[]> {
  const url = `${API_BASE}${API_PREFIX}/sales/orders/${orderId}/deliveries/${deliveryId}/print`;
  const resp = await page.request.get(url);
  expect(resp.status(), `打印端点须 2xx，实际 ${resp.status()}`).toBeLessThan(300);
  const body = await resp.body();
  const zip = await JSZip.loadAsync(body);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) {
    throw new Error(`打印件缺 word/document.xml，实际条目=${Object.keys(zip.files).join(',')}`);
  }
  return parsePrintedLines(docXml);
}

async function readDeliveries(
  page: import('@playwright/test').Page,
  orderId: number
): Promise<Row[]> {
  const res = await apiCallRaw(page, 'GET', `/sales/orders/${orderId}/deliveries`);
  const list = (requireRow(res, '发货单列表信封').list as unknown) ?? undefined;
  if (list === undefined) throw new Error('发货单列表信封缺 list 键，不按空数组兜底');
  return readRows(list, '发货单列表 list');
}

async function createApprovedOrder(
  page: import('@playwright/test').Page,
  customerId: number,
  productId: number,
  quantity: string,
  unitPrice: string,
  tag: string
): Promise<number> {
  const created = requireRow(
    await apiCallRaw(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      order_no: genCode(tag),
      status: 'draft',
      currency: 'CNY',
      tax_inclusive: false,
      tax_rate: '0',
      total_amount: String(Number(quantity) * Number(unitPrice)),
      notes: `E2E-${tag}`,
      items: [{ product_id: productId, quantity, unit_price: unitPrice }],
    }),
    '建单出参'
  );
  const orderId = positiveId(created.id, '销售订单主键');
  await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
  let detail = requireRow(await apiCallRaw(page, 'GET', `/sales/orders/${orderId}`), '订单详情');
  if (detail.status !== 'approved') {
    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
    detail = requireRow(await apiCallRaw(page, 'GET', `/sales/orders/${orderId}`), '订单详情');
  }
  if (detail.status !== 'approved') {
    throw new Error(`订单 ${orderId} 提交+审批后状态=${String(detail.status)}，期望 approved`);
  }
  return orderId;
}

test.describe('624 发货打印四维守恒与事务性', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('624-01 两匹发货打印逐行守恒，非法四维被拒不落发货单不耗匹', async ({ page }) => {
    test.setTimeout(600_000);
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const customerId = ctx.customerId;
    if (productId === undefined || customerId === undefined) {
      throw new Error('前置缺失：染色布产品或客户未就绪');
    }
    const tag = genCode('624-PRINT');
    const warehouse = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: warehouse.id,
      quantityMeters: '120',
      pieceCount: 3,
      context: tag,
    });
    const [piece1, piece2, piece3] = bundle.pieces;
    if (!piece1 || !piece2 || !piece3) {
      throw new Error(`染色匹链未产出三匹，实际 ${bundle.pieces.length}`);
    }
    expect(
      piece1.piece_no !== piece2.piece_no && piece2.piece_no !== piece3.piece_no,
      '三匹卷号必须互不相同，否则逐行守恒无检测力'
    ).toBe(true);

    // 两张独立 approved 订单：A 发两匹（80 米），B 留给非法四维负例（40 米），
    // 避免用已 shipped 的 A 做负例而被状态门抢先拒绝，导致误把事务性判绿。
    const orderA = await createApprovedOrder(
      page,
      customerId,
      productId,
      '80',
      '12.50',
      tag + '-A'
    );
    const orderB = await createApprovedOrder(
      page,
      customerId,
      productId,
      '40',
      '12.50',
      tag + '-B'
    );

    const deliveriesBeforeB = await readDeliveries(page, orderB);
    expect(deliveriesBeforeB.length, '负例订单发货前应零张发货单').toBe(0);

    const shipItems = [piece1, piece2].map(piece => ({
      product_id: productId,
      quantity: String(piece.length),
      batch_no: bundle.dyeLotNo,
      color_no: bundle.colorNo,
      dye_lot_no: bundle.dyeLotNo,
      piece_no: piece.piece_no,
    }));
    await apiCall(page, 'POST', `/sales/orders/${orderA}/ship`, {
      order_id: orderA,
      warehouse_code: warehouse.code,
      items: shipItems,
      remarks: `E2E-${tag} 两匹发货`,
    });

    // 打印正文按栏名取值：两行卷号/缸号/数量与发货请求逐行相等（逐分比，不用浮点）
    const deliveriesAfterShip = await readDeliveries(page, orderA);
    expect(deliveriesAfterShip.length, '正向发货应只落一张发货单').toBe(1);
    const deliveryId = positiveId(deliveriesAfterShip[0]!.id, '发货单主键');
    const printed = await readPrintedLines(page, orderA, deliveryId);
    expect(printed.length, `打印明细应恰好 ${shipItems.length} 行，实际 ${printed.length}`).toBe(
      shipItems.length
    );
    for (const expected of shipItems) {
      const hits = printed.filter(row => row.pieceNo === expected.piece_no);
      expect(hits.length, `打印明细卷号 ${expected.piece_no} 应唯一，实际 ${hits.length} 行`).toBe(
        1
      );
      const hit = hits[0]!;
      expect(hit.dyeLotNo, `卷号 ${expected.piece_no} 的缸号须与发货请求一致`).toBe(
        expected.dye_lot_no
      );
      eqCents(
        hit.quantity,
        cents(expected.quantity, '发货请求数量'),
        `卷号 ${expected.piece_no} 打印数量`
      );
    }
    expect(new Set(printed.map(row => row.pieceNo)).size, '打印明细不得重复卷号').toBe(
      shipItems.length
    );

    // 发货单头 total_quantity = 明细数量合计；打印读回与发货列表是两条独立读路径
    const expectedTotal = shipItems.reduce(
      (sum, item) => sum + cents(item.quantity, '发货请求数量'),
      0n
    );
    const printedTotal = printed.reduce((sum, row) => sum + row.quantity, 0n);
    eqCents(expectedTotal, printedTotal, '发货请求数量合计=打印明细数量合计');
    eqCents(
      cents(deliveriesAfterShip[0]!.total_quantity, '发货单头 total_quantity'),
      expectedTotal,
      '发货单头 total_quantity=明细数量合计'
    );

    // 非法四维：对仍 AVAILABLE 的第三匹，只把卷号改成不存在的假号；颜色/缸/批/仓全合法。
    // 拒绝必须来自四维匹校验（文案点名假卷号），而非订单状态门。
    const fakePieceNo = `${piece3.piece_no}-NOSUCH`;
    const rejected = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderB}/ship`, {
      order_id: orderB,
      warehouse_code: warehouse.code,
      items: [
        {
          product_id: productId,
          quantity: String(piece3.length),
          batch_no: bundle.dyeLotNo,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          piece_no: fakePieceNo,
        },
      ],
      remarks: `E2E-${tag} 非法四维`,
    });
    expect(
      rejected.status >= 200 && rejected.status < 300,
      `非法四维必须非 2xx，实际 ${rejected.status}`
    ).toBe(false);
    expect(failureCode(rejected), '非法四维拒绝码须为 AppError 字符串 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(rejected.message ?? ''), `拒绝文案应点名假卷号 ${fakePieceNo}`).toContain(
      fakePieceNo
    );

    const deliveriesAfterReject = await readDeliveries(page, orderB);
    expect(
      deliveriesAfterReject.length,
      `非法四维被拒后发货单行数不得增加（拒前 ${deliveriesBeforeB.length}）`
    ).toBe(deliveriesBeforeB.length);
    const stillAvailable = await readDyedPieceByNo(page, {
      productId,
      warehouseId: warehouse.id,
      dyeLotNo: bundle.dyeLotNo,
      batchNo: bundle.dyeLotNo,
      pieceNo: piece3.piece_no,
    });
    expect(stillAvailable, '第三匹必须仍能按原四维回读，不得被失败事务消耗').not.toBeNull();
    expect(stillAvailable?.status, '失败事务不得把 AVAILABLE 匹改成 SHIPPED').toBe('AVAILABLE');
  });
});
