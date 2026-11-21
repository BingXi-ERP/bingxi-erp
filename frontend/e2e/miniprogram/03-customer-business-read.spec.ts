// 小程序客户业务读接口契约护栏 E2E — miniprogram/03-customer-business-read
// 功能：把"customer 角色对小程序同款业务读端点全部被后端拒绝"的当前权限态钉成契约矩阵
//   （调研报告 F:/tmp/mp-customer-api-survey-1122.md 结论 B：小程序是真实客户端，
//   apiGateway.js + 50+ 条 /api/v1/erp 调用，但业务读端点所需权限码 customer 一概不持，
//   登录客户业务页全 403 不可用——已登记功能补齐工单）。
//   该矩阵是缺口登记的回归护栏：功能补齐（customer 授受限读码+数据归属过滤）落地后
//   本文件断言须随功能口径同步改写为正向脱敏断言，不得静默放行任何一条。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 01/02 用例同一后端与账号池。
// 传给谁：page.request.get 直发（01 同法），storageState 显式置空防 admin 会话伪造 200 假绿。
// 存什么：不落库，仅断言失败状态码。存哪里：Actions 日志与测试报告。
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { getRoleCredential, BASE_URL, API_BASE, API_PREFIX } from '../flow/helpers';

const CUSTOMER = 'customer';

// 小程序真实调用且归属客户可见域的业务读端点。每项标注小程序页面域与当前缺口。
// 客户台账 /customers/* 另有 require_issue_permission 二道门，不在本矩阵（见调研报告 §二）。
const BUSINESS_READ_ENDPOINTS: Array<{ path: string; why: string }> = [
  {
    path: '/color-cards',
    why: '色卡列表（customer-management/color-card-list 页）：客户应仅见授权色卡，当前无读码全 403',
  },
  {
    path: '/sales/orders',
    why: '销售订单（订单列表/进度页）：客户应仅见自有订单，当前无读码全 403',
  },
  { path: '/sales/sales-returns', why: '销售退货（退货页）：客户应仅见自有退货，当前无读码全 403' },
  {
    path: '/ar-reconciliations',
    why: '应收对账单（对账确认页）：客户应仅见自有对账，当前无读码全 403',
  },
  {
    path: '/products',
    why: '面料商品（商品页）：客户应见商品化档案且屏蔽成本字段，当前无读码全 403',
  },
];

test.describe('小程序接口层：客户业务读接口契约护栏', () => {
  test('customer 登录态对业务读端点的当前权限态（缺口回归护栏）', async ({ browser }) => {
    const cred = getRoleCredential(CUSTOMER);
    expect(cred, 'customer 角色凭证不存在——global-setup 未建角色，属 setup 缺陷判红').toBeTruthy();

    // storageState 显式置空：browser.newContext 会继承项目级 admin 会话态，
    // 不置空则请求带 admin 身份发出，契约矩阵被伪造成 200 假绿。
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    try {
      await applyAuthMocks(context, { username: cred!.username, password: cred!.password });
      const page = await context.newPage();
      const me = await page.request.get(`${API_BASE}${API_PREFIX}/auth/me`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      expect(me.status(), 'customer 登录必须成功且 /auth/me 可用，否则矩阵断言失去前提').toBe(200);

      for (const { path, why } of BUSINESS_READ_ENDPOINTS) {
        const res = await page.request.get(`${API_BASE}${API_PREFIX}${path}?page=1&page_size=10`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        expect(
          [401, 403].includes(res.status()),
          `${why}：customer 访问 ${path} 期望 401/403（缺口未补齐的当前态），实际 ${res.status()}；功能补齐落地后本断言须随功能口径同步改写`
        ).toBe(true);
      }
    } finally {
      await context.close();
    }
  });
});
