// 4.39 索引与慢查询 E2E（端点级）— flow/575-slow-queries-endpoint-contract
// 功能：慢查询采集端点可触发刷新、列表返回合规分页结构；不做数据库索引内部断言。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；只读端点，不改业务主档。
// 传给谁：POST /slow-queries/refresh 触发采集 → GET /slow-queries?page=1&page_size= 读列表 →
//   GET /slow-queries/stats 读统计结构（若路由存在）。
// 存什么：不自建数据；仅触发采集任务向 slow_query 表写入（数据来自 pg_stat_statements）。
// 存哪里：slow_query 表（由采集任务落库）。
// 口径说明：报告明确"索引命中无覆盖但只端点级可立、不做数据库索引内部断言"；数据库编码与索引
//   由外部 PG 集群设定，仓库无 encoding 配置可验。CI 若未装 pg_stat_statements，列表与统计允许空集，
//   但分页信封与字段结构必须存在，不得空断言假绿。
//   后端判据：system.rs 注册 GET /slow-queries、POST /slow-queries/refresh、GET /slow-queries/stats
//   （无 /system 前缀）；SlowQueryListResponse{items,total,page,page_size}；
//   SlowQueryDto 含 query_text/execution_time_ms/calls/rows_examined/captured_at。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCallExpectFail, apiCallRaw } from './helpers';

interface SlowQueryItem {
  id?: unknown;
  query_text?: unknown;
  execution_time_ms?: unknown;
  calls?: unknown;
  rows_examined?: unknown;
  captured_at?: unknown;
}
interface SlowQueryStat {
  query_text?: unknown;
  max_exec_time_ms?: unknown;
  total_calls?: unknown;
  avg_rows?: unknown;
  sample_count?: unknown;
}

function expectNonNegativeInteger(value: unknown, label: string): void {
  expect(
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0,
    `${label} 必须为非负整数`
  ).toBe(true);
}

function expectFiniteNumber(value: unknown, label: string): void {
  expect(typeof value === 'number' && Number.isFinite(value), `${label} 必须为有限数值`).toBe(true);
}

test('575-01 慢查询刷新、列表与统计端点返回完整契约', async ({ page }: { page: Page }) => {
  // 仅放行采集端点的 DATABASE_ERROR 环境态；公开错误信封固定脱敏，不能要求内部扩展名。
  // 后续列表与统计仍须成功，数据库整体不可用或业务表缺失会由这两腿判红。
  const refresh = await apiCallExpectFail(page, 'POST', '/slow-queries/refresh');
  const envDegraded = refresh.code === 'DATABASE_ERROR';
  if (envDegraded) {
    expect(refresh.status, '采集端点数据库错误须保留原始 HTTP 500').toBe(500);
    console.warn('[575] 慢查询采集端点数据库错误降级，继续验证列表与统计可用性');
  } else {
    expect(String(refresh.code), '刷新端点成功态须返回 success 信封 code=200').toBe('200');
    expect(refresh.status, '刷新成功态 HTTP 须 200').toBe(200);
    const data = refresh.data;
    expect(data && typeof data === 'object' && !Array.isArray(data), '刷新响应须含 data 对象').toBe(
      true
    );
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('575 刷新响应缺少 data 对象，无法验证采集结果');
    }
    const result = data as Record<string, unknown>;
    expectNonNegativeInteger(result.inserted, '刷新插入条数');
    expect(typeof result.message === 'string' && result.message.length > 0, '刷新提示须非空').toBe(
      true
    );
  }

  // 列表端点：分页四键必须存在；items 为空允许，但结构不得缺失。
  const listRequest = page.waitForRequest(r => /\/slow-queries\?/.test(r.url()));
  const list = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    '/slow-queries?page=1&page_size=10'
  );
  const url = new URL((await listRequest).url());
  expect(url.searchParams.get('page'), '列表请求须真实下发 page 参数').toBe('1');
  expect(url.searchParams.get('page_size'), '列表请求须真实下发 page_size 参数').toBe('10');
  expect(Array.isArray(list.items), 'list.items 须为数组').toBe(true);
  if (!Array.isArray(list.items)) {
    throw new Error('575 列表缺少 items 数组，无法验证慢查询行');
  }
  expectNonNegativeInteger(list.total, 'list.total');
  expect(list.page, 'list.page 须回显请求页码 1').toBe(1);
  expect(list.page_size, 'list.page_size 须回显请求页大小 10').toBe(10);

  const items = list.items as SlowQueryItem[];
  expect(items.length, '当前页条数不得超过 total').toBeLessThanOrEqual(Number(list.total));
  for (const item of items) {
    expectNonNegativeInteger(item.id, '慢查询行 id');
    expect(
      typeof item.query_text === 'string' && item.query_text.length > 0,
      'SQL 文本须非空'
    ).toBe(true);
    expectFiniteNumber(item.execution_time_ms, '慢查询平均执行时间');
    expectNonNegativeInteger(item.calls, '慢查询调用次数');
    expectNonNegativeInteger(item.rows_examined, '慢查询扫描行数');
    expect(
      typeof item.captured_at === 'string' && !Number.isNaN(Date.parse(item.captured_at)),
      '采集时间须为可解析时间'
    ).toBe(true);
  }
  if (items.length === 0) {
    console.warn('[575] 慢查询列表为空，仍已验证分页信封与统计契约');
  }

  const stats = await apiCallRaw<Record<string, unknown>>(page, 'GET', '/slow-queries/stats');
  expect(Array.isArray(stats.top10), 'stats.top10 须为数组').toBe(true);
  if (!Array.isArray(stats.top10)) {
    throw new Error('575 统计缺少 top10 数组，无法验证聚合结构');
  }
  expectNonNegativeInteger(stats.total_count, 'stats.total_count');
  expect(
    typeof stats.time_range === 'string' && stats.time_range.length > 0,
    '统计时间范围须非空'
  ).toBe(true);
  expect(stats.top10.length, 'TOP 10 最多返回 10 组').toBeLessThanOrEqual(10);
  expect(stats.top10.length, 'TOP 10 条数不得超过近七天样本总数').toBeLessThanOrEqual(
    Number(stats.total_count)
  );
  let previousMax = Number.POSITIVE_INFINITY;
  for (const item of stats.top10 as SlowQueryStat[]) {
    expect(
      typeof item.query_text === 'string' && item.query_text.length > 0,
      '聚合 SQL 文本须非空'
    ).toBe(true);
    expectFiniteNumber(item.max_exec_time_ms, '聚合最大执行时间');
    expect(Number(item.max_exec_time_ms), '采样行的最大执行时间必须为正').toBeGreaterThan(0);
    expect(Number(item.max_exec_time_ms), 'TOP 10 须按最大执行时间降序').toBeLessThanOrEqual(
      previousMax
    );
    previousMax = Number(item.max_exec_time_ms);
    expectNonNegativeInteger(item.total_calls, '聚合调用次数');
    expect(Number(item.total_calls), '采样行的累计调用次数必须为正').toBeGreaterThan(0);
    expectFiniteNumber(item.avg_rows, '聚合平均扫描行数');
    expectNonNegativeInteger(item.sample_count, '聚合样本数');
    expect(Number(item.sample_count), '采样行必须至少有一个样本').toBeGreaterThan(0);
  }
});
