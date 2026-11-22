// 502 报价色价列表：0 哨兵全表不过滤 + page/page_size 钳制 + product_id 过滤隔离。
// 后端判据：routes/quotations.rs:48-51 把 GET /quotations/color-prices/{product_color_id}
//   挂到 handlers/quotation_handler.rs:605 list_color_prices；
//   :595-601 page/page_size 为 Option<u64>；:612 page=unwrap_or(1).clamp(1,1000)，
//   :613 page_size=unwrap_or(20).clamp(1,100)；:625-627 fetch_page 用 1-based→0-based；
//   :629-631 回显钳制后的 page/page_size；:615-619 只有非零路径参数才按 product_id 过滤，
//   故 0 是全表哨兵而非空结果，且路径段名字虽叫 product_color_id，实际过滤列是 ProductId。
// 响应判据：utils/response.rs:39-45 固定 items/total/page/page_size 四键；
//   models/product_color_price.rs:10-33 行含 id/product_id/color_id/base_price/is_active/approval_status。
// 该查询无 ORDER BY，故不断言 items 顺序；也不按 is_active/approval_status 过滤，
//   故不假设停用行被排除。page/page_size 是 u64，负数会解析 400，本例不用负数做钳制断言。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

interface ColorPriceRow {
  id: number;
  product_id: number;
  base_price?: unknown;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

interface Host {
  productId: number;
  colorId: number;
}

interface CreatedPrice {
  id: number;
  productId: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

/** 校验分页信封四键，并用 unknown 入参避免把后端缺键静默当成空数组。 */
function expectPagedShape(value: unknown, label: string): Paged<ColorPriceRow> {
  expect(
    value !== null && typeof value === 'object',
    `[502] ${label} data 须是分页对象，实际=${JSON.stringify(value)}`
  ).toBe(true);
  const raw = value as Record<string, unknown>;

  expect(
    Array.isArray(raw.items),
    `[502] ${label} items 须是数组，实际=${JSON.stringify(raw.items)}`
  ).toBe(true);
  const total = raw.total;
  expect(
    typeof total === 'number' && Number.isInteger(total) && total >= 0,
    `[502] ${label} total 须是非负整数，实际=${JSON.stringify(total)}`
  ).toBe(true);
  const page = raw.page;
  expect(
    typeof page === 'number' && Number.isInteger(page) && page >= 1,
    `[502] ${label} page 须是正整数，实际=${JSON.stringify(page)}`
  ).toBe(true);
  const pageSize = raw.page_size;
  expect(
    typeof pageSize === 'number' && Number.isInteger(pageSize) && pageSize >= 1,
    `[502] ${label} page_size 须是正整数，实际=${JSON.stringify(pageSize)}`
  ).toBe(true);

  return raw as unknown as Paged<ColorPriceRow>;
}

async function list(page: Page, path: string, label: string): Promise<Paged<ColorPriceRow>> {
  const data = await apiCallRaw<unknown>(page, 'GET', path);
  return expectPagedShape(data, label);
}

function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** 唯一分类/产品/色号宿主；宿主行按 115/482 范式保留，只清价格行避免悬空引用。 */
async function seedHost(page: Page, tag: string): Promise<Host> {
  const category = await apiCallRaw<Row>(page, 'POST', '/categories', {
    name: `502类${tag}`,
    code: `502CAT${tag}`,
  });
  const categoryId = Number(category.id);
  expect(
    Number.isInteger(categoryId) && categoryId > 0,
    `[502] 分类须回真实主键，tag=${tag} 实际=${JSON.stringify(category)}`
  ).toBe(true);

  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    name: `502产品${tag}`,
    code: `502P${tag}`,
    category_id: categoryId,
    unit: 'm',
    // 色价按色号计价，取非面料类型免带面料三键。
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product.id);
  expect(
    Number.isInteger(productId) && productId > 0,
    `[502] 产品须回真实主键，tag=${tag} 实际=${JSON.stringify(product)}`
  ).toBe(true);

  const color = await apiCallRaw<Row>(page, 'POST', `/products/${productId}/colors`, {
    color_no: `502CN${tag}`,
    color_name: `502色号${tag}`,
    color_type: 'STANDARD',
    extra_cost: 0,
  });
  const colorId = Number(color.id);
  expect(
    Number.isInteger(colorId) && colorId > 0,
    `[502] 色号须回真实主键，tag=${tag} 实际=${JSON.stringify(color)}`
  ).toBe(true);

  return { productId, colorId };
}

async function seedPrice(page: Page, host: Host, tag: string, base: string): Promise<CreatedPrice> {
  const row = await apiCallRaw<Row>(page, 'POST', '/color-prices', {
    product_id: host.productId,
    color_id: host.colorId,
    currency: 'CNY',
    base_price: base,
    effective_from: ymd(0),
    notes: `502初建${tag}`,
  });
  const id = Number(row.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[502] 建价须回真实主键，tag=${tag} 实际=${JSON.stringify(row)}`
  ).toBe(true);
  const productId = Number(row.product_id);
  expect(
    productId === host.productId,
    `[502] 建价响应 product_id 须等于宿主产品 ${host.productId}，实际=${JSON.stringify(row.product_id)}`
  ).toBe(true);
  CLEANUP.push({ path: `/color-prices/${id}`, label: `price-${tag}` });
  return { id, productId };
}

test.describe.serial('502 报价色价列表钳制', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('502-01 0 哨兵取基数且默认/越界分页钳制，非零参数按 product_id 隔离', async ({ page }) => {
    const tag = genCode('E502');
    const expectedUpperPageItems = (t: number): number => Math.min(Math.max(t - 999, 0), 1);

    // 先用 page_size=100 的 0 哨兵取本会话相对基数 T，不写死 0，也不据此判新建成功。
    const probe = await list(
      page,
      '/quotations/color-prices/0?page_size=100',
      '0 哨兵 page_size=100 基数'
    );
    const t = probe.total;
    expect(probe.page === 1, `[502] 0 哨兵未传 page 须默认 1，实际=${probe.page}`).toBe(true);
    expect(
      probe.page_size === 100,
      `[502] 0 哨兵 page_size=100 须回显 100，实际=${probe.page_size}`
    ).toBe(true);
    expect(
      probe.items.length === Math.min(t, 100),
      `[502] 0 哨兵 items 数须为 min(T,100)，T=${t} 实际=${probe.items.length}`
    ).toBe(true);

    // 默认页：无 query 时后端 unwrap_or(1)/unwrap_or(20)。
    const def = await list(page, '/quotations/color-prices/0', '0 哨兵默认分页');
    expect(def.page === 1, `[502] 默认 page 须为 1，实际=${def.page}`).toBe(true);
    expect(def.page_size === 20, `[502] 默认 page_size 须为 20，实际=${def.page_size}`).toBe(true);
    expect(def.total === t, `[502] 默认分页 total 须等于基数 T=${t}，实际=${def.total}`).toBe(true);
    expect(
      def.items.length === Math.min(t, 20),
      `[502] 默认分页 items 数须为 min(T,20)，T=${t} 实际=${def.items.length}`
    ).toBe(true);

    // 下界 0→1、上界 1000→100。
    const lowerUpper = await list(
      page,
      '/quotations/color-prices/0?page=0&page_size=1000',
      '0 哨兵 page=0&page_size=1000'
    );
    expect(lowerUpper.page === 1, `[502] page=0 须钳到 1，实际=${lowerUpper.page}`).toBe(true);
    expect(
      lowerUpper.page_size === 100,
      `[502] page_size=1000 须钳到 100，实际=${lowerUpper.page_size}`
    ).toBe(true);
    expect(
      lowerUpper.total === t,
      `[502] 下界/上界钳制 total 须等于 T=${t}，实际=${lowerUpper.total}`
    ).toBe(true);
    expect(
      lowerUpper.items.length === Math.min(t, 100),
      `[502] 钳到 1/100 后 items 数须为 min(T,100)，T=${t} 实际=${lowerUpper.items.length}`
    ).toBe(true);

    // 上界 1001→1000、下界 0→1；第 1000 页每页 1 条，条目数按基数公式且不超过 1。
    const upperLower = await list(
      page,
      '/quotations/color-prices/0?page=1001&page_size=0',
      '0 哨兵 page=1001&page_size=0'
    );
    expect(upperLower.page === 1000, `[502] page=1001 须钳到 1000，实际=${upperLower.page}`).toBe(
      true
    );
    expect(
      upperLower.page_size === 1,
      `[502] page_size=0 须钳到 1，实际=${upperLower.page_size}`
    ).toBe(true);
    expect(
      upperLower.total === t,
      `[502] 上界/下界钳制 total 须等于 T=${t}，实际=${upperLower.total}`
    ).toBe(true);
    expect(
      upperLower.items.length === expectedUpperPageItems(t) && upperLower.items.length <= 1,
      `[502] 钳到 1000/1 后 items 数须为 ${expectedUpperPageItems(t)} 且不超过 1，实际=${upperLower.items.length}`
    ).toBe(true);

    // 过滤腿：两个不同 product 各建一条唯一色价；不断言全局总数变化。
    const host1 = await seedHost(page, `${tag}P1`);
    const host2 = await seedHost(page, `${tag}P2`);
    expect(
      host1.productId !== host2.productId,
      `[502] P1/P2 产品主键须不同，实际均为 ${host1.productId}`
    ).toBe(true);
    expect(
      host1.colorId !== host2.colorId,
      `[502] P1/P2 色号主键须不同，实际均为 ${host1.colorId}`
    ).toBe(true);

    const price1 = await seedPrice(page, host1, `${tag}P1`, '10.00');
    const price2 = await seedPrice(page, host2, `${tag}P2`, '20.00');
    expect(price1.id !== price2.id, `[502] 两条自建价格主键须不同，实际均为 ${price1.id}`).toBe(
      true
    );

    const p1 = await list(
      page,
      `/quotations/color-prices/${host1.productId}?page_size=100`,
      `P1=${host1.productId} 过滤`
    );
    const p2 = await list(
      page,
      `/quotations/color-prices/${host2.productId}?page_size=100`,
      `P2=${host2.productId} 过滤`
    );

    for (const [label, result, productId, priceId, otherPriceId, basePrice] of [
      ['P1', p1, host1.productId, price1.id, price2.id, 10],
      ['P2', p2, host2.productId, price2.id, price1.id, 20],
    ] as const) {
      expect(
        result.page === 1 && result.page_size === 100,
        `[502] ${label} 过滤分页须为 1/100，实际=${result.page}/${result.page_size}`
      ).toBe(true);
      expect(
        result.total === 1 && result.items.length === 1,
        `[502] ${label} 唯一产品应只命中自建一行，total=${result.total} items=${result.items.length}`
      ).toBe(true);
      expect(
        result.items.every(row => Number(row.product_id) === productId),
        `[502] ${label} items.product_id 须全为 ${productId}，实际=${JSON.stringify(
          result.items.map(row => row.product_id)
        )}`
      ).toBe(true);

      const ids = result.items.map(row => Number(row.id));
      expect(
        ids.every(id => Number.isInteger(id) && id > 0),
        `[502] ${label} items.id 须全为正整数，实际=${JSON.stringify(ids)}`
      ).toBe(true);
      expect(
        ids.includes(priceId),
        `[502] ${label} 须含自建价格 id=${priceId}，实际=${JSON.stringify(ids)}`
      ).toBe(true);
      expect(
        ids.includes(otherPriceId),
        `[502] ${label} 不得含另一产品自建价格 id=${otherPriceId}，实际=${JSON.stringify(ids)}`
      ).toBe(false);

      const own = result.items.find(row => Number(row.id) === priceId);
      expect(
        own !== undefined,
        `[502] ${label} 须能按自建 id=${priceId} 定位行，实际=${JSON.stringify(result.items)}`
      ).toBe(true);
      expect(
        Number(own?.base_price) === basePrice,
        `[502] ${label} 自建行 base_price 须为 ${basePrice}，实际=${JSON.stringify(own?.base_price)}`
      ).toBe(true);
    }
  });
});
