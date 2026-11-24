// 4.39 事务边界 E2E（端点级）— flow/576-import-mixed-batch-transaction
// 功能：批量导入 100 行含部分失败行时，imported/failed 计数守恒、errors 带行号、失败行零落库。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；100 行 data 全为内存构造，code 用唯一前缀避免撞库存量。
// 传给谁：POST /excel（import_type=customers，data 二维数组）→ 读 ImportResult{task_id,imported,failed,errors} →
//   GET /data-import/tasks/{task_id} 核对任务行成功/失败数 → GET /crm/customers?keyword= 回读成功行。
// 存什么：customers 行（成功行按 code 落库、重复 code 行不落）、import_tasks 一行（计数与结果）。
// 存哪里：customers 表；import_tasks 表。任务行按领域契约保留（无删除端点），客户按唯一前缀全量清理。
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
  task_id?: number;
  imported?: number;
  failed?: number;
  errors?: ImportError[];
}
interface TaskRow {
  id?: number;
  import_type?: string;
  status?: string;
  total_rows?: number;
  imported_rows?: number;
  failed_rows?: number;
}
interface TaskDetail {
  id?: number;
  status?: string;
  total_rows?: number;
  processed_rows?: number;
  success_rows?: number;
  failed_rows?: number;
}
interface CustomerRow {
  id: number;
  customer_code?: string;
}

let cleanupCodePrefix = '';

async function listImportedCustomers(page: Page, codePrefix: string): Promise<CustomerRow[]> {
  const response = await apiCallRaw<{ items?: CustomerRow[]; total?: number }>(
    page,
    'GET',
    `/crm/customers?keyword=${encodeURIComponent(codePrefix)}&page=1&page_size=100`
  );
  expect(Array.isArray(response.items), '客户列表必须返回 items').toBe(true);
  if (!Array.isArray(response.items)) {
    throw new Error('576 客户列表缺少 items，无法核对导入结果');
  }
  const rows = response.items.filter(item =>
    String(item.customer_code ?? '').startsWith(codePrefix)
  );
  expect(rows.length, '唯一前缀命中的客户必须一次全部回读').toBe(Number(response.total ?? -1));
  return rows;
}

test.afterEach(async ({ page }) => {
  if (!cleanupCodePrefix) return;
  const rows = await listImportedCustomers(page, cleanupCodePrefix);
  for (const row of rows) {
    await tryCleanup(page, 'DELETE', `/crm/customers/${row.id}`, `576 导入客户 ${row.id}`);
  }
  const remaining = await listImportedCustomers(page, cleanupCodePrefix);
  expect(remaining, '本轮导入客户必须全部清理').toHaveLength(0);
  cleanupCodePrefix = '';
});

test('576-01 百行混合批导入计数守恒且重复码失败行不落库', async ({ page }: { page: Page }) => {
  const tag = genCode('576A');
  cleanupCodePrefix = `C${tag}`;
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
  expect(
    typeof imported.task_id === 'number' &&
      Number.isSafeInteger(imported.task_id) &&
      imported.task_id > 0,
    '导入结果必须携带本次任务正整数主键'
  ).toBe(true);
  const taskId = Number(imported.task_id);

  // errors 须逐行点名行号（1-based），且指向重复 code 的那几行。
  const errs = imported.errors ?? [];
  expect(errs.length, `errors 条数须等于失败行数 ${failedCount}`).toBe(failedCount);
  for (const r of dupeRows) {
    expect(
      errs.some(e => Number(e.row) === r + 1),
      `errors 须含第 ${r + 1} 行（重复 code 行）的行号`
    ).toBe(true);
  }

  // 97 个唯一成功 code 必须逐项回读；重复 code 只允许一条，失败行不得额外落库。
  const expectedCodes = [...new Set(codes)].sort();
  const importedRows = await listImportedCustomers(page, cleanupCodePrefix);
  const actualCodes = importedRows.map(item => String(item.customer_code)).sort();
  expect(actualCodes, '成功行集合须与 97 个唯一 code 逐项相等').toEqual(expectedCodes);
  expect(importedRows.length, '重复 code 只能落库一次').toBe(total - dupeRows.length);
  expect(actualCodes.filter(code => code === codes[0]).length, '重复 code 只允许一条记录').toBe(1);

  // 任务身份只认导入响应回传的 task_id，不能按类型/行数猜中历史同规模任务。
  const tasks = await apiCallRaw<TaskRow[]>(page, 'GET', '/data-import/tasks');
  expect(Array.isArray(tasks), '任务列表出参须为裸数组').toBe(true);
  if (!Array.isArray(tasks)) {
    throw new Error('576 导入后任务列表形状异常，无法绑定本轮任务');
  }
  const listedTasks = tasks.filter(item => Number(item.id) === taskId);
  expect(listedTasks, `任务列表必须且只能包含本轮 task_id=${taskId}`).toHaveLength(1);
  const task = listedTasks[0];
  expect(task.import_type, '本轮任务类型须为 customers').toBe('customers');
  expect(task.status, '混合批任务必须为 partial').toBe('partial');
  expect(Number(task.total_rows), '任务 total_rows 须为 100').toBe(total);
  expect(Number(task.imported_rows), '任务 imported_rows 须与端点 imported 一致').toBe(
    importedCount
  );
  expect(Number(task.failed_rows), '任务 failed_rows 须与端点 failed 一致').toBe(failedCount);

  const detail = await apiCallRaw<TaskDetail>(page, 'GET', `/data-import/tasks/${taskId}`);
  expect(detail.id, '任务详情须按响应 task_id 精确回读').toBe(taskId);
  expect(detail.status, '任务详情状态须为 partial').toBe('partial');
  expect(Number(detail.total_rows), '任务详情总行数须为 100').toBe(total);
  expect(Number(detail.processed_rows), '任务详情已处理行数须守恒为 100').toBe(total);
  expect(Number(detail.success_rows), '任务详情成功行数须与端点一致').toBe(importedCount);
  expect(Number(detail.failed_rows), '任务详情失败行数须与端点一致').toBe(failedCount);
});
