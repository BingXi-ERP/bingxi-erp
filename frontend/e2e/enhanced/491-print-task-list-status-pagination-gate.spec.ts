// 4.14 搜索筛选分页 + 4.25 错误码：打印任务列表状态词白名单与分页钳制。
// 后端判据：handlers/print_task_handler.rs:610-611 page 钳到 1..=1000、page_size 钳到 1..=200；
//   :622-627 status 外层 trim 后经 models/status/print.rs:14-37 的 print_task_status::is_valid
//   逐字符匹配 pending/queued/dispatched/succeeded/failed，越界即 AppError::bad_request
//   → 400 + BAD_REQUEST + 脱敏文案「请求参数错误」；:635-638 用 PaginatedResponse 装信封。
// 与既有覆盖分工：flow/79 只测 POST /print-tasks 受理与详情读回，全 e2e 无 GET /print-tasks
//   的状态白名单、trim 后合法性、分页上下界断言；本例纯 API 零造数。
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/print-tasks';
const ALL_STATUSES = ['pending', 'queued', 'dispatched', 'succeeded', 'failed'];

interface TaskPage {
  items?: unknown;
  total?: unknown;
  page?: unknown;
  page_size?: unknown;
}

async function rejectStatus(
  page: import('@playwright/test').Page,
  status: string,
  reason: string
): Promise<void> {
  const r = await apiCallExpectFail(page, 'GET', `${PATH}?status=${encodeURIComponent(status)}`);
  expect(r.status, `[491] ${reason} 须 400，实际 ${r.status}`).toBe(400);
  expect(
    failureCode(r),
    `[491] ${reason} 机器码须 BAD_REQUEST，实际 ${String(failureCode(r))}`
  ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  expect(String(r.message), `[491] ${reason} 须脱敏，实际 ${String(r.message)}`).toBe(
    '请求参数错误'
  );
}

test.describe('4.14 打印任务列表状态与分页门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('491-01 状态词逐字符白名单与外层 trim 合法性', async ({ page }) => {
    for (const status of ALL_STATUSES) {
      const r = await apiCall<TaskPage>(page, 'GET', `${PATH}?status=${status}`);
      expect(r.code, `[491] 合法状态 ${status} 须 200，实际 ${r.code}`).toBe(200);
      expect(
        Array.isArray(r.data.items),
        `[491] 合法状态 ${status} 须回 PaginatedResponse.items 数组`
      ).toBe(true);
      expect(
        Number(r.data.total),
        `[491] 合法状态 ${status} 须回 total，实际 ${String(r.data.total)}`
      ).toBeGreaterThanOrEqual(0);
    }

    const trimmed = await apiCall<TaskPage>(
      page,
      'GET',
      `${PATH}?status=${encodeURIComponent('  pending  ')}`
    );
    expect(trimmed.code, `[491] 外层空白 trim 后应命中 pending，实际 ${trimmed.code}`).toBe(200);

    await rejectStatus(page, 'Pending', '大小写变体');
    await rejectStatus(page, 'in_progress', '词表外状态');
    await rejectStatus(page, 'succeededX', '合法词追加字符');
  });

  test('491-02 页码与每页条数越界钳制到权威上下界', async ({ page }) => {
    const lower = await apiCall<TaskPage>(page, 'GET', `${PATH}?page=0&page_size=0`);
    expect(lower.code, `[491] 下界请求须 200，实际 ${lower.code}`).toBe(200);
    expect(Number(lower.data.page), '[491] page=0 须钳到 1').toBe(1);
    expect(Number(lower.data.page_size), '[491] page_size=0 须钳到 1').toBe(1);

    const upper = await apiCall<TaskPage>(page, 'GET', `${PATH}?page=1001&page_size=201`);
    expect(upper.code, `[491] 上界请求须 200，实际 ${upper.code}`).toBe(200);
    expect(Number(upper.data.page), '[491] page=1001 须钳到 1000').toBe(1000);
    expect(Number(upper.data.page_size), '[491] page_size=201 须钳到 200').toBe(200);
  });
});
