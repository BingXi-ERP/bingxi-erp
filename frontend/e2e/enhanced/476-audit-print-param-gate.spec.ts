// 4.25 错误码与提示文案 + 4.33 审计合规：打印审计埋点端点字段边界门。
// 后端判据：handlers/audit_log_handler.rs:851-858 RecordPrintEventRequest 四字段；
//   :873-891 record_print_event 用 chars().count() 校验：
//   resource_type 1-64 字符、title 1-200 字符、record_count>=0、resource_id<=64 字符；
//   越界一律 AppError::validation_displayable（400 + VALIDATION_ERROR，文案点名字段与范围）。
//   关键判据：用 chars().count() 而非 String::len()——中文 1 字按 1 计，不按 UTF-8 3 字节收紧。
// 与既有覆盖分工：全仓 e2e 无 record-print 命中；本例专补该埋点端点的字段边界零覆盖点。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/audit-logs/record-print';
const base = { resource_type: 'customer', title: 'E2E476 打印', record_count: 1 };

async function reject(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
  field: string
) {
  const r = await apiCallExpectFail(page, 'POST', PATH, body);
  expect(r.status, `[476] ${field} 越界须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[476] ${field} 越界机器码须 VALIDATION_ERROR`).toBe(
    APP_ERROR_CODES.VALIDATION_ERROR
  );
  expect(r.message ?? '', `[476] ${field} 拒因须点名字段`).toContain(field);
  return r;
}

test.describe('4.25 打印审计埋点字段边界门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('476-01 四类字段越界恰 400/VALIDATION_ERROR 且点名字段', async ({ page }) => {
    await reject(page, { ...base, resource_type: '' }, 'resource_type');
    await reject(page, { ...base, resource_type: 'x'.repeat(65) }, 'resource_type');
    await reject(page, { ...base, title: '' }, 'title');
    await reject(page, { ...base, title: 'x'.repeat(201) }, 'title');
    await reject(page, { ...base, record_count: -1 }, 'record_count');
    await reject(page, { ...base, resource_id: 'x'.repeat(65) }, 'resource_id');
  });

  test('476-02 边界内放行，中文按字符计数不被 UTF-8 字节收紧', async ({ page }) => {
    // resource_type 恰 64 个中文字符：chars().count()=64 放行；若按 bytes 计会被当 192 拒绝。
    const ok = await apiCall<unknown>(page, 'POST', PATH, {
      ...base,
      resource_type: '客'.repeat(64),
      title: '标'.repeat(200),
      resource_id: '单'.repeat(64),
    });
    expect(ok.code, '[476] 中文边界值须放行（ApiResponse code=200）').toBe(200);

    // record_count = 0 合法（判据是 >=0，仅负数为非法）。
    const zero = await apiCall<unknown>(page, 'POST', PATH, { ...base, record_count: 0 });
    expect(zero.code, '[476] record_count=0 须放行（ApiResponse code=200）').toBe(200);
  });
});
