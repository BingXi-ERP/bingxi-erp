// 4.36 二维码/条码/扫码识别专项 —— 失效码内容校验负例。
// 功能：验证扫不存在的条码/匹号时被后端明确拒绝并返回统一 NOT_FOUND 机器码，
//   不接受 200 + 成功体的假成功，也不把失效码当成有效布卷写入出库（目标 4.36「内容校验」）。
// 调用方：Playwright 分片（frontend/playwright.config.ts）；依赖 diagnose-fixture 登录会话与 applyAuthMocks。
// 入参：无外部入参；用 genCode 生成唯一不存在条码，避免撞到测试库真实布卷。
// 传给谁：apiCallExpectFail 发 GET /scanner/scan-inventory 与 POST /scanner/scan-to-ship；
//   失败体交给 failureCode / APP_ERROR_CODES.NOT_FOUND 判定，文案按脱敏常量校验。
// 存什么：断言 HTTP 404 + NOT_FOUND 机器码 + 脱敏文案「资源未找到」，不做零值兜底。
// 存哪里：scan-to-ship 负例不落库（中间件前置查不到布卷即拒绝，事务回滚）；断言进测试报告。
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { APP_ERROR_CODES, apiCallExpectFail, failureCode, genCode } from './helpers';

const SANITIZED_NOT_FOUND = '资源未找到';

test.describe('扫码识别失效码负例（4.36）', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
  });

  test('扫不存在的条码盘库被 404 NOT_FOUND 拒绝且文案脱敏', async ({ page }) => {
    const fakeBarcode = genCode('E2E-NO-SUCH-BARCODE');
    const fail = await apiCallExpectFail(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${fakeBarcode}`
    );

    expect(fail.status, '失效条码盘库必须 404，200 即内容校验门失效').toBe(404);
    expect(failureCode(fail), '机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(fail.message, '失效码提示应为统一脱敏文案「资源未找到」，不得回显内部 SQL/表名').toBe(
      SANITIZED_NOT_FOUND
    );
  });

  test('用不存在的条码扫码出库被 404 NOT_FOUND 拒绝，不写入出库状态', async ({ page }) => {
    const fakeBarcode = genCode('E2E-NO-SUCH-SHIP');
    // order_id 传 0：即便越过 barcode 存在性门，也不应命中任何合法订单。
    const fail = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: fakeBarcode,
      order_id: 0,
    });

    expect(fail.status, '失效条码出库必须 404，200 即把失效码当成有效布卷').toBe(404);
    expect(failureCode(fail), '机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(fail.message, '失效码出库提示应为统一脱敏文案').toBe(SANITIZED_NOT_FOUND);

    // 回读：同一失效码再次盘库仍 NOT_FOUND，证明前一次失败未凭空写入任何布卷。
    const reread = await apiCallExpectFail(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${fakeBarcode}`
    );
    expect(reread.status, '失败请求不得写入任何布卷，回读仍应 404').toBe(404);
    expect(failureCode(reread), '回读机器码仍应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
  });
});
