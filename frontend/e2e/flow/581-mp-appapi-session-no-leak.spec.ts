// 小程序 /app-api 旁路面会话不泄漏钉子 — ERP 会话对遗留网关面无授权语义
// 功能：小程序历史契约（v3 之前）的 /app-api、/oauth-api 遗留网关路径不经本仓 Rust 后端
//       （backend/src/routes 全树无 app-api 挂载），RBAC 与 data_permission 均不覆盖该面。
//       本 spec 在接口层钉死 fail-closed 事实：持有有效 ERP 会话 Cookie 的请求打
//       /app-api/* 仍然 404（未匹配路由），响应体不带成功信封——ERP 会话对旁路面
//       不存在任何授权语义，不会因为"路径不归 RBAC 管"而意外放行。
//       小程序源码面已整体删除 /app-api 运行时调用（miniprogram v3 契约，scripts/ci/
//       mp-endpoint-check.cjs 扫源码 URL 字面量门禁），本 spec 只守运行时接口面。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 flow 其它用例共享后端账号池。
// 入参：无测试参数；前置由管理员会话造客户档案与绑定 customer 账号。
// 传给谁：门户面走 apiCallRaw 信封 helper；旁路面走 page.request 原始 fetch（同上下文
//         Cookie 自动随行），不走 API_PREFIX 信封恢复逻辑。
// 存什么：404 状态码与"非成功信封"断言、门户哨兵 200；不落库。
// 存哪里：Actions 日志与 Playwright 报告。
import { test, expect } from '../diagnose-fixture';
import { API_BASE, apiCallRaw, genCode, loginInIsolatedContext, testPassword } from './helpers';

type Row = Record<string, unknown>;
type Page = Parameters<typeof apiCallRaw>[0];

function positiveId(id: unknown, subject: string): number {
  const num = Number(id);
  expect(Number.isSafeInteger(num) && num > 0, `${subject} 应返回正整数 id`).toBe(true);
  return num;
}

async function findRoleId(admin: Page, code: string): Promise<number> {
  const resp = await apiCallRaw<{ roles?: Array<Row & { code?: string }> }>(
    admin,
    'GET',
    '/roles?page=1&page_size=100'
  );
  expect(Array.isArray(resp.roles), '角色列表必须返回 data.roles').toBe(true);
  const hit = resp.roles!.find(r => r.code === code);
  expect(hit, `${code} 角色应存在——后端种子或 global-setup 幂等补建`).toBeTruthy();
  return positiveId(hit?.id, `${code} 角色行`);
}

test.describe.serial('581 /app-api 旁路面会话不泄漏', () => {
  const tag = genCode('581CA');
  const boundUsername = genCode('mp581bound');
  const sessions: Awaited<ReturnType<typeof loginInIsolatedContext>>[] = [];
  let customerId = 0;

  test('造数：客户档案 + 绑定 customer 账号', async ({ page, browser }) => {
    const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `旁路面回归客户${tag}`,
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '1000',
    });
    customerId = positiveId(created.id, '旁路面回归客户建档');

    const customerRoleId = await findRoleId(page, 'customer');
    const user = await apiCallRaw<Row>(page, 'POST', '/users', {
      username: boundUsername,
      password: testPassword(),
      role_id: customerRoleId,
      customer_id: customerId,
    });
    expect(Number(user.customer_id), '绑定归属写口回读').toBe(customerId);
    sessions.push(await loginInIsolatedContext(browser, boundUsername, testPassword()));
  });

  test('同会话门户面 200 哨兵，/app-api/* 家族 404 且无成功信封', async () => {
    const session = sessions[0];
    expect(session, '前置造数应已建立绑定客户会话').toBeTruthy();

    // 会话有效性哨兵：同一上下文的 Cookie 打门户面必须 200，
    // 否则 /app-api 的 404 会被"Cookie 根本没带上"伪装成通过
    const dash = await apiCallRaw<Row>(session.page, 'GET', '/customer-portal/dashboard');
    expect(dash, '绑定 customer 门户 dashboard 应 200（会话有效性哨兵）').toBeTruthy();

    // 遗留旁路面家族探针：打印/用户信息/AI 对话（小程序 v3 前真实调用过的 /app-api 面）
    const probes = [
      '/app-api/order/print/1',
      '/app-api/neadend/print/1',
      '/app-api/user/info',
      '/app-api/ai/chat',
    ];
    for (const probe of probes) {
      const resp = await session.page.request.get(`${API_BASE}${probe}`);
      expect(resp.status(), `带 ERP 会话打旁路面 ${probe} 必须 404（路由未挂载 fail-closed）`).toBe(
        404
      );
      const text = await resp.text();
      expect(
        text.includes('"success":true') || text.includes('"code":0'),
        `旁路面 ${probe} 响应体不得是成功信封（授权语义不得泄漏）`
      ).toBe(false);
    }
  });

  test.afterAll(async () => {
    for (const session of sessions) {
      await session.close();
    }
  });
});
