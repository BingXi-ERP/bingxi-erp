// 全局搜索文档类型面用例（518）。
//
// 覆盖面。GET /search/doc-types（routes/mod.rs 挂载 /api/v1/erp/search/doc-types，
// handler search_api::list_doc_types）曾对 19 类业务域宣称可搜，而真实同步写点
// 只有 customers/products/sales_orders 三域，其余类型 doc_count 恒 0——页面与
// 健康探针都只会看到"类型存在"，看不到"搜不到任何文档"的名实差。本文件钉住
// 撤注册后的名实一致契约：类型集合恰为三域、每类带中文描述与索引名、doc_count
// 为非负整数；配合三个真实搜索端点的空查询成功信封，防注册集合回涨。
//
// 契约真相（逐段读后端源，非推测）。
// 出参 = ApiResponse<Vec<serde_json::Value>>，每项键：type（Debug 形式的变体名，
// 如 "SalesOrder"）、index（索引名字符串）、desc_zh（中文描述）、doc_count（数值）。
// doc_count 来自 search_client.doc_count(index)，CI 未配 ELASTICSEARCH_URL 时
// 走进程内 mock 存储（container/mod.rs init_search_client），空库返回 0 属合法值，
// 故只断非负整数不断非零。三个搜索端点空查询返回 {total, took_ms, hits} 三键
// 信封，hits 为数组。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw } from './helpers';

type Row = Record<string, unknown>;

const DOC_TYPES = ['sales_orders', 'customers', 'products'];

test('518-01 doc-types 类型集合恰为三个真实同步域', async ({ page }) => {
  const data = await apiCallRaw<Array<Row>>(page, 'GET', '/search/doc-types');
  expect(
    Array.isArray(data),
    `doc-types 出参应为数组，实际 ${JSON.stringify(data).slice(0, 200)}`
  ).toBe(true);
  expect(
    data.map(t => String(t.index)).sort(),
    '注册索引集合必须恰为三同步域（多注册即假可供性回涨）'
  ).toEqual([...DOC_TYPES].sort());
  for (const t of data) {
    expect(
      typeof t.doc_count === 'number' && t.doc_count >= 0,
      `索引 ${String(t.index)} 的 doc_count 应为非负整数，实际 ${JSON.stringify(t.doc_count)}`
    ).toBe(true);
    expect(
      typeof t.desc_zh === 'string' && t.desc_zh.length > 0,
      `索引 ${String(t.index)} 的中文描述应非空，实际 ${JSON.stringify(t.desc_zh)}`
    ).toBe(true);
    expect(
      typeof t.type === 'string' && t.type.length > 0,
      `索引 ${String(t.index)} 的 type 键应为非空字符串，实际 ${JSON.stringify(t.type)}`
    ).toBe(true);
  }
});

test('518-02 三个搜索端点空查询回成功信封三键', async ({ page }) => {
  for (const path of ['/search/sales-orders', '/search/customers', '/search/products']) {
    const resp = await apiCallRaw<Row>(page, 'GET', `${path}?q=`);
    expect(
      typeof resp.total === 'number',
      `${path} 出参 total 应为数值，实际 ${JSON.stringify(resp).slice(0, 150)}`
    ).toBe(true);
    expect(
      typeof resp.took_ms === 'number',
      `${path} 出参 took_ms 应为数值，实际 ${JSON.stringify(resp.took_ms)}`
    ).toBe(true);
    expect(
      Array.isArray(resp.hits),
      `${path} 出参 hits 应为数组，实际 ${JSON.stringify(resp.hits).slice(0, 100)}`
    ).toBe(true);
  }
});
