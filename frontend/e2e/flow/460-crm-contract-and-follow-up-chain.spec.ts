// 460 CRM 合同与跟单跟进链 建档、阶段流转、审批门与金额日期口径
//
// 本文件守的业务事实（逐条对照后端写入方源码与迁移 DDL 实读，非推测）：
// 1. 客户跟单：POST /crm/customers/{id}/follow-ups 落 customer_followup 行
//    （models/customer_followup.rs：id(uuid)/customer_id/follow_up_type/content/follow_up_at/
//    next_follow_up_at/notes/created_by），notes 写真实操作人登录名（auth.username），
//    next_follow_date 为 YYYY-MM-DD 纯日期字符串，入库折成当日 00:00:00 UTC 存 next_follow_up_at；
//    GET 列表出参 = {items,total,page,page_size}（services/crm/cust.rs::list_follow_ups）。
//    客户不存在时两腿均 404 NOT_FOUND（AppError::not_found）。
// 2. 商机建档：POST /crm/opportunities 未传 stage 时默认 QUALIFICATION（opp_status 大写词表），
//    win_probability 按阶段自动填充（QUALIFICATION→10）；opportunity_no 由取号器生成 OPP 前缀；
//    owner_name 写 auth.username 真实登录名（services/crm/opp.rs::create_opportunity 文档口径，
//    禁止"用户{id}"式占位名）。PUT /crm/opportunities/{id} 改名后重读逐字符一致。
//    列表 GET /crm/opportunities 出参 = {data,total,page,page_size}。
// 3. 商机阶段状态机（写入方唯一事实来源 models/status/bpm_crm_contract.rs::crm_opportunity，
//    大写词表，比较点逐字符相同）：
//    ALL_STAGES = QUALIFICATION/NEEDS_ANALYSIS/PROPOSAL/NEGOTIATION/CLOSED_WON/CLOSED_LOST；
//    ALL_STATUSES = OPEN/CLOSED_WON/CLOSED_LOST。
//    合法链（validate_opportunity_stage_transition）：QUALIFICATION→NEEDS_ANALYSIS→PROPOSAL→
//    NEGOTIATION→CLOSED_WON，每跳 win_probability 按 default_win_probability_by_stage 重算
//    （25/40/50/100）。opportunity_stage 与 opportunity_status 是两列：PUT 流转只改 stage、
//    不碰 status（status 保持 OPEN 是源码事实，本文件按实断言）；status 由输单关单腿写。
//    非法跳转（词表内不可达组合）→ 400 BUSINESS_ERROR，重读 stage 不变；
//    建档时送词表外值（如小写 draft）→ ensure_valid_opportunity_stage 判 400 VALIDATION_ERROR，
//    不落库。
//    输单腿 POST /crm/opportunities/{id}/close-lost（CloseAsLostRequest.lost_reason 必填）：
//    空白理由 → 400 VALIDATION_ERROR；成功置 status/stage=CLOSED_LOST、win_probability=0、
//    lost_reason 真实落列；重复关单 → 400 BUSINESS_ERROR；已关闭商机的 PUT 改名 →
//    400 BUSINESS_ERROR（ensure_opportunity_not_closed 在 service.update_opportunity 首行）。
// 4. 商机跟进：POST /crm/opportunities/{id}/follow-ups 落 opportunity_follow_up 行
//    （follow_up_type/content 必填、next_follow_up_date 为 chrono::NaiveDate，JSON 只接受
//    "YYYY-MM-DD" 纯日期——送完整 ISO 时间戳在 serde 解码层即 400，属入参格式契约）；
//    同腿顺带回填商机主行 last_follow_up_date=今天、next_follow_up_date=送值
//    （services/crm/opp.rs::create_opportunity_follow_up）。GET 出参为裸数组（Vec<Model>）。
// 5. 合同建档与审批状态机（写入方 models/status/bpm_crm_contract.rs::contract，小写词表）：
//    draft→active（approve）、draft→rejected（reject）、draft|active→cancelled（cancel）；
//    门控值与写入值逐字符相同。POST /sales/sales-contracts 初始 status=draft、contract_no 取号
//    SC 前缀、customer_name 建单时从 customers 表回填真实客户名（冗余列，非占位串）；
//    total_amount 落库列为 DECIMAL(15,2)（m0011 DDL 实读），出参为序列化字符串，断言只认字符串
//    本身按 2 位标度整数比分，不在测试侧二次舍入。
//    approve/reject 理由均服务端必填（trim 非空）：通过理由落 approval_reason、拒绝理由落
//    rejected_reason，两动作两列；cancel 不使用 rejected_reason 列。
//    非法动作（active 再 approve、active 被 reject、cancelled 再 cancel）→ 400 BUSINESS_ERROR。
//    日期入参（signed_date/delivery_date/expiry_date/effective_date 均 Option<NaiveDate>）
//    必须发 YYYY-MM-DD 纯日期，完整 ISO 时间戳在解码层判格式不正确（400）。
// 6. 越权面：CI 库 quality_inspector 岗权限面 = 应用外壳键 + pieces 两键
//    （frontend/e2e/global-setup.ts SEED_ROLE_EXTRA_PERMISSIONS），不持 crm-opportunities:create
//    与 sales-contracts:create（运行时键由 URL 段派生：crm→opportunities 消歧为
//    crm-opportunities，sales→sales-contracts 保留原名，middleware/permission.rs +
//    utils/path_utils.rs RESOURCE_NAME_MAP）；真实登录打这两个写端点必 403 FORBIDDEN，
//    拒绝文案为固定字面量（middleware/permission.rs「权限不足，无法访问该资源」）；
//    被拒不得半改目标数据（用持键会话回读证明零标记行）。
//
// 失败信封唯一形状：{code,message,trace_id,timestamp}；
//   ValidationError/可外显校验错 → HTTP 400 code VALIDATION_ERROR；
//   BusinessError/可外显业务错 → HTTP 400 code BUSINESS_ERROR；
//   NotFound → HTTP 404 code NOT_FOUND；PermissionDenied 与 RBAC 中间件 → 403 code FORBIDDEN。
// 假成功防线：引用不存在客户（商机腿 404、合同腿 400 BUSINESS_ERROR）、必填缺失（解码层 400）、
//   内外销标记词表外值 400；各非法请求后重读列表，总数与行数不得增加、无本轮标记行残留。
//
// 已知源码缺口登记（实读判定，不据派工口径臆造断言，待后端/产品裁定后补测）：
//   a) 合同 total_amount 无非负门：CreateSalesContractRequestDto 无 range 校验、
//      sales_contract_service.create 不查符号、sales_contracts 迁移无 CHECK(total_amount>=0)
//      ——负金额会照常 200 入库。若断言负金额 4xx 将对着真实后端得到 200 成为假红旗，
//      故本文件不写该断言，登记为源码缺口。
//   b) 客户跟进 next_follow_date 非法字符串（含完整 ISO 时间戳）经 parse.ok() 静默折成 NULL
//      （services/crm/cust.rs::create_follow_up），不是拒绝路径，本文件只测纯日期正向腿，
//      非法形态不在此断言（与商机跟进腿 b 的 NaiveDate 强类型拒绝口径不同）。
//   c) 已关闭商机的 POST /{id}/follow-ups 与 POST /{id}/stage-change 无 closed 门：
//      create_opportunity_follow_up 与 record_stage_change 均不查 opportunity_status，
//      照常 200 落库。本文件的已关闭拒绝断言只覆盖真实存在的门（PUT 改名与重复关单）。
import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  isCsrfRejection,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

/** 商机阶段词表（逐字符取写入方 models/status/bpm_crm_contract.rs::crm_opportunity，大写） */
const OPP_STAGE = {
  QUALIFICATION: 'QUALIFICATION',
  NEEDS_ANALYSIS: 'NEEDS_ANALYSIS',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST',
} as const;

/** 合同状态词表（逐字符取写入方 models/status/bpm_crm_contract.rs::contract，小写） */
const CONTRACT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
} as const;

/**
 * DECIMAL 出参（字符串/数字）折指定位数标度的整数分位；
 * 超出标度且非零尾数即抛错判红，不静默截断、不二次舍入。
 */
function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** DECIMAL(15,2)/DECIMAL(5,2) 出参与期望值按 2 位标度整数比分 */
function eqScaled2(actual: unknown, expected: string, label: string): void {
  expect(
    toScaled(actual, 2, label),
    `${label}：期望=${expected} 实际=${JSON.stringify(actual)}`
  ).toBe(toScaled(expected, 2, `${label} 期望值`));
}

function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：未取得有效正整数主键，raw=${JSON.stringify(v)}`);
  return n;
}

function requireStr(v: unknown, label: string): string {
  if (typeof v !== 'string' || v === '')
    throw new Error(`${label}：出参非非空字符串，raw=${JSON.stringify(v)}`);
  return v;
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 失败信封的本地显式建模（键与 utils/error.rs ErrorResponse 逐字符同）：
 * apiCallExpectFail 的回包不带 trace_id/timestamp，rawFail 需要完整失败体取四键。
 */
interface RawFailBody {
  code?: string | number;
  message?: string | null;
  trace_id?: string;
  timestamp?: number;
}

/**
 * 原生失败请求（文件内局部工装，helpers 冻结不动）：apiCallExpectFail 的回包只带
 * status/code/message 三键，取不到失败信封的 trace_id/timestamp，无法断言
 * AppError 四键形状。本工装照 apiCallExpectFail 的头部范式串行取 CSRF cookie，
 * 返回完整解析后的失败 JSON；CSRF 竞败按 isCsrfRejection 有界重试一次，
 * 重试后仍是 CSRF 拒绝即抛错点名（不静默、不把中间件拒绝当业务拒绝）。
 */
async function rawFail(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: Row
): Promise<{ status: number; json: RawFailBody }> {
  const url = `${API_BASE}${API_PREFIX}${path}`;
  const csrfOf = async (): Promise<string> => {
    const cookies = await page.context().cookies();
    const csrf = cookies.find(c => c.name === 'csrf_token');
    if (!csrf) throw new Error('rawFail：csrf_token cookie 缺失（会话未就绪）');
    return csrf.value;
  };
  const doFetch = async (token: string): Promise<APIResponse> =>
    page.request.fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': token,
      },
      data: body !== undefined ? JSON.stringify(body) : undefined,
    });
  let response = await doFetch(await csrfOf());
  let text = await response.text();
  let json: RawFailBody;
  try {
    json = JSON.parse(text) as RawFailBody;
  } catch {
    throw new Error(`rawFail：非 JSON 响应 status=${response.status()} body=${text.slice(0, 200)}`);
  }
  if (isCsrfRejection(response.status(), json)) {
    response = await doFetch(await csrfOf());
    text = await response.text();
    try {
      json = JSON.parse(text) as RawFailBody;
    } catch {
      throw new Error(
        `rawFail：重试后非 JSON status=${response.status()} body=${text.slice(0, 200)}`
      );
    }
  }
  if (isCsrfRejection(response.status(), json)) {
    throw new Error(
      `rawFail：${method} ${path} 最终仍是 CSRF 中间件拒绝（status=${response.status()} code=${String(json.code)}）——不是被测的业务拒绝`
    );
  }
  return { status: response.status(), json };
}

/** 失败信封四键形状断言（utils/error.rs ErrorResponse：code/message 字符串、trace_id 字符串、timestamp 数值） */
function assertEnvelopeFourKeys(json: RawFailBody, label: string): void {
  expect(typeof json.code, `${label}：code 必须是字符串机器码`).toBe('string');
  expect(typeof json.message, `${label}：message 必须是字符串`).toBe('string');
  expect(
    requireStr(json.trace_id, `${label} trace_id`).length,
    `${label}：trace_id 必须非空`
  ).toBeGreaterThan(0);
  expect(typeof json.timestamp, `${label}：timestamp 必须是数值`).toBe('number');
  expect(Number.isFinite(json.timestamp as number), `${label}：timestamp 必须是有限数值`).toBe(
    true
  );
}

/** 商机建单入参：stage 缺省走写入方默认 QUALIFICATION；日期一律 YYYY-MM-DD 纯日期 */
function oppPayload(tag: string, customerId: number, extra?: Row): Row {
  return {
    opportunity_name: `E2E-${tag}-商机`,
    customer_id: customerId,
    estimated_amount: '88888.88',
    currency: 'CNY',
    expected_close_date: plusDays(45),
    priority: 'high',
    ...(extra ?? {}),
  };
}

/** 合同建单入参：total_amount 送字符串保 DECIMAL(15,2) 原值直落；日期纯日期形态 */
function contractPayload(tag: string, customerId: number, extra?: Row): Row {
  return {
    contract_name: `E2E-${tag}-合同`,
    customer_id: customerId,
    total_amount: '12345.67',
    contract_type: 'sales',
    payment_terms: '月结30天',
    delivery_date: plusDays(60),
    signed_date: plusDays(0),
    effective_date: plusDays(1),
    contract_market: 'domestic',
    tax_inclusive: false,
    remark: `E2E-${tag}-HEAD`,
    ...(extra ?? {}),
  };
}

async function readOpportunity(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/crm/opportunities/${id}`);
}

async function readContract(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/sales/sales-contracts/${id}`);
}

/** 商机列表定位本轮标记行（按 opportunity_name 精确匹配），缺键即点名 */
function findOppByName(rows: Row[], name: string): Row | undefined {
  return rows.find(r => r.opportunity_name === name);
}

test.describe('460 CRM 合同与跟单跟进链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('460-01 客户跟单建档后重读逐字符一致、下次跟进日期入库、不存在客户两腿 404', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const customerId = ctx.customerId;
    const tag = genCode('C460A');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myName = requireStr(me.username, '当前用户登录名');

    const content = `E2E-${tag}-拜访：确认染整交期与验货标准`;
    const nextDate = plusDays(21);
    const created = await apiCallRaw<Row>(page, 'POST', `/crm/customers/${customerId}/follow-ups`, {
      type: 'visit',
      content,
      next_follow_date: nextDate,
    });
    const followUpId = requireStr(created.id, '跟进记录主键（uuid 字符串）');
    expect(
      requireStr(created.follow_up_type, '跟进类型'),
      '建单出参 follow_up_type 与写入值逐字符一致'
    ).toBe('visit');
    expect(created.content, '建单出参 content 与写入值逐字符一致').toBe(content);
    expect(
      requireStr(created.notes, '操作人留痕'),
      'notes 写真实操作人登录名，禁止"用户{id}"式占位串'
    ).toBe(myName);
    expect(created.customer_id, 'customer_id 挂在目标客户下').toBe(customerId);

    // 列表腿重读（不信建单出参）：items/total/page/page_size 信封 + 本轮行逐字符回读
    const list = await apiCallRaw<Row>(
      page,
      'GET',
      `/crm/customers/${customerId}/follow-ups?page=1&page_size=50`
    );
    const items = pickListArray<Row>(list, 'items', '客户跟进列表');
    expect(Number(list.total) >= 1, 'total 至少含本轮一行').toBe(true);
    expect(Number(list.page), '分页回显 page=1').toBe(1);
    expect(Number(list.page_size), '分页回显 page_size=50').toBe(50);
    const mine = items.filter(r => String(r.content).includes(tag));
    expect(mine.length, '本轮标记的跟进行恰一条（重跑不漏写不重复）').toBe(1);
    const row = mine[0];
    expect(row.id, '列表行主键与建单返回一致').toBe(followUpId);
    expect(row.content, '列表重读 content 逐字符一致').toBe(content);
    expect(row.follow_up_type, '列表重读 follow_up_type 逐字符一致').toBe('visit');
    // next_follow_date 纯日期入库为当日 00:00:00 UTC
    expect(
      requireStr(row.next_follow_up_at, '下次跟进时间'),
      `下次跟进时间必须落在 ${nextDate} 当日零点`
    ).toMatch(new RegExp(`^${nextDate}T00:00:00`));

    // 不存在客户两腿均 404 NOT_FOUND（AppError::not_found，客户存在性先行校验）
    const ghost = 999999999;
    const fGet = await apiCallExpectFail(page, 'GET', `/crm/customers/${ghost}/follow-ups`);
    expect(fGet.status, '不存在客户跟进列表必 404').toBe(404);
    expect(failureCode(fGet), '列表 404 机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    const fPost = await apiCallExpectFail(page, 'POST', `/crm/customers/${ghost}/follow-ups`, {
      type: 'phone',
      content: `E2E-${tag}-幽灵客户跟进`,
    });
    expect(fPost.status, '不存在客户建档跟进必 404').toBe(404);
    expect(failureCode(fPost), '建档 404 机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    console.log(
      `[460-01] 客户跟单链通过 跟进=${followUpId} 下次跟进=${nextDate} 幽灵客户两腿均 404`
    );
  });

  test('460-02 商机建档默认阶段与赢率、字段逐字符重读、负责人真实名、PUT 改名一致、列表可见', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('C460B');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myName = requireStr(me.username, '当前用户登录名');
    const closeDate = plusDays(45);

    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, ctx.customerId)
    );
    const oppId = requireId(created.id, '商机主键');
    const detail = await readOpportunity(page, oppId);
    expect(requireStr(detail.opportunity_no, '商机编号'), '未传编号时由后端取号，OPP 前缀').toMatch(
      /^OPP/
    );
    expect(detail.opportunity_name, '商机名与写入值逐字符一致').toBe(`E2E-${tag}-商机`);
    expect(detail.customer_id, 'customer_id 挂目标客户').toBe(ctx.customerId);
    expect(detail.opportunity_stage, '未传阶段时写入方默认 QUALIFICATION（大写词表）').toBe(
      OPP_STAGE.QUALIFICATION
    );
    expect(detail.opportunity_status, '新建商机状态 OPEN').toBe('OPEN');
    eqScaled2(detail.win_probability, '10', 'QUALIFICATION 档自动赢率=10');
    eqScaled2(detail.estimated_amount, '88888.88', '预估金额 DECIMAL(15,2) 原值直落');
    expect(detail.expected_close_date, 'NaiveDate 出参纯日期、与入参逐字符一致').toBe(closeDate);
    expect(
      requireStr(detail.owner_name, '负责人展示名'),
      'owner_name 写真实登录名，禁止"用户{id}"式占位串'
    ).toBe(myName);
    expect(detail.actual_close_date, '未发生实际关闭，actual_close_date 落 NULL 不写 0').toBeNull();

    // PUT 改名（不送 stage，阶段与赢率不得被牵连改动）后重读逐字符一致
    const renamed = `E2E-${tag}-商机改名`;
    await apiCall(page, 'PUT', `/crm/opportunities/${oppId}`, { opportunity_name: renamed });
    const afterRename = await readOpportunity(page, oppId);
    expect(afterRename.opportunity_name, 'PUT 改名后重读逐字符一致').toBe(renamed);
    expect(afterRename.opportunity_stage, '改名不得牵连阶段').toBe(OPP_STAGE.QUALIFICATION);
    eqScaled2(afterRename.win_probability, '10', '改名不得牵连赢率');

    // 列表腿可见（{data,total,page,page_size} 信封），本轮行按名称精确命中
    const list = await apiCallRaw<Row>(page, 'GET', '/crm/opportunities?page=1&page_size=100');
    const rows = pickListArray<Row>(list, 'data', '商机列表');
    expect(Number(list.total) >= 1, 'total 至少含本轮一行').toBe(true);
    const hit = findOppByName(rows, renamed);
    expect(hit, '改名后列表须能按新名定位本轮行').toBeTruthy();
    expect(hit?.id, '列表行主键与详情一致').toBe(oppId);
    console.log(
      `[460-02] 商机建档链通过 商机=${oppId} 编号=${String(created.opportunity_no)} 负责人=${myName}`
    );
  });

  test('460-03 商机阶段合法链四跳逐跳落库、赢率按档重算、stage 与 status 两列互不牵连', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('460C');
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, ctx.customerId)
    );
    const oppId = requireId(created.id, '商机主键');

    // 每跳：PUT stage → 详情重读 stage 与 win_probability（default_win_probability_by_stage 档位值）
    const hops: Array<{ to: string; win: string }> = [
      { to: OPP_STAGE.NEEDS_ANALYSIS, win: '25' },
      { to: OPP_STAGE.PROPOSAL, win: '40' },
      { to: OPP_STAGE.NEGOTIATION, win: '50' },
      { to: OPP_STAGE.CLOSED_WON, win: '100' },
    ];
    let prevStage: string = OPP_STAGE.QUALIFICATION;
    let prevWin = '10';
    for (const hop of hops) {
      await apiCall(page, 'PUT', `/crm/opportunities/${oppId}`, { opportunity_stage: hop.to });
      const after = await readOpportunity(page, oppId);
      expect(
        after.opportunity_stage,
        `阶段必须真实推进到 ${hop.to}（上一档 ${prevStage}），重读值=${JSON.stringify(after.opportunity_stage)}`
      ).toBe(hop.to);
      eqScaled2(after.win_probability, hop.win, `${hop.to} 档自动赢率`);
      // 逐跳赢率必须区别于上一档（档位值互不相同是重算真实发生的对照前提）
      expect(
        toScaled(after.win_probability, 2, `${hop.to} 档赢率`) !==
          toScaled(prevWin, 2, `上一档 ${prevStage} 赢率`),
        `${hop.to} 档赢率必须区别于上一档 ${prevStage}`
      ).toBe(true);
      prevStage = hop.to;
      prevWin = hop.win;
    }

    // 源码事实：PUT 阶段流转只写 opportunity_stage，不碰 opportunity_status
    //（status 由 convert/close-lost 两条腿写，见 services/crm/opp.rs）。
    const finalDetail = await readOpportunity(page, oppId);
    expect(
      finalDetail.opportunity_status,
      'PUT 流转到 CLOSED_WON 阶段后 status 列仍是 OPEN（两列分离是写入方事实）'
    ).toBe('OPEN');

    // 同值 PUT（validate_opportunity_stage_transition 对 current==next 放行）：
    // 200 且 stage 与赢率原样不动，证明同档重写不产生档位漂移
    await apiCall(page, 'PUT', `/crm/opportunities/${oppId}`, {
      opportunity_stage: OPP_STAGE.CLOSED_WON,
    });
    const sameValue = await readOpportunity(page, oppId);
    expect(sameValue.opportunity_stage, '同值 PUT 后 stage 仍 CLOSED_WON').toBe(
      OPP_STAGE.CLOSED_WON
    );
    eqScaled2(sameValue.win_probability, '100', '同值 PUT 不得漂移赢率');

    // stage-change 腿：POST /{id}/stage-change 只落 opportunity_stage_history 历史行，
    // 不改主行 stage（handler 取 existing.opportunity_stage 为 from_stage，
    // service 仅 insert 历史，见 services/crm/opp.rs::record_stage_change）；
    // 历史回读走 GET /crm/opportunities/stage-duration?opportunity_id=（data 为裸数组）
    await apiCall(page, 'POST', `/crm/opportunities/${oppId}/stage-change`, {
      to_stage: OPP_STAGE.CLOSED_LOST,
    });
    const afterHistory = await readOpportunity(page, oppId);
    expect(
      afterHistory.opportunity_stage,
      'stage-change 是历史留痕端点，主行 stage 必须仍为 CLOSED_WON（不被历史写牵连）'
    ).toBe(OPP_STAGE.CLOSED_WON);
    const history = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/crm/opportunities/stage-duration?opportunity_id=${oppId}`
    );
    const histRows = pickListArray<Row>(history, 'bare', '阶段历史列表');
    const lostEntry = histRows.find(
      r => r.from_stage === OPP_STAGE.CLOSED_WON && r.to_stage === OPP_STAGE.CLOSED_LOST
    );
    expect(lostEntry, 'stage-change 历史行必须可按 from→to 档位回读').toBeTruthy();
    expect(lostEntry?.opportunity_id, '历史行挂本商机').toBe(oppId);
    expect(typeof lostEntry?.duration_days, '历史行停留天数为数值').toBe('number');
    console.log(
      `[460-03] 阶段链通过 商机=${oppId} 四跳逐档重算+同值重写+stage-change 历史留痕而主行不动`
    );
  });

  test('460-04 非法流转被拒且重读不变、建档词表外值 400、输单门与已关闭写门、假成功零残留', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('C460D');

    // 建档送词表外小写 draft → ensure_valid_opportunity_stage 判 400 VALIDATION_ERROR，不落库
    const fBadStage = await apiCallExpectFail(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, ctx.customerId, { opportunity_stage: 'draft' })
    );
    expect(fBadStage.status, '词表外阶段建档必 400').toBe(400);
    expect(failureCode(fBadStage), '非法阶段机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );

    // 必填缺失（去 customer_id，解码层收口 400）与引用不存在客户（404）均不落库
    const noCust = oppPayload(tag, ctx.customerId);
    delete noCust.customer_id;
    const fMissing = await apiCallExpectFail(page, 'POST', '/crm/opportunities', noCust);
    expect(fMissing.status, '缺 customer_id 建单必 400').toBe(400);
    expect(failureCode(fMissing), '缺必填机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const fGhost = await apiCallExpectFail(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, 999999999)
    );
    expect(fGhost.status, '引用不存在客户建商机必 404').toBe(404);
    expect(failureCode(fGhost), '客户不存在机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    // 落库守恒按标记行判（created_at 倒序，任何非法新行必在首页）：三枚非法请求零残留
    const listAfter = await apiCallRaw<Row>(page, 'GET', '/crm/opportunities?page=1&page_size=100');
    const scanned = pickListArray<Row>(listAfter, 'data', '非法建单后商机列表');
    const leakedOpps = scanned.filter(r => String(r.opportunity_name).includes(tag));
    expect(leakedOpps.length, '三枚非法建单都不得落库（本轮标记行必须为零）').toBe(0);

    // 非法跳转：QUALIFICATION → CLOSED_WON 不在合法出边集 → 400 BUSINESS_ERROR（四键信封），
    // 重读 stage 原值不变（被拒不得半改）
    const opp = await apiCallRaw<Row>(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, ctx.customerId)
    );
    const oppId = requireId(opp.id, '商机主键');
    const fJump = await rawFail(page, 'PUT', `/crm/opportunities/${oppId}`, {
      opportunity_stage: OPP_STAGE.CLOSED_WON,
    });
    expect(fJump.status, 'QUALIFICATION→CLOSED_WON 非法跳转必 400').toBe(400);
    assertEnvelopeFourKeys(fJump.json, '非法跳转拒绝体');
    expect(failureCode(fJump.json), '非法跳转机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const stillQual = await readOpportunity(page, oppId);
    expect(stillQual.opportunity_stage, '被拒跳转后阶段原样不动').toBe(OPP_STAGE.QUALIFICATION);

    // 输单门：空白理由 400 VALIDATION_ERROR；合法理由 → status/stage=CLOSED_LOST、
    // win_probability 归 0、lost_reason 逐字符落列
    const fBlank = await apiCallExpectFail(page, 'POST', `/crm/opportunities/${oppId}/close-lost`, {
      lost_reason: '   ',
    });
    expect(fBlank.status, '空白输单理由必 400').toBe(400);
    expect(failureCode(fBlank), '空白理由机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const reason = `E2E-${tag}-客户预算取消转向竞品`;
    await apiCall(page, 'POST', `/crm/opportunities/${oppId}/close-lost`, { lost_reason: reason });
    const lost = await readOpportunity(page, oppId);
    expect(lost.opportunity_status, '输单后 status=CLOSED_LOST（写 status 列的合法通道）').toBe(
      OPP_STAGE.CLOSED_LOST
    );
    expect(lost.opportunity_stage, '输单后 stage=CLOSED_LOST').toBe(OPP_STAGE.CLOSED_LOST);
    eqScaled2(lost.win_probability, '0', '输单赢率归 0');
    expect(lost.lost_reason, '流失原因逐字符落库').toBe(reason);

    // 已关闭门的写端点拒绝：重复关单与 PUT 改名均 400 BUSINESS_ERROR，且库内值不动
    const fReclose = await rawFail(page, 'POST', `/crm/opportunities/${oppId}/close-lost`, {
      lost_reason: `E2E-${tag}-重复关单`,
    });
    expect(fReclose.status, '已输单商机重复关单必 400').toBe(400);
    assertEnvelopeFourKeys(fReclose.json, '重复关单拒绝体');
    expect(failureCode(fReclose.json), '重复关单机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const fRenameClosed = await apiCallExpectFail(page, 'PUT', `/crm/opportunities/${oppId}`, {
      opportunity_name: `E2E-${tag}-已关闭改名`,
    });
    expect(fRenameClosed.status, '已关闭商机 PUT 改名必 400').toBe(400);
    expect(failureCode(fRenameClosed), '已关闭不可改机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const unchanged = await readOpportunity(page, oppId);
    expect(unchanged.opportunity_name, '被拒改名不得半改名称').toBe(`E2E-${tag}-商机`);
    expect(unchanged.lost_reason, '被拒重复关单不得覆盖流失原因').toBe(reason);
    console.log(`[460-04] 非法流转与关闭门通过 商机=${oppId} 三处 400 且重读零变更`);
  });

  test('460-05 商机跟进建档重读逐字符一致、日期契约纯日期与非法时间戳 400、缺必填 400', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('C460E');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myName = requireStr(me.username, '当前用户登录名');
    const opp = await apiCallRaw<Row>(
      page,
      'POST',
      '/crm/opportunities',
      oppPayload(tag, ctx.customerId)
    );
    const oppId = requireId(opp.id, '商机主键');

    const content = `E2E-${tag}-方案演示跟进`;
    const nextDate = plusDays(30);
    const created = await apiCallRaw<Row>(page, 'POST', `/crm/opportunities/${oppId}/follow-ups`, {
      follow_up_type: 'meeting',
      content,
      next_follow_up_date: nextDate,
    });
    expect(created.follow_up_type, '建单出参类型逐字符一致').toBe('meeting');
    expect(created.content, '建单出参内容逐字符一致').toBe(content);
    expect(created.next_follow_up_date, 'NaiveDate 纯日期入参原样回读').toBe(nextDate);
    expect(requireStr(created.user_name, '跟进人展示名'), 'user_name 写真实登录名').toBe(myName);
    expect(created.opportunity_id, '跟进挂在目标商机下').toBe(oppId);

    // 裸数组列表重读，本轮行恰一条且逐字符一致
    const list = await apiCallRaw<Row[]>(page, 'GET', `/crm/opportunities/${oppId}/follow-ups`);
    const rows = pickListArray<Row>(list, 'bare', '商机跟进列表');
    const mine = rows.filter(r => String(r.content).includes(tag));
    expect(mine.length, '本轮跟进行恰一条').toBe(1);
    expect(mine[0].id, '列表行主键与建单一致').toBe(created.id);

    // 同腿顺带回填商机主行（services/crm/opp.rs::create_opportunity_follow_up）
    const oppAfter = await readOpportunity(page, oppId);
    expect(oppAfter.next_follow_up_date, '主行 next_follow_up_date 回填为送值').toBe(nextDate);
    expect(
      requireStr(oppAfter.last_follow_up_date, '主行最近跟进日期'),
      '主行 last_follow_up_date 回填为今天'
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 日期契约负腿：完整 ISO 时间戳送 NaiveDate 字段 → 解码层拒绝，
    // 400 + 固定公开文案（utils/error.rs REQUEST_DECODING_PUBLIC，"请求格式不正确…"）；
    // 机器码暂不作判据（解码收口出参码以 CI 实跑为准）。
    const fIso = await apiCallExpectFail(page, 'POST', `/crm/opportunities/${oppId}/follow-ups`, {
      follow_up_type: 'phone',
      content: `E2E-${tag}-非法时间戳形态`,
      next_follow_up_date: `${nextDate}T00:00:00Z`,
    });
    expect(fIso.status, 'NaiveDate 送完整 ISO 时间戳必 400').toBe(400);
    expect(requireStr(fIso.message, '日期格式拒绝文案'), '解码层拒绝带固定文案').toContain(
      '请求格式不正确'
    );
    // 缺必填（无 content）同判 400；两枚非法请求后跟进列表仍恰一条（假成功零残留）
    const fNoContent = await apiCallExpectFail(
      page,
      'POST',
      `/crm/opportunities/${oppId}/follow-ups`,
      {
        follow_up_type: 'phone',
      }
    );
    expect(fNoContent.status, '缺 content 建跟进必 400').toBe(400);
    expect(failureCode(fNoContent), '缺必填机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const afterIllegal = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/crm/opportunities/${oppId}/follow-ups`
    );
    const leaked = pickListArray<Row>(afterIllegal, 'bare', '非法请求后跟进列表').filter(r =>
      String(r.content).includes(tag)
    );
    expect(leaked.length, '两枚非法跟进请求都不得落库').toBe(1);
    expect(leaked[0].content, '残留检查命中的仍是正向建档那一行').toBe(content);

    // 不存在商机的跟进列表腿 404（get_opportunity 先行存在性校验）
    const fGhost = await apiCallExpectFail(page, 'GET', '/crm/opportunities/999999999/follow-ups');
    expect(fGhost.status, '不存在商机跟进列表必 404').toBe(404);
    expect(failureCode(fGhost), '商机不存在机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    console.log(`[460-05] 商机跟进链通过 商机=${oppId} 纯日期正向、ISO 负例 400、列表零残留`);
  });

  test('460-06 合同建档金额与日期口径、审批状态机与两列理由、非法动作 400、假成功零残留', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('C460F');
    const customerDetail = await apiCallRaw<Row>(page, 'GET', `/crm/customers/${ctx.customerId}`);
    const customerName = requireStr(customerDetail.customer_name, '夹具客户名称');

    // 建单：total_amount 送 '12345.67'（DECIMAL(15,2) 列），日期全用 YYYY-MM-DD 纯日期
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/sales/sales-contracts',
      contractPayload(tag, ctx.customerId)
    );
    const contractId = requireId(created.id, '合同主键');
    const detail = await readContract(page, contractId);
    expect(requireStr(detail.contract_no, '合同编号'), '未传编号由后端取号，SC 前缀').toMatch(
      /^SC/
    );
    expect(detail.contract_name, '合同名逐字符一致').toBe(`E2E-${tag}-合同`);
    expect(detail.status, '新建合同初始状态小写 draft').toBe(CONTRACT_STATUS.DRAFT);
    eqScaled2(detail.total_amount, '12345.67', '合同金额 DECIMAL(15,2) 出参字符串原值');
    expect(requireStr(detail.delivery_date, '交期'), 'NaiveDate 出参纯日期且与入参逐字符一致').toBe(
      plusDays(60)
    );
    expect(detail.customer_name, '冗余列回填真实客户名，逐字符一致').toBe(customerName);
    expect(detail.customer_name, '客户名不得是"客户+编号"占位形态').not.toMatch(/^客户\s*\d+$/);
    expect(detail.approval_reason, '未审批前通过理由 NULL').toBeNull();
    expect(detail.rejected_reason, '未拒绝前拒绝理由 NULL').toBeNull();
    expect(detail.source_order_id, '手工建档溯源列落 NULL 而非 0').toBeNull();

    // 列表腿（data 为裸数组）按 customer_id 过滤可见，行内客户名同样是真实值
    const listVisible = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/sales/sales-contracts?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const visibleRows = pickListArray<Row>(listVisible, 'bare', '合同列表');
    const hit = visibleRows.find(r => r.id === contractId);
    expect(hit, '列表须能按主键定位本轮合同').toBeTruthy();
    expect(hit?.customer_name, '列表行 customer_name 与真实客户名逐字符一致').toBe(customerName);

    // approve 理由服务端必填：缺体键与纯空白均 400 VALIDATION_ERROR，状态不得半改
    const fNoReason = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-contracts/${contractId}/approve`,
      {}
    );
    expect(fNoReason.status, '缺通过理由审批必 400').toBe(400);
    expect(failureCode(fNoReason), '缺理由机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const fBlankReason = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-contracts/${contractId}/approve`,
      {
        approval_reason: '  ',
      }
    );
    expect(fBlankReason.status, '空白通过理由必 400').toBe(400);
    expect(failureCode(fBlankReason), '空白理由机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const stillDraft = await readContract(page, contractId);
    expect(stillDraft.status, '两次被拒审批后仍是 draft').toBe(CONTRACT_STATUS.DRAFT);

    // draft→active：通过理由逐字符落 approval_reason，rejected_reason 保持 NULL（两动作两列）
    const passReason = `E2E-${tag}-价格与交期核可`;
    await apiCall(page, 'POST', `/sales/sales-contracts/${contractId}/approve`, {
      approval_reason: passReason,
    });
    const active = await readContract(page, contractId);
    expect(active.status, '审批通过 draft→active').toBe(CONTRACT_STATUS.ACTIVE);
    expect(active.approval_reason, '通过理由逐字符落库').toBe(passReason);
    expect(active.rejected_reason, '通过动作不写拒绝理由列').toBeNull();

    // active 上的非法动作：再 approve、被 reject 均 400 BUSINESS_ERROR（后者验四键），
    // 重读 status 与两列理由零变更
    const fReapprove = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-contracts/${contractId}/approve`,
      {
        approval_reason: `E2E-${tag}-重复审批`,
      }
    );
    expect(fReapprove.status, 'active 再审批必 400（仅草稿可审核）').toBe(400);
    expect(failureCode(fReapprove), '重复审批机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const fRejectActive = await rawFail(
      page,
      'POST',
      `/sales/sales-contracts/${contractId}/reject`,
      {
        reason: `E2E-${tag}-对活跃合同非法拒绝`,
      }
    );
    expect(fRejectActive.status, 'active 被拒绝必 400（仅草稿可拒绝）').toBe(400);
    assertEnvelopeFourKeys(fRejectActive.json, '非法拒绝拒绝体');
    expect(failureCode(fRejectActive.json), '非法拒绝机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterIllegalActions = await readContract(page, contractId);
    expect(afterIllegalActions.status, '非法动作后仍 active').toBe(CONTRACT_STATUS.ACTIVE);
    expect(afterIllegalActions.approval_reason, '非法动作不得覆盖通过理由').toBe(passReason);
    expect(afterIllegalActions.rejected_reason, 'active 上拒绝被拒后拒绝理由仍 NULL').toBeNull();

    // active→cancelled；cancelled 上再 cancel 必 400（仅活跃或草稿可取消）
    await apiCall(page, 'PUT', `/sales/sales-contracts/${contractId}/cancel`, {
      reason: `E2E-${tag}-客户撤单作废`,
    });
    const cancelled = await readContract(page, contractId);
    expect(cancelled.status, '取消后 active→cancelled').toBe(CONTRACT_STATUS.CANCELLED);
    const fRecancel = await apiCallExpectFail(
      page,
      'PUT',
      `/sales/sales-contracts/${contractId}/cancel`,
      {
        reason: `E2E-${tag}-重复取消`,
      }
    );
    expect(fRecancel.status, 'cancelled 再取消必 400').toBe(400);
    expect(failureCode(fRecancel), '重复取消机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );

    // 假成功防线：缺必填（去 contract_name）、引用不存在客户、完整 ISO 日期、词表外内外销标记
    // 全部 4xx，且四枚非法请求都不得留下带各自标记的半成品行
    const noName = contractPayload(tag, ctx.customerId, { remark: `E2E-${tag}-NONAME` });
    delete noName.contract_name;
    const fMissing = await apiCallExpectFail(page, 'POST', '/sales/sales-contracts', noName);
    expect(fMissing.status, '缺合同名建单必 400').toBe(400);
    expect(failureCode(fMissing), '缺必填机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const fGhostCust = await apiCallExpectFail(
      page,
      'POST',
      '/sales/sales-contracts',
      contractPayload(tag, 999999999, { remark: `E2E-${tag}-GHOSTCUST` })
    );
    expect(fGhostCust.status, '引用不存在客户建合同必 400').toBe(400);
    expect(failureCode(fGhostCust), '客户不存在走业务拒绝族 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const fIsoDate = await apiCallExpectFail(
      page,
      'POST',
      '/sales/sales-contracts',
      contractPayload(tag, ctx.customerId, {
        signed_date: '2026-01-01T00:00:00Z',
        remark: `E2E-${tag}-BADISO`,
      })
    );
    expect(fIsoDate.status, 'NaiveDate 送完整 ISO 时间戳必 400').toBe(400);
    expect(failureCode(fIsoDate), '日期格式机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const fBadMarket = await apiCallExpectFail(
      page,
      'POST',
      '/sales/sales-contracts',
      contractPayload(tag, ctx.customerId, {
        contract_market: '内外销',
        remark: `E2E-${tag}-BADMARKET`,
      })
    );
    expect(fBadMarket.status, '词表外内外销标记必 400').toBe(400);
    expect(failureCode(fBadMarket), '词表外值机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    const listAfter = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/sales/sales-contracts?page=1&page_size=100`
    );
    const rowsAfter = pickListArray<Row>(listAfter, 'bare', '非法建单后合同列表');
    const rejectedMarkers = ['NONAME', 'GHOSTCUST', 'BADISO', 'BADMARKET'].map(k => `${tag}-${k}`);
    const halfDone = rowsAfter.filter(r => {
      const remark = r.remark;
      return typeof remark === 'string' && rejectedMarkers.some(m => remark.includes(m));
    });
    expect(halfDone.length, '四枚非法建单都不得落库（列表不得出现任何被拒标记行）').toBe(0);
    console.log(
      `[460-06] 合同状态机通过 合同=${contractId} draft→active→cancelled 四枚非法建单零残留`
    );
  });

  test('460-07 越权面：无 CRM 与合同写键岗位两枚写端点 403 四键信封且库内零变更', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('C460G');

    // 零变更判据按本轮标记行扫描（created_at 倒序，越权写端点若被放行，
    // 新品必然出现在列表首页），不依赖易受并发写漂移的列表总数

    // 切到 quality_inspector（CI 库权限面 = 外壳键 + pieces 两键，不持这两个写键）：
    // 两枚写端点均 403 FORBIDDEN，拒绝体统一四键信封，message 固定文案不带记录 ID
    await loginAsRole(page, 'quality_inspector');
    const fOpp = await rawFail(page, 'POST', '/crm/opportunities', oppPayload(tag, ctx.customerId));
    expect(fOpp.status, '无 crm-opportunities:create 建商机必 403').toBe(403);
    assertEnvelopeFourKeys(fOpp.json, '越权建商机拒绝体');
    expect(failureCode(fOpp.json), '越权机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    expect(fOpp.status === 200, '越权写端点绝不得 200').toBe(false);
    const fContract = await rawFail(
      page,
      'POST',
      '/sales/sales-contracts',
      contractPayload(tag, ctx.customerId)
    );
    expect(fContract.status, '无 sales-contracts:create 建合同必 403').toBe(403);
    assertEnvelopeFourKeys(fContract.json, '越权建合同拒绝体');
    expect(failureCode(fContract.json), '越权机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 切回持键会话证明库内零变更（403 会话自读不可信，读键同样缺失）
    await loginViaUI(page, testUsername(), testPassword(), true);
    const oppListAfter = await apiCallRaw<Row>(
      page,
      'GET',
      '/crm/opportunities?page=1&page_size=100'
    );
    const oppRows = pickListArray<Row>(oppListAfter, 'data', '越权后商机列表');
    const oppLeaks = oppRows.filter(r => String(r.opportunity_name).includes(tag));
    expect(oppLeaks.length, '越权被拒后商机首页不得出现本轮标记行').toBe(0);
    const contractListAfter = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/sales/sales-contracts?page=1&page_size=100`
    );
    const contractRowsAfter = pickListArray<Row>(contractListAfter, 'bare', '越权后合同列表');
    const contractLeaks = contractRowsAfter.filter(r => String(r.contract_name).includes(tag));
    expect(contractLeaks.length, '越权被拒后合同首页不得出现本轮标记行').toBe(0);
    console.log(
      `[460-07] 越权面通过 quality_inspector 两枚写端点均 403 四键信封且持键回读零标记行`
    );
  });
});
