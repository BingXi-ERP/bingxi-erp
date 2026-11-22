// 写操作参数篡改 IDOR E2E — flow/526-mp-write-idor
// 功能：验证已登录的 self 范围用户把请求参数里的资源 ID 换成他人单据、金额改成 0.01 时，
//   后端按行级归属拒绝（403 固定脱敏信封），且他人单据金额未被篡改落库（目标 4.1-P / 3.6）。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 DC-001 越权用例同一后端与账号池。
// 入参：两个不同 user_id 的 self 范围角色凭证（salesperson / customer_service），均由
//   global-setup 建号；金额原值 50000、篡改值 0.01。
// 传给谁：apiCallExpectFail（带 CSRF 恢复，专用于负例）发越权 PUT；apiCallRaw 回读原值。
// 存什么：不落库；断言失败状态码、机器码存在、以及原单据金额仍为原值。
// 存哪里：Actions 日志与测试报告，不写任何业务库。
import { test, expect } from '../diagnose-fixture';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  genCode,
  tryCleanup,
  getRoleCredential,
  BASE_URL,
} from './helpers';

const OWNER_ROLE = 'salesperson';
const INTRUDER_ROLE = 'customer_service';
const ORIGINAL_AMOUNT = '50000';
const TAMPER_AMOUNT = '0.01';

type RoleSession = {
  context: BrowserContext;
  page: Page;
  userId: number;
  username: string;
};

async function loginBare(browser: Browser, role: string): Promise<RoleSession> {
  const cred = getRoleCredential(role);
  expect(cred, `${role} 角色凭证不存在——global-setup 未建角色，属 setup 缺陷判红`).toBeTruthy();
  // storageState 显式置空：browser.newContext 会继承项目级 admin 会话，
  // 不置空则请求带 admin(all scope) 身份，跨 owner 写被伪造成 200 假绿。
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  await applyAuthMocks(context, { username: cred!.username, password: cred!.password });
  const page = await context.newPage();
  const me = await apiCallRaw<{ id: number; username: string }>(page, 'GET', '/auth/me');
  expect(
    me.username,
    `${role} 的 /auth/me 未返回 username，登录身份无法确认，越权断言失去意义`
  ).toBe(cred!.username);
  return { context, page, userId: me.id, username: cred!.username };
}

async function seedLead(
  session: RoleSession,
  prefix: string
): Promise<{ id: number; leadNo: string }> {
  const leadNo = genCode(prefix);
  const created = await apiCall<{ id?: number }>(session.page, 'POST', '/crm/leads', {
    lead_no: leadNo,
    lead_status: 'new',
    company_name: `写IDOR测试 ${leadNo}`,
    contact_name: '测试联系人',
    lead_source: 'WEBSITE',
    mobile_phone: '13700137001',
    email: `${leadNo}@test.com`,
    priority: 'LOW',
    estimated_amount: ORIGINAL_AMOUNT,
  });
  expect(
    created.data?.id,
    `owner 建线索失败，越权写前置不成立：${JSON.stringify(created)}`
  ).toBeTruthy();
  return { id: created.data!.id!, leadNo };
}

test.describe('写操作参数篡改 IDOR（后端拒绝落库）', () => {
  test('跨 owner PUT 把金额改成 0.01 被拒且原值未被篡改', async ({ browser }) => {
    const owner = await loginBare(browser, OWNER_ROLE);
    const intruder = await loginBare(browser, INTRUDER_ROLE);
    let leadId = 0;
    try {
      expect(
        owner.userId,
        `owner(${owner.userId}) 与 intruder(${intruder.userId}) 必须不同 user_id，否则越权前提不成立`
      ).not.toBe(intruder.userId);

      const lead = await seedLead(owner, 'E2E-WIDOR');
      leadId = lead.id;
      console.warn(
        `[写IDOR] owner=${owner.username}(id=${owner.userId}) 建线索 ${lead.id} 金额=${ORIGINAL_AMOUNT}；intruder=${intruder.username}(id=${intruder.userId})`
      );

      // 篡改请求参数：把 ID 换成他人的、金额改成 0.01，走带 CSRF 恢复的负例 helper
      const fail = await apiCallExpectFail(intruder.page, 'PUT', `/crm/leads/${lead.id}`, {
        estimated_amount: TAMPER_AMOUNT,
      });
      console.warn(
        `[写IDOR] 越权 PUT /crm/leads/${lead.id} → HTTP ${fail.status} code=${failureCode(fail) ?? '(无机器码)'}`
      );

      // fail-closed：已认证用户的跨 owner 写必须 403，不接受 200/2xx 伪装成功
      expect(
        fail.status,
        `intruder 跨 owner 改金额应返回 403（实际 ${fail.status}，响应 ${JSON.stringify(fail)}）`
      ).toBe(403);
      expect(
        failureCode(fail),
        `403 应带字符串机器码（统一错误信封），实际 ${JSON.stringify(fail)}`
      ).toBeTruthy();

      // 关键实证：后端拒绝后，owner 回读金额仍是原值，0.01 未落库
      const after = await apiCallRaw<{ id: number; estimated_amount: string }>(
        owner.page,
        'GET',
        `/crm/leads/${lead.id}`
      );
      expect(after.id, `回读线索 id 应与写入一致`).toBe(lead.id);
      expect(
        Number(after.estimated_amount),
        `越权写被拒后 owner 回读金额应仍为 ${ORIGINAL_AMOUNT}，实际 ${after.estimated_amount}（篡改已落库＝越权门失效）`
      ).toBe(Number(ORIGINAL_AMOUNT));
      expect(Number(after.estimated_amount), `金额绝不能被篡改为 ${TAMPER_AMOUNT}`).not.toBe(
        Number(TAMPER_AMOUNT)
      );
    } finally {
      if (leadId) {
        await tryCleanup(owner.page, 'DELETE', `/crm/leads/${leadId}`, 'crm_lead').catch(
          () => undefined
        );
      }
      await owner.context.close();
      await intruder.context.close();
    }
  });

  test('跨 owner DELETE 他人线索被拒且记录仍在', async ({ browser }) => {
    const owner = await loginBare(browser, OWNER_ROLE);
    const intruder = await loginBare(browser, INTRUDER_ROLE);
    let leadId = 0;
    try {
      expect(
        owner.userId,
        `owner 与 intruder 必须不同 user_id（实际 ${owner.userId}/${intruder.userId}）`
      ).not.toBe(intruder.userId);

      const lead = await seedLead(owner, 'E2E-WIDOR-DEL');
      leadId = lead.id;

      const fail = await apiCallExpectFail(intruder.page, 'DELETE', `/crm/leads/${lead.id}`);
      console.warn(
        `[写IDOR] 越权 DELETE /crm/leads/${lead.id} → HTTP ${fail.status} code=${failureCode(fail) ?? '(无机器码)'}`
      );
      expect(fail.status, `intruder 跨 owner 删除应返回 403（实际 ${fail.status}）`).toBe(403);
      expect(failureCode(fail), `403 应带字符串机器码`).toBeTruthy();

      // 实证：记录仍在，owner 可正常读回
      const after = await apiCallRaw<{ id: number }>(owner.page, 'GET', `/crm/leads/${lead.id}`);
      expect(after.id, `越权删除被拒后记录应仍存在，实际回读 ${JSON.stringify(after)}`).toBe(
        lead.id
      );
    } finally {
      if (leadId) {
        await tryCleanup(owner.page, 'DELETE', `/crm/leads/${leadId}`, 'crm_lead').catch(
          () => undefined
        );
      }
      await owner.context.close();
      await intruder.context.close();
    }
  });
});
