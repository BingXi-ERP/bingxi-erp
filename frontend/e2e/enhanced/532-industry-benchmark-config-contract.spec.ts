/**
 * 532 行业基准配置契约。
 *
 * 功能：钉住 GET /dashboard/industry-benchmark 的固定行业名与四项指标，防止看板基准值或键集合被静默改动。
 * 调用方：看板行业基准卡片；本用例只做 API 回归，不打开页面。
 * 入参：仅 loginViaUI 的 admin 会话，无 query、无 body、不造数、不清理。
 * 传给谁：请求经 flow/helpers 发出，路径相对前端 baseURL /api/v1/erp。
 * 存什么：响应不出参落库；必须与 handler 的固定配置逐字段相等。
 * 存哪里：backend/src/handlers/dashboard_handler.rs:425-476 的 IndustryBenchmarkConfig / IndustryBenchmark。
 *
 * 判据出处：路由在 frontend/scripts/route-snapshot.txt:438，挂在 /dashboard/industry-benchmark；
 * 四项指标按 库存周转率/应收账款周转率/毛利率/次品率 顺序固定，source 恒为 行业平均。
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
  benchmarks: IndustryBenchmark[];
  industry: string;
}

const EXPECTED: IndustryBenchmarkConfig = {
  benchmarks: [
    { metric: '库存周转率', benchmark_value: 6, unit: '次/年', source: '行业平均' },
    { metric: '应收账款周转率', benchmark_value: 8, unit: '次/年', source: '行业平均' },
    { metric: '毛利率', benchmark_value: 25, unit: '%', source: '行业平均' },
    { metric: '次品率', benchmark_value: 2, unit: '%', source: '行业平均' },
  ],
  industry: '纺织行业',
};

test('532-01 行业基准四项指标与行业及键集合逐字段回读不漂移', async ({ page }) => {
  await loginViaUI(page);
  const config = await apiCallRaw<IndustryBenchmarkConfig>(
    page,
    'GET',
    '/dashboard/industry-benchmark'
  );
  console.warn('[532] GET /dashboard/industry-benchmark 已返回，开始逐字段核对');

  expect(config, '行业基准配置须逐字段等于后端固定四项指标').toEqual(EXPECTED);
  for (const benchmark of config.benchmarks) {
    expect(
      Object.keys(benchmark).sort(),
      `${benchmark.metric} 只允许 benchmark_value/metric/source/unit 四键`
    ).toEqual(['benchmark_value', 'metric', 'source', 'unit']);
  }
  expect(Object.keys(config).sort(), '配置只含 benchmarks 与 industry 两键').toEqual([
    'benchmarks',
    'industry',
  ]);
});
