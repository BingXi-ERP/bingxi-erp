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
import { apiCall, apiCallRaw } from './helpers';

interface SlowQueryItem {
  id?: unknown;
  query_text?: unknown;
  execution_time_ms?: unknown;
  calls?: unknown;
  rows_examined?: unknown;
  captured_at?: unknown;
}

test('575-01 慢查询刷新与列表端点返回分页信封与字段结构', async ({ page }: { page: Page }) => {
  // 刷新端点：合法响应须为 success 信封；未装 pg_stat_statements 时 message 会提示不可用，
  // 但端点本身须可达且不抛 5xx（采集缺依赖属环境态，不是端点契约失败）。
  const refresh = await apiCall<{ inserted?: unknown; message?: unknown }>(
    page,
    'POST',
    '/slow-queries/refresh'
  );
  expect(refresh.code, '刷新端点须返回 success 信封 code=200').toBe(200);

  // 列表端点：分页四键必须存在；items 为空允许（CI 无慢查询数据），结构不得缺失。
  const list = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    '/slow-queries?page=1&page_size=10'
  );
  expect(Array.isArray(list.items), 'list.items 须为数组').toBe(true);
  expect(Number.isFinite(Number(list.total)), 'list.total 须为数值').toBe(true);
  expect(Number(list.page), 'list.page 须回显请求页码 1').toBe(1);
  expect(Number(list.page_size), 'list.page_size 须回显请求页大小 10').toBe(10);

  // 若采集到行，逐字段核对 DTO 结构存在，做到有数据即验、空数据不假绿。
  const items = (list.items ?? []) as SlowQueryItem[];
  if (items.length > 0) {
    const first = items[0];
    expect('query_text' in first, '慢查询行须含 query_text').toBe(true);
    expect('execution_time_ms' in first, '慢查询行须含 execution_time_ms').toBe(true);
    expect('calls' in first, '慢查询行须含 calls').toBe(true);
    expect('rows_examined' in first, '慢查询行须含 rows_examined').toBe(true);
    expect('captured_at' in first, '慢查询行须含 captured_at').toBe(true);
    const req = page.waitForRequest(r => /\/slow-queries\?/.test(r.url()));
    await apiCallRaw(page, 'GET', '/slow-queries?page=1&page_size=10');
    const url = new URL((await req).url());
    expect(url.searchParams.get('page'), '列表请求须真实下发 page 参数').toBe('1');
    expect(url.searchParams.get('page_size'), '列表请求须真实下发 page_size 参数').toBe('10');
  } else {
    console.warn(
      '[575] 慢查询列表为空（CI 未装 pg_stat_statements 或未采集到阈值查询），按报告口径允许空集'
    );
  }
});
