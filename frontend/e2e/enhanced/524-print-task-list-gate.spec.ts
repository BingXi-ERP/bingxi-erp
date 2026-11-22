// 524 打印任务列表门：状态词表逐字符校验与分页边界钳制。
// 后端判据：backend/src/routes/mod.rs:326-335 挂 GET /print-tasks；
// handlers/print_task_handler.rs:605-637 先在 :622-625 对非空 status 调
// models/status/print.rs:14-36 的 print_task_status::is_valid（五值闭合、不转换大小写），
// 非法值返回 bad_request；合法值继续精确筛选；
// :610-611 把 page 钳制到 1..1000、page_size 钳制到 1..200，
// :635-637 按 PaginatedResponse{items,total,page,page_size} 单信封回包。
import { test, expect } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  APP_ERROR_CODES,
  loginViaUI,
} from '../flow/helpers';

interface PrintTaskListData {
  items?: Array<{ status?: unknown }>;
  total?: unknown;
  page?: unknown;
  page_size?: unknown;
}

const LEGAL_STATUSES = ['pending', 'queued', 'dispatched', 'succeeded', 'failed'] as const;
const ILLEGAL_STATUSES = ['Pending', 'in_progress', 'success'] as const;

function listPath(query: Record<string, string | number>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  return `/print-tasks?${params.toString()}`;
}

function expectEnvelope(data: PrintTaskListData, context: string): void {
  expect(Array.isArray(data.items), `${context} items 须数组`).toBe(true);
  expect(
    Number.isInteger(data.total) && Number(data.total) >= 0,
    `${context} total 须非负整数`
  ).toBe(true);
  expect(Number.isInteger(data.page) && Number(data.page) > 0, `${context} page 须正整数`).toBe(
    true
  );
  expect(
    Number.isInteger(data.page_size) && Number(data.page_size) > 0,
    `${context} page_size 须正整数`
  ).toBe(true);
}

test.describe('4.14 打印任务列表状态与分页门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('524-01 状态词表逐字符拒绝变体并放行五值', async ({ page }) => {
    for (const status of ILLEGAL_STATUSES) {
      const rejected = await apiCallExpectFail(page, 'GET', listPath({ status }));
      expect(rejected.status, `[524] 状态 ${status} 须 400`).toBe(400);
      expect(failureCode(rejected), `[524] 状态 ${status} 须 BAD_REQUEST`).toBe(
        APP_ERROR_CODES.BAD_REQUEST
      );
    }

    for (const status of LEGAL_STATUSES) {
      const data = await apiCallRaw<PrintTaskListData>(page, 'GET', listPath({ status }));
      expectEnvelope(data, `[524] 状态 ${status} 列表`);
      const items = data.items;
      if (!Array.isArray(items)) {
        throw new Error(`[524] status=${status} items 非数组，实际 ${JSON.stringify(data)}`);
      }
      for (const item of items) {
        expect(item.status, `[524] status=${status} 筛选结果不得混入其它状态`).toBe(status);
      }
    }
  });

  test('524-02 页码与每页条数按上下界钳制', async ({ page }) => {
    const lower = await apiCallRaw<PrintTaskListData>(
      page,
      'GET',
      listPath({ page: 0, page_size: 0 })
    );
    expectEnvelope(lower, '[524] 下界钳制列表');
    expect(lower.page, '[524] page=0 须钳到 1').toBe(1);
    expect(lower.page_size, '[524] page_size=0 须钳到 1').toBe(1);

    const upper = await apiCallRaw<PrintTaskListData>(
      page,
      'GET',
      listPath({ page: 1001, page_size: 201 })
    );
    expectEnvelope(upper, '[524] 上界钳制列表');
    expect(upper.page, '[524] page=1001 须钳到 1000').toBe(1000);
    expect(upper.page_size, '[524] page_size=201 须钳到 200').toBe(200);
  });
});
