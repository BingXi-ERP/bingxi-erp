import type { Browser } from '@playwright/test';
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  API_BASE,
  API_PREFIX,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  expectStateGateRejection,
  failureCode,
  genCode,
  genName,
  getRoleCredential,
  loginInIsolatedContext,
  tryCleanup,
  type ApiFailureResult,
  type ApiRequestBody,
} from './helpers';

/**
 * 色卡与样品打样主链（跨角色协作 + 字段专项回读）。
 *
 * 这枚文件测什么。
 * 1) 色卡建档链：色卡主档（卡号/卡名/类型/季节/品牌/封面图）→ 色号明细（色号、PANTONE/CNCS/自定义
 *    编码、RGB 与自动换算的 CMYK/CIELab、色片图）→ 每次都重新 GET 逐字段回读，钉住「写进去的等于读出来的」。
 * 2) 色卡图片面：封面图与色片图的替换只留新值、色号删除后明细集合真变空（按出参数组长度与 total_colors 判，
 *    不按界面可见性判）。
 * 3) 打样协作链：打样通知单 → 开始打样 → ABCD 多版小样（处方/工艺参数/染料与助剂与总成本回填）→ 对色登记
 *    （色差等级 + ΔE）→ 送客户确认 → 客户选中 OK 样 → 复样（车间半制品布批号 + 染料缸号）→ 复样结果 → 染色技术卡。
 *    按化验室真实分工换身份执行：打样员建单与打样、研发组长做对色判定与复样开卡、业务员在本链上没有写面。
 * 4) 跨角色可达与响应体键面：持色卡读面的岗位按卡名与色号都能命中同一条记录；不持该资源授权键的岗位读同一条
 *    记录被 RBAC 拒（HTTP 403 + 机器码 FORBIDDEN），且其响应体里不出现成本/价格类键。
 * 5) 时序门控：打样版数上限、同一通知单版本标识唯一、无小样不可送确认、通知单未 approved 不可复样、
 *    源样非 selected 不可复样、复样未 passed 不可开技术卡、对色结果不可重复记录、非 sampling 不可加小样。
 * 6) 反向腿：未被引用的待处理打样单可软删且回读即消失；已流转的打样单与被复样引用的 OK 样删除被点名拒绝且零副作用；
 *    色卡归档后主档更新与色号维护都被关闭。
 *
 * 字段专项的落库位置（逐列读 backend/src/models 与实体 Model，不自造键名）。
 * 色号与色彩空间在 color_card_item（color_code / pantone_code / cncs_code / custom_code / rgb_* / hex_value /
 * swatch_image_url）；打样版数与版本在 lab_dip_request.sample_versions 与 lab_dip_sample.version_label /
 * version_seq；缸号与车间半制品布批号在 lab_dip_resample.dye_batch_no / auxiliary_batch_no /
 * workshop_fabric_batch；门幅与克重在本域只有自由文本落点（lab_dip_request.fabric_spec，
 * 色卡与打样三张表均无 width/gsm/米数列，属契约缺口，本文件只在 fabric_spec 内承载并回读，不假装它是结构化列）；
 * 色差在 color_difference_grade（1-5 级整数）与 color_difference_value（ΔE，DECIMAL(5,2)）；
 * 色卡图片在 color_card.cover_image_url 与 color_card_item.swatch_image_url。
 *
 * 契约真相来源。
 * 路由逐条核 frontend/scripts/route-snapshot.txt 与 backend/src/routes/{color_card,production}.rs 的装配；
 * baseURL 已是 /api/v1/erp，本文件只写其后部分（色卡 /color-cards…，打样 /production/lab-dip…）。
 * 色卡出入参面在 models/color_card_create_dto.rs（Create/Update/Archive/Query）与
 * color_card_response_dto.rs（PagedResponse{items,total,page,page_size}、ColorCardListItem、ColorCardDetail、
 * ColorItemInfo、ScanResult），色号入参面在 models/color_card_item_dto.rs::ColorItemDto。
 * 打样出入参是实体全列（models/lab_dip_{request,sample,resample}.rs），请求体面在
 * services/lab_dip_ops/types.rs；DECIMAL 列出参按十进制字符串或数字两种形态出现，比较一律走 num() 归一。
 * 状态词表逐字符照写入方：色卡 models/status/wage_energy_chemical_business.rs::color_card
 * （小写 draft/issued/received/used/expired/archived/lost），打样通知单与小样、复样在
 * models/status/quality_dyeing.rs 的 lab_dip_request / lab_dip_sample / lab_dip_resample 三个子模块
 * （小写 pending/sampling/submitted/approved/rejected/completed、pending/matched/not_matched/selected、
 * pending/passed/failed/adjusted）。
 * 失败信封只有 AppError 一种形状（字符串 code + message + trace_id + timestamp），
 * 状态门拒绝一律 400 + BUSINESS_ERROR 族，按 expectStateGateRejection 判，404/403/5xx 都不算门生效。
 *
 * 依赖的既有夹具。
 * ./helpers 的 apiCall / apiCallRaw / apiCallExpectFail（带 CSRF 一次性令牌的重放与轮换）、
 * expectStateGateRejection、failureCode、genCode 与 genName（并发 worker 的唯一造数后缀）、
 * getRoleCredential + loginInIsolatedContext（角色真登录会话，凭证来自 global-setup 写出的
 * e2e/.auth/role-credentials.json）、tryCleanup（收尾回收，失败只留日志不静默）。
 * 会话身份：本文件的正写腿用分片 worker 会话（admin 短路 RBAC），跨角色腿按角色码取账号。
 * 角色授权面依据 backend/src/services/init_service_ops/permission.rs 的角色分组：
 * lab_technician 与 dye_recipe_master 持 ("lab-dip","*") 与 ("color-cards","*")，
 * sales_manager 持 ("color-cards","*")，sales_rep（e2e 镜像岗 salesperson 的同名后端岗）持
 * ("color-cards","read") —— 因此业务员对色卡读面是有键岗位，只能当"读得到"的正例，
 * 不能当"被 RBAC 拒"的反例。反例取 report_viewer：该岗既不在 init 的角色分组里，
 * 镜像建岗面又闭合到应用外壳两枚键（dashboard:read 与 notifications:read），
 * 对本文件的色卡与化验资源零授权键，403 只能来自权限门。
 * 化验室打样（lab-dip）面对业务员与 report_viewer 都不放行，两条反例同口径成立。
 *
 * 给谁看。色卡仓储与化验室打样两个域的实现者，以及后续要把这条链并入主流程回归的交付侧。
 */

type Row = Record<string, unknown>;

/** 一棒跨角色会话：真登录的隔离 context（含 page 与 close）加上该棒的角色码 */
type RoleSession = Awaited<ReturnType<typeof loginInIsolatedContext>> & { role: string };

/** 色卡资源前缀：routes/mod.rs nest /api/v1/erp + routes/color_card.rs 的 /color-cards */
const CC = '/color-cards';
/** 化验室打样资源前缀：routes/production.rs 的 /lab-dip 段 */
const LD = '/production/lab-dip';

/** 色卡状态词表（写入方 models/status/wage_energy_chemical_business.rs::color_card，小写原值逐字符照抄） */
const CARD_STATUS = {
  DRAFT: 'draft',
  ARCHIVED: 'archived',
} as const;

/** 打样通知单状态词表（写入方 models/status/quality_dyeing.rs::lab_dip_request） */
const REQ_STATUS = {
  PENDING: 'pending',
  SAMPLING: 'sampling',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
} as const;

/** 小样对色结果词表（写入方 models/status/quality_dyeing.rs::lab_dip_sample） */
const SAMPLE_MATCHING = {
  PENDING: 'pending',
  MATCHED: 'matched',
  NOT_MATCHED: 'not_matched',
  SELECTED: 'selected',
} as const;

/** 复样结果词表（写入方 models/status/quality_dyeing.rs::lab_dip_resample） */
const RESAMPLE_RESULT = {
  PENDING: 'pending',
  PASSED: 'passed',
} as const;

/**
 * 功能 判定出参对象并收窄为键值行，形态不符即抛错点名。
 * 调用方 本文件所有回读点的起手式。
 * 入参 value 后端 data 位的原始值（对象或数组元素）。
 * 传给谁 返回的行交本文件的 readStr / readNum / readNullable* 逐键取值。
 * 存什么 不存储，纯收窄。为什么不用 `?? {}` 兜底：缺键与空对象在断言里必须可分辨，
 * 兜底会把「后端没返这个键」读成「后端返了空值」。
 * 存哪里 无。
 */
function asRow(value: unknown, subject: string): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `${subject} 的出参应为对象，实际 ${JSON.stringify(value) ?? 'undefined'}——` +
        '形状不符契约（多为信封 data 位错位或后端返回 null），不做兜底、直接判红'
    );
  }
  return value as Row;
}

/**
 * 功能 判定出参数组并收窄为行数组，非数组即抛错点名。
 * 调用方 本文件列表与明细集合回读（items、色号集合、小样集合、复样集合）。
 * 入参 value 原始值；subject 该集合的业务名字，进判红消息。
 * 传给谁 返回值长度与内容直接进 expect。
 * 存什么 不存储。为什么不写 `?? []`：空集合必须是后端真的返回了空数组，
 * 而不是键缺失被兜底成空数组——后者会让「明细集合真变空」这条判据恒绿。
 * 存哪里 无。
 */
function asRows(value: unknown, subject: string): Row[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${subject} 的出参应为数组，实际 ${JSON.stringify(value) ?? typeof value}——` +
        '集合形状不符契约（缺键或非数组），不用空数组兜底'
    );
  }
  return value as Row[];
}

/**
 * 功能 按权威键名读取必填字符串列，缺失或类型不符即抛错点名键名。
 * 调用方 本文件逐字段回读（卡号、色号、状态、单号、URL）。
 * 入参 row 已收窄的出参行；key 后端序列化出来的键名；subject 行身份描述。
 * 传给谁 返回值进 expect(...).toBe(期望值)。
 * 存什么 不存储。
 * 存哪里 无。
 */
function readStr(row: Row, key: string, subject: string): string {
  const value = row[key];
  if (typeof value !== 'string') {
    throw new Error(
      `${subject} 的出参键 ${key} 应为字符串，实际 ${JSON.stringify(value)}（typeof=${typeof value}）` +
        '——键缺失或类型漂移都属契约不符，禁止用可选链或默认值掩盖'
    );
  }
  return value;
}

/**
 * 功能 按权威键名读取可空字符串列，要求键必须在场且值为字符串或 null。
 * 调用方 本文件读色卡的 season/brand/description/封面图、色号的编码族与色片图、打样各自由文本列。
 * 入参 row、key、subject 同上。
 * 传给谁 返回值（string | null）进调用方的等值或判空断言。
 * 存什么 不存储。为什么区分「键缺席」与「值为 null」：null 是该列真的为空，
 * 缺席是出参没带这一列，二者含义不同，混为一谈就把序列化漏列读成业务空值。
 * 存哪里 无。
 */
function readNullableStr(row: Row, key: string, subject: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(
      `${subject} 的出参缺键 ${key}（实际键集=${Object.keys(row).join(',')}）——` +
        '可空列也必须出参带键，不能靠缺席推断，判红不兜底'
    );
  }
  const value = row[key];
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(`${subject} 的出参键 ${key} 应为字符串或 null，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 功能 按权威键名读取必填数值列并归一为 number（DECIMAL 列出参是十进制字符串）。
 * 调用方 本文件比较 id、total_colors、RGB 三列、版数、色差等级、分页三键。
 * 入参 row、key、subject 同上。
 * 传给谁 返回值进 expect(...).toBe / toEqual。
 * 存什么 不存储。
 * 存哪里 无。
 */
function readNum(row: Row, key: string, subject: string): number {
  const value = row[key];
  const n = typeof value === 'number' ? value : Number(String(value));
  if (value === null || value === undefined || !Number.isFinite(n)) {
    throw new Error(
      `${subject} 的出参键 ${key} 应为可归一的数值，实际 ${JSON.stringify(value)}` +
        '——缺键或非数值都判红，不做默认值兜底'
    );
  }
  return n;
}

/**
 * 功能 按权威键名读取可空数值列并归一为 number | null。
 * 调用方 本文件读 CMYK/CIELab 自动换算列、工艺参数与成本三族、ΔE 色差值、复样加成系数。
 * 入参 row、key、subject 同上。
 * 传给谁 返回值进调用方的等值或判空断言。
 * 存什么 不存储。
 * 存哪里 无。
 */
function readNullableNum(row: Row, key: string, subject: string): number | null {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(
      `${subject} 的出参缺键 ${key}（实际键集=${Object.keys(row).join(',')}）——判红不兜底`
    );
  }
  const value = row[key];
  if (value === null) {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(n)) {
    throw new Error(
      `${subject} 的出参键 ${key} 应为数值、十进制字符串或 null，实际 ${JSON.stringify(value)}`
    );
  }
  return n;
}

/**
 * 功能 按权威键名读取布尔列（软删标记等）。
 * 调用方 本文件钉打样链三张表的 is_deleted 出参真值。
 * 入参 row、key、subject 同上。
 * 传给谁 返回值进 expect(...).toBe(false)。
 * 存什么 不存储。
 * 存哪里 无。
 */
function readBool(row: Row, key: string, subject: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') {
    throw new Error(
      `${subject} 的出参键 ${key} 应为布尔，实际 ${JSON.stringify(value)}（typeof=${typeof value}）`
    );
  }
  return value;
}

/**
 * 功能 按权威键名读取必填整数列，null 或类型不符即抛错（审计身份列专用）。
 * 调用方 本文件钉 created_by / approved_by / reviewed_by / tech_card_issued_by 四族非空。
 * 入参 row、key、subject 同上。
 * 传给谁 返回值进 expect(...).toBeGreaterThan(0) 与跨棒次身份比对。
 * 存什么 不存储。这些列唯一来源是服务端会话身份（打样 handler 不接收请求体身份字段），
 * 因此取不到值就说明身份没落库，必须点名而不是跳过。
 * 存哪里 无。
 */
function readRequiredId(row: Row, key: string, subject: string): number {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(`${subject} 的出参缺键 ${key}（实际键集=${Object.keys(row).join(',')}）`);
  }
  const value = row[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${subject} 的出参键 ${key} 应为正整数（身份列由服务端会话注入），实际 ${JSON.stringify(value)}`
    );
  }
  return value;
}

/**
 * 功能 判定时间戳列出参是真实时间字符串且可解析。
 * 调用方 本文件对色时间、客户确认时间、复样复核时间、开卡时间四处。
 * 入参 value 出参原始值。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。为什么不只判长度：String(null) 得到 "null" 同样非空，
 * 会把「时间没落库」读成「落了值」。
 * 存哪里 无。
 */
function isRealTimestamp(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * 功能 两个十进制出参按数值等值判定，容差 1e-9。
 * 调用方 本文件成本加和、加成系数、ΔE 与工艺参数的等值断言。
 * 入参 actual 与 expected 均为待比数的原始出参值。
 * 传给谁 结果直接进 expect(...).toBe(true)，消息由调用方给出。
 * 存什么 不存储。容差远小于本域最小线值 0.0001（DECIMAL(10,4) 与 (5,2)），
 * 只吸收 JS 双精度表示误差，不放宽业务精度。
 * 存哪里 无。
 */
function decimalEq(actual: unknown, expected: number): boolean {
  const a = Number(String(actual));
  return Number.isFinite(a) && Math.abs(a - expected) < 1e-9;
}

/**
 * 功能 生成 N 天后的 YYYY-MM-DD，作打样通知单必填的 required_date。
 * 调用方 本文件各条腿的建单载荷。
 * 入参 daysFromNow 距今天数（正整数）。
 * 传给谁 进 POST /production/lab-dip/requests 请求体 required_date 键，由
 * services/lab_dip_ops/request.rs 与当天比较（早于今天即拒）。
 * 存什么 不存储，纯函数。
 * 存哪里 无。
 */
function dateInDays(daysFromNow: number): string {
  const d = new Date(Date.now() + daysFromNow * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * 功能 按角色码取真登录的独立会话，凭证缺失即抛错点名角色码。
 * 调用方 本文件跨角色腿（打样员、研发组长、色卡读面岗、无授权键的业务员岗）。
 * 入参 browser Playwright browser；role 角色码（role-credentials.json 的键）。
 * 传给谁 返回会话的 page 交 apiCall / apiCallExpectFail 消费，close 由调用方在 finally 里收。
 * 存什么 不存储；会话 cookie 只活在各自 BrowserContext 内。
 * 存哪里 无。为什么不允许换用本 worker 账号顶替：跨角色判据的前提就是两个不同身份，
 * 同账号自问自答不构成协作，也不构成越权。
 */
async function openRoleSession(browser: Browser, role: string): Promise<RoleSession> {
  const cred = getRoleCredential(role);
  if (!cred) {
    throw new Error(
      `角色码 ${role} 在 e2e/.auth/role-credentials.json 与 env 两处都取不到凭证，` +
        '跨角色前提未落地（属 setup 缺陷，禁止改用本 worker 账号顶替成单人剧）'
    );
  }
  const session = await loginInIsolatedContext(browser, cred.username, cred.password);
  return { ...session, role };
}

/**
 * 功能 断言失败拒绝是「未授权岗位被 RBAC 拒」而不是路由缺失或后端裸崩。
 * 调用方 本文件跨角色负例（业务员岗读/写色卡与打样资源、无授权岗走打样写端点）。
 * 入参 result apiCallExpectFail 的返回；context 该拒绝的业务点名。
 * 传给谁 判据结果直接进 expect，消息进 Playwright 报告。
 * 存什么 不存储。钉 HTTP 恰 403 + 机器码 FORBIDDEN：404 属端点未注册或路由漂移、
 * 5xx 属后端裸崩、400 属状态门，三种都不是权限面，混用会把「授权没生效」读成「授权拦住了」。
 * 存哪里 无。
 */
function expectPermissionGateRejection(result: ApiFailureResult, context: string): void {
  expect(
    result.status,
    `${context}：应恰为 HTTP 403（RBAC 拒绝），实际 status=${result.status} code=${JSON.stringify(result.code)}` +
      '——404 属路由未注册、400 属状态门、5xx 属后端裸崩，都不是权限面'
  ).toBe(403);
  expect(
    failureCode(result),
    `${context}：403 必须带统一信封的字符串机器码 FORBIDDEN，实际 code=${JSON.stringify(result.code)}`
  ).toBe(APP_ERROR_CODES.FORBIDDEN);
}

/**
 * 功能 递归收集一个 JSON 值里出现过的全部对象键名。
 * 调用方 本文件响应体键面判据（授权读回的色卡详情、未授权岗 403 的失败体）。
 * 入参 value 已解析的响应体或其中任一层；out 累加器，缺省新建集合。
 * 传给谁 返回的键名数组进 expect(...).not.toContain 与 toContain。
 * 存什么 不存储，纯遍历。为什么要深扫而不是只看顶层：成本与价格类列可能藏在明细数组的元素里，
 * 只看顶层会把「明细带价」读成「响应体干净」。
 * 存哪里 无。
 */
function deepKeys(value: unknown, out: Set<string> = new Set()): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepKeys(item, out);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Row)) {
      out.add(key);
      deepKeys(child, out);
    }
  }
  return [...out];
}

/**
 * 金额类键名清单：本文件用它点名"读面不该带出的东西"，取值逐字符照后端列名。
 * 只收列本身携带金额的列名；指向价格记录的外键 ID 列不含任何金额，不入此列。
 */
const COST_KEYS = [
  'dye_cost',
  'auxiliary_cost',
  'total_cost',
  'base_price',
  'cost_price',
  'purchase_price',
] as const;

/**
 * 功能 以给定会话建一张打样通知单并返回收窄出参行。
 * 调用方 本文件打样链、门控与反向腿的建单步。
 * 入参 page 执行建单的会话页；overrides 需要覆盖的列（版数、交期、色号族等）。
 * 传给谁 返回行的 id 与 request_no 交后续流转步与回读断言消费。
 * 存什么 不存储；请求体的 light_source 与 required_date 是本域必填两列，缺任一即被拒。
 * 存哪里 落 lab_dip_request 表（写入方 services/lab_dip_ops/request.rs）。
 */
async function createLabDipRequest(page: Page, overrides: ApiRequestBody = {}): Promise<Row> {
  const colorNo = genCode('CL440');
  const body: ApiRequestBody = {
    light_source: 'D65',
    secondary_light_source: 'TL84',
    sample_type: 'fabric',
    customer_color_no: colorNo,
    customer_color_name: `${colorNo} 客户色名`,
    fabric_spec: '40S/1 全棉平纹 门幅 160cm 克重 180g/m²',
    fabric_component: '棉 100%',
    sample_size: '30x15cm',
    dye_category: 'reactive',
    eco_requirement: 'Oeko-Tex',
    expected_days: 3,
    sample_versions: 2,
    required_date: dateInDays(7),
    remarks: genName('E440打样备注'),
    ...overrides,
  };
  return asRow(
    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests`, body),
    '新建打样通知单响应'
  );
}

/**
 * 功能 回读一张打样通知单（按主键 GET）。
 * 调用方 本文件每一步状态流转后的落库回读。
 * 入参 page 会话页；id 通知单主键。
 * 传给谁 返回行进状态与字段断言。
 * 存什么 不存储。GET 走的是 lab_dip_handler.rs 的 get_request，软删后按主键读会 404，
 * 因此本函数既用于值回读也用于"消失"判据的前半段。
 * 存哪里 无。
 */
async function readLabDipRequest(page: Page, id: number): Promise<Row> {
  return asRow(
    await apiCallRaw<unknown>(page, 'GET', `${LD}/requests/${id}`),
    `打样通知单回读（id=${id}）`
  );
}

/**
 * 功能 以给定会话在某通知单下建一版打样小样并返回收窄出参行。
 * 调用方 本文件打样链、门控与反向腿的建样步。
 * 入参 page 会话页；requestId 所属通知单；body 处方、工艺参数与成本列（可缺省 version_label 让服务端按序生成）。
 * 传给谁 返回行的 id 与 version_label 交对色、送确认、复样各步消费。
 * 存什么 不存储。
 * 存哪里 落 lab_dip_sample 表（写入方 services/lab_dip_ops/sample.rs）。
 */
async function createLabDipSample(
  page: Page,
  requestId: number,
  body: ApiRequestBody
): Promise<Row> {
  return asRow(
    await apiRaw(page, 'POST', `${LD}/samples`, { request_id: requestId, ...body }),
    `新建打样小样响应（通知单 id=${requestId}）`
  );
}

/**
 * 功能 调 apiCallRaw 并把出参收窄成行，失败时把端点与业务名一起抛出。
 * 调用方 本文件的建样与建单包装函数。
 * 入参 page 会话页；method 写方法；path 资源路径；body 请求体。
 * 传给谁 返回原始 data 值交调用方的 asRow 收窄。
 * 存什么 不存储。单点包一层只为让 apiCallRaw 的泛型不必在每个调用点重复写 unknown。
 * 存哪里 无。
 */
async function apiRaw(
  page: Page,
  method: 'POST',
  path: string,
  body: ApiRequestBody
): Promise<unknown> {
  return apiCallRaw<unknown>(page, method, path, body);
}

/**
 * 功能 读某通知单下的小样集合。
 * 调用方 本文件版数上限、删除引用与零写入回读。
 * 入参 page 会话页；requestId 通知单主键。
 * 传给谁 返回数组的长度与内容进 expect。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function listLabDipSamples(page: Page, requestId: number): Promise<Row[]> {
  return asRows(
    await apiCallRaw<unknown>(page, 'GET', `${LD}/samples/by-request/${requestId}`),
    `小样集合回读（通知单 id=${requestId}）`
  );
}

/**
 * 功能 读某通知单下的复样记录集合。
 * 调用方 本文件"未 approved 不可复样"与"复样未 passed 不可开卡"的零写入回读。
 * 入参 page 会话页；requestId 通知单主键。
 * 传给谁 返回数组长度进 expect。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function listLabDipResamples(page: Page, requestId: number): Promise<Row[]> {
  return asRows(
    await apiCallRaw<unknown>(page, 'GET', `${LD}/resamples/by-request/${requestId}`),
    `复样集合回读（通知单 id=${requestId}）`
  );
}

/**
 * 功能 把一张通知单推到"有 1 版已对色为 matched 的小样"这一前置态。
 * 调用方 本文件门控腿与反向腿（都需要真前置才能撞下一个门，而不是靠缺参蒙混）。
 * 入参 page 会话页；overrides 建单覆盖列。
 * 传给谁 返回 {requestId, sampleId, colorNo} 交调用方继续流转与断言。
 * 存什么 不存储。
 * 存哪里 落 lab_dip_request 与 lab_dip_sample 两张表。
 */
async function seedMatchedSample(
  page: Page,
  overrides: ApiRequestBody = {}
): Promise<{ requestId: number; sampleId: number }> {
  const req = await createLabDipRequest(page, overrides);
  const requestId = readNum(req, 'id', '新建打样通知单响应');
  await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${requestId}/start-sampling`);
  const sample = await createLabDipSample(page, requestId, {
    recipe_no: genCode('R440'),
    formula: '活性红 3BS 2%(o.w.f) + 黄 0.4%',
    temperature: 60,
    time_minutes: 45,
    liquor_ratio: '1:5',
    ph_value: 10.5,
    dyeing_method: 'dip',
  });
  const sampleId = readNum(sample, 'id', '新建打样小样响应');
  await apiCallRaw<unknown>(page, 'POST', `${LD}/samples/${sampleId}/matching`, {
    color_difference_grade: 4,
    color_difference_value: 0.9,
    approval_comment: 'e2e 对色通过',
  });
  return { requestId, sampleId };
}

/**
 * 功能 把一张通知单推到"OK 样已选定、复样已登记且结果为 passed"这一前置态。
 * 调用方 本文件打样链主腿与技术卡门控腿。
 * 入参 page 会话页；opts.sessionLead 由哪个会话执行登记复样（真实业务归研发组长）。
 * 传给谁 返回 {requestId, sampleId, resampleId} 交后续开卡与引用保护断言。
 * 存什么 不存储。
 * 存哪里 落 lab_dip_request / lab_dip_sample / lab_dip_resample 三张表。
 */
async function seedPassedResample(
  page: Page,
  sampleId: number,
  requestId: number
): Promise<{ resampleId: number; resampleNo: string }> {
  await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${requestId}/submit`);
  await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${requestId}/approve`, {
    sample_id: sampleId,
    comment: 'e2e 客户选中 A 版',
  });
  const resample = asRow(
    await apiCallRaw<unknown>(page, 'POST', `${LD}/resamples`, {
      request_id: requestId,
      source_sample_id: sampleId,
      workshop_fabric_batch: genCode('WB440'),
      dye_batch_no: genCode('DY440'),
      auxiliary_batch_no: genCode('AZ440'),
      adjusted_formula: '在 OK 样处方上加成 5%',
      adjustment_factor: 1.05,
      adjusted_temperature: 62,
      adjusted_time_minutes: 50,
      adjusted_liquor_ratio: '1:8',
    }),
    '新建复样记录响应'
  );
  const resampleId = readNum(resample, 'id', '新建复样记录响应');
  return { resampleId, resampleNo: readStr(resample, 'resample_no', '新建复样记录响应') };
}

test.describe('色卡与样品打样主链', () => {
  test('440-01 色卡建档：主档与色号（含色片图）写入后逐字段回读一致', async ({ page }) => {
    const cardNo = genCode('CC440A');
    const cardName = genName('E440春季卡');
    const season = '2026SS';
    const brand = genName('E440品牌');
    const description = genName('E440描述');
    const coverUrl = `https://e2e.invalid/${cardNo}/cover-v1.png`;
    const colorCode = genCode('C440A');
    const colorName = genName('E440石榴红');
    const pantoneCode = genCode('P440');
    const cncsCode = genCode('N440');
    const customCode = genCode('X440');
    const swatchUrl = `https://e2e.invalid/${cardNo}/${colorCode}/swatch-v1.png`;

    const createdCard = asRow(
      await apiCallRaw<unknown>(page, 'POST', CC, {
        card_no: cardNo,
        card_name: cardName,
        card_type: 'PANTONE',
        season,
        brand,
        description,
        cover_image_url: coverUrl,
      }),
      '新建色卡响应'
    );
    const cardId = readNum(createdCard, 'id', '新建色卡响应');
    expect(cardId, '新建色卡应返回主键 id').toBeGreaterThan(0);

    const createdItem = asRow(
      await apiCallRaw<unknown>(page, 'POST', `${CC}/${cardId}/items`, {
        color_code: colorCode,
        color_name: colorName,
        rgb_r: 180,
        rgb_g: 60,
        rgb_b: 90,
        hex_value: '#B43C5A',
        pantone_code: pantoneCode,
        cncs_code: cncsCode,
        custom_code: customCode,
        swatch_image_url: swatchUrl,
        sequence: 1,
      }),
      '新建色号响应'
    );
    const itemId = readNum(createdItem, 'id', '新建色号响应');

    const detail = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}`),
      `色卡详情回读（id=${cardId}）`
    );
    expect(readStr(detail, 'card_no', '色卡详情'), '卡号必须逐字符等于提交值').toBe(cardNo);
    expect(readStr(detail, 'card_name', '色卡详情')).toBe(cardName);
    expect(readStr(detail, 'card_type', '色卡详情')).toBe('PANTONE');
    expect(readNullableStr(detail, 'season', '色卡详情')).toBe(season);
    expect(readNullableStr(detail, 'brand', '色卡详情')).toBe(brand);
    expect(readNullableStr(detail, 'description', '色卡详情')).toBe(description);
    expect(readNullableStr(detail, 'cover_image_url', '色卡详情'), '封面图必须落库并原样读出').toBe(
      coverUrl
    );
    expect(readStr(detail, 'status', '色卡详情'), '新建色卡状态由写入方落草稿态').toBe(
      CARD_STATUS.DRAFT
    );
    expect(readNum(detail, 'total_colors', '色卡详情'), '建号后色卡总色号数应随明细递增到 1').toBe(
      1
    );
    expect(
      readNum(detail, 'stock_quantity', '色卡详情'),
      '建档不登记库存，出参应为 0 而非缺键'
    ).toBe(0);
    expect(readNum(detail, 'issued_quantity', '色卡详情')).toBe(0);
    expect(isRealTimestamp(detail['created_at']), '创建时间必须是可解析时间串').toBe(true);

    const items = asRows(detail['items'], `色卡详情 items（id=${cardId}）`);
    expect(items.length, '详情内色号集合应恰好 1 行').toBe(1);
    const row = asRow(items[0], '色卡详情内的色号行');
    expect(readStr(row, 'color_code', '色号行'), '色号必须逐字符等于提交值').toBe(colorCode);
    expect(readStr(row, 'color_name', '色号行')).toBe(colorName);
    expect(readNum(row, 'rgb_r', '色号行')).toBe(180);
    expect(readNum(row, 'rgb_g', '色号行')).toBe(60);
    expect(readNum(row, 'rgb_b', '色号行')).toBe(90);
    expect(readStr(row, 'hex_value', '色号行'), 'HEX 原样入库不重算').toBe('#B43C5A');
    expect(readNullableStr(row, 'pantone_code', '色号行')).toBe(pantoneCode);
    expect(readNullableStr(row, 'cncs_code', '色号行')).toBe(cncsCode);
    expect(readNullableStr(row, 'custom_code', '色号行')).toBe(customCode);
    expect(readNullableStr(row, 'swatch_image_url', '色号行'), '色片图必须落库并原样读出').toBe(
      swatchUrl
    );
    expect(readNum(row, 'sequence', '色号行')).toBe(1);
    expect(readNum(row, 'color_card_id', '色号行'), '色号必须挂在这张卡下').toBe(cardId);
    for (const key of [
      'cmyk_c',
      'cmyk_m',
      'cmyk_y',
      'cmyk_k',
      'lab_l',
      'lab_a',
      'lab_b',
    ] as const) {
      expect(
        readNullableNum(row, key, '色号行'),
        `提交未带 ${key}，应由服务端按 RGB 自动换算出值而不是留空`
      ).not.toBeNull();
    }

    const itemPage = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}/items?page=1&page_size=20`),
      `色号分页回读（色卡 id=${cardId}）`
    );
    expect(readNum(itemPage, 'total', '色号分页'), '色号分页总数应为 1').toBe(1);
    expect(readNum(itemPage, 'page', '色号分页')).toBe(1);
    expect(readNum(itemPage, 'page_size', '色号分页')).toBe(20);
    expect(
      readNum(
        asRow(asRows(itemPage['items'], '色号分页 items')[0], '色号分页首行'),
        'id',
        '色号分页首行'
      ),
      '色号分页首行应是刚建的那条色号'
    ).toBe(itemId);

    const list = asRow(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `${CC}?keyword=${encodeURIComponent(cardName)}&page=1&page_size=20`
      ),
      `色卡列表按卡名筛选（${cardName}）`
    );
    const listRows = asRows(list['items'], '色卡列表 items');
    const mine = listRows.filter(r => String(r['card_no']) === cardNo);
    expect(mine.length, `列表按卡名筛选应命中且只命中本次新建的 ${cardNo}`).toBe(1);
    const listItem = asRow(mine[0], '色卡列表命中行');
    expect(readStr(listItem, 'card_name', '色卡列表命中行')).toBe(cardName);
    expect(readNum(listItem, 'id', '色卡列表命中行'), '列表与详情必须指向同一行').toBe(cardId);
    expect(readStr(listItem, 'status', '色卡列表命中行')).toBe(CARD_STATUS.DRAFT);
    expect(readNum(listItem, 'total_colors', '色卡列表命中行')).toBe(1);
    expect(readNullableStr(listItem, 'cover_image_url', '色卡列表命中行')).toBe(coverUrl);

    await tryCleanup(page, 'DELETE', `${CC}/${cardId}`, '归档本次新建色卡');
  });

  test('440-02 色卡图片面：封面图与色片图替换只留新值、色号删除后明细集合真变空', async ({
    page,
  }) => {
    const cardNo = genCode('CC440B');
    const cardName = genName('E440图片卡');
    const colorCode = genCode('C440B');
    const coverV1 = `https://e2e.invalid/${cardNo}/cover-v1.png`;
    const coverV2 = `https://e2e.invalid/${cardNo}/cover-v2.png`;
    const swatchV1 = `https://e2e.invalid/${cardNo}/${colorCode}/swatch-v1.png`;
    const swatchV2 = `https://e2e.invalid/${cardNo}/${colorCode}/swatch-v2.png`;

    const card = asRow(
      await apiCallRaw<unknown>(page, 'POST', CC, {
        card_no: cardNo,
        card_name: cardName,
        card_type: 'CNCS',
        cover_image_url: coverV1,
      }),
      '新建色卡响应（图片腿）'
    );
    const cardId = readNum(card, 'id', '新建色卡响应（图片腿）');
    const itemBody: ApiRequestBody = {
      color_code: colorCode,
      color_name: genName('E440靛蓝'),
      rgb_r: 40,
      rgb_g: 80,
      rgb_b: 160,
      hex_value: '#2850A0',
      swatch_image_url: swatchV1,
      sequence: 1,
    };
    const item = asRow(
      await apiCallRaw<unknown>(page, 'POST', `${CC}/${cardId}/items`, itemBody),
      '新建色号响应（图片腿）'
    );
    const itemId = readNum(item, 'id', '新建色号响应（图片腿）');

    const putEnvelope = await apiCall<unknown>(page, 'PUT', `${CC}/${cardId}`, {
      cover_image_url: coverV2,
    });
    expect(putEnvelope.code, '色卡封面图更新应走成功信封').toBe(200);
    const afterCoverPut = asRow(putEnvelope.data, '色卡封面图更新的即时出参');

    const detailAfterCover = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}`),
      `色卡详情回读（封面替换后，id=${cardId}）`
    );
    expect(
      readNullableStr(detailAfterCover, 'cover_image_url', '色卡详情'),
      '替换后读回应是新图'
    ).toBe(coverV2);
    expect(JSON.stringify(detailAfterCover), '响应体里不应残留旧封面图 URL').not.toContain(coverV1);
    expect(readStr(detailAfterCover, 'card_name', '色卡详情'), '只提交封面图时卡名不应被抹掉').toBe(
      cardName
    );
    expect(readStr(detailAfterCover, 'card_type', '色卡详情'), '缺省的列保持原值').toBe('CNCS');
    expect(readNum(detailAfterCover, 'total_colors', '色卡详情'), '缺省的列保持原值').toBe(1);
    expect(readNum(detailAfterCover, 'stock_quantity', '色卡详情'), '未提交库存时库存不动').toBe(0);
    expect(
      readNullableStr(afterCoverPut, 'cover_image_url', '色卡封面图更新的即时出参'),
      '更新端点的即时出参与回读必须一致'
    ).toBe(coverV2);

    const replacedItem = asRow(
      await apiCallRaw<unknown>(page, 'PUT', `${CC}/${cardId}/items/${itemId}`, {
        ...itemBody,
        swatch_image_url: swatchV2,
      }),
      '色号色片图替换的出参'
    );
    expect(readNullableStr(replacedItem, 'swatch_image_url', '色号色片图替换的出参')).toBe(
      swatchV2
    );

    const itemsAfterSwap = asRows(
      asRow(
        await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}`),
        '色卡详情回读（色片替换后）'
      )['items'],
      `色卡明细（色片替换后，id=${cardId}）`
    );
    expect(itemsAfterSwap.length, '替换色片图不应新增明细行').toBe(1);
    const swappedRow = asRow(itemsAfterSwap[0], '替换后的色号行');
    expect(
      readNullableStr(swappedRow, 'swatch_image_url', '替换后的色号行'),
      '色片图只剩新值'
    ).toBe(swatchV2);
    expect(JSON.stringify(swappedRow), '色号行里不应残留旧色片图 URL').not.toContain(swatchV1);
    expect(readStr(swappedRow, 'color_code', '替换后的色号行'), '整量更新里色号仍等于原值').toBe(
      colorCode
    );

    await apiCall(page, 'DELETE', `${CC}/${cardId}/items/${itemId}`);

    const detailAfterDelete = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}`),
      `色卡详情回读（色号删除后，id=${cardId}）`
    );
    expect(
      asRows(detailAfterDelete['items'], `色卡明细（色号删除后，id=${cardId}）`).length,
      '删除后详情内的色号集合必须真变空'
    ).toBe(0);
    expect(
      readNum(detailAfterDelete, 'total_colors', '色卡详情'),
      '删除色号后总色号数应回到 0'
    ).toBe(0);

    const itemsEndpointAfterDelete = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}/items?page=1&page_size=20`),
      `色号分页回读（色号删除后，id=${cardId}）`
    );
    expect(
      asRows(itemsEndpointAfterDelete['items'], '色号分页（删除后）').length,
      '色号分页也必须为空'
    ).toBe(0);
    expect(readNum(itemsEndpointAfterDelete, 'total', '色号分页（删除后）'), '分页总数应归零').toBe(
      0
    );

    const repeatDelete = await apiCallExpectFail(page, 'DELETE', `${CC}/${cardId}/items/${itemId}`);
    expect(repeatDelete.status, '同一色号重复删除应报未找到，坐实删除确实生效').toBe(404);
    expect(failureCode(repeatDelete), '重复删除的机器码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );

    await tryCleanup(page, 'DELETE', `${CC}/${cardId}`, '归档本次新建色卡（图片腿）');
  });

  test('440-03 打样协作链：打样员建单打样与回填成本、研发组长对色与复样开卡，状态按词表逐级流转', async ({
    browser,
  }) => {
    const sampler = await openRoleSession(browser, 'lab_technician');
    const lead = await openRoleSession(browser, 'dye_recipe_master');
    const outsider = await openRoleSession(browser, 'salesperson');
    expect(
      new Set([sampler.username, lead.username, outsider.username]).size,
      `三棒必须是三个不同账号，实际 ${[sampler.username, lead.username, outsider.username].join(' / ')}`
    ).toBe(3);

    try {
      const req = await createLabDipRequest(sampler.page, { sample_versions: 2 });
      const requestId = readNum(req, 'id', '新建打样通知单响应');
      const samplerId = readRequiredId(req, 'created_by', '新建打样通知单响应');
      expect(readStr(req, 'status', '新建打样通知单响应'), '建单即落待处理态').toBe(
        REQ_STATUS.PENDING
      );
      expect(
        readStr(req, 'request_no', '新建打样通知单响应'),
        '通知单号由服务端生成且前缀为 LD'
      ).toMatch(/^LD/);
      expect(readNum(req, 'sample_versions', '新建打样通知单响应')).toBe(2);
      expect(
        readStr(req, 'fabric_spec', '新建打样通知单响应'),
        '门幅与克重按坯布规格自由文本列原样落库'
      ).toBe('40S/1 全棉平纹 门幅 160cm 克重 180g/m²');
      expect(readStr(req, 'light_source', '新建打样通知单响应')).toBe('D65');
      expect(readStr(req, 'required_date', '新建打样通知单响应')).toBe(dateInDays(7));

      const outsiderWrite = await apiCallExpectFail(
        outsider.page,
        'POST',
        `${LD}/requests`,
        await outsiderBody()
      );
      expectPermissionGateRejection(outsiderWrite, '业务员岗（无化验室打样授权键）建打样通知单');

      // 建单即 pending，后端只允许 sampling 状态挂小样，先推 pending → sampling 再建样。
      await apiCallRaw<unknown>(sampler.page, 'POST', `${LD}/requests/${requestId}/start-sampling`);
      await createLabDipSample(sampler.page, requestId, {
        recipe_no: genCode('R440A'),
        formula: '活性红 3BS 2%(o.w.f)',
        formula_detail: [{ dye_name: '活性红 3BS', amount: 2, unit: '%(o.w.f)', percentage: 2 }],
        temperature: 60,
        time_minutes: 45,
        liquor_ratio: '1:5',
        ph_value: 10.5,
        dyeing_method: 'dip',
        dye_cost: 12.5,
        auxiliary_cost: 3.25,
        total_cost: 15.75,
      });
      const sampleB = await createLabDipSample(sampler.page, requestId, {
        recipe_no: genCode('R440B'),
        formula: '活性红 3BS 2.4%(o.w.f)',
        temperature: 60,
        time_minutes: 50,
        liquor_ratio: '1:5',
        dyeing_method: 'dip',
      });
      const sampleBId = readNum(sampleB, 'id', '新建打样小样响应');

      const samples = await listLabDipSamples(sampler.page, requestId);
      expect(samples.length, '通知单下应有 2 版小样').toBe(2);
      const sampleA = asRow(samples[0], '小样集合首行');
      const sampleAId = readNum(sampleA, 'id', '小样集合首行');
      expect(readStr(sampleA, 'version_label', '小样集合首行'), '未传版本标识时按序生成 A').toBe(
        'A'
      );
      expect(readNum(sampleA, 'version_seq', '小样集合首行')).toBe(1);
      expect(readStr(sampleB, 'version_label', '第二版小样'), '显式提交的版本标识应原样落库').toBe(
        'B'
      );
      expect(
        readStr(sampleA, 'matching_result', '小样集合首行'),
        '新建小样的对色结果落待对色态'
      ).toBe(SAMPLE_MATCHING.PENDING);
      const readSampleA = asRow(
        await apiCallRaw<unknown>(sampler.page, 'GET', `${LD}/samples/${sampleAId}`),
        `小样回读（id=${sampleAId}）`
      );
      expect(decimalEq(readSampleA['dye_cost'], 12.5), '染料成本回填列必须原值读回').toBe(true);
      expect(decimalEq(readSampleA['auxiliary_cost'], 3.25), '助剂成本回填列必须原值读回').toBe(
        true
      );
      expect(decimalEq(readSampleA['total_cost'], 15.75), '总成本回填列必须原值读回').toBe(true);
      expect(
        decimalEq(
          readSampleA['total_cost'],
          Number(String(readSampleA['dye_cost'])) + Number(String(readSampleA['auxiliary_cost']))
        ),
        '总成本应等于染料成本加助剂成本'
      ).toBe(true);
      expect(decimalEq(readSampleA['temperature'], 60), '染色温度列必须原值读回').toBe(true);
      expect(readStr(readSampleA, 'liquor_ratio', '小样回读')).toBe('1:5');
      const formulaDetail = asRows(readSampleA['formula_detail'], '小样处方明细');
      expect(formulaDetail.length, '处方明细 JSON 应原样往返').toBe(1);
      const detailItem = asRow(formulaDetail[0], '处方明细首项');
      expect(readStr(detailItem, 'dye_name', '处方明细首项')).toBe('活性红 3BS');
      expect(decimalEq(detailItem['amount'], 2)).toBe(true);
      expect(readStr(detailItem, 'unit', '处方明细首项')).toBe('%(o.w.f)');

      const matchedA = asRow(
        await apiCallRaw<unknown>(lead.page, 'POST', `${LD}/samples/${sampleAId}/matching`, {
          color_difference_grade: 4,
          color_difference_value: 0.85,
          approval_comment: 'e2e 研发组长判定 4 级通过',
        }),
        'A 版对色登记出参'
      );
      expect(
        readStr(matchedA, 'matching_result', 'A 版对色登记出参'),
        '色差 4 级应判为 matched'
      ).toBe(SAMPLE_MATCHING.MATCHED);
      const notMatchedB = asRow(
        await apiCallRaw<unknown>(lead.page, 'POST', `${LD}/samples/${sampleBId}/matching`, {
          color_difference_grade: 2,
          color_difference_value: 3.6,
          approval_comment: 'e2e 研发组长判定 2 级需重打',
        }),
        'B 版对色登记出参'
      );
      expect(
        readStr(notMatchedB, 'matching_result', 'B 版对色登记出参'),
        '色差低于 4 级应判为 not_matched'
      ).toBe(SAMPLE_MATCHING.NOT_MATCHED);
      const leadId = readRequiredId(matchedA, 'approved_by', 'A 版对色登记出参');
      expect(isRealTimestamp(matchedA['approved_at']), '对色时间应随对色登记落库').toBe(true);
      expect(leadId, '对色审核人取会话身份，必须与建单人是两个不同用户').not.toBe(samplerId);

      const submitted = asRow(
        await apiCallRaw<unknown>(sampler.page, 'POST', `${LD}/requests/${requestId}/submit`),
        '送客户确认出参'
      );
      expect(readStr(submitted, 'status', '送客户确认出参')).toBe(REQ_STATUS.SUBMITTED);

      const approved = asRow(
        await apiCallRaw<unknown>(sampler.page, 'POST', `${LD}/requests/${requestId}/approve`, {
          sample_id: sampleAId,
          comment: 'e2e 客户选中 A 版作 OK 样',
        }),
        '客户确认 OK 样出参'
      );
      expect(readStr(approved, 'status', '客户确认 OK 样出参')).toBe(REQ_STATUS.APPROVED);
      expect(
        readNum(approved, 'approved_sample_id', '客户确认 OK 样出参'),
        '应记下被选中的样版'
      ).toBe(sampleAId);
      expect(isRealTimestamp(approved['customer_approved_at']), '客户确认时间应落库').toBe(true);
      expect(
        readStr(
          asRow(
            (await listLabDipSamples(sampler.page, requestId)).find(
              r => Number(String(r['id'])) === sampleAId
            ) ?? null,
            'OK 样回读行'
          ),
          'matching_result',
          'OK 样回读行'
        ),
        '被选中的 OK 样对色结果应升级为 selected'
      ).toBe(SAMPLE_MATCHING.SELECTED);

      const resample = asRow(
        await apiCallRaw<unknown>(lead.page, 'POST', `${LD}/resamples`, {
          request_id: requestId,
          source_sample_id: sampleAId,
          workshop_fabric_batch: genCode('WB440'),
          dye_batch_no: genCode('DY440'),
          auxiliary_batch_no: genCode('AZ440'),
          adjusted_formula: '在 OK 样处方上加成 5%',
          adjustment_factor: 1.05,
          adjusted_temperature: 62,
          adjusted_time_minutes: 50,
          adjusted_liquor_ratio: '1:8',
        }),
        '研发组长登记复样出参'
      );
      const resampleId = readNum(resample, 'id', '研发组长登记复样出参');
      const resampleNo = readStr(resample, 'resample_no', '研发组长登记复样出参');
      expect(resampleNo, '复样单号由服务端生成且前缀为 RS').toMatch(/^RS/);
      expect(readStr(resample, 'result', '研发组长登记复样出参'), '复样结果初值落待判定态').toBe(
        RESAMPLE_RESULT.PENDING
      );
      expect(readNum(resample, 'source_sample_id', '研发组长登记复样出参')).toBe(sampleAId);
      expect(readStr(resample, 'dye_batch_no', '研发组长登记复样出参'), '缸号列必须原样落库').toBe(
        readStr(resample, 'dye_batch_no', '研发组长登记复样出参')
      );
      expect(
        readBool(resample, 'is_deleted', '研发组长登记复样出参'),
        '新登记复样记录不应带软删标记'
      ).toBe(false);
      expect(
        readNullableStr(resample, 'tech_card_no', '研发组长登记复样出参'),
        '未复样判定前不应有技术卡号'
      ).toBeNull();

      const judged = asRow(
        await apiCallRaw<unknown>(lead.page, 'POST', `${LD}/resamples/${resampleId}/result`, {
          color_difference_grade: 5,
          color_difference_value: 0.6,
          review_comment: 'e2e 复样色差 5 级可投产',
        }),
        '复样结果判定出参'
      );
      expect(readStr(judged, 'result', '复样结果判定出参'), '复样色差 5 级应判为 passed').toBe(
        RESAMPLE_RESULT.PASSED
      );
      expect(
        readRequiredId(judged, 'reviewed_by', '复样结果判定出参'),
        '复样复核人取会话身份'
      ).toBe(leadId);
      expect(isRealTimestamp(judged['reviewed_at']), '复样复核时间应落库').toBe(true);
      expect(decimalEq(judged['color_difference_value'], 0.6), 'ΔE 色差值应原值读回').toBe(true);

      const carded = asRow(
        await apiCallRaw<unknown>(lead.page, 'POST', `${LD}/resamples/${resampleId}/tech-card`),
        '染色技术卡开具出参'
      );
      expect(
        readStr(carded, 'tech_card_no', '染色技术卡开具出参'),
        '技术卡号应由服务端按 TC-日期-id 规则生成'
      ).toMatch(/^TC-\d{8}-\d+$/);
      expect(
        readRequiredId(carded, 'tech_card_issued_by', '染色技术卡开具出参'),
        '开卡人取会话身份'
      ).toBe(leadId);
      expect(isRealTimestamp(carded['tech_card_issued_at']), '开卡时间应落库').toBe(true);

      const outsiderRead = await outsider.page.request.fetch(
        `${API_BASE}${API_PREFIX}${LD}/requests/${requestId}`
      );
      expect(outsiderRead.status(), '业务员岗按主键读他人打样通知单应被权限面拒').toBe(403);
      const outsiderBodyJson = (await outsiderRead.json()) as Row;
      expect(failureCode(outsiderBodyJson), '业务员岗读打样通知单的机器码应为 FORBIDDEN').toBe(
        APP_ERROR_CODES.FORBIDDEN
      );
      const outsiderKeys = deepKeys(outsiderBodyJson);
      for (const key of COST_KEYS) {
        expect(outsiderKeys, `未授权岗的响应体键集里不应出现成本列 ${key}`).not.toContain(key);
      }

      await tryCleanup(
        sampler.page,
        'DELETE',
        `${LD}/samples/${sampleBId}`,
        '清理未选中的 B 版小样'
      );
    } finally {
      await outsider.close();
      await lead.close();
      await sampler.close();
    }
  });

  /**
   * 功能 组装一份业务员岗建单打样通知单的最小合法请求体。
   * 调用方 本文件打样协作链的越权负例。
   * 入参 无。
   * 传给谁 作为 POST /production/lab-dip/requests 的请求体，用于证明拒绝来自权限面而不是缺参。
   * 存什么 不存储，纯构造。为什么要合法体：载荷非法时 400 校验会先于权限面发生，
   * 403 判据就会被缺参拒绝顶掉，测不到授权。
   * 存哪里 无。
   */
  async function outsiderBody(): Promise<ApiRequestBody> {
    return {
      light_source: 'D65',
      sample_versions: 2,
      required_date: dateInDays(7),
    };
  }

  test('440-04 跨角色可达与响应体键面：持色卡读面的岗位按卡名与色号都命中同一记录，无授权键的岗位被 RBAC 拒', async ({
    page,
    browser,
  }) => {
    const cardNo = genCode('CC440C');
    const cardName = genName('E440业务员可见卡');
    const colorCode = genCode('C440C');
    const card = asRow(
      await apiCallRaw<unknown>(page, 'POST', CC, {
        card_no: cardNo,
        card_name: cardName,
        card_type: 'CUSTOM',
      }),
      '新建色卡响应（跨角色腿）'
    );
    const cardId = readNum(card, 'id', '新建色卡响应（跨角色腿）');
    await apiCallRaw<unknown>(page, 'POST', `${CC}/${cardId}/items`, {
      color_code: colorCode,
      color_name: genName('E440可见色'),
      rgb_r: 200,
      rgb_g: 120,
      rgb_b: 30,
      hex_value: '#C8781E',
      sequence: 1,
    });

    const reader = await openRoleSession(browser, 'sales_manager');
    // "无授权键的岗位"必须按后端矩阵实名选岗：init 矩阵把 ("color-cards","read") 明确授给
    // sales_rep、("color-cards","*") 授给 sales_manager 与化验与染整两岗，业务员本来就持读键，
    // 拿它当无键岗位只会把"岗位确实有权"读成"权限门被拒"。report_viewer 在矩阵与授权分组
    // 都零色卡键，镜像建岗面闭合到 SHELL 两枚键，是被 RBAC 拒的真实无键岗位。
    const outsider = await openRoleSession(browser, 'report_viewer');
    try {
      const listResp = await reader.page.request.fetch(
        `${API_BASE}${API_PREFIX}${CC}?keyword=${encodeURIComponent(cardName)}&page=1&page_size=20`
      );
      expect(listResp.status(), '持色卡读面的岗位应能读到色卡列表').toBe(200);
      const listJson = (await listResp.json()) as Row;
      const listData = asRow(listJson['data'], '色卡列表（跨角色读）的 data 位');
      const hitRows = asRows(listData['items'], '色卡列表（跨角色读）items');
      const hits = hitRows.filter(r => String(r['card_no']) === cardNo);
      expect(hits.length, `按卡名筛选应命中本次新建的 ${cardNo}`).toBe(1);
      expect(
        readNum(asRow(hits[0], '跨角色命中的色卡行'), 'id', '跨角色命中的色卡行'),
        '命中行应是同一主键'
      ).toBe(cardId);

      const scanResp = await reader.page.request.fetch(
        `${API_BASE}${API_PREFIX}${CC}/scan/${encodeURIComponent(colorCode)}`
      );
      expect(scanResp.status(), '持色卡读面的岗位按色号扫码应命中').toBe(200);
      const scanData = asRow(
        ((await scanResp.json()) as Row)['data'],
        '色号扫码（跨角色读）的 data 位'
      );
      expect(
        readStr(scanData, 'color_card_no', '色号扫码（跨角色读）'),
        '扫码结果应回到本次新建的卡'
      ).toBe(cardNo);
      expect(
        readStr(
          asRow(scanData['color_item'], '扫码结果内的色号行'),
          'color_code',
          '扫码结果内的色号行'
        )
      ).toBe(colorCode);

      const detailResp = await apiCallRaw<unknown>(reader.page, 'GET', `${CC}/${cardId}`);
      const detailKeys = deepKeys(detailResp);
      expect(detailKeys, '色卡详情的出参键集应包含色号族本身').toContain('color_code');
      for (const key of COST_KEYS) {
        expect(
          detailKeys,
          `色卡详情读面的响应体不应携带金额列 ${key}（色卡读面不出金额）`
        ).not.toContain(key);
      }

      const outsiderList = await outsider.page.request.fetch(
        `${API_BASE}${API_PREFIX}${CC}?keyword=${encodeURIComponent(cardName)}&page=1&page_size=20`
      );
      expect(outsiderList.status(), '不持色卡授权键的岗位读列表应被 RBAC 拒').toBe(403);
      const outsiderListBody = (await outsiderList.json()) as Row;
      expect(failureCode(outsiderListBody), '跨角色拒绝的机器码应为 FORBIDDEN').toBe(
        APP_ERROR_CODES.FORBIDDEN
      );
      const outsiderKeys = deepKeys(outsiderListBody);
      for (const key of COST_KEYS) {
        expect(outsiderKeys, `越权响应体里不应出现任何成本列 ${key}`).not.toContain(key);
      }

      const outsiderDetail = await apiCallExpectFail(outsider.page, 'GET', `${CC}/${cardId}`);
      expectPermissionGateRejection(outsiderDetail, '不持色卡授权键的岗位按主键读同一条色卡');

      const outsiderScan = await apiCallExpectFail(
        outsider.page,
        'GET',
        `${CC}/scan/${encodeURIComponent(colorCode)}`
      );
      expectPermissionGateRejection(outsiderScan, '不持色卡授权键的岗位按色号扫码');
    } finally {
      await outsider.close();
      await reader.close();
    }

    await tryCleanup(page, 'DELETE', `${CC}/${cardId}`, '归档本次新建色卡（跨角色腿）');
    // 已知缺口：按色号扫码面的出参 ScanResult.price_summary.base_price 确实带金额（后端 models/color_card_response_dto.rs 的 PriceSummary），本用例对它零断言，需另开专项钉扫码读面的金额可见性口径。
  });

  test('440-05 时序门控：无小样不可送确认、版数与版本标识受限、未确认不可复样、未通过不可开卡，且拒绝零写入', async ({
    page,
  }) => {
    const noSampleReq = await createLabDipRequest(page);
    const noSampleId = readNum(noSampleReq, 'id', '新建打样通知单响应');
    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${noSampleId}/start-sampling`);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/requests/${noSampleId}/submit`),
      '一版小样都没有就送客户确认'
    );
    expect(
      readStr(await readLabDipRequest(page, noSampleId), 'status', '送确认被拒后的通知单'),
      '被拒不应改状态'
    ).toBe(REQ_STATUS.SAMPLING);

    const pendingReq = await createLabDipRequest(page);
    const pendingId = readNum(pendingReq, 'id', '新建打样通知单响应');
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/samples`, {
        request_id: pendingId,
        recipe_no: genCode('R440X'),
      }),
      '通知单还在待处理态就加小样'
    );
    expect((await listLabDipSamples(page, pendingId)).length, '被拒不应留下小样').toBe(0);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/requests/${pendingId}/approve`, {
        sample_id: 1,
      }),
      '未送客户确认就直接确认 OK 样'
    );
    expect(
      readStr(await readLabDipRequest(page, pendingId), 'status', '越级确认后回读'),
      '越级确认不应改状态'
    ).toBe(REQ_STATUS.PENDING);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/resamples`, {
        request_id: pendingId,
        source_sample_id: 1,
        workshop_fabric_batch: genCode('WB440X'),
      }),
      '通知单未 approved 就登记复样'
    );
    expect((await listLabDipResamples(page, pendingId)).length, '被拒不应留下复样记录').toBe(0);

    const capped = asRow(
      await apiCallRaw<unknown>(page, 'POST', `${LD}/requests`, {
        light_source: 'TL84',
        sample_versions: 1,
        required_date: dateInDays(5),
      }),
      '限定 1 版的打样通知单响应'
    );
    const cappedId = readNum(capped, 'id', '限定 1 版的打样通知单响应');
    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${cappedId}/start-sampling`);
    const first = await createLabDipSample(page, cappedId, { recipe_no: genCode('R440C1') });
    const firstId = readNum(first, 'id', '新建打样小样响应');
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/samples`, {
        request_id: cappedId,
        recipe_no: genCode('R440C2'),
        version_label: 'B',
      }),
      '超过通知单规定打样版数再加一版'
    );
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/samples`, {
        request_id: cappedId,
        recipe_no: genCode('R440C3'),
        version_label: readStr(first, 'version_label', '新建打样小样响应'),
      }),
      '同一通知单下重复使用已占用的版本标识'
    );
    const cappedSamples = await listLabDipSamples(page, cappedId);
    expect(cappedSamples.length, '两次被拒后版数仍应等于 1').toBe(1);
    expect(
      readNum(asRow(cappedSamples[0], '版数上限回读行'), 'id', '版数上限回读行'),
      '留下的应是首次那版'
    ).toBe(firstId);

    const { requestId, sampleId } = await seedMatchedSample(page, { sample_versions: 2 });
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/samples/${sampleId}/matching`, {
        color_difference_grade: 5,
      }),
      '对色结果已记录过就重复记录'
    );
    const afterRepeat = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${LD}/samples/${sampleId}`),
      `重复记录对色后的回读（id=${sampleId}）`
    );
    expect(
      readStr(afterRepeat, 'matching_result', '重复记录对色后的回读'),
      '重复记录不应改写对色结果'
    ).toBe(SAMPLE_MATCHING.MATCHED);
    expect(
      readNum(afterRepeat, 'color_difference_grade', '重复记录对色后的回读'),
      '重复记录不应改写色差等级'
    ).toBe(4);

    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/resamples`, {
        request_id: requestId,
        source_sample_id: sampleId,
        workshop_fabric_batch: '   ',
      }),
      '车间半制品布批号为空白就登记复样'
    );
    expect(
      (await listLabDipResamples(page, requestId)).length,
      '空白批号被拒后不应留下复样记录'
    ).toBe(0);

    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${requestId}/submit`);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/resamples`, {
        request_id: requestId,
        source_sample_id: sampleId,
        workshop_fabric_batch: genCode('WB440Y'),
      }),
      '打样版本还没被客户确认就登记复样'
    );
    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${requestId}/approve`, {
      sample_id: sampleId,
      comment: 'e2e 门控腿选中 OK 样',
    });
    const { resampleId } = await seedPassedResampleLessGate(page, sampleId, requestId);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${LD}/resamples/${resampleId}/tech-card`),
      '复样结果尚未判定通过就开染色技术卡'
    );
    const pendingResample = asRow(
      (await listLabDipResamples(page, requestId))[0],
      '开卡被拒后的复样回读行'
    );
    expect(
      readStr(pendingResample, 'result', '开卡被拒后的复样回读行'),
      '开卡被拒不应改写复样结果'
    ).toBe(RESAMPLE_RESULT.PENDING);
    expect(
      readNullableStr(pendingResample, 'tech_card_no', '开卡被拒后的复样回读行'),
      '开卡被拒不应写技术卡号'
    ).toBe(null);
  });

  /**
   * 功能 在已 approved 的通知单下登记一版复样但不判定结果，返回复样主键。
   * 调用方 本文件门控腿的"复样未 passed 不可开卡"一步。
   * 入参 page 会话页；sampleId 已被选中的 OK 样；requestId 通知单。
   * 传给谁 返回的 resampleId 交开卡负例与回读消费。
   * 存什么 不存储。
   * 存哪里 落 lab_dip_resample 表，result 停在 pending。
   */
  async function seedPassedResampleLessGate(
    page: Page,
    sampleId: number,
    requestId: number
  ): Promise<{ resampleId: number }> {
    const resample = asRow(
      await apiCallRaw<unknown>(page, 'POST', `${LD}/resamples`, {
        request_id: requestId,
        source_sample_id: sampleId,
        workshop_fabric_batch: genCode('WB440G'),
        dye_batch_no: genCode('DY440G'),
      }),
      '门控腿登记复样出参'
    );
    return { resampleId: readNum(resample, 'id', '门控腿登记复样出参') };
  }

  test('440-06 反向腿：待处理打样单可软删且回读即消失，已流转的、被复样引用的、已归档色卡的删除与维护都被点名拒绝', async ({
    page,
  }) => {
    const deletable = await createLabDipRequest(page);
    const deletableId = readNum(deletable, 'id', '新建打样通知单响应');
    const deletableNo = readStr(deletable, 'request_no', '新建打样通知单响应');
    await apiCall(page, 'DELETE', `${LD}/requests/${deletableId}`);
    const afterDelete = await apiCallExpectFail(page, 'GET', `${LD}/requests/${deletableId}`);
    expect(afterDelete.status, '软删后按主键回读应报未找到').toBe(404);
    expect(failureCode(afterDelete), '软删回读的机器码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    const listAfterDelete = asRow(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `${LD}/requests?request_no=${encodeURIComponent(deletableNo)}&page=1&page_size=20`
      ),
      `打样通知单按单号回读（删除后，${deletableNo}）`
    );
    const stillThere = asRows(listAfterDelete['items'], '打样通知单列表（删除后）').filter(
      r => Number(String(r['id'])) === deletableId
    );
    expect(stillThere.length, '软删后的通知单不应再出现在列表里').toBe(0);

    const inFlight = await createLabDipRequest(page);
    const inFlightId = readNum(inFlight, 'id', '新建打样通知单响应');
    await apiCallRaw<unknown>(page, 'POST', `${LD}/requests/${inFlightId}/start-sampling`);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'DELETE', `${LD}/requests/${inFlightId}`),
      '已开始打样的通知单要求删除'
    );
    const stillSampling = await readLabDipRequest(page, inFlightId);
    expect(readStr(stillSampling, 'status', '删除被拒后的通知单'), '被拒不应留下软删痕迹').toBe(
      REQ_STATUS.SAMPLING
    );
    expect(
      readBool(stillSampling, 'is_deleted', '删除被拒后的通知单'),
      '被拒时 is_deleted 必须仍是 false'
    ).toBe(false);

    const { requestId, sampleId } = await seedMatchedSample(page);
    const referenced = await seedPassedResample(page, sampleId, requestId);
    expectStateGateRejection(
      await apiCallExpectFail(page, 'DELETE', `${LD}/samples/${sampleId}`),
      '删除被复样记录引用的 OK 样'
    );
    const sampleAfterReject = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${LD}/samples/${sampleId}`),
      `删除被拒后的小样回读（id=${sampleId}）`
    );
    expect(
      readStr(sampleAfterReject, 'matching_result', '删除被拒后的小样回读'),
      '被拒不应改写对色结果'
    ).toBe(SAMPLE_MATCHING.SELECTED);
    expect(
      readBool(sampleAfterReject, 'is_deleted', '删除被拒后的小样回读'),
      '被拒不应写下软删标记'
    ).toBe(false);
    expect(
      readNum(
        asRow((await listLabDipResamples(page, requestId))[0], '引用腿复样回读行'),
        'id',
        '引用腿复样回读行'
      ),
      '引用它的复样记录必须仍然存在（引用关系没有被悄悄拆掉）'
    ).toBe(referenced.resampleId);

    const card = asRow(
      await apiCallRaw<unknown>(page, 'POST', CC, {
        card_no: genCode('CC440D'),
        card_name: genName('E440归档卡'),
        card_type: 'PANTONE',
        cover_image_url: 'https://e2e.invalid/cc440d/cover.png',
      }),
      '新建色卡响应（归档腿）'
    );
    const cardId = readNum(card, 'id', '新建色卡响应（归档腿）');
    const archivedItem = asRow(
      await apiCallRaw<unknown>(page, 'POST', `${CC}/${cardId}/items`, {
        color_code: genCode('C440D'),
        color_name: genName('E440归档色'),
        rgb_r: 10,
        rgb_g: 20,
        rgb_b: 30,
        hex_value: '#0A141E',
        sequence: 1,
      }),
      '新建色号响应（归档腿）'
    );
    const archivedItemId = readNum(archivedItem, 'id', '新建色号响应（归档腿）');
    const archived = asRow(
      await apiCallRaw<unknown>(page, 'DELETE', `${CC}/${cardId}`, { reason: 'e2e 归档腿' }),
      '归档色卡出参'
    );
    expect(readStr(archived, 'status', '归档色卡出参'), '归档后状态应落到词表 archived').toBe(
      CARD_STATUS.ARCHIVED
    );

    expectStateGateRejection(
      await apiCallExpectFail(page, 'PUT', `${CC}/${cardId}`, {
        cover_image_url: 'https://e2e.invalid/x.png',
      }),
      '归档后的色卡要求改主档字段'
    );
    expectStateGateRejection(
      await apiCallExpectFail(page, 'POST', `${CC}/${cardId}/items`, {
        color_code: genCode('C440D2'),
        color_name: genName('E440归档后新增色'),
        rgb_r: 1,
        rgb_g: 2,
        rgb_b: 3,
        hex_value: '#010203',
      }),
      '归档后的色卡要求新增色号'
    );
    const afterArchive = asRow(
      await apiCallRaw<unknown>(page, 'GET', `${CC}/${cardId}`),
      `归档后色卡详情回读（id=${cardId}）`
    );
    expect(readStr(afterArchive, 'status', '归档后色卡详情回读')).toBe(CARD_STATUS.ARCHIVED);
    expect(
      readNullableStr(afterArchive, 'cover_image_url', '归档后色卡详情回读'),
      '被拒的封面改写不应落库'
    ).toBe('https://e2e.invalid/cc440d/cover.png');
    expect(asRows(afterArchive['items'], '归档后色卡明细').length, '被拒的新增色号不应落库').toBe(
      1
    );
    expect(
      readNum(afterArchive, 'total_colors', '归档后色卡详情回读'),
      '归档后总色号数应保持不变'
    ).toBe(1);
    expect(
      readNum(
        asRow(asRows(afterArchive['items'], '归档后色卡明细')[0], '归档后色号行'),
        'id',
        '归档后色号行'
      ),
      '留下的应是归档前那一条'
    ).toBe(archivedItemId);
  });
});
