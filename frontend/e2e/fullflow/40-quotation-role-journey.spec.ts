// 报价单多角色真实流转 E2E，40 号段（建数到报价审批到审计与越权对照）
//
// **声明：本文件未在本地实跑（本机禁跑 Playwright 实机用例），仅按后端源码契约编写，待 CI 分片验证。**
//
// 这条链验的业务：纺织 ERP 销售报价的完整协同流转，全部走真实后端与真实登录会话，零 mock。
// 报价单从建数（面料产品与客户）开始，由销售岗起草并提交审批，审批岗批准或拒绝，
// 批准后走转销售订单准入、拒绝后走转单被拒准入；每个关键状态跃迁同时在系统审计日志里
// 留下操作人与时间以及变更前后状态快照；最后用无审批权角色与仓储岗对照按钮可达性与
// 菜单可见性与端点权限门。批准与建单分岗由后端 init 矩阵的 SoD 建审分离口径保证。
//
// 用到的角色与为什么（角色码与权限面均取后端源码，不做推测）：
// 1 manager 部门经理，建产品腿。init_service_ops/permission.rs management_role_resources
//   对 manager 授 ("products","*")；后端矩阵里 sales_rep 没有 products:create，
//   所以派工单里"salesperson 建产品"按源码现实改由真实持有该码的部门经理岗执行，
//   这是"按账号权限各自做各自能做的事"的本义，不拿越权建单冒充协同。
// 2 sales_rep 销售代表，建客户 建报价 提交腿。sales_role_resources 对 sales_rep
//   授 quotations read create update submit cancel 与 customers read create，行级范围 self；
//   SEED_ROLES 里的 salesperson 码在 e2e 库由 global-setup 补建，权限面只有 SHELL 加 extras，
//   不含 quotations 任何键，真实登录打报价端点必 403，故建单棒取后端在册的 sales_rep 码
//   （122-role-relay-foundation 已证明该码凭证与授权在 CI 库真实存在）。
// 3 sales_manager 销售经理，批准与拒绝腿。sales_role_resources 对 sales_manager 授
//   quotations read approve reject，且与 sales_rep 建审分离（不授 create submit）。
// 4 warehouse_keeper 仓库管理员，越权对照棒。后端矩阵该岗无 quotations 键，
//   真实登录读报价列表必须 403、侧栏无报价入口、直访列表页被路由守卫挡到无权限页。
// 5 admin 超管，审计读面与终态回读棒。audit_log_handler list_audit_logs 要求
//   require_admin_role，审计读面现实上只有 admin 可达；admin 同时坐实业务侧回读。
//
// 供应商为什么不在链上：销售报价的业务链只引用客户与产品，不触达供应商与 SKU 对照，
// 按派工单"必填链按先例处理"的现实结论是无需建供应商，不造多余数据。
//
// 金额与税的口径（utils/tax.rs 与 services/quotation_ops/crud.rs 现实）：
// 税率按百分数传（tax.rs PERCENT 口径，13 即百分之十三）；含税单价 113 是录入事实，
// 净额 100 由含税除以 1.13 反算得到（本链刻意取整除值，服务端与测试侧都不出现舍入歧义，
// 严禁用净额乘税率正推含税冒充反算口径）。数量 2000 时净额小计 200000 税额 26000
// 含税总额 226000，全部是精确整值；金额出参是 DECIMAL 字符串，断言先钉字符串类型再
// 做精确数值比较，不在测试里做任何舍入。总额档位：quotation_approval_service.rs 的
// AMOUNT_THRESHOLD_SELF 为 100000，本链无论按净额 200000 还是含税 226000 判档都落在
// 销售经理档（10 万到 50 万），提交必走 BPM 分支落 pending_approval，不会被小额自批短路。
// 建单载荷按后端 DTO 必填全量给出：sales_user_id 为 DTO 必填（quotation_create_dto.rs），
// 取本棒会话真实登录用户 id，不用上下文之外的 id。
//
// 审计面现实核到的字段清单（audit_log_service.rs build_update_audit_log 与 models/audit_log.rs）：
// 报价每次经 update_with_audit 的跃迁落一行审计，现实字段为 user_id 与 username（操作人，
// 反查 users 表补全）、action=UPDATE、operation_type=UPDATE、resource_type 落报价单实体的存储表名
// （写入单点把历史占位串换成实体体表名，报价侧即 sales_quotations）、
// resource_id 为报价单 id 字符串、created_at（时间）、old_value 与 new_value（变更前后整行快照，
// 内含 status 与 rejection_reason 列）。
// 缺的那一段（如实声明，不为其编造断言）：description request_path request_method 在
// update_with_audit 写入路径全部为 None，即审计现实里没有动作语义描述与请求路径列，
// 提交 批准 拒绝三种跃迁只能靠快照状态对（draft 到 pending_approval 等）与操作人区分，
// 故本文件的审计断言停在"记录存在且含操作人与时间且快照可判状态跃迁"这一档。
//
// 清理与现实残留（如实声明，登记必回读）：
// 报价单族后端无 DELETE 端点（routes/quotations.rs），批准链的报价被转单推进到 converted
// 终态、拒绝链的报价停在 rejected（cancel 状态门对两者都拒绝），都是业务终态残留，
// 按 21 号段判例以唯一 notes 标记可点名，不登记会打空的删除位点；
// 客户与产品被在库报价行外键引用，其 DELETE 清理腿预期被外键门拒而残留，
// 残留行带唯一标记可点名，这是后端现实而非清理遗漏，故不伪装 404 回读核验。
import { test, expect, type Page } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  API_PREFIX,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  APP_ERROR_CODES,
} from '../flow/helpers';
import { pickListArray, safeGoto } from '../flow/ui-helpers';
import {
  createRelay,
  expectEndpointDenied,
  expectMenuItemAbsent,
  expectMenuItemPresent,
  expectPageGuardDenied,
  expectPageRendersRow,
} from '../fixtures/relay';

type Row = Record<string, unknown>;

/** 报价管理入口文案，来源 src/locales/zh-CN.ts layout.menu.quotations 同节文案 */
const QUOTATION_MENU_LABEL = '报价单';

/** 列表筛选取页口径：只看第一页，配合唯一标记判定，不做多页归并 */
const LIST_PAGE_QUERY = '?page=1&page_size=200';

/**
 * 审计行的资源类型真值：报价审批服务的写入单点传的是历史占位串，落库时被换成实体存储表名，
 * 报价单实体的表名即此值（后端主干契约测试逐字钉过），故检索与断言都取体表名而非占位串。
 */
const AUDIT_RESOURCE_TYPE = 'sales_quotations';

/**
 * 报价业务事实常量（金额口径见 buildQuotationPayload 的 tax_inclusive 说明）。
 * 净单价 100 与税率百分数 13 使含税单价恰为 113，全链路金额无除不尽位；
 * 明细行出参键以 models/sales_quotation_item.rs 与 quotation_response_dto.rs 为准：
 * 只有 amount（净额行总额）与 amount_with_tax（含税行总额）两列，
 * 行税额后端不外露，故按差额钩稽而不是断一个不存在的 tax_amount 键。
 */
const TAX_PERCENT = '13';
const QTY = '2000';
const PRICE_WITH_TAX = '113';
const PRICE_NET = '100';
const EXPECT_NET_UNIT_PRICE = 100;
const EXPECT_WITH_TAX_UNIT_PRICE = 113;
const EXPECT_SUBTOTAL_NET = 200000;
const EXPECT_TAX_AMOUNT = 26000;
const EXPECT_TOTAL_WITH_TAX = 226000;

function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label}：未取得有效 id，实际出参片段=${JSON.stringify(v)?.slice(0, 200)}`);
  }
  return n;
}

/** DECIMAL 字符串出参判定：先钉类型是字符串，再做精确数值比较，不做舍入 */
function expectDecimalString(row: Row, key: string, expected: number, label: string): void {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(`${label}：响应缺少金额键 ${key}，实际键=${Object.keys(row).join(',')}`);
  }
  const raw = row[key];
  expect(
    typeof raw,
    `${label}：金额出参应为 DECIMAL 字符串，实际类型=${typeof raw} 值=${JSON.stringify(raw)}`
  ).toBe('string');
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}：金额字符串不可解析，raw=${JSON.stringify(raw)}`);
  }
  expect(n, `${label}：键 ${key} 期望 ${expected} 实际 ${n} 原始 ${JSON.stringify(raw)}`).toBe(
    expected
  );
}

/** 报价详情回读并点名含 status 键（词表小写，models/status/sales.rs quotation 模组） */
async function readQuotationStatus(page: Page, id: number): Promise<Row> {
  const res = await apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
  expect(
    Object.prototype.hasOwnProperty.call(res, 'status'),
    `报价 ${id} 详情回读应含 status 键，实际键=${Object.keys(res).join(',')}`
  ).toBe(true);
  return res;
}

/** 从详情出参里按产品锚定唯一明细行（明细键 items 来源 quotation_response_dto.rs，缺失即点名实际键） */
function pickQuotationItem(detail: Row, productId: number): Row {
  if (!Object.prototype.hasOwnProperty.call(detail, 'items')) {
    throw new Error(
      `报价详情未含明细键 items（出参结构体该字段无 skip_serializing_if，缺失属契约漂移），` +
        `实际键=${Object.keys(detail).join(',')}`
    );
  }
  const rows = pickListArray<Row>(detail, 'items', '报价明细');
  const hit = rows.find(r => Number(r.product_id) === productId);
  if (!hit) {
    throw new Error(
      `报价明细未找到产品 ${productId} 的行，实际行数=${rows.length}，首行键=${
        rows.length > 0 ? Object.keys(rows[0]).join(',') : '无'
      }`
    );
  }
  return hit;
}

/**
 * 从审计快照取状态位。快照缺失、快照不是对象、快照里没有 status 键三种情况各返回可点名的文本，
 * 不折成空串——折成空串会把"读面结构不对"冒充成"跃迁不存在"，判红时看不出是哪一种。
 */
function snapshotStatus(raw: unknown): string {
  if (raw === null || raw === undefined) return '无快照';
  if (typeof raw !== 'object') return `非对象:${typeof raw}`;
  const status = (raw as Row).status;
  if (status === undefined || status === null) return '快照缺status键';
  return String(status);
}

/**
 * 审计跃迁定位（admin 读面）。
 * 入参：admin 会话 page 与筛选口径。传给谁：先 GET /audit-logs 按资源键取候选行主键，
 * 再逐行 GET /audit-logs/{id} 取详情。
 * 判据：变更前后两列只在详情出参（AuditLogDetailResponse 的 before_snapshot 与 after_snapshot），
 * 列表出参（AuditLogListItem）没有这两列，因此在列表上判跃迁恒得 0 命中；
 * 资源侧仍按 resource_type 与 resource_id 等值筛（keyword=5 会命中 resource_id 为 15 的行，不用模糊），
 * 再取详情快照里的 status 对精确匹配一次跃迁，命中必须恰好一行。
 * 审计现实缺 description 与 request_path（均 NULL），因此跃迁语义只能由快照状态对判定，
 * 这一档与文件头"审计面现实核到的字段清单"一致。
 */
async function findAuditTransition(
  page: Page,
  quotationId: number,
  fromStatus: string,
  toStatus: string,
  context: string
): Promise<Row> {
  const list = await apiCallRaw<unknown>(
    page,
    'GET',
    `/audit-logs?resource_type=${AUDIT_RESOURCE_TYPE}&resource_id=${quotationId}&page=1&page_size=100`
  );
  const rows = pickListArray<Row>(list, 'items', `${context}审计列表`);
  // 判红时必须把逐行读到的跃迁自证出来：只报行数会把"资源键不同源""详情读面被门挡"
  // "跃迁被别的动作抢先"三种成因混成同一条红，下一轮仍要重新取证。
  const observed: string[] = [];
  const hits: Row[] = [];
  for (const row of rows) {
    const auditId = Number(row.id);
    if (!Number.isInteger(auditId) || auditId <= 0) {
      throw new Error(
        `${context}：审计列表行的 id 应为正整数主键，实际=${String(row.id)}，行键=${Object.keys(row).join(',')}`
      );
    }
    const detail = await apiCallRaw<Row>(page, 'GET', `/audit-logs/${auditId}`);
    const before = snapshotStatus(detail.before_snapshot);
    const after = snapshotStatus(detail.after_snapshot);
    observed.push(
      `id=${auditId} rt=${String(detail.resource_type ?? '无')} rid=${String(
        detail.resource_id ?? '无'
      )} op=${String(detail.operation_type ?? '无')} from=${before} to=${after}`
    );
    if (before === fromStatus && after === toStatus) hits.push(detail);
  }
  expect(
    hits.length,
    `${context}：审计中应恰好一行 ${fromStatus} 到 ${toStatus} 的跃迁（报价 ${quotationId}），` +
      `实际 ${hits.length} 行，候选 ${rows.length} 行；逐行详情读到的跃迁=${observed.join(' | ') || '空'}`
  ).toBe(1);
  const row = hits[0];
  // 每行跃迁都必须同时交出操作人与时间，缺一即审计留痕不完整
  expect(
    Number(row.user_id),
    `${context}：审计行的操作人 user_id 应为正数，实际=${JSON.stringify(row.user_id)}`
  ).toBeGreaterThan(0);
  expect(
    typeof row.username === 'string' && (row.username as string).length > 0,
    `${context}：审计行应含 username 字符串（写入方反查 users 表补全），实际=${JSON.stringify(
      row.username
    )}`
  ).toBe(true);
  expect(
    typeof row.created_at === 'string' && (row.created_at as string).length > 0,
    `${context}：审计行应含 created_at 时间，实际=${JSON.stringify(row.created_at)}`
  ).toBe(true);
  return row;
}

/** 以会话 auth/me 回读的 permissions 面判定持键情况（同源比较，不手抄第二套词表） */
function havePerms(permissions: string[], keys: string[]): boolean {
  return keys.every(k => permissions.includes(k));
}

/** 报价域建单动作键（建单 提交）与审批动作键（批准 拒绝），与后端矩阵成对 */
const BUILD_KEYS = ['quotations:create', 'quotations:submit'];
const APPROVE_KEYS = ['quotations:approve', 'quotations:reject'];

/**
 * 建单棒与审批棒的按钮可达性对照（授权面口径）。
 * 判据来源：views/quotations/detail.vue 的 canSubmit canApprove canReject computed
 * 以 hasRoutePermission(PERMISSIONS.*) 对 auth/me permissions 过滤渲染，
 * 按钮是否渲染由该会话权限集合逐一决定，因此比较会话真实 permissions 面与按钮语义同源。
 * 调用方：40-01 与 40-02 的链尾。入参：两个棒的权限数组与失败信息前缀。
 * 传给谁：只进 expect 判定，不落库。存什么：不持久化。
 * 双向互斥都断：建单侧持提交无批准、审批侧持批准无提交，只断单侧不构成 SoD 对照。
 */
function assertBuildApproverSeparation(
  buildPerms: string[],
  approvePerms: string[],
  context: string
): void {
  expect(havePerms(buildPerms, BUILD_KEYS), `${context}：建单棒应持建单提交面`).toBe(true);
  expect(havePerms(buildPerms, APPROVE_KEYS), `${context}：建单棒不应持批准拒绝面（SoD）`).toBe(
    false
  );
  expect(havePerms(approvePerms, APPROVE_KEYS), `${context}：审批棒应持批准与拒绝面`).toBe(true);
  expect(havePerms(approvePerms, BUILD_KEYS), `${context}：审批棒不应持建单提交面（SoD）`).toBe(
    false
  );
}

/** 报价创建载荷（DTO 必填全量，含税事实与反算净额成对给出，见文件头金额口径） */
function buildQuotationPayload(
  customerId: number,
  salesUserId: number,
  productId: number,
  unit: string,
  marker: string
): Row {
  return {
    customer_id: customerId,
    sales_user_id: salesUserId,
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    // 后端把 tax_inclusive 读作"unit_price 已是含税价、小计即含税额、税额列记 0"
    // （quotation_ops/calc.rs 的含税分支）。本链要同时验净额、税额与含税总额三档，
    // 故按不含税口径提交：净额由 unit_price 给，含税由 unit_price_with_tax 给，
    // 税额由后端乘率算出，头与行才能钩稽。
    tax_inclusive: false,
    tax_rate: TAX_PERCENT,
    items: [
      {
        product_id: productId,
        unit,
        quantity: QTY,
        unit_price: PRICE_NET,
        unit_price_with_tax: PRICE_WITH_TAX,
      },
    ],
    notes: marker,
  };
}

/**
 * 面料产品创建载荷（字段口径与 flow/helpers 建产品先例一致）。
 * 面料必录门要求类型 成分 克重 幅宽 齐备，缺任一键后端 validate_product_create_fields 拒 400；
 * 分类 id 取 ensureTestEntities 就绪的共享种子分类（在库引用而非新建，不动全局夹具）。
 */
function buildProductPayload(code: string): Row {
  const catId = Number(getCtx().productCategoryIds[0]);
  if (!Number.isFinite(catId) || catId <= 0) {
    throw new Error('前置缺失：共享产品分类 id 未就绪，无法建面料产品');
  }
  return {
    code,
    name: `E2E报价产品${code}`,
    unit: '米',
    category_id: catId,
    product_type: '成品布',
    fabric_composition: '100%涤纶',
    gram_weight: 180,
    width: 150,
    meters_per_piece: 50,
  };
}

test.describe('40 报价单多角色审批流转', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await ensureTestEntities(page);
  });

  test('40-01 批准主链：经理建产品 销售建客户建报价并提交 销售经理批准 仓储越权拒 审计跃迁 转单终态', async ({
    browser,
  }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'manager',
          label: '建面料产品（products:create 真实持有岗）',
          run: async ({ session, registerCleanup }) => {
            const code = genCode('F40P');
            const created = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/products',
              buildProductPayload(code)
            );
            const productId = requireId(created.id, '经理建产品');
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back.code ?? ''),
              `经理按 id 回读产品编码应为自建唯一码 ${code}，实际=${JSON.stringify(back.code)}`
            ).toBe(code);
            expect(
              String(back.unit ?? ''),
              `产品回读交易单位应为米（报价行单位以它为大写事实源），实际=${JSON.stringify(
                back.unit
              )}`
            ).toBe('米');
            registerCleanup({
              method: 'DELETE',
              path: `/products/${productId}`,
              label: `产品#${productId}`,
            });
            return {
              artifacts: [
                { key: 'productId', value: productId },
                { key: 'productUnit', value: String(back.unit ?? '') },
              ],
            };
          },
        },
        {
          role: 'sales_rep',
          label: '建客户并起草报价提交审批',
          run: async ({ session, require, registerCleanup }) => {
            const productId = Number(require('productId'));
            const productUnit = String(require('productUnit'));
            // 客户棒先登记清理：flush 逆序时后注册先执行，报价引用存在期间不先拆客户腿
            const custCode = genCode('F40C');
            const customer = await apiCallRaw<Row>(session.page, 'POST', '/crm/customers', {
              customer_name: custCode,
              contact_phone: '13800000000',
            });
            const customerId = requireId(customer.id, '销售建客户');
            const custBack = await apiCallRaw<Row>(
              session.page,
              'GET',
              `/crm/customers/${customerId}`
            );
            expect(
              String(custBack.customer_name ?? ''),
              `销售按 id 回读客户名应为自建唯一名 ${custCode}，实际=${JSON.stringify(
                custBack.customer_name
              )}`
            ).toBe(custCode);
            registerCleanup({
              method: 'DELETE',
              path: `/crm/customers/${customerId}`,
              label: `客户#${customerId}`,
            });

            const marker = genCode('F40Q');
            const created = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/quotations',
              buildQuotationPayload(
                customerId,
                session.userId,
                productId,
                productUnit,
                `E2E-F40-${marker}`
              )
            );
            const quotationId = requireId(created.id, '销售建报价');
            const detail = await readQuotationStatus(session.page, quotationId);
            const quotationNo = String(detail.quotation_no ?? '');
            if (quotationNo === '') {
              throw new Error(`报价详情缺 quotation_no，实际键=${Object.keys(detail).join(',')}`);
            }
            expect(
              String(detail.status ?? ''),
              `新建报价初始状态应为 draft，实际=${JSON.stringify(detail.status)}`
            ).toBe('draft');
            // 含税事实与反算净额逐值钉死（DECIMAL 字符串出参，无舍入）
            expectDecimalString(detail, 'subtotal', EXPECT_SUBTOTAL_NET, '报价头净额小计');
            expectDecimalString(detail, 'tax_amount', EXPECT_TAX_AMOUNT, '报价头税额');
            expectDecimalString(detail, 'total_amount', EXPECT_TOTAL_WITH_TAX, '报价头含税总额');
            const item = pickQuotationItem(detail, productId);
            expect(
              String(item.unit ?? ''),
              `报价行单位应逐字符等于产品交易单位 ${productUnit}（后端 validate_item_units_against_products）`
            ).toBe(productUnit);
            expectDecimalString(item, 'quantity', Number(QTY), '报价行数量');
            expectDecimalString(
              item,
              'unit_price_with_tax',
              EXPECT_WITH_TAX_UNIT_PRICE,
              '报价行含税单价（录入事实）'
            );
            expectDecimalString(
              item,
              'unit_price',
              EXPECT_NET_UNIT_PRICE,
              '报价行净额单价（由含税反算）'
            );
            expectDecimalString(item, 'amount', EXPECT_SUBTOTAL_NET, '报价行净额总额');
            expectDecimalString(item, 'amount_with_tax', EXPECT_TOTAL_WITH_TAX, '报价行含税总额');
            // 明细出参没有 tax_amount 键（quotation_response_dto.rs 不暴露行税额，
            // sales_quotation_item 只有 amount 与 amount_with_tax 两列），行税额只能按
            // 含税与净额之差钩稽；并要求头税额等于各行差额之和，杜绝头与行分差。
            const itemTaxDelta =
              Number(item.amount_with_tax as string) - Number(item.amount as string);
            expect(
              itemTaxDelta,
              `报价行税额应由含税减净额得出，实际 amount_with_tax=${String(
                item.amount_with_tax
              )} amount=${String(item.amount)}`
            ).toBe(EXPECT_TAX_AMOUNT);
            const detailTax = Number(detail.tax_amount as string);
            const detailSubtotal = Number(detail.subtotal as string);
            const detailTotal = Number(detail.total_amount as string);
            expect(
              detailTax,
              `头税额应恰等于各行含税与净额之差，实际头=${detailTax} 行差=${itemTaxDelta}`
            ).toBe(itemTaxDelta);
            expect(
              detailTotal - detailSubtotal,
              `头含税总额与头净额之差应等于头税额（无分差），实际 ${detailTotal}-${detailSubtotal}!=${detailTax}`
            ).toBe(detailTax);

            // 提交前的越权负例：建单棒自己尝试批准必须被 RBAC 权限门拒（SoD 真实成立）
            const selfApprove = await apiCallExpectFail(
              session.page,
              'POST',
              `/quotations/${quotationId}/approve`,
              { approval_reason: 'E2E-F40 建单岗自批尝试' }
            );
            expect(
              selfApprove.status,
              `建单岗自批应 403，实际=${selfApprove.status} 响应片段=${JSON.stringify(
                selfApprove
              ).slice(0, 200)}`
            ).toBe(403);

            // 提交（审批档位现实见文件头，必走 BPM 分支）
            await apiCall(session.page, 'POST', `/quotations/${quotationId}/submit`);
            const submitted = await readQuotationStatus(session.page, quotationId);
            expect(
              String(submitted.status ?? ''),
              `提交后应真落库 pending_approval（quotation_ext 词表小写），实际=${JSON.stringify(
                submitted.status
              )}`
            ).toBe('pending_approval');
            expect(
              Number(submitted.approval_instance_id) > 0,
              `提交后应关联 BPM 实例 id，实际=${JSON.stringify(submitted.approval_instance_id)}`
            ).toBe(true);

            // UI 对照一：建单棒列表页应渲出自己这张报价的行
            await expectPageRendersRow(session.page, '/quotations', quotationNo, '建单棒报价列表');

            return {
              artifacts: [
                { key: 'quotationId', value: quotationId },
                { key: 'quotationNo', value: quotationNo },
                { key: 'repUsername', value: session.username },
              ],
            };
          },
        },
        {
          role: 'sales_manager',
          label: '批准报价（审批岗真实办理）',
          run: async ({ session, require }) => {
            const quotationId = Number(require('quotationId'));
            await apiCall(session.page, 'POST', `/quotations/${quotationId}/approve`, {
              approval_reason: 'E2E-F40 同意报价',
            });
            // 审批棒行级范围 dept 且报价资源无部门，读面可能被数据门挡；
            // 批准后的状态坐实交给审计棒（admin 读面），不在此强行 GET。
            return {
              artifacts: [{ key: 'managerUsername', value: session.username }],
            };
          },
        },
        {
          role: 'warehouse_keeper',
          label: '无审批权角色对照（端点门与入口门）',
          run: async ({ session, require }) => {
            const quotationId = Number(require('quotationId'));
            // 端点面：读列表与读详情两口径都必须被权限门拒
            await expectEndpointDenied(
              session.page,
              'GET',
              `/quotations${LIST_PAGE_QUERY}`,
              '仓储棒越权读报价列表'
            );
            await expectEndpointDenied(
              session.page,
              'GET',
              `/quotations/${quotationId}`,
              '仓储棒越权读报价详情'
            );
            // UI 对照二：仓储棒侧栏无报价入口，直访列表页被守卫挡住且不泄露业务行
            await safeGoto(session.page, '/dashboard');
            await expectMenuItemAbsent(session.page, QUOTATION_MENU_LABEL, '仓储棒侧栏');
            await expectPageGuardDenied(session.page, '/quotations', '仓储棒越权进报价列表页');
            return {
              artifacts: [{ key: 'deniedQuotationEndpoint', value: '/quotations' }],
            };
          },
        },
        {
          role: 'admin',
          label: '审计跃迁回读与转单终态坐实',
          run: async ({ session, require }) => {
            const quotationId = Number(require('quotationId'));
            const quotationNo = String(require('quotationNo'));
            // 批准后状态由 admin 读面坐实（超管旁路行级数据门）
            const approved = await readQuotationStatus(session.page, quotationId);
            expect(
              String(approved.status ?? ''),
              `批准后应真落库 approved，实际=${JSON.stringify(approved.status)}`
            ).toBe('approved');
            if (!Object.prototype.hasOwnProperty.call(approved, 'approval_reason')) {
              throw new Error(
                `批准链要求详情出参含 approval_reason 键（quotation_response_dto.rs 该字段无 ` +
                  `skip_serializing_if，键缺失属契约漂移，必须点名而非跳过），实际键=${Object.keys(
                    approved
                  ).join(',')}`
              );
            }
            expect(
              String(approved.approval_reason ?? ''),
              `审批理由应真实落列并可在详情出参回读，实际=${JSON.stringify(
                approved.approval_reason
              )}`
            ).toBe('E2E-F40 同意报价');

            // 审计跃迁逐条点名操作人与时间与前后状态（提交与批准两条）
            const tSubmit = await findAuditTransition(
              session.page,
              quotationId,
              'draft',
              'pending_approval',
              '提交跃迁'
            );
            const tApprove = await findAuditTransition(
              session.page,
              quotationId,
              'pending_approval',
              'approved',
              '批准跃迁'
            );
            // 跃迁操作人必须分别等于接力链上的两个真实身份（写入方取 AuthContext，不采信伪造）
            expect(
              String(tSubmit.username ?? ''),
              `提交跃迁审计的操作人应为建单棒账号，实际=${JSON.stringify(tSubmit.username)}`
            ).toBe(String(require('repUsername')));
            expect(
              String(tApprove.username ?? ''),
              `批准跃迁审计的操作人应为审批棒账号，实际=${JSON.stringify(tApprove.username)}`
            ).toBe(String(require('managerUsername')));

            // 转销售订单准入：approved 后方可转（quotation_convert_service 状态门）
            await apiCall(session.page, 'POST', `/quotations/${quotationId}/convert`);
            const converted = await readQuotationStatus(session.page, quotationId);
            expect(
              String(converted.status ?? ''),
              `转单后报价应进 converted 终态，实际=${JSON.stringify(converted.status)}`
            ).toBe('converted');
            const soId = requireId(converted.converted_sales_order_id, '转单关联销售订单 id');
            const orderBack = await apiCallRaw<Row>(session.page, 'GET', `/sales/orders/${soId}`);
            expect(
              String(orderBack.status ?? ''),
              `转出的销售订单应落 draft（真实链路起点，与 21 号段同源口径），实际=${JSON.stringify(
                orderBack.status
              )}`
            ).toBe('draft');
            // 转单跃迁同样要求审计行含操作人与时间与前后状态
            await findAuditTransition(
              session.page,
              quotationId,
              'approved',
              'converted',
              '转单跃迁'
            );
            // 侧栏对照旁证：超管同样可见报价入口（可见性判据与授权面同源）
            await safeGoto(session.page, '/dashboard');
            await expectMenuItemPresent(session.page, QUOTATION_MENU_LABEL, '超管侧栏');
            return {
              artifacts: [{ key: 'finalQuotationNo', value: quotationNo }],
            };
          },
        },
      ]);

      // 链尾三向对照：建单棒持提交无批准、审批棒持批准无提交、越权棒两面皆无
      const repLeg = relay.sessions[1];
      const approverLeg = relay.sessions[2];
      const deniedLeg = relay.sessions[3];
      assertBuildApproverSeparation(repLeg.permissions, approverLeg.permissions, '按钮可达性对照');
      expect(
        havePerms(deniedLeg.permissions, BUILD_KEYS) ||
          havePerms(deniedLeg.permissions, APPROVE_KEYS),
        '越权棒对建单面与批准面都应一无所有（持任一侧即扩权）'
      ).toBe(false);
      expect(new Set(relay.sessions.map(s => s.userId)).size, '五棒用户 id 应互不相同').toBe(5);
    } finally {
      await relay.close();
    }
  });

  test('40-02 驳回分支：驳回留痕 转单准入被拒点名原因 审计跃迁 审批棒按钮对照', async ({
    browser,
  }) => {
    const relay = await createRelay(browser);
    try {
      await relay.runSteps([
        {
          role: 'manager',
          label: '建面料产品（驳回链）',
          run: async ({ session, registerCleanup }) => {
            const code = genCode('F40RP');
            const created = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/products',
              buildProductPayload(code)
            );
            const productId = requireId(created.id, '经理建产品（驳回链）');
            const back = await apiCallRaw<Row>(session.page, 'GET', `/products/${productId}`);
            expect(
              String(back.code ?? ''),
              `回读产品编码应为 ${code}，实际=${JSON.stringify(back.code)}`
            ).toBe(code);
            registerCleanup({
              method: 'DELETE',
              path: `/products/${productId}`,
              label: `产品#${productId}`,
            });
            return {
              artifacts: [
                { key: 'rejProductId', value: productId },
                { key: 'rejProductUnit', value: String(back.unit ?? '') },
              ],
            };
          },
        },
        {
          role: 'sales_rep',
          label: '建客户建报价并提交（驳回链用）',
          run: async ({ session, require, registerCleanup }) => {
            const productId = Number(require('rejProductId'));
            const productUnit = String(require('rejProductUnit'));
            const custCode = genCode('F40RC');
            const customer = await apiCallRaw<Row>(session.page, 'POST', '/crm/customers', {
              customer_name: custCode,
              contact_phone: '13800000001',
            });
            const customerId = requireId(customer.id, '建客户（驳回链）');
            registerCleanup({
              method: 'DELETE',
              path: `/crm/customers/${customerId}`,
              label: `客户#${customerId}`,
            });
            const marker = genCode('F40RQ');
            const created = await apiCallRaw<Row>(
              session.page,
              'POST',
              '/quotations',
              buildQuotationPayload(
                customerId,
                session.userId,
                productId,
                productUnit,
                `E2E-F40REJ-${marker}`
              )
            );
            const quotationId = requireId(created.id, '建报价（驳回链）');
            const detail = await readQuotationStatus(session.page, quotationId);
            const quotationNo = String(detail.quotation_no ?? '');
            if (quotationNo === '') {
              throw new Error(`驳回链报价缺 quotation_no，实际键=${Object.keys(detail).join(',')}`);
            }
            await apiCall(session.page, 'POST', `/quotations/${quotationId}/submit`);
            const submitted = await readQuotationStatus(session.page, quotationId);
            expect(
              String(submitted.status ?? ''),
              `提交后应 pending_approval，实际=${JSON.stringify(submitted.status)}`
            ).toBe('pending_approval');
            return {
              artifacts: [
                { key: 'rejQuotationId', value: quotationId },
                { key: 'rejQuotationNo', value: quotationNo },
                { key: 'rejRepUsername', value: session.username },
                { key: 'rejCustomerId', value: customerId },
              ],
            };
          },
        },
        {
          role: 'sales_manager',
          label: '跨 owner 读面拒 自名下按钮对照 办理拒绝',
          run: async ({ session, require, registerCleanup }) => {
            const quotationId = Number(require('rejQuotationId'));
            // 读面判据：报价的归属人列是 sales_user_id（quotation_ops/crud.rs 的
            // ensure_visible_by_scope 按归属人判可见），本棒 data_scope=dept 而报价资源无部门维列，
            // 部门成员集合为空使可见集退化为仅本人，因此跨 owner 读他人报价详情必被行级数据范围门
            // fail-closed 拒成 403，与 e2e/flow/123 与 e2e/flow/94 在册判据同口径。
            // 动作区整块在详情卡的 v-if="quotation" 内：读面失败时 quotation 为 null，
            // 连返回按钮都不会渲染（views/quotations/detail.vue 的 loadData 失败分支），
            // 所以这条腿只钉读面状态码，不在这张他人行上做按钮对照。
            // 等待判据必须按 pathname 精确等于 API 详情路径：同一次导航里浏览器文档请求
            // /quotations/{id} 也回 200，宽松子串匹配会被它抢先命中，后续定位就只能超时；
            // 精确等式同时排除 /quotations/{id}/terms 等子路径，非预期码不跳过、原样交给下方断言点名。
            const detailPathname = `${API_PREFIX}/quotations/${quotationId}`;
            const detailRead = session.page.waitForResponse(
              r => {
                if (r.request().method() !== 'GET') return false;
                try {
                  return new URL(r.url()).pathname === detailPathname;
                } catch {
                  return false;
                }
              },
              { timeout: 15000 }
            );
            await safeGoto(session.page, `/quotations/${quotationId}`);
            let detailStatus = 0;
            try {
              detailStatus = (await detailRead).status();
            } catch (e) {
              throw new Error(
                `审批棒进他人报价详情后 15s 内没有拿到详情读响应，读面未发或被守卫吞掉：${
                  (e as Error).message
                }`
              );
            }
            expect(
              detailStatus,
              `跨 owner 读报价详情应 403（被行级数据范围门 fail-closed 拒绝，与 123 与 94 在册判据一致），实际 ${detailStatus}`
            ).toBe(403);
            const guard = session.page.url();
            expect(guard, `审批棒进报价详情不应被守卫挡到无权限页，实际落在 ${guard}`).not.toMatch(
              /\/403(\?|#|$)/
            );

            // 对照单的归属人必须与提交会话同源：POST /quotations/{id}/submit 的 handler 先过
            // get_by_id_scoped 行级归属门（handlers/quotation_handler.rs 提交腿注释「提交是创建人
            // 推进自身草稿的动作，必须先证归属」；门口径 services/quotation_ops/crud.rs 的
            // ensure_visible_by_scope，DataScope::Self_ 要求归属人等于会话用户 id，fail-closed 拒 403），
            // 而 sales_rep 的行级范围是 self，所以归属人写另一棒的 user_id 必被这道门拒——本轮真实红因，
            // 门是正确契约，不是 RBAC 缺失。建单与提交都沿用建单棒会话（relay.sessions 按棒次顺序，
            // 第 2 棒持 create 与 submit），sales_user_id 取该棒会话真实登录用户 id，与本文件头
            // 「取本棒会话真实登录用户 id，不用上下文之外的 id」同口径；金额沿用
            // buildQuotationPayload 的净额 200000，落在 10 万到 50 万档，提交走 BPM 分支，
            // 不会被小额自批短路直接落 approved。
            const builder = relay.sessions[1];
            const ctrlMarker = genCode('F40CT');
            const ctrlCreated = await apiCallRaw<Row>(
              builder.page,
              'POST',
              '/quotations',
              buildQuotationPayload(
                Number(require('rejCustomerId')),
                builder.userId,
                Number(require('rejProductId')),
                String(require('rejProductUnit')),
                `E2E-F40CTRL-${ctrlMarker}`
              )
            );
            const ctrlQuotationId = requireId(ctrlCreated.id, '建单棒名下对照建单');
            await apiCall(builder.page, 'POST', `/quotations/${ctrlQuotationId}/submit`);
            // 提交后的状态坐实由归属棒自己读回（它在这张单的可见集内；换棒读必被同一道门拒）
            const ctrlSubmitted = await readQuotationStatus(builder.page, ctrlQuotationId);
            expect(
              String(ctrlSubmitted.status ?? ''),
              `建单棒名下对照单提交后应 pending_approval（10 万到 50 万档走 BPM 分支），实际=${JSON.stringify(
                ctrlSubmitted.status
              )}`
            ).toBe('pending_approval');
            // 报价族后端无 DELETE 端点，cancel 是它在册的终结面，按本文件清理范式登记收尾；
            // 本棒（审批棒）授权面只有 quotations 的读与批准拒绝四键，无 cancel 键，该清理腿预期
            // 被权限门拒而残留，未落终态时该单以唯一 notes 标记点名残留（与本文件头登记的现实残留同口径）。
            registerCleanup({
              method: 'POST',
              path: `/quotations/${ctrlQuotationId}/cancel`,
              label: `对照报价#${ctrlQuotationId}`,
            });
            // 详情页动作区对照搬到归属棒（建单棒）：动作区只有在归属人自己读得通的那张单上才渲染。
            // 审批棒侧「读自己名下这张单得 200 并各出 1 枚批准与拒绝按钮」无法由用例自建合法前置——
            // 对照单归审批棒时提交被行级归属门拒（本轮红因），归建单棒时审批棒读面被同一道门拒
            // （即上方 403 判据），而审批棒按 SoD 不持 create 与 submit 键（init 矩阵 quotation 分组），
            // 现实中不存在"自己名下且处于待审批"的报价行可造；批准面的 UI 可达由 40-01 的真实办理腿
            // 与本链链尾的授权面互斥判据承载，本腿只钉建单棒这一侧的负向可达（缺口如实登记，见交付回报）。
            const ctrlPathname = `${API_PREFIX}/quotations/${ctrlQuotationId}`;
            const ctrlRead = builder.page.waitForResponse(
              r => {
                if (r.request().method() !== 'GET') return false;
                try {
                  return new URL(r.url()).pathname === ctrlPathname;
                } catch {
                  return false;
                }
              },
              { timeout: 15000 }
            );
            await safeGoto(builder.page, `/quotations/${ctrlQuotationId}`);
            let ctrlStatus = 0;
            try {
              ctrlStatus = (await ctrlRead).status();
            } catch (e) {
              throw new Error(
                `建单棒进自名下报价详情后 15s 内没有拿到详情读响应，读面未发或被守卫吞掉：${
                  (e as Error).message
                }`
              );
            }
            expect(
              ctrlStatus,
              `归属棒读自己名下待审报价详情应 200（归属人在自身可见集内，动作区才可能渲染），实际 ${ctrlStatus}`
            ).toBe(200);
            // 先等动作区渲染出来（返回按钮是那一块里唯一无条件渲染的），再数批准与拒绝
            await builder.page
              .locator('.actions .el-button', { hasText: '返回' })
              .first()
              .waitFor({ state: 'visible', timeout: 15000 });
            let approveButtons = 0;
            let rejectButtons = 0;
            await expect
              .poll(async () => {
                approveButtons = await builder.page
                  .locator('.actions .el-button', { hasText: '批准' })
                  .count();
                rejectButtons = await builder.page
                  .locator('.actions .el-button', { hasText: '拒绝' })
                  .count();
                return `${approveButtons}:${rejectButtons}`;
              }, `建单棒（不持审批键）在待审单详情页动作区应既无批准也无拒绝`)
              .toBe('0:0');
            expect(
              approveButtons,
              `建单棒详情页不应出现批准入口（SoD：持建单提交面无批准面），实际 ${approveButtons} 个`
            ).toBe(0);
            expect(rejectButtons, `建单棒详情页不应出现拒绝入口，实际 ${rejectButtons} 个`).toBe(0);

            // 真实办理拒绝仍打在原来那张他人行上：这条腿验的事实是 reject 端点不设归属门，
            // 跨 owner 也能办理；与上方"跨 owner 读面被行级数据范围门拒成 403"是两条独立判据，不矛盾。
            await apiCall(session.page, 'POST', `/quotations/${quotationId}/reject`, {
              reason: 'E2E-F40 价格低于成本线驳回',
            });
            return {
              artifacts: [
                { key: 'rejManagerUsername', value: session.username },
                { key: 'ctrlQuotationId', value: ctrlQuotationId },
                { key: 'ctrlQuotationMarker', value: ctrlMarker },
              ],
            };
          },
        },
        {
          role: 'admin',
          label: '驳回留痕回读 转单准入被拒点名原因 审计跃迁',
          run: async ({ session, require }) => {
            const quotationId = Number(require('rejQuotationId'));
            const rejected = await readQuotationStatus(session.page, quotationId);
            expect(
              String(rejected.status ?? ''),
              `驳回后应真落库 rejected，实际=${JSON.stringify(rejected.status)}`
            ).toBe('rejected');
            expect(
              Object.prototype.hasOwnProperty.call(rejected, 'rejection_reason'),
              `驳回链要求详情出参含 rejection_reason 键（该键缺失属契约漂移，必须点名而非跳过），实际键=${Object.keys(
                rejected
              ).join(',')}`
            ).toBe(true);
            expect(String(rejected.rejection_reason ?? ''), '驳回意见应真实落列并可回读').toBe(
              'E2E-F40 价格低于成本线驳回'
            );

            // 驳回后转销售订单准入必须被拒，且拒绝点名当前状态（不是只断 4xx 了事）
            const convFail = await apiCallExpectFail(
              session.page,
              'POST',
              `/quotations/${quotationId}/convert`
            );
            expect(convFail.status, `rejected 报价转单应 400，实际=${convFail.status}`).toBe(400);
            expect(
              failureCode(convFail),
              `rejected 转单机器码应 BUSINESS_ERROR，实际 code=${convFail.code ?? ''}`
            ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
            // 文案判据与被拒点原文逐字同源（quotation_convert_service.rs 的转单状态门），
            // 并从"点名状态门"加严到点名允许态与本单实际态三条。
            expect(
              String(convFail.message ?? ''),
              `rejected 转单拒绝文案应点名状态门，实际=${JSON.stringify(convFail.message)}`
            ).toContain('报价单状态不允许转订单');
            expect(
              String(convFail.message ?? ''),
              `拒绝文案应点名允许态 approved，实际=${JSON.stringify(convFail.message)}`
            ).toContain('仅 approved 状态可转换');
            expect(
              String(convFail.message ?? ''),
              `拒绝文案应回显本单实际状态 rejected，实际=${JSON.stringify(convFail.message)}`
            ).toContain('：rejected');
            const still = await readQuotationStatus(session.page, quotationId);
            expect(
              String(still.status ?? ''),
              `转单被拒后应零漂移仍 rejected，实际=${JSON.stringify(still.status)}`
            ).toBe('rejected');

            // 审计跃迁：提交与驳回逐条点名操作人与时间与前后状态
            const tSubmit = await findAuditTransition(
              session.page,
              quotationId,
              'draft',
              'pending_approval',
              '驳回链提交跃迁'
            );
            expect(
              String(tSubmit.username ?? ''),
              `驳回链提交跃迁操作人应为建单棒账号，实际=${JSON.stringify(tSubmit.username)}`
            ).toBe(String(require('rejRepUsername')));
            const tReject = await findAuditTransition(
              session.page,
              quotationId,
              'pending_approval',
              'rejected',
              '驳回跃迁'
            );
            expect(
              String(tReject.username ?? ''),
              `驳回跃迁操作人应为审批棒账号，实际=${JSON.stringify(tReject.username)}`
            ).toBe(String(require('rejManagerUsername')));
            const rejectSnapshot = tReject.new_value as Row;
            expect(
              String(rejectSnapshot.rejection_reason ?? ''),
              '驳回跃迁审计的变更后快照应携带真实驳回意见'
            ).toBe('E2E-F40 价格低于成本线驳回');
            return {
              artifacts: [{ key: 'rejFinalNo', value: String(require('rejQuotationNo')) }],
            };
          },
        },
      ]);

      // 链尾对照：建单棒与审批棒的按钮授权面互斥（同 40-01 判据，两棒真实权限取自 auth/me）
      const repLeg = relay.sessions[1];
      const approverLeg = relay.sessions[2];
      assertBuildApproverSeparation(repLeg.permissions, approverLeg.permissions, '驳回链按钮对照');
      expect(new Set(relay.sessions.map(s => s.userId)).size, '四棒用户 id 应互不相同').toBe(4);
    } finally {
      await relay.close();
    }
  });
});
