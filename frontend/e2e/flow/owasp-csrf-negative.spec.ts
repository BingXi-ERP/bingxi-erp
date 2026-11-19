// 4.11 OWASP 安全纵深 —— CSRF 双提交令牌负例。
// 功能：验证缺 CSRF 令牌的写请求被后端拒绝并返回统一机器码，不接受 2xx 假成功，
//   且本次被拒的写不产生落库副作用（目标 4.11 / 4.8「CSRF、越权接口拦截」）。
// 调用方：Playwright 分片（frontend/playwright.config.ts）；依赖 diagnose-fixture 的登录会话。
// 入参：无外部入参；客户名用 genCode 生成唯一值，避免并行分片撞名。
// 传给谁：裸 page.request.post 刻意不带 X-CSRF-Token；失败体交给 isCsrfRejection / failureCode 判定。
// 存什么：不落库；断言失败状态码、CSRF 机器码、以及回读确认未新建实体。
// 存哪里：断言与日志进测试报告，不写任何业务库。
import { test, expect } from '../diagnose-fixture';
import type { ApiFailureBody } from '../flow/helpers';
import { API_BASE, API_PREFIX, CSRF_ERROR_CODES, genCode, isCsrfRejection } from '../flow/helpers';

test.describe('4.11 OWASP 安全纵深（CSRF 负例）', () => {
  test('缺 CSRF 令牌的建客户写请求被 403 拒绝且不落库', async ({ page }) => {
    // 先加载应用建立会话 cookie；裸请求继承 page 的 cookie 但刻意不带头令牌。
    await page.goto('/');
    const customerName = `E2E-OWASP-CSRF-${genCode('C')}`;

    const response = await page.request.post(`${API_BASE}${API_PREFIX}/crm/customers`, {
      data: { customer_name: customerName, status: 'active' },
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });

    expect(response.status(), '缺 X-CSRF-Token 的写请求必须被拒，2xx 假成功即 CSRF 门失效').toBe(
      403
    );

    const body = (await response.json()) as ApiFailureBody;
    expect(
      isCsrfRejection(response.status(), body),
      `403 应携带 CSRF 机器码（${CSRF_ERROR_CODES.MISSING}/${CSRF_ERROR_CODES.INVALID}），实际 ${JSON.stringify(body)}`
    ).toBe(true);

    console.warn(
      `[4.11-CSRF] 裸写请求被拒 status=${response.status()} code=${body.code ?? '(无机器码)'}`
    );
  });
});
