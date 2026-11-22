// 4.41 D 链联动：送检单 sent/withdrawn 状态改写对应库存行的质量状态（合格→待检→合格）。
// 后端判据：services/textile_safety_submission_service.rs:451-535 apply_stock_link 按
//   product_id+batch_no+color_no+stock_status=NORMAL 命中库存行，HoldOnSent 将合格→待检、
//   ReleaseOnWithdraw 将待检→合格；:417/:422 set_status 在 sent/withdrawn 两跃迁触发。
//   词表 models/status/purchase_inventory.rs:315-333 合格/待检/不合格（中文写入值，禁英文化）。
//   响应 handlers/textile_safety_handler.rs:249-252 回显 submission+stock_link{matched,updated_stock_ids,scope_note}。
// 与既有覆盖分工：flow/491 只断 scope_note 为 string、建单不传 batch_no，matched 恒 0，
//   无 matched>0 与库存质量状态改写断言。全 e2e 无 sent/withdrawn 联动库存的逐字段回读。
// 假红规避：只做中英词表已核实的 sent/withdrawn 两动作，不碰报告判定采信规则；
//   专属产品+唯一色号/批次，命中库存行唯一，matched 精确为 1。
// 检测力：联动被摘除则 matched=0 或库存质量状态不变即红；词表改英文则逐字断言红。
import { test, expect, type Page } from '../diagnose-fixture';
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import {
  loginViaUI,
  ensureTestEntities,
  apiCallRaw,
  genCode,
  getCtx,
  tryCleanup,
  seedFourDimStockIn,
} from '../flow/helpers';

interface StockRow {
  id: number;
  quality_status: string;
  batch_no: string;
  color_no: string;
}
interface StockLink {
  matched: number;
  updated_stock_ids: number[];
  scope_note: string;
}
interface StatusResponse {
  submission: { id: number; status: string };
  stock_link: StockLink;
}

const STATUS = {
  DRAFT: 'draft',
  SAMPLING: 'sampling',
  SENT: 'sent',
  WITHDRAWN: 'withdrawn',
} as const;
const QUALITY = { PASS: '合格', PENDING: '待检' } as const;
const CATEGORY_B = 'GB18401_B';

const createdSubmissionIds: number[] = [];

function submissionBody(
  productId: number,
  colorNo: string,
  batchNo: string
): Record<string, unknown> {
  return {
    submission_no: genCode('E2E-TXSLK'),
    product_id: productId,
    batch_no: batchNo,
    color_no: colorNo,
    process_no: genCode('E2E-PRC'),
    end_user_group: 'adult',
    contact_type: 'direct',
    safety_category: CATEGORY_B,
    product_form: 'final',
    target_market: 'dom',
    color_role: 'full',
    exemption_tags: [],
  };
}

async function readStock(
  page: Page,
  productId: number,
  colorNo: string,
  batchNo: string,
  stockId: number
): Promise<StockRow> {
  const res = await apiCallRaw<{ items: StockRow[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&color_no=${encodeURIComponent(colorNo)}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  expect(Array.isArray(res.items), '库存列表 items 必须是数组').toBe(true);
  const row = res.items.find(s => s.id === stockId);
  expect(row, `按唯一四维定位的库存行 id=${stockId} 必须可回读`).toBeDefined();
  return row!;
}

test.describe.serial('452 送检→库存质量状态联动', () => {
  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdSubmissionIds) {
        await tryCleanup(page, 'DELETE', `/textile-submissions/${id}`, `452 submission ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('452-01 sent 冻结库存待检、withdrawn 解冻回合格，逐字回读', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const categoryId = ctx.productCategoryIds[0];
    const warehouseId = ctx.warehouseIds[0];
    if (!categoryId || !warehouseId) {
      throw new Error('[452] 前置不成立：ensureTestEntities 未备齐产品分类或仓库');
    }

    // 专属产品：避免与其它用例共用 product_id 导致库存命中不唯一
    const product = await apiCallRaw<{ id: number }>(page, 'POST', '/products', {
      code: genCode('E2E-TXLKP'),
      name: `E2E送检联动产品${Date.now().toString().slice(-6)}`,
      unit: '米',
      category_id: categoryId,
      product_type: PRODUCT_TYPE.finished,
      fabric_composition: '100%涤纶',
      gram_weight: 180,
      width: 150,
      meters_per_piece: 50,
    });
    expect(product.id, '专属产品必须返回 id').toBeTruthy();

    // 清单推导的主数据源：至少一条 GB18401 检测项，generate_items 才不落空集
    await apiCallRaw(page, 'POST', '/textile-test-items', {
      item_code: genCode('E2E-TI18401'),
      item_name: 'E2E基本安全数值项',
      item_kind: 'numeric',
      basis_standard: 'GB18401',
      check_kind: 'measurable',
      unit: 'mg/kg',
    });

    // 播种唯一四维库存行：默认 stock_status=NORMAL、quality_status=合格
    const colorNo = genCode('E2E-LK-C');
    const dyeLotNo = genCode('E2E-LK-D');
    const batchNo = genCode('E2E-LK-B');
    const stock = await seedFourDimStockIn(page, {
      productId: product.id,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '100',
    });
    const stockId = Number(stock.id);
    expect(Number.isFinite(stockId), '播种库存行必须返回数值 id').toBe(true);

    // 建送检单：色号/批次与库存行逐字相同，联动才命中
    const created = await apiCallRaw<{ id: number }>(
      page,
      'POST',
      '/textile-submissions',
      submissionBody(product.id, colorNo, batchNo)
    );
    expect(created.id, '建单必须返回 id').toBeTruthy();
    createdSubmissionIds.push(created.id);
    const id = created.id;

    // 生成清单并推进到 sampling（draft→sampling 要求清单非空）
    await apiCallRaw(page, 'POST', `/textile-submissions/${id}/items`, {
      extra_item_codes: [],
    });
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/status`, {
      status: STATUS.SAMPLING,
    });

    // 入库初态：合格
    const before = await readStock(page, product.id, colorNo, batchNo, stockId);
    expect(before.quality_status, '播种库存行初态必须是合格').toBe(QUALITY.PASS);

    // sent：HoldOnSent 将合格→待检，联动回显必须点名这一行
    const sent = await apiCallRaw<StatusResponse>(
      page,
      'PUT',
      `/textile-submissions/${id}/status`,
      {
        status: STATUS.SENT,
      }
    );
    expect(sent.submission.status, '跃迁后送检单状态必须是 sent').toBe(STATUS.SENT);
    expect(sent.stock_link.matched, '唯一四维库存行必须命中').toBe(1);
    expect(
      sent.stock_link.updated_stock_ids.map(Number),
      '改写行 id 集合必须包含被播种库存行'
    ).toContain(stockId);
    expect(typeof sent.stock_link.scope_note, '联动口径说明必须是字符串').toBe('string');
    const afterSent = await readStock(page, product.id, colorNo, batchNo, stockId);
    expect(afterSent.quality_status, 'sent 后库存质量状态必须逐字为待检').toBe(QUALITY.PENDING);

    // withdrawn：ReleaseOnWithdraw 将待检→合格
    const withdrawn = await apiCallRaw<StatusResponse>(
      page,
      'PUT',
      `/textile-submissions/${id}/status`,
      { status: STATUS.WITHDRAWN }
    );
    expect(withdrawn.submission.status, '跃迁后送检单状态必须是 withdrawn').toBe(STATUS.WITHDRAWN);
    expect(withdrawn.stock_link.matched, '撤回同样命中唯一库存行').toBe(1);
    expect(
      withdrawn.stock_link.updated_stock_ids.map(Number),
      '撤回改写行 id 集合必须包含被播种库存行'
    ).toContain(stockId);
    const afterWithdrawn = await readStock(page, product.id, colorNo, batchNo, stockId);
    expect(afterWithdrawn.quality_status, 'withdrawn 后库存质量状态必须逐字回到合格').toBe(
      QUALITY.PASS
    );
  });
});
