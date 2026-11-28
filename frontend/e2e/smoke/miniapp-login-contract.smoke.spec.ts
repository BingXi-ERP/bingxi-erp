import { test, expect } from '../diagnose-fixture';

const API_PREFIX = '/api/v1/erp';

test.describe('小程序登录契约', () => {
  test('缺少 code 与 phone_code 时返回统一 400 校验信封', async ({ page }) => {
    const response = await page.request.post(`${API_PREFIX}/auth/miniapp/login`, {
      data: { code: '', phone_code: '' },
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as {
      code?: string;
      message?: string;
      trace_id?: string;
      timestamp?: number;
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toContain('code 与 phone_code 不能为空');
    expect(typeof body.trace_id).toBe('string');
    expect(body.trace_id).not.toBe('');
    expect(typeof body.timestamp).toBe('number');
    expect(Number.isInteger(body.timestamp)).toBe(true);
    expect(body.timestamp).toBeGreaterThan(0);
  });
});
