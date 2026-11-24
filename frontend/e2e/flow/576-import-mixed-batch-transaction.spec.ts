// 4.39 事务边界 E2E（端点级）— flow/576-import-mixed-batch-transaction
// 功能：批量导入 100 行含部分失败行时，imported/failed 计数守恒、errors 带行号、失败行零落库。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；100 行 data 全为内存构造，code 用唯一前缀避免撞库存量。
// 传给谁：POST /excel（import_type=customers，data 二维数组）→ 读 ImportResult{imported,failed,errors} →
//   GET /data-import/tasks 核对任务行 imported_rows/failed_rows → GET /crm/customers?keyword= 回读成功行。
// 存什么：customers 行（成功行按 code 落库、重复 code 行不落）、data_import_tasks 一行（计数与结果）。
// 存哪里：customers 表；data_import_tasks 表。
// 口径说明：报告认定 122/126 已覆盖导入任务生命周期、错误日志与零落库负例，本例只补报告点名的
//   "端点级混合批 imported+failed=100、errors 含行索引、成功行可回读、失败行零落库"空缺面。
//   后端判据：import_data 逐行 import_customer_row，无整批事务，逐行 record_import_result 累积计数；
//   customers 模板列序 code/name/contact/phone，前两列必填；重复 code 在 service 层 business 拒绝，
//   是能穿过 handler 层 validate_import_data 全量校验、又触发逐行部分失败的可控输入。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCallRaw, genCode, tryCleanup } from './helpers';

interface ImportError {
  row?: number;
  field?: string | null;
  message?: string;
}
interface ImportResult {
  imported?: number;
  failed?: number;
  errors?: ImportError[];
}
interface TaskRow {
  id?: number;
  import_type?: string;
  total_rows?: number;
  imported_rows?: number;
  failed_rows?: number;
}
interface CustomerRow {
  id: number;
  customer_code?: string;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test('576-01 百行混合批导入计数守恒且重复码失败行不落库', async ({ page }: { page: Page }) => {
  const tag = genCode('576A');
  const total = 100;
  // 97 个唯一 code + 3 行重复第 1 行 code：重复码在 service 层被拒，走逐行部分失败路径。
  const codes = Array.from({ length: total }, (_, i) => `C${tag}${String(i).padStart(3, '0')}`);
  const dupeRows = [40, 70, 90];
  for (const r of dupeRows) codes[r] = codes[0];
  const data = codes.map((code, i) => [code, `客户${tag}第${i}行`, `联系人${i}`, '']);

  const imported = await apiCallRaw<ImportResult>(page, 'POST', '/excel', {
    import_type: 'customers',
    data,
  });
  const importedCount = Number(imported.imported ?? -1);
  const failedCount = Number(imported.failed ?? -1);
  expect(importedCount, `成功行须为 97，实际 ${importedCount}`).toBe(total - dupeRows.length);
  expect(failedCount, `失败行须为 ${dupeRows.length}，实际 ${failedCount}`).toBe(dupeRows.length);
  expect(importedCount + failedCount, 'imported+failed 须守恒为总行数 100').toBe(total);

  // errors 须逐行点名行号（1-based），且指向重复 code 的那几行。
  const errs = imported.errors ?? [];
  expect(errs.length, `errors 条数须等于失败行数 ${failedCount}`).toBe(failedCount);
  for (const r of dupeRows) {
    expect(
      errs.some(e => Number(e.row) === r + 1),
      `errors 须含第 ${r + 1} 行（重复 code 行）的行号`
    ).toBe(true);
  }

  // 成功行可回读：取首个唯一 code 必在客户列表；失败行（重复 code）不额外落库，
  // 该 code 只对应原来那一行，重复提交未产生第二条。
  const okCode = codes[1];
  const okList = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    `/crm/customers?keyword=${encodeURIComponent(okCode)}&page=1&page_size=20`
  );
  const okRows = (okList.items ?? []).filter(r => r.customer_code === okCode);
  expect(okRows.length, '成功导入的 code 须可回读').toBe(1);
  for (const r of okRows) {
    CLEANUP.push({ path: `/crm/customers/${r.id}`, label: `576 成功行 ${r.id}` });
  }

  const dupeCode = codes[0];
  const dupeList = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    `/crm/customers?keyword=${encodeURIComponent(dupeCode)}&page=1&page_size=20`
  );
  const dupeRowsFound = (dupeList.items ?? []).filter(r => r.customer_code === dupeCode);
  expect(dupeRowsFound.length, '重复 code 只落库一次，3 行失败不得产生额外行（失败行零落库）').toBe(
    1
  );
  for (const r of dupeRowsFound) {
    CLEANUP.push({ path: `/crm/customers/${r.id}`, label: `576 重复码原行 ${r.id}` });
  }

  // 任务行计数与端点返回一致（122/126 只覆盖任务生命周期，这里只核对混合批计数面）。
  // 出参形状以 handler 为准：list_import_tasks 返回 ApiResponse<Vec<ImportTaskItem>>
  // （裸数组、按 created_at 倒序最近 100 行），不是分页信封；用分页键读会恒 undefined 假红。
  const tasks = await apiCallRaw<TaskRow[]>(page, 'GET', '/data-import/tasks?page=1&page_size=100');
  expect(Array.isArray(tasks), '任务列表出参须为裸数组').toBe(true);
  const task = (Array.isArray(tasks) ? tasks : []).find(
    t => t.import_type === 'customers' && Number(t.total_rows) === total
  );
  expect(task, '应存在本次 100 行导入任务行').toBeDefined();
  if (task) {
    expect(Number(task.imported_rows), '任务 imported_rows 须与端点 imported 一致').toBe(
      importedCount
    );
    expect(Number(task.failed_rows), '任务 failed_rows 须与端点 failed 一致').toBe(failedCount);
  }
});
