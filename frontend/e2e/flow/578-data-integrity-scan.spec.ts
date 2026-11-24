// 脏数据定期巡检与报告端点用例（578）。
//
// 覆盖面。审计 4.38/4.39/4.24 判定唯一功能缺口＝只有写时门（validator /
// 重复编码拒绝 / 库存不足拒绝），没有存量巡检。本支补后端巡检服务
// data_integrity_scan_service.rs + 统一调度注册 + 可观测报告端点：
//   GET /scheduler/data-integrity/report    同步巡检并返回四类异常计数与样本
//
// 契约真相（逐段读后端源，非推测）。
// 出参 = DataIntegrityReport，字段 generated_at / scheduler_name / findings /
// total_count / sample_limit / repair_enabled / repairs_applied。findings 六条
// 覆盖四类口径（孤立明细两种、重复单据两种、负库存、金额为空），每条带
// category / entity / count / sample / remediation；count ≥0、sample ≤20，
// total_count 必须等于各条 count 之和（报告不得自相矛盾）。
// 自动修复默认关闭，报告端点是只读的；调度任务 data-integrity-scan 在
// /scheduler/jobs 清单中按配置启用，手动触发后执行历史落 trigger=manual 行，
// 证明"定时巡检任务确实注册并可执行"，而不只是挂了个读端点。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw } from './helpers';

type Row = Record<string, unknown>;

const REPORT_PATH = '/scheduler/data-integrity/report';
const SCAN_JOB = 'data-integrity-scan';
const CATEGORIES = ['orphan_detail', 'duplicate_document', 'negative_stock', 'empty_amount'];

test('578-01 巡检报告：六条口径覆盖四类且计数与样本自洽', async ({ page }) => {
  const data = await apiCallRaw<Row>(page, 'GET', REPORT_PATH);
  expect(typeof data, `报告应为对象，实际 ${JSON.stringify(data).slice(0, 200)}`).toBe('object');
  expect(data === null, '报告不得为 null').toBe(false);
  expect(
    data.scheduler_name,
    `任务名应为 ${SCAN_JOB}，实际 ${JSON.stringify(data.scheduler_name)}`
  ).toBe(SCAN_JOB);
  expect(
    Number.isNaN(Date.parse(String(data.generated_at))),
    `generated_at 应为可解析时间戳，实际 ${JSON.stringify(data.generated_at)}`
  ).toBe(false);

  const findings = data.findings;
  expect(Array.isArray(findings), 'findings 应为数组').toBe(true);
  const groups = findings as Row[];
  expect(
    groups.length,
    `巡检口径应覆盖六条（两类明细 + 两类单据 + 库存 + 金额），实际 ${groups.length}`
  ).toBe(6);

  let sum = 0;
  for (const g of groups) {
    expect(
      CATEGORIES.includes(String(g.category)),
      `category 应为四类之一，实际 ${JSON.stringify(g.category)}`
    ).toBe(true);
    expect(
      typeof g.entity === 'string' && String(g.entity).length > 0,
      'entity 应为非空字符串'
    ).toBe(true);
    expect(
      typeof g.count === 'number' && Number(g.count) >= 0,
      `count 应为非负整数，实际 ${JSON.stringify(g.count)}`
    ).toBe(true);
    expect(Array.isArray(g.sample), 'sample 应为数组').toBe(true);
    expect((g.sample as unknown[]).length, '样本条数不得超过 20').toBeLessThanOrEqual(20);
    expect(
      typeof g.remediation === 'string' && String(g.remediation).length > 0,
      'remediation 应给出修复指引'
    ).toBe(true);
    sum += Number(g.count);
  }
  for (const category of CATEGORIES) {
    expect(
      groups.some(g => g.category === category),
      `必须覆盖 ${category} 口径，实际 ${JSON.stringify(groups.map(g => g.category))}`
    ).toBe(true);
  }
  expect(data.total_count, `total_count 应等于各项之和 ${sum}`).toBe(sum);
  expect(
    typeof data.repair_enabled === 'boolean',
    `repair_enabled 应为布尔值，实际 ${JSON.stringify(data.repair_enabled)}`
  ).toBe(true);
  expect(
    typeof data.repairs_applied === 'number' && Number(data.repairs_applied) >= 0,
    `repairs_applied 应为非负整数，实际 ${JSON.stringify(data.repairs_applied)}`
  ).toBe(true);
});

test('578-02 调度注册：巡检任务在清单且手动触发留执行历史', async ({ page }) => {
  const jobs = await apiCallRaw<Row[]>(page, 'GET', '/scheduler/jobs');
  expect(Array.isArray(jobs), '任务清单应为数组').toBe(true);
  const names = (jobs as Row[]).map(j => String(j.name));
  expect(names, `任务清单必须含 ${SCAN_JOB}，实际 ${JSON.stringify(names)}`).toContain(SCAN_JOB);

  const triggered = await apiCallRaw<Row>(page, 'POST', `/scheduler/jobs/${SCAN_JOB}/trigger`);
  expect(
    triggered.scheduler_name,
    `触发回显应为 ${SCAN_JOB}，实际 ${JSON.stringify(triggered.scheduler_name)}`
  ).toBe(SCAN_JOB);

  const runs = await apiCallRaw<Row>(
    page,
    'GET',
    `/scheduler/jobs/runs?scheduler_name=${SCAN_JOB}`
  );
  const items = runs.items as Row[] | undefined;
  expect(Array.isArray(items), '执行历史 items 应为数组').toBe(true);
  expect(
    (items ?? []).some(r => r.scheduler_name === SCAN_JOB && r.trigger === 'manual'),
    `手动触发后应有 ${SCAN_JOB} 的 manual 执行历史，实际 ${JSON.stringify(items?.slice(0, 3))}`
  ).toBe(true);
});
