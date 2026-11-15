/**
 * 494 财务主数据三面写面：资产分类、账龄档位配置、行业基准配置。
 *
 * 调用面（backend/src/routes/finance.rs 注册）：
 *   GET    /api/v1/erp/asset-categories 资产分类列表（PaginatedResponse 信封，is_active 与分页过滤）
 *   POST   /api/v1/erp/asset-categories 建分类（出参分类本体）
 *   GET    /api/v1/erp/asset-categories/{id} 分类详情（出参本体，悬空 404）
 *   PUT    /api/v1/erp/asset-categories/{id} 修分类（可空列三态：缺席保持、显式 null 清空、有值覆盖）
 *   DELETE /api/v1/erp/asset-categories/{id} 停用分类（软删 is_active=false，出参文案）
 *   GET    /api/v1/erp/aging-grades 账龄档位列表（出参数组，仅 is_active=true，sort_order 升序）
 *   POST   /api/v1/erp/aging-grades 建档位（出参本体）
 *   GET    /api/v1/erp/aging-grades/{id} 档位详情（出参本体，悬空 404）
 *   PUT    /api/v1/erp/aging-grades/{id} 修档位（部分字段覆盖）
 *   DELETE /api/v1/erp/aging-grades/{id} 删档位（硬删，出参文案，再删 404）
 *   GET    /api/v1/erp/industry-benchmarks 行业基准列表（出参数组，仅 is_active=true）
 *   POST   /api/v1/erp/industry-benchmarks 建基准（出参本体，metric_value 为 DECIMAL 线格式字符串）
 *   GET    /api/v1/erp/industry-benchmarks/{id} 基准详情（出参本体，悬空 404）
 *   PUT    /api/v1/erp/industry-benchmarks/{id} 修基准（部分字段覆盖）
 *   DELETE /api/v1/erp/industry-benchmarks/{id} 删基准（硬删，出参文案，再删 404）
 *
 * 判据单源：asset_category_service.rs（软删与三态更新）、aging_grade_handler.rs 与
 * industry_benchmark_handler.rs（列表仅活跃行、详情按 id 取单行、硬删）。
 * 资产分类列表分页是夹紧口径（page 小于 1 夹到 1、page_size 夹到 1 至 100），不抛 400。
 * 前置自建：编码与名称带 genCode 唯一后缀，跨分片共库不撞。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';

interface CategoryRow {
  id: number;
  category_code: string;
  category_name: string;
  parent_id: number | null;
  default_useful_life: number | null;
  default_depreciation_method: string | null;
  default_salvage_rate: string | number | null;
  description: string | null;
  is_active: boolean;
}

interface AgingRow {
  id: number;
  grade_name: string;
  min_days: number;
  max_days: number;
  sort_order: number;
  is_active: boolean;
  remark: string | null;
}

interface BenchmarkRow {
  id: number;
  benchmark_name: string;
  industry_type: string;
  metric_name: string;
  metric_value: string | number;
  unit: string | null;
  data_source: string | null;
  data_year: number | null;
  is_active: boolean;
  remark: string | null;
}

interface PageEnvelope<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

const MISSING_ID = 2147483647;

const createdCategoryIds: number[] = [];
const createdAgingIds: number[] = [];
const createdBenchmarkIds: number[] = [];

async function createCategory(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<CategoryRow> {
  const row = await apiCallRaw<CategoryRow>(page, 'POST', '/asset-categories', {
    category_code: genCode('E2E-AC'),
    category_name: 'E2E资产分类',
    default_useful_life: 5,
    default_depreciation_method: 'straight_line',
    default_salvage_rate: 0.05,
    description: 'E2E建档描述',
    ...overrides,
  });
  if (!row.id) throw new Error(`[494] 建分类未返回 id：${JSON.stringify(row)}`);
  createdCategoryIds.push(row.id);
  return row;
}

async function createAging(page: Page, overrides: Record<string, unknown> = {}): Promise<AgingRow> {
  const row = await apiCallRaw<AgingRow>(page, 'POST', '/aging-grades', {
    grade_name: genCode('E2E-AG'),
    min_days: 0,
    max_days: 30,
    sort_order: 1,
    ...overrides,
  });
  if (!row.id) throw new Error(`[494] 建档位未返回 id：${JSON.stringify(row)}`);
  createdAgingIds.push(row.id);
  return row;
}

async function createBenchmark(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<BenchmarkRow> {
  const row = await apiCallRaw<BenchmarkRow>(page, 'POST', '/industry-benchmarks', {
    benchmark_name: genCode('E2E-IB'),
    industry_type: genCode('E2E-IND'),
    metric_name: '资产负债率',
    metric_value: 55.5,
    unit: '%',
    data_source: 'E2E行业年报',
    data_year: 2025,
    ...overrides,
  });
  if (!row.id) throw new Error(`[494] 建基准未返回 id：${JSON.stringify(row)}`);
  createdBenchmarkIds.push(row.id);
  return row;
}

function expectNotFound(res: ApiFailureResult, label: string): void {
  expect(res.status, `${label}：悬空 id 应 404，实际=${res.status}`).toBe(404);
  expect(failureCode(res), `${label}：机器码 NOT_FOUND`).toBe(APP_ERROR_CODES.NOT_FOUND);
}

test.describe.serial('494 财务主数据三面写面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdAgingIds) {
        await tryCleanup(page, 'DELETE', `/aging-grades/${id}`, `494 aging ${id}`);
      }
      for (const id of createdBenchmarkIds) {
        await tryCleanup(page, 'DELETE', `/industry-benchmarks/${id}`, `494 benchmark ${id}`);
      }
      for (const id of createdCategoryIds) {
        await tryCleanup(page, 'DELETE', `/asset-categories/${id}`, `494 category ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('494-01 资产分类建档回读与列表分页信封，is_active 过滤真下推', async ({ page }) => {
    const code = genCode('E2E-AC01');
    const created = await createCategory(page, {
      category_code: code,
      category_name: 'E2E回读分类',
    });
    expect(created.category_code).toBe(code);
    expect(created.category_name).toBe('E2E回读分类');
    expect(created.is_active, '建档恒活跃').toBe(true);
    expect(created.default_useful_life).toBe(5);
    expect(created.default_depreciation_method).toBe('straight_line');
    expect(Number(created.default_salvage_rate), '残值率落库').toBe(0.05);
    expect(created.description).toBe('E2E建档描述');

    const list = await apiCallRaw<PageEnvelope<CategoryRow>>(
      page,
      'GET',
      '/asset-categories?is_active=true&page=1&page_size=100'
    );
    expect(Array.isArray(list.items), '分页信封 items 为数组').toBe(true);
    expect(typeof list.total, '分页信封 total 为数值').toBe('number');
    expect(list.page, '分页信封回读 page').toBe(1);
    expect(list.page_size, '分页信封回读 page_size').toBe(100);
    expect(
      list.items.some(c => c.id === created.id),
      '活跃过滤应含本分类'
    ).toBe(true);
    expect(
      list.items.every(c => c.is_active === true),
      'is_active=true 过滤不得串档'
    ).toBe(true);
  });

  test('494-02 资产分类详情按 id 取单行，悬空 id 判 404', async ({ page }) => {
    const created = await createCategory(page);
    const detail = await apiCallRaw<CategoryRow>(page, 'GET', `/asset-categories/${created.id}`);
    expect(detail.id).toBe(created.id);
    expect(detail.category_code).toBe(created.category_code);

    const missing = await apiCallExpectFail(page, 'GET', `/asset-categories/${MISSING_ID}`);
    expectNotFound(missing, '资产分类详情');
  });

  test('494-03 资产分类更新三态：有值覆盖、显式 null 清空、缺席保持', async ({ page }) => {
    const created = await createCategory(page, {
      description: 'E2E原始描述',
      default_useful_life: 8,
    });
    // 有值覆盖 description，显式 null 清空 default_useful_life，缺席 default_depreciation_method 保持
    const updated = await apiCallRaw<CategoryRow>(page, 'PUT', `/asset-categories/${created.id}`, {
      description: 'E2E覆盖描述',
      default_useful_life: null,
    });
    expect(updated.description, '有值覆盖落库').toBe('E2E覆盖描述');
    expect(updated.default_useful_life, '显式 null 清空为 NULL').toBeNull();
    expect(updated.default_depreciation_method, '缺席键保持原值').toBe('straight_line');
    expect(updated.category_name, '未提交名称保持').toBe(created.category_name);

    const flipped = await apiCallRaw<CategoryRow>(page, 'PUT', `/asset-categories/${created.id}`, {
      is_active: false,
    });
    expect(flipped.is_active, 'is_active 可翻转为 false').toBe(false);
  });

  test('494-04 资产分类软删除：停用文案落库，详情仍可读且 is_active=false', async ({ page }) => {
    const created = await createCategory(page);
    const del = await apiCallRaw<string>(page, 'DELETE', `/asset-categories/${created.id}`);
    expect(del, '软删出参为停用文案').toContain('已停用');

    const detail = await apiCallRaw<CategoryRow>(page, 'GET', `/asset-categories/${created.id}`);
    expect(detail.id, '软删后详情仍可读').toBe(created.id);
    expect(detail.is_active, '软删置 is_active=false').toBe(false);

    const activeList = await apiCallRaw<PageEnvelope<CategoryRow>>(
      page,
      'GET',
      '/asset-categories?is_active=true&page=1&page_size=100'
    );
    expect(
      activeList.items.some(c => c.id === created.id),
      '活跃列表不再含停用分类'
    ).toBe(false);
  });

  test('494-05 资产分类列表分页夹紧口径：page 小于 1 夹到 1，page_size 超界夹到 100', async ({
    page,
  }) => {
    const clamped = await apiCallRaw<PageEnvelope<CategoryRow>>(
      page,
      'GET',
      '/asset-categories?page=0&page_size=500'
    );
    expect(clamped.page, 'page=0 夹到 1（不抛 400）').toBe(1);
    expect(clamped.page_size, 'page_size=500 夹到 100').toBe(100);
  });

  test('494-06 账龄档位建档回读与列表数组形状，仅活跃行且 sort_order 升序', async ({ page }) => {
    const low = await createAging(page, {
      grade_name: genCode('E2E-AG-L'),
      sort_order: 1,
      min_days: 0,
      max_days: 30,
    });
    const high = await createAging(page, {
      grade_name: genCode('E2E-AG-H'),
      sort_order: 9,
      min_days: 31,
      max_days: 60,
    });
    expect(low.min_days).toBe(0);
    expect(low.max_days).toBe(30);
    expect(low.is_active, '建档默认活跃').toBe(true);

    const list = await apiCallRaw<AgingRow[]>(page, 'GET', '/aging-grades');
    expect(Array.isArray(list), '账龄列表出参为数组').toBe(true);
    expect(
      list.every(g => g.is_active === true),
      '列表仅活跃行'
    ).toBe(true);
    const mine = list.filter(g => g.id === low.id || g.id === high.id);
    expect(mine.length, '两枚自建档位都在列表').toBe(2);
    expect(mine[0].id, 'sort_order 升序：小档位排前').toBe(low.id);
    expect(mine[1].id, 'sort_order 升序：大档位排后').toBe(high.id);
  });

  test('494-07 账龄档位详情按 id 取单行，悬空 id 判 404', async ({ page }) => {
    const created = await createAging(page);
    const detail = await apiCallRaw<AgingRow>(page, 'GET', `/aging-grades/${created.id}`);
    expect(detail.id, '详情取单行而非列表').toBe(created.id);
    expect(detail.grade_name).toBe(created.grade_name);

    const missing = await apiCallExpectFail(page, 'GET', `/aging-grades/${MISSING_ID}`);
    expectNotFound(missing, '账龄档位详情');
  });

  test('494-08 账龄档位部分更新与悬空 404', async ({ page }) => {
    const created = await createAging(page, { min_days: 0, max_days: 30 });
    const updated = await apiCallRaw<AgingRow>(page, 'PUT', `/aging-grades/${created.id}`, {
      max_days: 90,
      remark: 'E2E更新备注',
    });
    expect(updated.max_days, '提交字段覆盖').toBe(90);
    expect(updated.min_days, '缺席字段保持').toBe(0);
    expect(updated.remark).toBe('E2E更新备注');

    const missing = await apiCallExpectFail(page, 'PUT', `/aging-grades/${MISSING_ID}`, {
      max_days: 1,
    });
    expectNotFound(missing, '账龄档位更新');
  });

  test('494-09 账龄档位硬删除：出参文案，再删 404，列表回收', async ({ page }) => {
    const created = await createAging(page);
    const del = await apiCallRaw<string>(page, 'DELETE', `/aging-grades/${created.id}`);
    expect(del).toContain('删除成功');
    const idx = createdAgingIds.indexOf(created.id);
    if (idx >= 0) createdAgingIds.splice(idx, 1);

    const again = await apiCallExpectFail(page, 'DELETE', `/aging-grades/${created.id}`);
    expectNotFound(again, '账龄档位再删');
    const list = await apiCallRaw<AgingRow[]>(page, 'GET', '/aging-grades');
    expect(
      list.some(g => g.id === created.id),
      '硬删后列表不再含'
    ).toBe(false);
  });

  test('494-10 行业基准建档回读与列表数组形状，metric_value 为 DECIMAL 字符串', async ({
    page,
  }) => {
    const created = await createBenchmark(page, { metric_value: 55.5 });
    expect(created.benchmark_name).toBeTruthy();
    expect(created.metric_name).toBe('资产负债率');
    expect(Number(created.metric_value), '基准值落库').toBe(55.5);
    expect(created.unit).toBe('%');
    expect(created.data_year).toBe(2025);
    expect(created.is_active).toBe(true);

    const list = await apiCallRaw<BenchmarkRow[]>(page, 'GET', '/industry-benchmarks');
    expect(Array.isArray(list), '基准列表出参为数组').toBe(true);
    expect(
      list.every(b => b.is_active === true),
      '列表仅活跃行'
    ).toBe(true);
    expect(
      list.some(b => b.id === created.id),
      '列表应含本基准'
    ).toBe(true);
  });

  test('494-11 行业基准详情按 id 取单行，悬空 id 判 404', async ({ page }) => {
    const created = await createBenchmark(page);
    const detail = await apiCallRaw<BenchmarkRow>(
      page,
      'GET',
      `/industry-benchmarks/${created.id}`
    );
    expect(detail.id, '详情取单行而非列表').toBe(created.id);
    expect(detail.benchmark_name).toBe(created.benchmark_name);

    const missing = await apiCallExpectFail(page, 'GET', `/industry-benchmarks/${MISSING_ID}`);
    expectNotFound(missing, '行业基准详情');
  });

  test('494-12 行业基准部分更新与悬空 404', async ({ page }) => {
    const created = await createBenchmark(page, { metric_value: 50, data_year: 2024 });
    const updated = await apiCallRaw<BenchmarkRow>(
      page,
      'PUT',
      `/industry-benchmarks/${created.id}`,
      {
        metric_value: 60.25,
        data_year: 2025,
      }
    );
    expect(Number(updated.metric_value), '提交字段覆盖').toBe(60.25);
    expect(updated.data_year).toBe(2025);
    expect(updated.metric_name, '缺席字段保持').toBe('资产负债率');

    const missing = await apiCallExpectFail(page, 'PUT', `/industry-benchmarks/${MISSING_ID}`, {
      metric_value: 1,
    });
    expectNotFound(missing, '行业基准更新');
  });

  test('494-13 行业基准硬删除：出参文案，再删 404，列表回收', async ({ page }) => {
    const created = await createBenchmark(page);
    const del = await apiCallRaw<string>(page, 'DELETE', `/industry-benchmarks/${created.id}`);
    expect(del).toContain('删除成功');
    const idx = createdBenchmarkIds.indexOf(created.id);
    if (idx >= 0) createdBenchmarkIds.splice(idx, 1);

    const again = await apiCallExpectFail(page, 'DELETE', `/industry-benchmarks/${created.id}`);
    expectNotFound(again, '行业基准再删');
    const list = await apiCallRaw<BenchmarkRow[]>(page, 'GET', '/industry-benchmarks');
    expect(
      list.some(b => b.id === created.id),
      '硬删后列表不再含'
    ).toBe(false);
  });

  test('494-14 三面悬空 id 的修改与删除均判 404', async ({ page }) => {
    const legs: Array<{ method: 'PUT' | 'DELETE'; path: string; body?: Record<string, unknown> }> =
      [
        {
          method: 'PUT',
          path: `/asset-categories/${MISSING_ID}`,
          body: { category_name: 'E2E悬空' },
        },
        { method: 'DELETE', path: `/asset-categories/${MISSING_ID}` },
        { method: 'PUT', path: `/aging-grades/${MISSING_ID}`, body: { max_days: 1 } },
        { method: 'DELETE', path: `/aging-grades/${MISSING_ID}` },
        { method: 'PUT', path: `/industry-benchmarks/${MISSING_ID}`, body: { metric_value: 1 } },
        { method: 'DELETE', path: `/industry-benchmarks/${MISSING_ID}` },
      ];
    for (const leg of legs) {
      const res = await apiCallExpectFail(page, leg.method, leg.path, leg.body);
      expectNotFound(res, `${leg.method} ${leg.path}`);
    }
  });
});
