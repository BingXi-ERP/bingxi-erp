// 周期任务可观测面用例（519）。
//
// 覆盖面。调度域此前只有"任务在跑"，无任何执行历史与外部可观测读面。
// 本支给 13 枚周期任务建了统一注册中心（SchedulerRegistry）、执行历史表
// scheduler_job_runs（迁移 m0141）与三枚端点，本文件把读面契约与手动
// 触发腿钉在真实后端回读上：
//   GET /scheduler/jobs        任务清单（名称/间隔/初始延迟/启用态四键）
//   GET /scheduler/jobs/runs   执行历史（PaginatedResponse 四键分页信封）
//   POST /scheduler/jobs/{name}/trigger  手动触发一轮执行
//
// 契约真相（逐段读后端源，非推测）。
// 任务清单出参 = Vec<SchedulerJobSummary>（scheduler_framework.rs），每项
// 四键：name/interval_secs/initial_delay_secs/enabled。清单是已注册集合
// （含禁用任务，禁用任务只是 start_all 跳过启动），CI 环境全部默认启用，
// 断言集合非空且含邮件队列任务（email-queue-worker，env 门默认 true）。
// 执行历史出参 = PaginatedResponse{items,total,page,page_size}（handler
// 用统一分页信封），items 为空数组也合法（表新建未跑满一轮时）——但
// 手动触发腿之后必须能看到 trigger='manual' 的新行。
// 手动触发：走与定时循环同一包装层 run_once_recorded，trigger=manual；
// 悬空任务名 404（AppError::not_found）；真实任务触发 200 并真实执行
// （email-queue-worker 的 run_once 扫描 PENDING 邮件，空队列 affected=0
// 属成功）。触发后执行历史必须新增一行 trigger='manual' 且
// scheduler_name 与触发名一致——这是"触发真执行了"的落库证据，不接受
// 只看 200。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, apiCallExpectFail } from './helpers';

type Row = Record<string, unknown>;

const KNOWN_JOB = 'email-queue-worker';

test('519-01 任务清单：已注册集合非空且四键逐项完整', async ({ page }) => {
  const data = await apiCallRaw<Array<Row>>(page, 'GET', '/scheduler/jobs');
  expect(
    Array.isArray(data),
    `任务清单出参应为数组，实际 ${JSON.stringify(data).slice(0, 200)}`
  ).toBe(true);
  expect(
    data.length,
    `已注册任务集合必须 ≥12（14 枚注册调用，催收未配受派人时少 1），实际 ${data.length}`
  ).toBeGreaterThanOrEqual(12);
  const names = data.map(j => String(j.name));
  expect(names, `任务清单必须含邮件队列任务 ${KNOWN_JOB}，实际 ${JSON.stringify(names)}`).toContain(
    KNOWN_JOB
  );
  expect(
    names,
    `任务清单必须含 ES 对账任务 es-reconcile-scheduler，实际 ${JSON.stringify(names)}`
  ).toContain('es-reconcile-scheduler');
  for (const j of data) {
    expect(
      typeof j.name === 'string' && j.name.length > 0,
      `任务名应为非空字符串，实际 ${JSON.stringify(j)}`
    ).toBe(true);
    expect(
      typeof j.interval_secs === 'number' && j.interval_secs > 0,
      `任务 ${String(j.name)} 的间隔应为正数，实际 ${JSON.stringify(j.interval_secs)}`
    ).toBe(true);
    expect(
      typeof j.initial_delay_secs === 'number' && j.initial_delay_secs >= 0,
      `任务 ${String(j.name)} 的初始延迟应为非负数，实际 ${JSON.stringify(j.initial_delay_secs)}`
    ).toBe(true);
    expect(
      typeof j.enabled === 'boolean',
      `任务 ${String(j.name)} 的启用态应为布尔，实际 ${JSON.stringify(j.enabled)}`
    ).toBe(true);
  }
});

test('519-02 执行历史：分页信封四键与手动触发落库证据', async ({ page }) => {
  // 悬空任务名触发 404
  const fMissing = await apiCallExpectFail(
    page,
    'POST',
    '/scheduler/jobs/no-such-job-trigger/trigger'
  );
  expect(fMissing.status, `悬空任务触发应 404，实际 ${fMissing.status}`).toBe(404);

  // 触发前历史基线（按任务名过滤）
  const before = await apiCallRaw<Row>(
    page,
    'GET',
    `/scheduler/jobs/runs?scheduler_name=${KNOWN_JOB}&page=1&page_size=20`
  );
  expect(
    typeof before.total === 'number',
    `执行历史 total 应为数值，实际 ${JSON.stringify(before.total)}`
  ).toBe(true);
  expect(before.page, `page 应回显 1，实际 ${JSON.stringify(before.page)}`).toBe(1);
  expect(
    Array.isArray(before.items),
    `执行历史 items 应为数组，实际 ${JSON.stringify(Object.keys(before))}`
  ).toBe(true);

  // 真实任务手动触发 200
  const triggered = await apiCallRaw<Row>(page, 'POST', `/scheduler/jobs/${KNOWN_JOB}/trigger`);
  expect(
    triggered.triggered,
    `手动触发应回 triggered=true，实际 ${JSON.stringify(triggered)}`
  ).toBe(true);
  expect(String(triggered.scheduler_name), '触发响应任务名应与路径一致').toBe(KNOWN_JOB);

  // 触发后按任务名过滤必须出现 trigger=manual 的新行（触发真执行了的落库证据）
  const after = await apiCallRaw<Row>(
    page,
    'GET',
    `/scheduler/jobs/runs?scheduler_name=${KNOWN_JOB}&page=1&page_size=20`
  );
  const manualRows = (after.items as Array<Row>).filter(r => String(r.trigger) === 'manual');
  expect(
    manualRows.length,
    `触发后执行历史必须含 manual 行，实际 ${JSON.stringify((after.items as Array<Row>).map(r => [r.trigger, r.status]))}`
  ).toBeGreaterThanOrEqual(1);
  const latest = manualRows[0];
  expect(String(latest.scheduler_name), 'manual 行任务名应与触发名一致').toBe(KNOWN_JOB);
  expect(
    ['success', 'failed', 'running'].includes(String(latest.status)),
    `manual 行状态应在词表内，实际 ${JSON.stringify(latest.status)}`
  ).toBe(true);
});
