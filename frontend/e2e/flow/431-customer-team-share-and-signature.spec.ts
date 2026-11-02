// [法#3 范围锁定] 目标：glob='frontend/e2e/flow/431-customer-team-share-and-signature.spec.ts'
// 客户团队共享与合同签署的数据范围隔离链 E2E — 431
//
// 功能：把"共享/团队成员按主体回读、成员与权限判定、过期批量清理、合同电子签署留痕、
// 无权限岗位拒绝"这五段数据范围隔离链钉成真实契约，验证共享与团队成员两张表
// 只按被查询主体（shared_to_user_id / user_id）出行，判定通道正反两例各自成立，
// 批量过期只动"已过期且仍 active"的行且复跑不二次写入，签署腿的留痕列真实落库
// 且重复签署被状态门拒绝。
// 调用方：后端 handlers/customer_team_share_handler.rs（list_user_shares、list_user_teams、
// is_team_member、check_share_permission、expire_overdue_shares）与
// handlers/contract_signature_handler.rs（sign_contract、verify_signature），
// 服务层 services/crm/customer_team_share_service.rs 与 services/contract_signature_service.rs；
// 前端调用面 frontend/src/api/customer-share.ts。本文件用 flow/helpers 的 apiCall 系列直连契约面。
// 入参：by-user 通道取 user_id（必填 i32，active_only 可空、缺省 true）；
// check 通道取 customer_id 与 user_id（均必填 i32）；共享写入口取 customer_id、
// shared_to_user_id、permission（词表 view/edit/full）、duration_days（i32，负值即已过期）；
// 签署腿取 contract_id、signed_by_user_id、signature_image_url、signature_certificate。
// 传给谁：CustomerTeamShareService 与 ContractSignatureService，落 customer_shares、
// customer_team_members、sales_contracts 三张表；数据范围门把 AuthContext 转成
// DataScopeContext 后传给 check_resource_owner 与 ensure_subject_visible。
// 存什么：customer_shares 落 permission、status、shared_at、expire_at、revoked_at、
// revoked_by、revoke_reason、share_reason 与两侧真实登录名；customer_team_members 落
// team_role、is_active、joined_at、left_at、notes、created_by；sales_contracts 落
// signed_at、signed_by_user_id、signature_hash、signature_image_url、signature_certificate。
// 可空列缺值写 NULL（未过期行的 expire_at、未撤销行的 revoked_at/revoked_by、
// 未签署合同的 signed_at/signature_hash），不用 0 或空串冒充。
// 存哪里：表 customer_shares（迁移 backend/migration/src/domain/v15/mod.rs，
// 唯一键 uk_cs_customer_to_user_active 为 customer_id+shared_to_user_id+status，
// 外键 fk_cs_customer_id ON DELETE CASCADE）；表 customer_team_members（同批迁移，
// 唯一键 uk_ctm_customer_user，外键 fk_ctm_customer_id ON DELETE CASCADE）；
// 签章五列在 sales_contracts 表（models/sales_contract.rs）。
//
// 取值词表（逐字符对齐写入方，禁止英文化或自造）：
//   共享状态 active/expired/revoked 与共享权限 view/edit/full——models/customer_share.rs
//   的 SHARE_STATUS_* 与 SHARE_PERMISSION_*，写入点 customer_team_share_service.rs
//   的 share_customer 与 expire_overdue_shares；
//   团队角色 member/assistant——models/customer_team_member.rs 的 TEAM_ROLE_*，
//   写入点 add_team_member；
//   合同状态 draft——models/status/bpm_crm_contract.rs 的 contract::DRAFT，
//   写入点 sales_contract_service.rs 的 build_sales_contract_active_model。
//   签署腿 sign_contract 只写签章五列、不改 sales_contracts.status，因此本文件断言
//   "状态跃迁"落在 signed_at 由 NULL 变为时间戳与 signature_hash 由 NULL 变为摘要，
//   并回读 status 仍为 draft 以钉死"签署不推进合同状态"这一真实口径（不自造 active）。
//
// 端点全集（逐条对 frontend/scripts/route-snapshot.txt 核实存在）：
//   GET  /customer-shares/by-user            GET  /customer-team-members/by-user
//   GET  /customer-team-members/check        GET  /customer-shares/check
//   POST /customer-shares/expire-overdue     POST /customer-shares
//   POST /customer-shares/revoke             POST /customer-team-members
//   DELETE /customer-team-members/{id}       POST /contract-signatures/sign
//   GET  /contract-signatures/{id}/verify    GET  /crm/customers/{id}
//   POST /crm/customers                      DELETE /crm/customers/{id}
//   POST /sales/sales-contracts              GET  /sales/sales-contracts/{id}
//   DELETE /sales/sales-contracts/{id}       GET  /users
// 载体面（建客户/建合同/取用户 id）与被测面分离，断言只按自建 id 回读，不依赖库是干净的。
//
// 失败信封口径：HTTP 失败体固定四键 code/message/trace_id/timestamp，code 为字符串机器码
// （backend/src/utils/error.rs 的 ErrorResponse），trace_id 为 Uuid::simple 的 32 位小写十六进制，
// timestamp 为 i64 秒值。权限拒绝文案永久脱敏，因此只断机器码与信封形状，永不读取文案内容。
// 无权限岗位选择依据：资源段 customer-shares、customer-team-members、contract-signatures
// 只在 backend/src/utils/path_utils.rs 的白名单在册，未出现在 backend/src/services/init_service_ops
// 的任一角色授权分组，因此非 admin 岗位（本文件取 cashier）在这五条腿上必然被权限门 403 拒绝；
// admin 在 permission.rs 的 check_permission 走管理员短路，故正腿以默认会话跑。

import { test, expect, type Page } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  expectDenied,
  expectStateGateRejection,
  genCode,
  getRoleCredential,
  loginInIsolatedContext,
  loginViaUI,
  tryCleanup,
} from './helpers';

/** customer_shares 出参行，键名逐字段对齐 models/customer_share.rs 的 Model 字段 */
type ShareRow = {
  id: number;
  customer_id: number;
  shared_by_user_id: number;
  shared_by_user_name: string | null;
  shared_to_user_id: number;
  shared_to_user_name: string | null;
  permission: string;
  status: string;
  shared_at: string;
  expire_at: string | null;
  revoked_at: string | null;
  revoked_by: number | null;
  revoke_reason: string | null;
  share_reason: string | null;
  updated_at: string;
};

/** customer_team_members 出参行，键名对齐 models/customer_team_member.rs 的 Model 字段 */
type MemberRow = {
  id: number;
  customer_id: number;
  user_id: number;
  user_name: string | null;
  team_role: string;
  is_active: boolean;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  created_by: number | null;
};

/** sales_contracts 出参行，只声明本文件断言到的列（total_amount 是 Decimal，序列化后为字符串） */
type ContractRow = {
  id: number;
  contract_no: string;
  contract_name: string;
  customer_id: number;
  status: string;
  signed_at: string | null;
  signed_by_user_id: number | null;
  signature_hash: string | null;
  signature_image_url: string | null;
  signature_certificate: string | null;
};

/** GET /contract-signatures/{id}/verify 出参，键名对齐 services/contract_signature_service.rs 的 SignatureVerificationResult */
type VerifyRow = {
  contract_id: number;
  contract_no: string;
  is_valid: boolean;
  stored_hash: string | null;
  computed_hash: string;
  signed_at: string | null;
  signed_by_user_id: number | null;
};

/** 共享状态词表，原值来自 models/customer_share.rs */
const SHARE_STATUS_ACTIVE = 'active';
const SHARE_STATUS_EXPIRED = 'expired';
const SHARE_STATUS_REVOKED = 'revoked';
/** 共享权限词表，原值来自 models/customer_share.rs */
const SHARE_PERMISSION_VIEW = 'view';
const SHARE_PERMISSION_EDIT = 'edit';
/** 团队角色词表，原值来自 models/customer_team_member.rs */
const TEAM_ROLE_MEMBER = 'member';
const TEAM_ROLE_ASSISTANT = 'assistant';
/** 合同状态词表，原值来自 models/status/bpm_crm_contract.rs 的 contract::DRAFT */
const CONTRACT_STATUS_DRAFT = 'draft';

/** 真实登录名的造名兜底形状（历史缺陷写法 format!("用户{id}") 与 format!("客户 #{}", id)），命中即判红 */
const FAKE_NAME_PATTERN = /^(用户\d+|客户\s*#\d+)$/;

/** 分步显式日志：任一腿的执行与判定结果都必须外显，不留黑盒 */
function log(caseNo: string, step: string, detail: unknown): void {
  console.log(`[431-${caseNo}] ${step}: ${JSON.stringify(detail)}`);
}

/**
 * 取若干个与指定 id 集合不同的活跃用户 id，作为共享与团队行的主体。
 * 入参：exclude 为需排除的用户 id（本 worker 登录人），count 为需要的主体数。
 * 传给谁：本文件的共享写入口与团队成员写入口。
 * 契约来源：handlers/user_handler.rs 的用户列表把行放在 data.users（不是 data.items），
 * 缺键或形状漂移在此直接抛错，不做 ?? [] 兜底。
 */
async function pickActiveUserIds(page: Page, exclude: number[], count: number): Promise<number[]> {
  const res = await apiCallRaw<{ users: Array<{ id: number; is_active: boolean }> }>(
    page,
    'GET',
    '/users?page=1&page_size=100'
  );
  expect(
    Array.isArray(res.users),
    `GET /users 响应缺 data.users 数组：${JSON.stringify(res)}`
  ).toBe(true);
  const ids = res.users.filter(u => u.is_active && !exclude.includes(u.id)).map(u => u.id);
  if (ids.length < count) {
    throw new Error(
      `活跃用户不足：需要 ${count} 个非本人活跃用户，实际 ${ids.length}（GET /users 前 100 行）`
    );
  }
  log('users', `取到 ${count} 个主体`, ids.slice(0, count));
  return ids.slice(0, count);
}

/**
 * 建一个本用例专属客户作为共享与团队行的载体，并回读归属列证明当前登录人可写。
 * 归属判据来源：services/customer_ops/crud.rs 以客户表 owner_id 为归属列，
 * 共享与团队写门 customer_team_share_service.rs 的 validate_share_permission 与
 * validate_team_management_permission 第一步都比对 customer.owner_id == 操作人。
 */
async function createOwnedCustomer(
  page: Page,
  caseNo: string,
  label: string,
  operatorId: number
): Promise<{ id: number; ownerId: number }> {
  const code = genCode(`431${label}`);
  const created = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: `E2E 共享载体 ${code}`,
  });
  const id = created.data?.id;
  expect(id, `建共享载体客户失败（${code}）：${JSON.stringify(created)}`).toBeTruthy();
  const readback = await apiCallRaw<{ id: number; owner_id: number }>(
    page,
    'GET',
    `/crm/customers/${id}`
  );
  expect(readback.id, `客户详情回读 id 应与自建 id 一致`).toBe(id);
  expect(
    readback.owner_id,
    `载体客户 ${code} 的 owner_id 必须等于当前登录人 ${operatorId}，否则共享与团队的写门不成立`
  ).toBe(operatorId);
  log(caseNo, '载体客户已建并回读归属', { code, id, ownerId: readback.owner_id });
  return { id: id as number, ownerId: readback.owner_id };
}

/**
 * 裸 GET 取未收窄的失败体，用于断言统一失败信封的四键形状。
 * apiCallExpectFail 只回传 status/code/message，承载不了 trace_id 与 timestamp，
 * 故失败信封形状用本函数取证（GET 不消费 CSRF，无需带令牌）。
 */
async function fetchEnvelope(
  page: Page,
  path: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await page.request.fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method: 'GET',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    timeout: 60_000,
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`GET ${path} 响应非 JSON（status=${res.status()}）：${text.slice(0, 200)}`);
  }
  return { status: res.status(), body };
}

/**
 * 断言失败体是统一信封：字符串机器码 FORBIDDEN + 非空 message + 32 位小写十六进制 trace_id
 * + 数值 timestamp，且不含数字 code 与旧旁路键。
 */
function assertUnifiedForbiddenEnvelope(
  env: { status: number; body: Record<string, unknown> },
  context: string
): void {
  expect(env.status, `${context}：实际 status=${env.status}`).toBe(403);
  const code = env.body.code;
  expect(
    typeof code,
    `${context}：失败信封 code 必须是字符串机器码，实际 ${JSON.stringify(code)}`
  ).toBe('string');
  expect(code, `${context}：code 应为 ${APP_ERROR_CODES.FORBIDDEN}`).toBe(
    APP_ERROR_CODES.FORBIDDEN
  );
  expect(typeof env.body.message, `${context}：message 必须存在且为字符串`).toBe('string');
  const traceId = env.body.trace_id;
  expect(typeof traceId, `${context}：trace_id 必须为字符串`).toBe('string');
  expect(
    /^[0-9a-f]{32}$/.test(String(traceId)),
    `${context}：trace_id 应为 Uuid::simple 的 32 位小写十六进制，实际 ${JSON.stringify(traceId)}`
  ).toBe(true);
  expect(typeof env.body.timestamp, `${context}：timestamp 应为 i64 秒值（JSON 数值）`).toBe(
    'number'
  );
  expect(
    Number.isInteger(env.body.timestamp),
    `${context}：timestamp 应为整数秒，实际 ${JSON.stringify(env.body.timestamp)}`
  ).toBe(true);
}

test.describe.serial('431 客户团队共享与合同签署数据范围隔离链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('431-01 by-user 通道只回读本人行，两个主体各自建的共享与团队行交叉互查不可见', async ({
    page,
  }) => {
    const me = await apiCallRaw<{ id: number; username: string }>(page, 'GET', '/auth/me');
    const [subjectA, subjectB] = await pickActiveUserIds(page, [me.id], 2);
    const custA = await createOwnedCustomer(page, '01', 'A', me.id);
    const custB = await createOwnedCustomer(page, '01', 'B', me.id);

    // 主体 A 的共享行（权限 view，30 天时效）与主体 B 的共享行（权限 edit，30 天时效）
    const shareA = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: custA.id,
      shared_to_user_id: subjectA,
      permission: SHARE_PERMISSION_VIEW,
      duration_days: 30,
      share_reason: 'E2E 主体甲',
    });
    const shareB = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: custB.id,
      shared_to_user_id: subjectB,
      permission: SHARE_PERMISSION_EDIT,
      duration_days: 30,
      share_reason: 'E2E 主体乙',
    });
    log('01', '两笔共享已写入', { shareAId: shareA.id, shareBId: shareB.id });

    // 写入口回读：状态、权限、归属与两侧留痕名逐字段核对
    expect(shareA.status, '新建共享的 status 应为词表 active').toBe(SHARE_STATUS_ACTIVE);
    expect(shareA.permission, '主体甲共享权限应为词表 view').toBe(SHARE_PERMISSION_VIEW);
    expect(shareA.shared_by_user_id, 'shared_by_user_id 应为当前登录人').toBe(me.id);
    expect(
      shareA.shared_by_user_name,
      'shared_by_user_name 必须落真实登录名（AuthContext.username），不得为自造名'
    ).toBe(me.username);
    expect(shareA.shared_to_user_id, 'shared_to_user_id 应等于提交主体甲').toBe(subjectA);
    expect(
      shareA.expire_at,
      '30 天时效共享的 expire_at 不得为 NULL（NULL 即永久共享）'
    ).not.toBeNull();
    expect(shareA.revoked_at, '未撤销共享的 revoked_at 必须写 NULL，不得写空串或时间').toBeNull();
    expect(shareA.revoked_by, '未撤销共享的 revoked_by 必须写 NULL，不得写 0').toBeNull();
    expect(
      shareA.shared_to_user_name && !FAKE_NAME_PATTERN.test(shareA.shared_to_user_name),
      `被共享人留痕名不得是造名形状，实际 ${JSON.stringify(shareA.shared_to_user_name)}`
    ).toBe(true);

    // 团队成员行：主体甲入客户甲（member），主体乙入客户乙（assistant）
    const memberA = await apiCallRaw<MemberRow>(page, 'POST', '/customer-team-members', {
      customer_id: custA.id,
      user_id: subjectA,
      team_role: TEAM_ROLE_MEMBER,
      notes: 'E2E 团队甲',
    });
    const memberB = await apiCallRaw<MemberRow>(page, 'POST', '/customer-team-members', {
      customer_id: custB.id,
      user_id: subjectB,
      team_role: TEAM_ROLE_ASSISTANT,
      notes: 'E2E 团队乙',
    });
    expect(memberA.team_role, '成员角色应落词表 member').toBe(TEAM_ROLE_MEMBER);
    expect(memberA.is_active, '新入队成员的 is_active 应为 true').toBe(true);
    expect(memberA.left_at, '在队成员的 left_at 必须写 NULL').toBeNull();
    expect(memberA.created_by, 'created_by 应落操作人（当前登录人）').toBe(me.id);
    expect(typeof memberA.user_name, 'user_name 应落被添加人的真实登录名').toBe('string');
    expect(
      memberA.user_name && !FAKE_NAME_PATTERN.test(memberA.user_name),
      `成员留痕名不得是造名形状，实际 ${JSON.stringify(memberA.user_name)}`
    ).toBe(true);
    expect(memberB.team_role, '成员角色应落词表 assistant').toBe(TEAM_ROLE_ASSISTANT);

    // ---- by-user 通道交叉互查：共享清单 ----
    const sharesOfA = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-user?user_id=${subjectA}`
    );
    expect(Array.isArray(sharesOfA), 'by-user 共享通道 data 应为数组').toBe(true);
    for (const row of sharesOfA) {
      expect(
        row.shared_to_user_id,
        `by-user?user_id=${subjectA} 回读到非本人行（shared_to_user_id=${row.shared_to_user_id}）——通道未过滤主体`
      ).toBe(subjectA);
    }
    expect(
      sharesOfA.some(r => r.id === shareA.id),
      `by-user 通道应回读到主体甲自己的共享行 ${shareA.id}`
    ).toBe(true);
    expect(
      sharesOfA.some(r => r.id === shareB.id),
      `主体乙的共享行 ${shareB.id} 出现在主体甲的 by-user 通道——数据范围隔离失效`
    ).toBe(false);

    const sharesOfB = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-user?user_id=${subjectB}`
    );
    expect(Array.isArray(sharesOfB), 'by-user 共享通道（主体乙）data 应为数组').toBe(true);
    for (const row of sharesOfB) {
      expect(
        row.shared_to_user_id,
        `by-user?user_id=${subjectB} 回读到非本人行（shared_to_user_id=${row.shared_to_user_id}）`
      ).toBe(subjectB);
    }
    expect(
      sharesOfB.some(r => r.id === shareB.id),
      '主体乙应能回读到自己的共享行'
    ).toBe(true);
    expect(
      sharesOfB.some(r => r.id === shareA.id),
      `主体甲的共享行 ${shareA.id} 出现在主体乙的 by-user 通道——数据范围隔离失效`
    ).toBe(false);

    // ---- by-user 通道交叉互查：团队清单 ----
    const teamsOfA = await apiCallRaw<MemberRow[]>(
      page,
      'GET',
      `/customer-team-members/by-user?user_id=${subjectA}`
    );
    expect(Array.isArray(teamsOfA), 'by-user 团队通道 data 应为数组').toBe(true);
    for (const row of teamsOfA) {
      expect(
        row.user_id,
        `by-user 团队通道回读到非本人行（user_id=${row.user_id}）——通道未过滤主体`
      ).toBe(subjectA);
    }
    expect(
      teamsOfA.some(r => r.id === memberA.id),
      '主体甲应能回读到自己的团队行'
    ).toBe(true);
    expect(
      teamsOfA.some(r => r.id === memberB.id),
      `主体乙的团队行 ${memberB.id} 出现在主体甲的 by-user 团队通道——数据范围隔离失效`
    ).toBe(false);

    const teamsOfB = await apiCallRaw<MemberRow[]>(
      page,
      'GET',
      `/customer-team-members/by-user?user_id=${subjectB}`
    );
    expect(Array.isArray(teamsOfB), 'by-user 团队通道（主体乙）data 应为数组').toBe(true);
    for (const row of teamsOfB) {
      expect(row.user_id, `by-user 团队通道混入非本人行 user_id=${row.user_id}`).toBe(subjectB);
    }
    expect(
      teamsOfB.some(r => r.id === memberB.id),
      '主体乙应能回读到自己的团队行'
    ).toBe(true);
    expect(
      teamsOfB.some(r => r.id === memberA.id),
      '主体甲的团队行不应出现在主体乙通道'
    ).toBe(false);

    // active_only=false 只放宽 is_active 过滤，不得放宽主体过滤
    const teamsOfAAll = await apiCallRaw<MemberRow[]>(
      page,
      'GET',
      `/customer-team-members/by-user?user_id=${subjectA}&active_only=false`
    );
    expect(Array.isArray(teamsOfAAll), 'active_only=false 时 data 仍应为数组').toBe(true);
    for (const row of teamsOfAAll) {
      expect(row.user_id, `active_only=false 混入非本人行 user_id=${row.user_id}`).toBe(subjectA);
    }

    for (const shareId of [shareA.id, shareB.id]) {
      await apiCall(page, 'POST', '/customer-shares/revoke', {
        share_id: shareId,
        revoke_reason: 'E2E 431 收口',
      });
    }
    await tryCleanup(page, 'DELETE', `/customer-team-members/${memberA.id}`, 'team_member_A');
    await tryCleanup(page, 'DELETE', `/customer-team-members/${memberB.id}`, 'team_member_B');
    await tryCleanup(page, 'DELETE', `/crm/customers/${custA.id}`, 'customer_A');
    await tryCleanup(page, 'DELETE', `/crm/customers/${custB.id}`, 'customer_B');
  });

  test('431-02 判定通道正反两例，成员与共享权限各判是判否，软删与撤销后必须转判否', async ({
    page,
  }) => {
    const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
    const [subjectA, subjectB] = await pickActiveUserIds(page, [me.id], 2);
    const cust = await createOwnedCustomer(page, '02', 'C', me.id);

    const member = await apiCallRaw<MemberRow>(page, 'POST', '/customer-team-members', {
      customer_id: cust.id,
      user_id: subjectA,
      team_role: TEAM_ROLE_ASSISTANT,
      notes: 'E2E 判定正例',
    });
    const share = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectA,
      permission: SHARE_PERMISSION_EDIT,
      duration_days: 30,
      share_reason: 'E2E 判定正例',
    });

    // 正例：判定通道回读的是 team_role 原值（服务层 is_team_member 返回 Option<String>）
    const memberPositive = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-team-members/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    log('02', '成员判定正例', memberPositive);
    expect(
      memberPositive,
      `在队成员的判定结果应为角色原值 ${TEAM_ROLE_ASSISTANT}，实际 ${JSON.stringify(memberPositive)}`
    ).toBe(TEAM_ROLE_ASSISTANT);

    // 反例：非成员必须判否，不许只断正例那半边
    const memberNegative = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-team-members/check?customer_id=${cust.id}&user_id=${subjectB}`
    );
    log('02', '成员判定反例', memberNegative);
    expect(
      memberNegative,
      `非成员判定必须为 null，实际 ${JSON.stringify(memberNegative)}`
    ).toBeNull();

    // 共享权限判定正反两例（服务层 check_share_permission 返回 Option<String>，值是 permission 原值）
    const permPositive = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-shares/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    expect(
      permPositive,
      `有 active 共享的主体应判出权限原值 ${SHARE_PERMISSION_EDIT}，实际 ${JSON.stringify(permPositive)}`
    ).toBe(SHARE_PERMISSION_EDIT);
    const permNegative = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-shares/check?customer_id=${cust.id}&user_id=${subjectB}`
    );
    expect(
      permNegative,
      `无共享的主体必须判 null，实际 ${JSON.stringify(permNegative)}`
    ).toBeNull();

    // 移除成员（软删 is_active=false）后判定通道必须转判否，证明判定腿真的读活跃标记
    await apiCall(page, 'DELETE', `/customer-team-members/${member.id}`);
    const memberAfterRemove = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-team-members/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    expect(
      memberAfterRemove,
      `成员离队后判定必须转 null，实际 ${JSON.stringify(memberAfterRemove)}`
    ).toBeNull();

    // 撤销共享后判定通道同样必须转判否（服务层只认 status=active 的行）
    await apiCall(page, 'POST', '/customer-shares/revoke', {
      share_id: share.id,
      revoke_reason: 'E2E 判定反例',
    });
    const revokedRow = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-customer?customer_id=${cust.id}&status=${SHARE_STATUS_REVOKED}`
    );
    expect(
      revokedRow.some(r => r.id === share.id),
      '撤销后应能在 status=revoked 的客户维度列表回读到该行'
    ).toBe(true);
    const revokedShare = revokedRow.find(r => r.id === share.id)!;
    expect(revokedShare.status, '撤销后 status 应为词表 revoked').toBe(SHARE_STATUS_REVOKED);
    expect(revokedShare.revoked_by, 'revoked_by 应落撤销操作人').toBe(me.id);
    expect(revokedShare.revoked_at, 'revoked_at 应落撤销时间而非 NULL').not.toBeNull();
    expect(revokedShare.revoke_reason, 'revoke_reason 应原样落库提交值').toBe('E2E 判定反例');
    const permAfterRevoke = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-shares/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    expect(
      permAfterRevoke,
      `共享撤销后判定必须转 null，实际 ${JSON.stringify(permAfterRevoke)}`
    ).toBeNull();

    await tryCleanup(page, 'DELETE', `/crm/customers/${cust.id}`, 'customer_C');
  });

  test('431-03 过期批量处理只动已过期 active 行，复跑幂等且二次调用不产生新行不二次写入', async ({
    page,
  }) => {
    const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
    const [subjectA, subjectB] = await pickActiveUserIds(page, [me.id], 2);
    const cust = await createOwnedCustomer(page, '03', 'D', me.id);

    // 边界值：duration_days 为负即 expire_at 落在过去（服务层按 now+days 计算，无符号校验）
    const overdue = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectA,
      permission: SHARE_PERMISSION_VIEW,
      duration_days: -1,
      share_reason: 'E2E 已过期边界',
    });
    // 对照行：同客户下的未过期共享，批量腿不得误动它
    const stillActive = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectB,
      permission: SHARE_PERMISSION_VIEW,
      duration_days: 30,
      share_reason: 'E2E 未过期对照',
    });
    expect(overdue.status, '新写入的过期边界行 status 仍应为 active（批量腿跑之前不过期）').toBe(
      SHARE_STATUS_ACTIVE
    );
    expect(
      new Date(overdue.expire_at as string).getTime() < Date.now(),
      `duration_days=-1 的 expire_at 必须落在过去，实际 ${overdue.expire_at}`
    ).toBe(true);

    const firstRun = await apiCallRaw<{ expired_count: number }>(
      page,
      'POST',
      '/customer-shares/expire-overdue'
    );
    log('03', '第一次批量过期', firstRun);
    expect(typeof firstRun.expired_count, 'expired_count 应为数值（服务层 ExpireResult）').toBe(
      'number'
    );
    expect(firstRun.expired_count, '本次至少应处理掉用例自建的那条已过期行').toBeGreaterThanOrEqual(
      1
    );

    const afterFirst = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-customer?customer_id=${cust.id}`
    );
    expect(afterFirst.length, '客户维度应恰好回读本用例自建的两行').toBe(2);
    const firstOverdue = afterFirst.find(r => r.id === overdue.id)!;
    const firstStillActive = afterFirst.find(r => r.id === stillActive.id)!;
    expect(firstOverdue.status, '已过期行应被批量腿置为词表 expired').toBe(SHARE_STATUS_EXPIRED);
    expect(firstOverdue.revoked_at, '自动过期不是主动撤销，revoked_at 必须保持 NULL').toBeNull();
    expect(firstOverdue.revoked_by, '自动过期不得写 revoked_by').toBeNull();
    expect(firstOverdue.revoke_reason, '自动过期不得写 revoke_reason').toBeNull();
    expect(firstStillActive.status, '未到期的对照行不得被批量腿误动').toBe(SHARE_STATUS_ACTIVE);
    const stampAfterFirst = firstOverdue.updated_at;
    expect(stampAfterFirst, '批量腿应刷新被处理行的 updated_at').not.toBe(overdue.updated_at);

    // 幂等复跑：本行已脱离 active，第二次不得再写它，也不得新增行
    const secondRun = await apiCallRaw<{ expired_count: number }>(
      page,
      'POST',
      '/customer-shares/expire-overdue'
    );
    log('03', '第二次批量过期（幂等复跑）', secondRun);
    expect(typeof secondRun.expired_count, '第二次返回仍应是数值').toBe('number');
    const afterSecond = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-customer?customer_id=${cust.id}`
    );
    expect(afterSecond.length, '第二次批量过期不得产生新行').toBe(2);
    const secondOverdue = afterSecond.find(r => r.id === overdue.id)!;
    expect(secondOverdue.status, '第二次复跑后状态仍是 expired，不得二次跃迁').toBe(
      SHARE_STATUS_EXPIRED
    );
    expect(
      secondOverdue.updated_at,
      `第二次复跑不得对被处理行二次写入（updated_at 应停在 ${stampAfterFirst}，实际 ${secondOverdue.updated_at}）`
    ).toBe(stampAfterFirst);
    expect(secondOverdue.revoked_at, '第二次复跑也不得写 revoked_at').toBeNull();
    expect(
      afterSecond.find(r => r.id === stillActive.id)!.status,
      '对照行在第二次复跑后仍应是 active'
    ).toBe(SHARE_STATUS_ACTIVE);

    // 过期行按词表判定应判否（服务层 check_share_permission 只认 active 行）
    const permAfterExpire = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-shares/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    expect(
      permAfterExpire,
      `过期后共享权限判定应为 null，实际 ${JSON.stringify(permAfterExpire)}`
    ).toBeNull();

    // 过期终态不可再撤销（revoke_share 有 status=active 前置门），用拒绝码钉死而不是忽略
    const revokeExpired = await apiCallExpectFail(page, 'POST', '/customer-shares/revoke', {
      share_id: overdue.id,
      revoke_reason: 'E2E 过期后撤销',
    });
    expectStateGateRejection(revokeExpired, '过期终态共享的撤销应被状态门拒绝');
    log('03', '过期行撤销被状态门拒绝', revokeExpired);

    await apiCall(page, 'POST', '/customer-shares/revoke', {
      share_id: stillActive.id,
      revoke_reason: 'E2E 431 收口',
    });
    await tryCleanup(page, 'DELETE', `/crm/customers/${cust.id}`, 'customer_D');
  });

  test('431-04 签署腿留痕列真实落库，验证通道哈希自洽，重复签署被状态门拒绝且无二次跃迁', async ({
    page,
  }) => {
    const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
    const [signerId] = await pickActiveUserIds(page, [me.id], 1);
    const cust = await createOwnedCustomer(page, '04', 'E', me.id);

    // total_amount 是 Decimal，入参按字符串提交（出参同为字符串，见 rust_decimal serde 口径）
    const contract = await apiCallRaw<ContractRow>(page, 'POST', '/sales/sales-contracts', {
      contract_name: `E2E 签署载体 ${genCode('431F')}`,
      customer_id: cust.id,
      total_amount: '1250.00',
    });
    expect(typeof contract.id, '建销售合同应返回主键').toBe('number');
    expect(contract.status, '新建合同的 status 应由写入方落词表 draft，不得自造').toBe(
      CONTRACT_STATUS_DRAFT
    );
    // 前置自证：未签署态的留痕列必须是 NULL，否则"签署产生跃迁"这条断言不成立
    expect(contract.signed_at, '未签署合同的 signed_at 必须写 NULL').toBeNull();
    expect(contract.signature_hash, '未签署合同的 signature_hash 必须写 NULL').toBeNull();
    expect(contract.signed_by_user_id, '未签署合同的 signed_by_user_id 必须写 NULL').toBeNull();

    const signatureImageUrl = 'https://e2e.invalid/431/signature.png';
    const signatureCertificate = 'E2E-431-PEM-MARKER';
    const signed = await apiCallRaw<ContractRow>(page, 'POST', '/contract-signatures/sign', {
      contract_id: contract.id,
      signed_by_user_id: signerId,
      signature_image_url: signatureImageUrl,
      signature_certificate: signatureCertificate,
    });
    log('04', '签署出参', { signedAt: signed.signed_at, hash: signed.signature_hash });
    expect(signed.signed_at, '签署后 signed_at 应由 NULL 跃迁为时间戳').not.toBeNull();
    expect(signed.signed_by_user_id, 'signed_by_user_id 应落提交的签署人').toBe(signerId);
    expect(
      /^[0-9a-f]{64}$/.test(String(signed.signature_hash)),
      `signature_hash 应为 SHA-256 的 64 位小写十六进制摘要，实际 ${JSON.stringify(signed.signature_hash)}`
    ).toBe(true);
    expect(signed.signature_image_url, 'signature_image_url 应原样落库').toBe(signatureImageUrl);
    expect(signed.signature_certificate, 'signature_certificate 应原样落库').toBe(
      signatureCertificate
    );
    expect(signed.status, 'sign_contract 不推进合同状态，status 应仍为词表 draft').toBe(
      CONTRACT_STATUS_DRAFT
    );

    // 详情通道回读：证明签署留痕真的落库，不是只在响应里现造
    const readback = await apiCallRaw<ContractRow>(
      page,
      'GET',
      `/sales/sales-contracts/${contract.id}`
    );
    expect(readback.contract_no, '详情回读的 contract_no 应与出参一致').toBe(contract.contract_no);
    expect(readback.signed_at, '详情回读的 signed_at 应与签署出参逐字符相同').toBe(
      signed.signed_at
    );
    expect(readback.signature_hash, '详情回读的摘要应与签署出参相同').toBe(signed.signature_hash);
    expect(readback.signed_by_user_id, '详情回读的签署人应与签署出参相同').toBe(signerId);
    expect(readback.status, '详情回读的合同状态仍应是 draft').toBe(CONTRACT_STATUS_DRAFT);

    // 验证通道：存的摘要与按合同内容重算的摘要必须一致
    const verify = await apiCallRaw<VerifyRow>(
      page,
      'GET',
      `/contract-signatures/${contract.id}/verify`
    );
    log('04', '验证通道回读', verify);
    expect(verify.contract_id, '验证通道应回读同一合同 id').toBe(contract.id);
    expect(verify.contract_no, '验证通道应回读同一合同编号').toBe(contract.contract_no);
    expect(verify.is_valid, '未篡改合同的签名验证应为 true').toBe(true);
    expect(verify.stored_hash, '验证通道的 stored_hash 应与落库摘要相同').toBe(
      signed.signature_hash
    );
    expect(verify.computed_hash, '验证通道重算的摘要应与落库摘要相同').toBe(
      signed.signature_hash as string
    );
    expect(verify.signed_at, '验证通道应回读真实签署时间').toBe(signed.signed_at);
    expect(verify.signed_by_user_id, '验证通道应回读真实签署人').toBe(signerId);

    // 重复签署被状态门拒绝（服务层 signed_at 已存在即 business），且不得产生二次跃迁
    const repeatSign = await apiCallExpectFail(page, 'POST', '/contract-signatures/sign', {
      contract_id: contract.id,
      signed_by_user_id: me.id,
      signature_image_url: signatureImageUrl,
      signature_certificate: 'E2E-431-SECOND',
    });
    expectStateGateRejection(repeatSign, '已签署合同重复签署应被状态门拒绝');
    log('04', '重复签署被拒绝', repeatSign);
    const afterRepeat = await apiCallRaw<ContractRow>(
      page,
      'GET',
      `/sales/sales-contracts/${contract.id}`
    );
    expect(afterRepeat.signed_at, '重复签署被拒后 signed_at 不得被改写').toBe(signed.signed_at);
    expect(afterRepeat.signature_hash, '重复签署被拒后摘要不得被改写').toBe(signed.signature_hash);
    expect(afterRepeat.signed_by_user_id, '重复签署被拒后签署人不得被改写').toBe(signerId);
    expect(afterRepeat.signature_certificate, '重复签署被拒后证书列不得被改写').toBe(
      signatureCertificate
    );

    await tryCleanup(page, 'DELETE', `/sales/sales-contracts/${contract.id}`, 'sales_contract');
    await tryCleanup(page, 'DELETE', `/crm/customers/${cust.id}`, 'customer_E');
  });

  test('431-05 非法词表取值与重复提交一律被拒，拒绝后库中不留脏行', async ({ page }) => {
    const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
    const [subjectA] = await pickActiveUserIds(page, [me.id], 1);
    const cust = await createOwnedCustomer(page, '05', 'G', me.id);

    // 团队角色词表外取值：服务层 validate_team_role 走 validation_displayable
    const badRole = await apiCallExpectFail(page, 'POST', '/customer-team-members', {
      customer_id: cust.id,
      user_id: subjectA,
      team_role: 'lead',
    });
    expectStateGateRejection(badRole, `团队角色 lead 不在词表内应被拒`);
    log('05', '非法团队角色被拒', badRole);

    // 共享权限词表外取值（前端旧写法 read 即落这里）
    const badPermission = await apiCallExpectFail(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectA,
      permission: 'read',
      duration_days: 30,
    });
    expectStateGateRejection(badPermission, '共享权限 read 不在词表内应被拒');
    log('05', '非法共享权限被拒', badPermission);

    // 非法角色被拒后不得留脏行：判定通道仍判否
    const memberCheckAfterBadRole = await apiCallRaw<string | null>(
      page,
      'GET',
      `/customer-team-members/check?customer_id=${cust.id}&user_id=${subjectA}`
    );
    expect(
      memberCheckAfterBadRole,
      `非法角色被拒后不应存在成员行，实际判定 ${JSON.stringify(memberCheckAfterBadRole)}`
    ).toBeNull();

    // 合法写入一次，再对同一客户同一主体重复共享：命中 active 判重（业务门）
    const first = await apiCallRaw<ShareRow>(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectA,
      permission: SHARE_PERMISSION_VIEW,
      duration_days: 30,
      share_reason: 'E2E 判重首笔',
    });
    const duplicate = await apiCallExpectFail(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: subjectA,
      permission: SHARE_PERMISSION_EDIT,
      duration_days: 30,
      share_reason: 'E2E 判重次笔',
    });
    expectStateGateRejection(duplicate, '同一客户同一主体的重复 active 共享应被业务门拒绝');
    log('05', '重复共享被拒', duplicate);
    const rows = await apiCallRaw<ShareRow[]>(
      page,
      'GET',
      `/customer-shares/by-customer?customer_id=${cust.id}`
    );
    expect(rows.length, '重复共享被拒后客户名下应只有一行共享').toBe(1);
    expect(rows[0].id, '保留的应是首笔共享行').toBe(first.id);
    expect(rows[0].permission, '次笔提交的权限不得覆盖首笔').toBe(SHARE_PERMISSION_VIEW);

    // 共享给自己被校验拒绝（服务层第 3 步）
    const shareToSelf = await apiCallExpectFail(page, 'POST', '/customer-shares', {
      customer_id: cust.id,
      shared_to_user_id: me.id,
      permission: SHARE_PERMISSION_VIEW,
      duration_days: 30,
    });
    expectStateGateRejection(shareToSelf, '共享给自己应被校验拒绝');
    log('05', '共享给自己被拒', shareToSelf);

    await apiCall(page, 'POST', '/customer-shares/revoke', {
      share_id: first.id,
      revoke_reason: 'E2E 431 收口',
    });
    await tryCleanup(page, 'DELETE', `/crm/customers/${cust.id}`, 'customer_G');
  });

  test('431-06 无权限岗位调用五条腿均被后端拒，失败体是统一四键信封且 code 为字符串机器码', async ({
    page,
    browser,
  }) => {
    const cred = getRoleCredential('cashier');
    if (!cred) {
      throw new Error(
        'role-credentials.json 缺少 cashier 岗位凭证（global-setup 的 ensureRoleUsers 未建该岗），' +
          '无权限岗位这一条腿无法取证，判红不降级为跳过'
      );
    }
    const adminMe = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
    const [subjectA] = await pickActiveUserIds(page, [adminMe.id], 1);
    const cust = await createOwnedCustomer(page, '06', 'H', adminMe.id);
    const contract = await apiCallRaw<ContractRow>(page, 'POST', '/sales/sales-contracts', {
      contract_name: `E2E 越权靶 ${genCode('431I')}`,
      customer_id: cust.id,
      total_amount: '100.00',
    });

    const session = await loginInIsolatedContext(browser, cred.username, cred.password);
    try {
      // 三条 GET 腿：统一失败信封四键逐键断言（GET 不消费 CSRF，直接裸取原始响应体）
      const getLegs: Array<[string, string]> = [
        ['共享按用户回读', `/customer-shares/by-user?user_id=${subjectA}`],
        ['团队按用户回读', `/customer-team-members/by-user?user_id=${subjectA}`],
        ['成员判定', `/customer-team-members/check?customer_id=${cust.id}&user_id=${subjectA}`],
      ];
      for (const [label, path] of getLegs) {
        const env = await fetchEnvelope(session.page, path);
        log('06', `${label} 越权响应`, { status: env.status, code: env.body.code });
        assertUnifiedForbiddenEnvelope(env, `${label}腿（岗位 ${cred.username}）应被权限门拒绝`);
      }

      // 两条 POST 腿：走 apiCallExpectFail 以获得 CSRF 轮换处理，再断权限门归因
      const expireFail = await apiCallExpectFail(
        session.page,
        'POST',
        '/customer-shares/expire-overdue'
      );
      expectDenied(expireFail, `过期批量处理腿（岗位 ${cred.username}）应被权限门拒绝`);
      log('06', '过期腿越权被拒', expireFail);

      const signFail = await apiCallExpectFail(session.page, 'POST', '/contract-signatures/sign', {
        contract_id: contract.id,
        signed_by_user_id: subjectA,
        signature_image_url: 'https://e2e.invalid/431/forbidden.png',
        signature_certificate: 'E2E-431-FORBIDDEN',
      });
      expectDenied(signFail, `签署腿（岗位 ${cred.username}）应被权限门拒绝`);
      log('06', '签署腿越权被拒', signFail);

      // 拒绝必须真的没写进去：签署留痕列仍为 NULL，共享通道仍读不到任何行
      const contractAfterForbiddenSign = await apiCallRaw<ContractRow>(
        page,
        'GET',
        `/sales/sales-contracts/${contract.id}`
      );
      expect(
        contractAfterForbiddenSign.signed_at,
        '越权签署被拒后 signed_at 不应被写入（仍为 NULL）'
      ).toBeNull();
      expect(
        contractAfterForbiddenSign.signature_hash,
        '越权签署被拒后 signature_hash 不应被写入（仍为 NULL）'
      ).toBeNull();

      const adminReadback = await apiCallRaw<ShareRow[]>(
        page,
        'GET',
        `/customer-shares/by-customer?customer_id=${cust.id}`
      );
      expect(adminReadback.length, '越权的共享读腿不应在库里留下任何行').toBe(0);
    } finally {
      await session.close();
    }

    await tryCleanup(
      page,
      'DELETE',
      `/sales/sales-contracts/${contract.id}`,
      'sales_contract_431_06'
    );
    await tryCleanup(page, 'DELETE', `/crm/customers/${cust.id}`, 'customer_H');
  });
});
