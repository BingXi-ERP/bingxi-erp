/**
 * 532 行业基准配置契约。
 *
 * 功能：钉住 GET /dashboard/industry-benchmark 的四项固定基准，防止看板基准被静默改动。
 * 调用方：经营看板基准对照；本用例只做 API 回归，不打开页面。
 * 入参：仅 loginViaUI 的 admin 会话，无 query、无 body、不造数。
 * 传给谁：请求经 flow/helpers 发出，路径相对前端 baseURL /api/v1/erp。
 * 存什么：不落库；响应必须逐字段等于 handler 的固定配置。
 * 存哪里：backend/src/handlers/dashboard_handler.rs:425-475 的 IndustryBenchmarkConfig。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:438，挂在 /dashboard/industry-benchmark。
 * 该端点是静态配置，不是 /industry-benchmarks 数据库写面；两者不可互相替代。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface IndustryBenchmark {
  metric: string;
  benchmark_value: number;
  unit: string;
  source: string;
}

interface IndustryBenchmarkConfig {
  industry: string;
  benchmarks: IndustryBenchmark[];
}

const EXPECTED: IndustryBenchmarkConfig = {
  industry: '纺织行业',
  benchmarks: [
    { metric: '库存周转率', benchmark_value: 6, unit: '次/年', source: '行业平均' },
    { metric: '应收账款周转率', benchmark_value: 8, unit: '次/年', source: '行业平均' },
    { metric: '毛利率', benchmark_value: 25, unit: '%', source: '行业平均' },
    { metric: '次品率', benchmark_value: 2, unit: '%', source: '行业平均' },
  ],
};

test('532-01 行业基准配置四项指标与行业逐字段回读不漂移', async ({ page }) => {
  await loginViaUI(page);
  const config = await apiCallRaw<IndustryBenchmarkConfig>(
    page,
    'GET',
    '/dashboard/industry-benchmark'
  );

  expect(config, '行业基准须逐字段等于后端固定配置').toEqual(EXPECTED);
  for (const benchmark of config.benchmarks) {
    expect(
      Object.keys(benchmark).sort(),
      `${benchmark.metric} 只允许 metric/benchmark_value/unit/source 四键`
    ).toEqual(['benchmark_value', 'metric', 'source', 'unit']);
  }
  expect(Object.keys(config).sort(), '配置只含 industry 与 benchmarks 两键').toEqual([
    'benchmarks',
    'industry',
  ]);
});
