// CRM 分配负载查询契约 — 06 workload 口零漂移回读与参数逐项校验负例
// 契约真相（逐段读后端源，非推测）：
//   GET crm/assignments/workload（handler crm_assignment_handler.rs list_workload，
//   service services/crm/assign.rs list_assignee_workload）查询参数 user_ids 为逗号分隔
//   整数字符串，任一元素非法即整体拒绝，不再静默丢弃非法项；载荷为空串报
//   validation_displayable「user_ids 参数不能为空」，列表内空项报「第 N 项为空」，
//   非法整数报「第 N 项「x」不是合法整数」，三类均 400 VALIDATION_ERROR 且文案外显。
//   出参为 AssigneeDistribution 数组，键 user_id、username、assigned_count；
//   仅 is_active 的用户入列，assigned_count 统计该 owner 名下 lead_status 非空且
//   非 CONVERTED 非 LOST 的活跃线索数（services/crm/lead.rs 建线 owner 恒为会话用户）。
// 正向零漂移：以本会话用户（auth/me id）为查询对象，基线数建线后加一，删线后归位。
// 假绿防线：回读用真实计数差值断言，不写恒真 is-numeric；负例钉 HTTP 码与机器码
// failureCode 并读 validation_displayable 外显文案（validation 族按 utils/error.rs
// 安全边界外显真实原因），拒绝把 400 当任意健康。
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  baseAdminPassword,
  failureCode,
  genCode,
  loginInIsolatedContext,
  tryCleanup,
} from '../flow/helpers';

interface WorkloadRow {
  user_id: number;
  username: string;
  assigned_count: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

/** workload 口按单个用户查询并取该用户行（行缺失即红，active 用户必入列） */
async function workloadCount(
  page: import('@playwright/test').Page,
  userId: number
): Promise<number> {
  const rows = await apiCallRaw<WorkloadRow[]>(
    page,
    'GET',
    `/crm/assignments/workload?user_ids=${userId}`
  );
  expect(Array.isArray(rows), `workload 应返回数组，实际 ${JSON.stringify(rows)}`).toBe(true);
  const row = rows.find(r => Number(r.user_id) === userId);
  expect(
    row,
    `user_ids=${userId} 应命中该 active 用户行，实际 ${JSON.stringify(rows)}`
  ).toBeDefined();
  return Number(row!.assigned_count);
}

test.describe('06 分配负载 workload 契约', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
  });

  test('06-01 建线与删线使本用户 assigned_count 加一归位（零漂移回读）', async ({
    page,
    browser,
  }) => {
    // 功能：钉住 workload 的 assigned_count 随本账号线索增删一对一增减，且删除后零漂移。
    // 调用方：crm_handler::list_workload（GET /crm/assignments/workload）。
    // 入参：user_ids 取本腿独占账号 id；线索由该独占会话自己创建。
    // 传给谁：services/crm/assign.rs 的按用户计数与 services/crm/lead.rs 的建线与删线。
    // 存什么：crm_lead 的 owner_id 与 assigned_count 的对应关系。
    // 存哪里：表 crm_lead，计数按 owner_id 聚合。
    // 计数对象必须是本腿独占账号：workload 按 owner 聚合，而同库并发腿会改写线索归属
    // （transfer 与 claim 的目标取自全局活跃用户列表，auto_assign 从全局待分配池取数），
    // 共享会话用户上的差值断言不可确定。建线的 owner 由服务端写会话用户，且
    // UpdateLeadRequest 不含 owner_id 无法移交，故唯一可确定的做法是让会话与 owner 同源且独占。
    const myRow = await apiCallRaw<{ id: number; role_id?: number | null }>(
      page,
      'GET',
      '/users/me'
    );
    const seedRoleId = Number(myRow.role_id);
    if (!Number.isInteger(seedRoleId) || seedRoleId <= 0) {
      throw new Error(
        `前置不成立：当前会话用户未挂角色（role_id=${myRow.role_id}），无法复制出可建线的独占账号`
      );
    }
    const username = `e2e_wl_${genCode('06X')}`.slice(0, 50);
    // 口令走 env 约定 TEST_PASSWORD（baseAdminPassword 只读该变量，缺失即抛错点名，不给默认值），
    // 与建号链路同口径，且必然过服务端强度校验；不在源码里自造口令字面量。
    const password = baseAdminPassword();
    const createdUser = await apiCall<{ id?: number }>(page, 'POST', '/users', {
      username,
      password,
      role_id: seedRoleId,
    });
    const exclusiveId = Number(createdUser.data?.id);
    if (!Number.isInteger(exclusiveId) || exclusiveId <= 0) {
      throw new Error(`独占账号建立失败，未返回真实主键：${JSON.stringify(createdUser.data)}`);
    }

    const session = await loginInIsolatedContext(browser, username, password);
    try {
      const before = await workloadCount(page, exclusiveId);
      expect(
        before,
        `刚建的独占账号 ${exclusiveId} 的 assigned_count 基线必须是 0，实际 ${before}`
      ).toBe(0);

      const leadNo = genCode('E2E-WLX');
      const createdLead = await apiCall<{ id?: number }>(session.page, 'POST', '/crm/leads', {
        lead_no: leadNo,
        lead_status: 'new',
        lead_source: 'WEBSITE',
        company_name: `E2E 独占负载 ${leadNo}`,
        contact_name: '测试联系人',
        mobile_phone: '13800138002',
        priority: 'MEDIUM',
      });
      const leadId = Number(createdLead.data?.id);
      if (!Number.isInteger(leadId) || leadId <= 0) {
        throw new Error(`独占会话建线失败，未返回真实主键：${JSON.stringify(createdLead.data)}`);
      }

      // owner 同源自证：读回的 owner_id 必须等于独占账号 id，否则计数对象不是本腿账号。
      const leadRow = await apiCall<Record<string, unknown>>(
        session.page,
        'GET',
        `/crm/leads/${leadId}`
      );
      expect(
        Number(leadRow.data['owner_id']),
        `新建线索的 owner_id 必须是独占账号 ${exclusiveId}，实际 ${leadRow.data['owner_id']}`
      ).toBe(exclusiveId);

      const afterCreate = await workloadCount(page, exclusiveId);
      expect(
        afterCreate,
        `独占账号建一条 new 线索后 assigned_count 应为 0+1=1，实际 ${afterCreate}`
      ).toBe(1);

      await apiCall(session.page, 'DELETE', `/crm/leads/${leadId}`);
      const afterDelete = await workloadCount(page, exclusiveId);
      expect(afterDelete, `删除线索后独占账号应回到基线 0（零漂移），实际 ${afterDelete}`).toBe(0);
    } finally {
      await session.close();
      // 回收顺序：线索已在上面删除，账号排在最后删（它被线索行引用时先删必被外键挡）。
      await tryCleanup(page, 'DELETE', `/users/${exclusiveId}`, `清理独占账号 ${exclusiveId}`);
    }
  });

  test('06-02 列表含非法整数项整体拒绝，400 VALIDATION_ERROR 外显第几项', async ({ page }) => {
    // handler 显式注释：原实现静默丢弃非法项导致调用方误以为覆盖全部 ID，
    // 现逐项校验，第 2 项 abc 非法即整体 400，文案点名项次与原文。
    const fail = await apiCallExpectFail(page, 'GET', '/crm/assignments/workload?user_ids=1,abc');
    expect(fail.status, `非法整数项应 400，实际 ${fail.status}`).toBe(400);
    expect(failureCode(fail), `应 VALIDATION_ERROR，实际 code=${fail.code}`).toBe(
      'VALIDATION_ERROR'
    );
    expect(
      String(fail.message ?? ''),
      `validation_displayable 必须外显真实原因（含项次与非法原文 abc），实际 message=${fail.message}`
    ).toContain('abc');
  });

  test('06-03 空串参数在归一化层被剔除，走缺必填字段通道出公开文案', async ({ page }) => {
    // 查询归一化中间件在进 handler 前把只含空值的 query 键整体剔除，服务端看到的是
    // 「缺 user_ids 字段」而不是「user_ids 值为空串」，因此出参恒为解码器拒绝的公开文案，
    // 不外显 serde 原文。本用例钉这条通道分界，同时点名它不会误报字段名。
    const fail = await apiCallExpectFail(page, 'GET', '/crm/assignments/workload?user_ids=');
    expect(fail.status, `缺 user_ids 应 400，实际 ${fail.status}`).toBe(400);
    expect(failureCode(fail), `应 VALIDATION_ERROR，实际 code=${fail.code}`).toBe(
      'VALIDATION_ERROR'
    );
    expect(
      String(fail.message ?? ''),
      `空串被归一化剔除后应走解码器公开文案，实际 message=${fail.message}`
    ).toContain('请求格式不正确');
    expect(
      String(fail.message ?? ''),
      `解码器拒绝通道不得外显字段名，实际 message=${fail.message}`
    ).not.toContain('user_ids');
  });

  test('06-04 逗号列表含空项时进 handler 逐项拒绝并点名 user_ids', async ({ page }) => {
    // 值非空但每一项都是空串时才真的进 handler 的逐项校验分支，文案必须落到字段名与项次。
    const fail = await apiCallExpectFail(page, 'GET', '/crm/assignments/workload?user_ids=,');
    expect(fail.status, `空项列表应 400，实际 ${fail.status}`).toBe(400);
    expect(failureCode(fail), `应 VALIDATION_ERROR，实际 code=${fail.code}`).toBe(
      'VALIDATION_ERROR'
    );
    const message = String(fail.message ?? '');
    expect(message, `文案应点名 user_ids，实际 message=${message}`).toContain('user_ids');
    expect(message, `文案应点名第 1 项为空，实际 message=${message}`).toContain('第 1 项为空');
  });
});
