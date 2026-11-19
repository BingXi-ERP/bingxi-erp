// 小程序接口层权限 E2E — miniprogram/01-customer-access
// 小程序与 Web 后台共用同一套后端账号权限体系（目标第五章「小程序登录，授权，账号打通，
// 和 Web 共用一套账号权限体系」）。CI 无微信开发者工具、无 miniprogram-automulator，
// 无法跑真机 UI 自动化，故本组以小程序客户端真实调用的后端端点为面，验证：
//   1. 客户外部账号（customer 角色，权限仅 SHELL + stock:export + pieces:print）
//      越权访问内部业务单据端点（销售订单/产品含成本/对账/客户档案）被 403 拒绝；
//   2. 该拒绝来自后端鉴权，不依赖前端按钮隐藏（目标 3.4c / 4.8「越权接口拦截」、
//      第五章「客户角色仅查看自有资料，无法修改后台核心业务数据」）。
// 这些是能确定通过的负向断言：customer 角色在册权限集不含对应读码，403 是权威口径，
// 不构造「客户能看到自己单据」的正向断言（customer 非业务客户账号，无数据归属）。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 PC flow 用例共享后端与账号池。
// 传给谁：apiCallExpectFail 走与 apiCall 相同的 CSRF 恢复与统一失败信封。
// 存什么：不落库，仅断言失败状态码与机器码。存哪里： Actions 侧日志与测试报告。
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { getRoleCredential, apiCallRaw, BASE_URL, API_BASE, API_PREFIX } from '../flow/helpers';

const CUSTOMER = 'customer';

// 客户账号越权访问的内部端点。每项标注目标要求与预期权限键（后端 /middleware/permission.rs
// 按 URL 段第 3/4 段派生 resource:action，customer 角色无这些键）。
const INTERNAL_ENDPOINTS: Array<{ path: string; why: string }> = [
  { path: '/sales/orders', why: '客户不得访问内部销售订单（3.4c 内部单据）' },
  { path: '/products', why: '客户不得读取含成本的标准价产品主档（3.4a 成本脱敏）' },
  { path: '/ar-reconciliations', why: '客户不得越权访问内部应收对账单（3.4c 对账数据）' },
  { path: '/crm/customers', why: '客户不得访问内部客户档案（3.4c 其他客户数据）' },
  { path: '/purchases/orders', why: '客户不得访问采购单据（3.4c 内部单据）' },
];

test.describe('小程序接口层：客户账号越权拦截', () => {
  for (const { path, why } of INTERNAL_ENDPOINTS) {
    test(`customer 越权 GET ${path} 被后端拒绝`, async ({ browser }) => {
      const cred = getRoleCredential(CUSTOMER);
      expect(
        cred,
        `customer 角色凭证不存在——global-setup 未建黑名单验证角色，属 setup 缺陷判红`
      ).toBeTruthy();

      // storageState 显式置空：browser.newContext 会继承项目级 admin 会话态，
      // 不置空则请求带着 admin 身份发出，越权断言被伪造成 200 假绿。
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      try {
        await applyAuthMocks(context, { username: cred!.username, password: cred!.password });
        const page = await context.newPage();

        // 先证明确实以 customer 身份登录（防止 credential 注入失败却靠未登录 401 蒙过）
        // apiCallRaw 已解包统一信封，返回值即 data 内容，直接取 username。
        const me = await apiCallRaw<{ username?: string }>(page, 'GET', '/auth/me');
        expect(
          me.username,
          `${why}：/auth/me 未返回 username，登录身份无法确认，越权断言失去意义`
        ).toBe(cred!.username);

        const fail = await page.request.get(`${API_BASE}${API_PREFIX}${path}?page=1&page_size=10`, {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        expect(
          [401, 403].includes(fail.status()),
          `${why}：customer 访问 ${path} 期望 401/403，实际 ${fail.status()}`
        ).toBe(true);
      } finally {
        await context.close();
      }
    });
  }
});
