// 4.39 索引与慢查询 E2E（端点级）— flow/575-slow-queries-endpoint-contract
// 功能：慢查询采集端点可触发刷新、列表返回合规分页结构；日期筛选用专用 PostgreSQL 样本验证边界。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；日期筛选样本仅写 slow_query_log，不改业务主档。
// 传给谁：POST /slow-queries/refresh 触发采集 → GET /slow-queries?page=1&page_size= 读列表 →
//   GET /slow-queries/stats 读统计结构（若路由存在）。
// 存什么：采集任务写入的慢查询，以及日期筛选专用样本（用例结束即删除）。
// 存哪里：slow_query_log 表（由采集任务落库）。
// 口径说明：报告明确"索引命中无覆盖但只端点级可立、不做数据库索引内部断言"；数据库编码与索引
//   由外部 PG 集群设定，仓库无 encoding 配置可验。CI 若未装 pg_stat_statements，列表与统计允许空集，
//   但分页信封与字段结构必须存在，不得空断言假绿。
//   后端判据：system.rs 注册 GET /slow-queries、POST /slow-queries/refresh、GET /slow-queries/stats
//   （无 /system 前缀）；SlowQueryListResponse{items,total,page,page_size}；
//   SlowQueryDto 含 query_text/execution_time_ms/calls/rows_examined/captured_at。
type PsqlExecOptions = {
  input: string;
  stdio: ['pipe', 'pipe', 'pipe'];
  env: Record<string, string | undefined>;
};
type NodeRuntime = {
  process: {
    mainModule: {
      require: (moduleName: string) => {
        execFileSync: (command: string, args: string[], options: PsqlExecOptions) => void;
        randomUUID: () => string;
      };
    } | null;
  };
};
const nodeRuntime = globalThis as unknown as NodeRuntime;
const { execFileSync } = nodeRuntime.process.mainModule!.require('node:child_process');
const { randomUUID } = nodeRuntime.process.mainModule!.require('node:crypto');
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
interface SlowQuerySummaryResponse {
  total_queries?: unknown;
  queries_today?: unknown;
  avg_execution_time?: unknown;
  max_execution_time?: unknown;
  most_frequent_query?: unknown;
  optimization_status?: {
    pending?: unknown;
    in_progress?: unknown;
    optimized?: unknown;
    ignored?: unknown;
  };
}
interface SlowQueryWeeklyReportResponse {
  week_start?: unknown;
  week_end?: unknown;
  total_queries?: unknown;
  new_queries?: unknown;
  optimized_queries?: unknown;
  avg_execution_time?: unknown;
  top_queries?: SlowQueryStat[];
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

function psqlExec(sql: string, variables: Record<string, string>): void {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new Error('[575] DATABASE_URL 未设置，无法创建日期筛选专用样本');
  }
  const dbUrl = new URL(rawUrl);
  const args = ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-f', '-'];
  for (const [key, value] of Object.entries(variables)) {
    args.push('-v', `${key}=${value}`);
  }
  const env = {
    ...process.env,
    PGHOST: dbUrl.hostname,
    PGPORT: dbUrl.port || '5432',
    PGUSER: decodeURIComponent(dbUrl.username),
    PGPASSWORD: decodeURIComponent(dbUrl.password),
    PGDATABASE: decodeURIComponent(dbUrl.pathname.slice(1)),
    PGCONNECT_TIMEOUT: '5',
    PGSSLMODE: dbUrl.searchParams.get('sslmode') ?? undefined,
  };
  execFileSync('psql', args, {
    input: sql,
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
}

test('575-01 慢查询刷新、列表与统计端点返回完整契约', async ({ page }: { page: Page }) => {
  // 未安装性能统计扩展时，采集端点必须明确返回零条与不可用提示；
  // 其他数据库故障原样失败，不能再用任意 DATABASE_ERROR 冒充环境降级。
  const refresh = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/slow-queries/refresh');
  expectNonNegativeInteger(refresh.inserted, '刷新插入条数');
  expect(typeof refresh.message === 'string' && refresh.message.length > 0, '刷新提示须非空').toBe(
    true
  );
  if (refresh.inserted === 0) {
    expect(refresh.message, '零条结果须明确区分无慢查询与采集能力不可用').toMatch(
      /未发现新的慢查询|暂不可用/
    );
  }

  // 列表端点：分页四键必须存在；items 为空允许，但结构不得缺失。
  const list = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    '/slow-queries?page=1&page_size=10'
  );
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

test('575-02 日期筛选接受 RFC 3339 并显式拒绝非法与倒置区间', async ({ page }: { page: Page }) => {
  const now = Date.now();
  const start = new Date(now - 60 * 60 * 1000).toISOString();
  const end = new Date(now + 60 * 60 * 1000).toISOString();
  const capturedIn = new Date(now).toISOString();
  const capturedOut = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const marker = `575-date-filter-${randomUUID()}`;
  const variables = {
    marker,
    captured_in: capturedIn,
    captured_out: capturedOut,
  };
  try {
    psqlExec(
      `INSERT INTO slow_query_log
         (query_text, execution_time_ms, calls, rows_examined, database_name, captured_at)
       VALUES
         (:'marker' || '-in', 575001, 1, 1, current_database(), :'captured_in'::timestamptz),
         (:'marker' || '-out', 575002, 1, 1, current_database(), :'captured_out'::timestamptz);`,
      variables
    );

    const filtered = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/slow-queries?start_time=${encodeURIComponent(start)}&end_time=${encodeURIComponent(end)}` +
        `&keyword=${encodeURIComponent(marker)}&page=1&page_size=10`
    );
    expect(Array.isArray(filtered.items), '日期筛选响应必须返回 items').toBe(true);
    if (!Array.isArray(filtered.items)) {
      throw new Error('575 日期筛选缺少 items，无法验证时间边界');
    }
    expectNonNegativeInteger(filtered.total, '日期筛选 total');
    expect(filtered.total, '区间内专用样本必须命中且区间外样本必须排除').toBe(1);
    const filteredItems = filtered.items as SlowQueryItem[];
    expect(
      filteredItems.map(item => item.query_text),
      '日期筛选只能返回区间内专用样本'
    ).toEqual([`${marker}-in`]);
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    for (const item of filteredItems) {
      const capturedMs = Date.parse(String(item.captured_at));
      expect(Number.isFinite(capturedMs), '日期筛选行采集时间须可解析').toBe(true);
      expect(capturedMs, '采集时间不得早于起始边界').toBeGreaterThanOrEqual(startMs);
      expect(capturedMs, '采集时间不得晚于截止边界').toBeLessThanOrEqual(endMs);
    }

    const invalidCases = [
      {
        query: 'start_time=2026-11-25',
        field: 'start_time',
        message: 'start_time 时间格式非法',
      },
      {
        query: 'end_time=not-a-time',
        field: 'end_time',
        message: 'end_time 时间格式非法',
      },
      {
        query: `start_time=${encodeURIComponent(end)}&end_time=${encodeURIComponent(start)}`,
        field: 'start_time',
        message: '起始时间不能晚于截止时间',
      },
    ];
    for (const item of invalidCases) {
      const failure = await apiCallExpectFail(page, 'GET', `/slow-queries?${item.query}`);
      expect(failure.status, `${item.field} 非法输入必须返回 HTTP 400`).toBe(400);
      expect(failure.code, `${item.field} 非法输入必须返回统一字符串错误码`).toBe(
        'VALIDATION_ERROR'
      );
      expect(failure.message, `${item.field} 错误消息必须点名真实原因`).toContain(item.message);
    }
  } finally {
    psqlExec(
      `DELETE FROM slow_query_log
       WHERE query_text IN (:'marker' || '-in', :'marker' || '-out');`,
      variables
    );
  }
});

test('575-03 摘要与周报按真实日志列聚合且优化状态匹配写入词表', async ({
  page,
}: {
  page: Page;
}) => {
  const marker = `575-summary-${randomUUID()}`;
  const variables = { marker };
  try {
    psqlExec(
      `INSERT INTO slow_query_log
         (query_text, execution_time_ms, calls, rows_examined, database_name, captured_at, optimization_status)
       VALUES
         (:'marker', 9000000000, 2, 10, current_database(), CURRENT_DATE + INTERVAL '12 hours', NULL),
         (:'marker', 8000000000, 3, 20, current_database(), CURRENT_DATE + INTERVAL '12 hours', 'resolved'),
         (:'marker', 7000000000, 4, 30, current_database(), CURRENT_DATE + INTERVAL '12 hours', 'wont_fix');`,
      variables
    );

    const summary = await apiCallRaw<SlowQuerySummaryResponse>(
      page,
      'GET',
      `/slow-queries/summary?keyword=${encodeURIComponent(marker)}`
    );
    expectNonNegativeInteger(summary.total_queries, '摘要总条数');
    expectNonNegativeInteger(summary.queries_today, '摘要今日条数');
    expect(summary.total_queries, '关键词摘要须只返回三条专用样本').toBe(3);
    expect(summary.queries_today, '三条专用样本须落在今日').toBe(3);
    expectFiniteNumber(summary.avg_execution_time, '摘要平均执行时间');
    expect(summary.avg_execution_time, '摘要平均执行时间须聚合三条样本').toBe(8000000000);
    expectFiniteNumber(summary.max_execution_time, '摘要最大执行时间');
    expect(summary.max_execution_time, '摘要最大执行时间须取三条样本最大值').toBe(9000000000);
    expect(summary.most_frequent_query, '关键词摘要最频繁查询须为专用样本').toBe(marker);
    expect(summary.optimization_status, '摘要须返回优化状态统计').toBeTruthy();
    expectNonNegativeInteger(summary.optimization_status?.pending, '摘要待处理数');
    expectNonNegativeInteger(summary.optimization_status?.in_progress, '摘要处理中数');
    expectNonNegativeInteger(summary.optimization_status?.optimized, '摘要已优化数');
    expectNonNegativeInteger(summary.optimization_status?.ignored, '摘要不修复数');
    expect(summary.optimization_status?.pending, '空状态样本须计入待处理').toBe(1);
    expect(summary.optimization_status?.in_progress, '无处理中样本时须为零').toBe(0);
    expect(summary.optimization_status?.optimized, 'resolved 样本须计入已优化').toBe(1);
    expect(summary.optimization_status?.ignored, 'wont_fix 样本须计入不修复').toBe(1);

    const weekly = await apiCallRaw<SlowQueryWeeklyReportResponse>(
      page,
      'GET',
      `/slow-queries/report/weekly?weeks=1&keyword=${encodeURIComponent(marker)}`
    );
    expect(
      typeof weekly.week_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekly.week_start)
    ).toBe(true);
    expect(typeof weekly.week_end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekly.week_end)).toBe(
      true
    );
    expectNonNegativeInteger(weekly.total_queries, '周报总条数');
    expectNonNegativeInteger(weekly.new_queries, '周报新增条数');
    expectNonNegativeInteger(weekly.optimized_queries, '周报已优化条数');
    expect(weekly.total_queries, '关键词周报须只返回三条专用样本').toBe(3);
    expect(weekly.new_queries, '周报新增须包含空状态样本').toBe(1);
    expect(weekly.optimized_queries, '周报已优化须包含 resolved 样本').toBe(1);
    expectFiniteNumber(weekly.avg_execution_time, '周报平均执行时间');
    expect(weekly.avg_execution_time, '周报平均执行时间须聚合三条样本').toBe(8000000000);
    expect(Array.isArray(weekly.top_queries), '周报须返回 TOP 查询数组').toBe(true);
    if (!Array.isArray(weekly.top_queries)) {
      throw new Error('575 周报缺少 top_queries 数组，无法验证聚合');
    }
    expect(weekly.top_queries, '关键词周报 TOP 须只包含专用样本').toHaveLength(1);
    const grouped = weekly.top_queries[0];
    expect(grouped?.query_text, '周报 TOP 查询文本须为专用样本').toBe(marker);
    expectFiniteNumber(grouped?.max_exec_time_ms, '周报 TOP 最大执行时间');
    expect(grouped?.max_exec_time_ms, '周报 TOP 取样本最大执行时间').toBe(9000000000);
    expectNonNegativeInteger(grouped?.total_calls, '周报 TOP 累计调用数');
    expect(grouped?.total_calls, '周报 TOP 累计调用数须聚合三条样本').toBe(9);
    expectFiniteNumber(grouped?.avg_rows, '周报 TOP 平均扫描行数');
    expect(grouped?.avg_rows, '周报 TOP 平均扫描行数须聚合三条样本').toBe(20);
    expectNonNegativeInteger(grouped?.sample_count, '周报 TOP 样本数');
    expect(grouped?.sample_count, '周报 TOP 样本数须为三条').toBe(3);

    for (const weeks of [0, 400000, 5201]) {
      const invalidWeeks = await apiCallExpectFail(
        page,
        'GET',
        `/slow-queries/report/weekly?weeks=${weeks}`
      );
      expect(invalidWeeks.status, `周数 ${weeks} 必须显式返回 HTTP 400`).toBe(400);
      expect(invalidWeeks.code, `周数 ${weeks} 必须返回统一字符串错误码`).toBe('VALIDATION_ERROR');
      expect(invalidWeeks.message, `周数 ${weeks} 错误消息须点名真实原因`).toContain(
        'weeks 必须在 1 到 5200 之间'
      );
    }
  } finally {
    psqlExec("DELETE FROM slow_query_log WHERE query_text = :'marker';", variables);
  }
});
