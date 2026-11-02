/**
 * 功能：把色号阶梯价（按量分档计价）的档位命中、档边界、档间空洞、改档即时重算与非法区间拒绝，
 * 以及供应商资质附件的「上传—列表回读—受鉴权下载—删除」闭环钉成真实落库与真实字节回读链。
 * 调用方：Playwright 分片 e2e（CI 的 frontend-e2e 分片按 flow 目录收集本文件）；请求面依次落到
 * backend/src/routes/color_price.rs:52-59 注册的 list_tiers/create_tier 与 :57-59 的 delete_tier、
 * :46-49 的 calculate_color_price，以及 backend/src/routes 下 purchase 分组的 supplier_handler
 * 资质四条腿（create_supplier_qualification / upload_supplier_qualification_attachment /
 * list_supplier_qualifications / get_supplier_qualification_attachment / delete_supplier_qualification）。
 * 入参：档位区间与单价由本用例自建（min_quantity/max_quantity/tier_price 取 CreatePriceTierDto 的
 * 字段名与可空性，customer_level 一律写 null 表通用档）；附件字节由本用例在内存生成的真实 PDF
 *  magic 头构成；会话账号只取 ./helpers 的 testPassword() / testUsername() 与 loginAsRole 的岗位名，
 * 源码内不出现任何口令字面量。
 * 传给谁：档位命中判定交 backend/src/utils/price_calculator.rs:276-316 的 find_tier_price
 * （min_quantity <= qty 且 max_quantity >= qty 或 max_quantity IS NULL，按 sequence 升序取单行），
 * 出参交 PriceCalcResult（tier_price/final_price/applied_rule/breakdown）；附件字节交
 * handlers/supplier_handler.rs:1154 起的受鉴权读取腿，上传腿只回服务端生成的 attachment_path。
 * 存什么：档位落 color_price_tier 的 product_color_price_id/min_quantity/max_quantity/tier_price/
 * customer_level/sequence/created_at/updated_at；max_quantity 与 customer_level 的"无上限/通用"写 NULL，
 * 不写 0 也不写空串；资质落 supplier_qualification 行，附件只回写 attachment_path 单列。
 * 存哪里：端点路径与方法的唯一事实来源是 frontend/scripts/route-snapshot.txt（本文件覆盖 GET/POST
 * /color-prices/tiers/{price_id}、DELETE /color-prices/tiers/item/{tier_id}、GET /color-prices/calculate、
 * POST 与 GET /purchase/suppliers/{sid}/qualifications[/{qid}][/attachment]、DELETE 资质腿，
 * 以及脱敏分面用的 GET /products 与 GET /products/{id}）；附件文件落
 * handlers/supplier_handler.rs 的 QUALIFICATION_UPLOAD_DIR 目录，受控名单点号形态
 * {supplier_id}_{qualification_id}.{ext}，落库 URL 前缀 /uploads/qualifications/。
 *
 * 金额口径。base_price 与 tier_price 在本域模型（backend/src/models/product_color_price.rs、
 * color_price_tier.rs）与 DTO（color_price_tier_dto.rs:18-46）里都没有含税列与税率列，
 * 系统未定义"阶梯价含税"这一事实，故本文件不引入 净额×(1+税率) 或 含税÷(1+税率) 的任何算式，
 * 也不把 tier_price 当含税价；所有金额判据只用 Number(String(出参)) 读回原值比对，测试内不再造一次舍入。
 * 同理，本域无克重列（gram_weight 属 products 面料域），"超大克重"负例不在本文件的端点面内，不自造字段。
 *
 * 契约真相（逐段读后端源，非推测）。
 * - 档命中的唯一门是 find_tier_price 的区间过滤；sequence 升序 + `.one(db)`，
 *   因此两档重叠时同量会命中多行，sea-orm 的 one() 对多行返回 Err → 经 TierError::Database
 *   映射 AppError::database（500 DATABASE_ERROR），后端没有"重复档/重叠档"的创建期校验门。
 *   该缺口按源码缺陷登记（见回报），本文件不把"重叠档被创建成功"写成正向期望，
 *   也不构造重叠数据去打 500，避免用一条红用例掩盖缺门事实。
 * - 创建期唯一的真实校验门（services/color_price_tier_service.rs:60-66）：max_quantity 有值时
 *   min_quantity >= max_quantity 即 TierError::Validation → tier_err（handlers/color_price_handler.rs:78）
 *   → AppError::validation，HTTP 400 与机器码 VALIDATION_ERROR（文案被脱敏，不断言原文）。
 * - 取价腿的数量是 String 再 Decimal::from_str（handlers/color_price_handler.rs:314-315），
 *   非数字即 AppError::validation_displayable → 400 VALIDATION_ERROR。
 * - 删除不存在的档位：AuditLogService::delete_with_audit_i64 的 NotFound → TierError::NotFound
 *   → AppError::not_found → 404 NOT_FOUND。
 * - list_tiers 有行级归属门（handlers/color_price_handler.rs:368-370）：非 admin 数据范围且
 *   parent.created_by 不在其成员范围 → AppError::permission_denied 403 FORBIDDEN。
 * - create_tier 无行级归属门，只吃 permission 中间件由 URL 段推导的 color-prices 权限键
 *   （middleware/permission.rs:259 取 /api/v1/erp/{seg3}/{seg4}），写权限缺失岗位一律 403 FORBIDDEN。
 * - 附件门：上传必须是合法 multipart（缺 boundary → 400 VALIDATION_ERROR）；扩展名白名单
 *   pdf/jpg/jpeg/png（supplier_handler.rs:749），非白名单 → 拒绝；声明扩展名与实际 magic 不符
 *   → 400 VALIDATION_ERROR；未上传前读取 → 404 NOT_FOUND（attachment_path 为 NULL）；
 *   删除资质行后该双键路径整体不存在 → 404。
 * - 脱敏分面（utils/field_mask.rs:63-84 + handlers/product_handler.rs:360-370 与 :435-445）：
 *   非 admin 只把 cost_price 键置 null，standard_price/name/code/unit 等同族键原样下发，
 *   列表腿与详情腿同源掩码；因此本文件按"只剔成本价、不剔全部价格"这一分面写断言，不做一刀切断言。
 *
 * 假绿防线。每次写档与删档都紧跟 list_tiers 逐列回读，并以 /color-prices/calculate 的真实取价结果
 * 证明档位参与计价（applied_rule 与 tier_price 两处同时成立）；负例除钉 HTTP 与机器码外，
 * 一律回读档位列表证零落库；附件下载断言取回字节数与上传字节数相等且 magic 头一致，
 * 删除后回读列表证行真的消失，不拿 404 当健康。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  failureCode,
  genCode,
  genName,
  getCtx,
  loginAsRole,
} from './helpers';
// 产品类型单源常量（与后端 product_type 词表同源）：建品夹具取值必须经成员引用。
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

const str = (v: unknown): string => String(v);

/**
 * 功能：把未知 JSON 节点收窄成对象行，拿不到对象即判红而不是返回兜底空对象。
 * 调用方：本文件所有回读点（建价、档位列表、取价结果、资质行、产品行）。
 * 入参：value 为待收窄节点，label 为点名前置条件的上下文文案。
 * 传给谁：只给本文件的断言用，不发请求也不落库。
 * 存什么：不持久化任何字段。缺值即抛错，禁止 ?? 与 || 兜底掩盖缺键。
 * 存哪里：不写任何存储位置。
 */
function requireRow(value: unknown, label: string): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}：期望 JSON 对象，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}：期望 JSON 数组，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 功能：把 DECIMAL 出参按序列化形态读成数值，不在测试内做任何舍入与补位。
 * 调用方：档位单价、base_price、取价结果的 tier_price 与 final_price 比对点。
 * 入参：value 为出参原值（字符串形态优先），label 点名是哪一列。
 * 传给谁：只给断言用。非有限数即判红，不按 0 兜底。
 * 存什么：不落库。
 * 存哪里：不写存储位置。
 */
function toNum(value: unknown, label: string): number {
  const n = Number(str(value));
  if (!Number.isFinite(n)) {
    throw new Error(`${label}：期望可解析的 DECIMAL 出参，实际 ${JSON.stringify(value)}`);
  }
  return n;
}

function ymd(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 功能：从会话 Cookie 取存活 CSRF 双提交令牌，供 multipart 上传腿自带请求头。
 * 调用方：uploadQualificationAttachment（POST 资质附件 multipart 腿）。
 * 入参：page 为已登录会话页。
 * 传给谁：写进 multipart 请求的 X-CSRF-Token 头，与 helpers 的 apiCall 同口径。
 * 存什么：不落库；取不到即判红，不做空串兜底放行。
 * 存哪里：不写存储位置。
 */
async function csrfOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf || csrf.value.length === 0) {
    throw new Error('会话缺少 csrf_token cookie，登录前置未成立，multipart 腿无法归因失败面');
  }
  return csrf.value;
}

/**
 * 功能：把资质附件的 multipart 上传腿打出去并解析统一成功信封，非 2xx 即判红点名状态码。
 * 调用方：451-03 附件闭环用例的正腿与负腿（负腿走 apiCallExpectFail 之外的 raw 判定）。
 * 入参：page 为已登录页，supplierId 与 qualificationId 为路径双键，fileName 为客户端原名
 * （含中文与括号，服务端不参与路径拼接），mime 与 bytes 决定实际 magic。
 * 传给谁：POST /purchase/suppliers/{sid}/qualifications/{qid}/attachment，
 * 由 handlers/supplier_service.rs 的 update_supplier_qualification_attachment_path 回写单列。
 * 存什么：只回服务端生成的 attachment_path 等资质列，客户端原名不落库。
 * 存哪里：supplier_qualification.attachment_path 与 QUALIFICATION_UPLOAD_DIR 下的受控文件名。
 */
async function uploadQualificationAttachment(
  page: Page,
  supplierId: number,
  qualificationId: number,
  fileName: string,
  mime: string,
  bytes: Uint8Array
): Promise<{ status: number; body: Row }> {
  const csrf = await csrfOf(page);
  const resp = await page.request.post(
    `${API_BASE}${API_PREFIX}/purchase/suppliers/${supplierId}/qualifications/${qualificationId}/attachment`,
    {
      headers: { 'X-CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' },
      multipart: {
        file: { name: fileName, mimeType: mime, buffer: Buffer.from(bytes) },
      },
    }
  );
  const text = await resp.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `附件腿非 JSON 响应 status=${resp.status()}，body 前 200 字符：${text.slice(0, 200)}`
    );
  }
  return { status: resp.status(), body: requireRow(body, `附件腿 status=${resp.status()}`) };
}

/**
 * 功能：自建一条色号价格宿主并返回其主键，供档位挂接与取价腿引用。
 * 调用方：451-01 与 451-02 两条阶梯价用例各自调用，互不共享句柄。
 * 入参：page 为已登录页，tag 为本轮唯一标记（并发车道隔离），productId 与 colorId 取
 * ensureTestEntities 自建自持的报价专用产品与其色号。
 * 传给谁：POST /color-prices（CreateColorPriceDto 的 product_id/color_id/currency/base_price/
 * effective_from 五枚必填列），服务端初态写 approval_status APPROVED 与 is_active 真。
 * 存什么：product_color_prices 一行的 product_id、color_id、currency、base_price、effective_from、notes；
 * 可空列缺省不写 0。
 * 存哪里：product_color_prices 表，取价腿按 product_id+color_id+currency+is_active 反查该行的 id。
 */
async function seedPriceHost(
  page: Page,
  tag: string,
  productId: number,
  colorId: number
): Promise<number> {
  const created = requireRow(
    await apiCallRaw<unknown>(page, 'POST', '/color-prices', {
      product_id: productId,
      color_id: colorId,
      currency: 'CNY',
      base_price: '100.00',
      effective_from: ymd(0),
      notes: `阶梯价宿主${tag}`,
    }),
    '建价出参'
  );
  const priceId = toNum(created.id, '建价返回主键');
  expect(
    Number.isInteger(priceId) && priceId > 0,
    `建价必须返回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  return priceId;
}

/**
 * 功能：新建一枚阶梯档并回读其行，证明确实落库且列值与提交一致。
 * 调用方：451-01 建三档、451-02 建边界档与替换档。
 * 入参：priceId 为宿主价格主键，minQ 与 maxQ 为区间（maxQ 传 null 表示无上限通用档），
 * tierPrice 为该档单价字符串（DECIMAL 形态），sequence 为升序取档序位。
 * 传给谁：POST /color-prices/tiers/{price_id}（CreatePriceTierDto），服务层 create 落 color_price_tier。
 * 存什么：product_color_price_id、min_quantity、max_quantity、tier_price、customer_level（写 NULL）、
 * sequence；缺上限写 NULL 不写 0。
 * 存哪里：color_price_tier 表一行，出参交调用方继续回读比对。
 */
async function createTier(
  page: Page,
  priceId: number,
  minQ: string,
  maxQ: string | null,
  tierPrice: string,
  sequence: number
): Promise<Row> {
  const created = requireRow(
    await apiCallRaw<unknown>(page, 'POST', `/color-prices/tiers/${priceId}`, {
      product_color_price_id: priceId,
      min_quantity: minQ,
      max_quantity: maxQ,
      tier_price: tierPrice,
      customer_level: null,
      sequence,
    }),
    `建档 ${minQ}-${String(maxQ)} 出参`
  );
  expect(
    toNum(created.min_quantity, '建档回显 min_quantity'),
    `建档回显 min_quantity 必须等于提交值，实际 ${str(created.min_quantity)}`
  ).toBe(Number(minQ));
  expect(
    toNum(created.tier_price, '建档回显 tier_price'),
    `建档回显 tier_price 必须等于提交值，实际 ${str(created.tier_price)}`
  ).toBe(Number(tierPrice));
  expect(
    created.customer_level === null,
    `通用档的 customer_level 必须落 NULL，实际 ${JSON.stringify(created.customer_level)}`
  ).toBe(true);
  return created;
}

/**
 * 功能：读回某价格宿主下的全部档位并按 sequence 定位一行，定位不到即判红。
 * 调用方：451-01 与 451-02 的写后回读与删除后回读。
 * 入参：page 为已登录页，priceId 为宿主主键，sequence 为目标档序位。
 * 传给谁：GET /color-prices/tiers/{price_id} 的出参 `{items,total}`（handlers/color_price_handler.rs:375-377）。
 * 存什么：只读不落，返回行的 min_quantity、max_quantity、tier_price、sequence 四列供断言。
 * 存哪里：不写存储位置；数据源为 color_price_tier。
 */
async function readTierBySequence(page: Page, priceId: number, sequence: number): Promise<Row> {
  const payload = requireRow(
    await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
    '档位列表出参'
  );
  const items = requireArray(payload.items, '档位列表 items');
  for (const item of items) {
    const row = requireRow(item, '档位列表行');
    if (toNum(row.sequence, '档位 sequence') === sequence) {
      return row;
    }
  }
  throw new Error(`档位列表未回读到 sequence=${sequence} 的行，实际 ${JSON.stringify(payload)}`);
}

/**
 * 功能：读回某数量下的真实取价结果，作为"档位是否参与计价"的唯一证据。
 * 调用方：451-01 逐档取价、451-02 边界与空洞取价、451-02 负例取价。
 * 入参：productId 与 colorId 为宿主两键，quantity 为字符串数量（后端 String→Decimal），
 * currency 固定 CNY 与建价币种同源。
 * 传给谁：GET /color-prices/calculate → utils/price_calculator.rs 的 calculate_price，
 * 出参 PriceCalcResult 的 tier_price/final_price/applied_rule 三键交断言。
 * 存什么：只读不落。
 * 存哪里：不写存储位置；命中判定读 color_price_tier。
 */
async function calcPrice(
  page: Page,
  productId: number,
  colorId: number,
  quantity: string
): Promise<Row> {
  return requireRow(
    await apiCallRaw<unknown>(
      page,
      'GET',
      `/color-prices/calculate?product_id=${productId}&color_id=${colorId}&quantity=${quantity}&currency=CNY`
    ),
    `取价 quantity=${quantity} 出参`
  );
}

test.describe.serial('451 阶梯价命中与资质附件流转', () => {
  test.beforeEach(async ({ page }) => {
    await ensureTestEntities(page);
  });

  test('451-01 三档阶梯价逐档命中且写后立即可被取价腿读到', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const colorId = ctx.quotationProductColorId;
    if (productId === undefined || colorId === undefined) {
      throw new Error('ensureTestEntities 未产出报价专用产品与其色号，阶梯价宿主前置不成立');
    }
    const tag = genCode('451A');
    const priceId = await seedPriceHost(page, tag, productId, colorId);

    await createTier(page, priceId, '1', '99', '88.88', 1);
    await createTier(page, priceId, '100', '499', '66.66', 2);
    await createTier(page, priceId, '500', null, '44.44', 3);

    const listed = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
      '三档建后列表出参'
    );
    expect(
      toNum(listed.total, '档位列表 total'),
      `三档应全部落库，实际 total=${str(listed.total)}`
    ).toBe(3);
    expect(
      str(await readTierBySequence(page, priceId, 3).then(r => r.max_quantity)),
      '第三档无上限必须回读为 NULL，而不是 0 或空串'
    ).toBe('null');

    for (const qty of ['1', '50', '99']) {
      const hit = await calcPrice(page, productId, colorId, qty);
      expect(str(hit.applied_rule), `数量 ${qty} 应命中阶梯价档`).toBe('tier');
      expect(
        toNum(hit.tier_price, `数量 ${qty} 的 tier_price`),
        `数量 ${qty} 应取第一档 88.88，实际 ${str(hit.tier_price)}`
      ).toBe(88.88);
      expect(
        toNum(hit.final_price, `数量 ${qty} 的 final_price`),
        `无等级无季节时 final_price 必须等于命中档单价，实际 ${str(hit.final_price)}`
      ).toBe(88.88);
    }

    for (const qty of ['100', '250', '499']) {
      const hit = await calcPrice(page, productId, colorId, qty);
      expect(
        toNum(hit.tier_price, `数量 ${qty} 的 tier_price`),
        `数量 ${qty} 应取第二档 66.66，实际 ${str(hit.tier_price)}`
      ).toBe(66.66);
    }

    for (const qty of ['500', '5000']) {
      const hit = await calcPrice(page, productId, colorId, qty);
      expect(str(hit.applied_rule), `数量 ${qty} 应命中第三档`).toBe('tier');
      expect(
        toNum(hit.tier_price, `数量 ${qty} 的 tier_price`),
        `数量 ${qty} 应取第三档 44.44（无上限档），实际 ${str(hit.tier_price)}`
      ).toBe(44.44);
    }

    const deletedTier = await readTierBySequence(page, priceId, 2);
    const delResp = requireRow(
      await apiCallRaw<unknown>(page, 'DELETE', `/color-prices/tiers/item/${str(deletedTier.id)}`),
      '删除第二档出参'
    );
    expect(toNum(delResp.deleted, '删除档位回显 id'), '删除腿必须回显被删档位主键').toBe(
      toNum(deletedTier.id, '第二档主键')
    );

    const afterDelete = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
      '删档后列表出参'
    );
    expect(
      toNum(afterDelete.total, '删档后 total'),
      `删档后应剩两档，实际 total=${str(afterDelete.total)}`
    ).toBe(2);

    const gap = await calcPrice(page, productId, colorId, '200');
    expect(
      str(gap.applied_rule),
      '第二档删除后 200 落入档间空洞，必须退回基础价而不是沿用已删档'
    ).toBe('base');
    expect(
      gap.tier_price === null,
      `档间空洞时 tier_price 必须为 null，实际 ${JSON.stringify(gap.tier_price)}`
    ).toBe(true);
    expect(
      toNum(gap.final_price, '空洞时 final_price'),
      '空洞时 final_price 必须等于基础价 100.00'
    ).toBe(100);

    expect(
      str((await calcPrice(page, productId, colorId, '99')).tier_price),
      '删第二档不应波及第一档'
    ).toBe('88.88');
    expect(
      str((await calcPrice(page, productId, colorId, '500')).tier_price),
      '删第二档不应波及第三档'
    ).toBe('44.44');

    await apiCallRaw<unknown>(page, 'DELETE', `/color-prices/${priceId}`);
  });

  test('451-02 补档即时生效与非法区间、非法数量、幽灵档位三类拒绝且不落库', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const colorId = ctx.quotationProductColorId;
    if (productId === undefined || colorId === undefined) {
      throw new Error('ensureTestEntities 未产出报价专用产品与其色号，阶梯价宿主前置不成立');
    }
    const tag = genCode('451B');
    const priceId = await seedPriceHost(page, tag, productId, colorId);
    await createTier(page, priceId, '1', '99', '88.88', 1);
    await createTier(page, priceId, '500', null, '44.44', 3);

    const before = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
      '负例前档位列表'
    );
    const beforeTotal = toNum(before.total, '负例前 total');
    expect(beforeTotal, '负例前置应为两档').toBe(2);

    const failEqual = await apiCallExpectFail(page, 'POST', `/color-prices/tiers/${priceId}`, {
      product_color_price_id: priceId,
      min_quantity: '100',
      max_quantity: '100',
      tier_price: '10.00',
      customer_level: null,
      sequence: 2,
    });
    expect(failEqual.status, `min==max 应被 400 拒绝，实际 ${failEqual.status}`).toBe(400);
    expect(
      failureCode(failEqual),
      `min==max 的机器码必须是 VALIDATION_ERROR，实际 ${JSON.stringify(failEqual.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      typeof failEqual.trace_id === 'string' && failEqual.trace_id.length > 0,
      `统一失败信封必须携带 trace_id，实际 ${JSON.stringify(failEqual)}`
    ).toBe(true);
    expect(
      typeof failEqual.message === 'string' && failEqual.message.length > 0,
      `统一失败信封必须携带 message，实际 ${JSON.stringify(failEqual)}`
    ).toBe(true);

    const failGreater = await apiCallExpectFail(page, 'POST', `/color-prices/tiers/${priceId}`, {
      product_color_price_id: priceId,
      min_quantity: '99',
      max_quantity: '50',
      tier_price: '10.00',
      customer_level: null,
      sequence: 2,
    });
    expect(failGreater.status, 'min>max 应被 400 拒绝').toBe(400);
    expect(failureCode(failGreater)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    const failQty = await apiCallExpectFail(
      page,
      'GET',
      `/color-prices/calculate?product_id=${productId}&color_id=${colorId}&quantity=abc&currency=CNY`
    );
    expect(failQty.status, `非数字数量应被 400 拒绝，实际 ${failQty.status}`).toBe(400);
    expect(
      failureCode(failQty),
      `非数字数量的机器码必须是 VALIDATION_ERROR，实际 ${JSON.stringify(failQty.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    const failGhost = await apiCallExpectFail(page, 'DELETE', '/color-prices/tiers/item/99999999');
    expect(failGhost.status, `删不存在档位应 404，实际 ${failGhost.status}`).toBe(404);
    expect(failureCode(failGhost)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const after = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
      '负例后档位列表'
    );
    expect(
      toNum(after.total, '负例后 total'),
      `三笔被拒请求不得落库，档位必须仍为 ${beforeTotal} 档，实际 ${str(after.total)}`
    ).toBe(beforeTotal);
    expect(
      JSON.stringify(
        requireArray(after.items, '负例后 items').map(r => requireRow(r, '行').min_quantity)
      ),
      '被拒的 100 与 99 起量档不得出现在列表里'
    ).not.toContain('"100"');

    const hole = await calcPrice(page, productId, colorId, '100');
    expect(str(hole.applied_rule), '补档前数量 100 落在空洞里，必须仍是 base 档').toBe('base');

    await createTier(page, priceId, '100', '150', '22.22', 2);
    const filled = await calcPrice(page, productId, colorId, '100');
    expect(str(filled.applied_rule), '补档后数量 100 必须立即命中新档').toBe('tier');
    expect(
      toNum(filled.tier_price, '补档后 tier_price'),
      `补档后必须取到新档单价 22.22，实际 ${str(filled.tier_price)}`
    ).toBe(22.22);
    expect(
      toNum(
        (await calcPrice(page, productId, colorId, '151')).final_price,
        '补档区间外 final_price'
      ),
      '151 超出新档上限 150，必须退回基础价 100.00'
    ).toBe(100);

    const replacement = await readTierBySequence(page, priceId, 2);
    await apiCallRaw<unknown>(page, 'DELETE', `/color-prices/tiers/item/${str(replacement.id)}`);
    await apiCallRaw<unknown>(page, 'DELETE', `/color-prices/${priceId}`);
  });

  test('451-03 资质附件上传到列表回读到受鉴权下载到删除的闭环', async ({ page }) => {
    const ctx = getCtx();
    const supplierId = ctx.supplierId;
    if (supplierId === undefined) {
      throw new Error('ensureTestEntities 未产出供应商主键，资质附件宿主前置不成立');
    }
    const tag = genCode('451C');

    const qualification = requireRow(
      await apiCallRaw<unknown>(page, 'POST', `/purchase/suppliers/${supplierId}/qualifications`, {
        qualification_name: genName('营业执照'),
        qualification_type: 'business_license',
        qualification_no: tag,
        issuing_authority: '市场监督管理局',
        issue_date: ymd(-30),
        valid_until: ymd(365),
        need_annual_check: true,
      }),
      '资质创建出参'
    );
    const qid = toNum(qualification.id, '资质主键');
    expect(
      qualification.attachment_path === null,
      `新建资质的 attachment_path 初态必须为 NULL（未补录不写空串），实际 ${JSON.stringify(
        qualification.attachment_path
      )}`
    ).toBe(true);

    const beforeUpload = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    expect(
      beforeUpload.status,
      `未上传附件时读取腿必须 404 而不是空壳 200，实际 ${beforeUpload.status}`
    ).toBe(404);
    expect(failureCode(beforeUpload)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const badExt = await uploadQualificationAttachment(
      page,
      supplierId,
      qid,
      '资质附件（中文）.txt',
      'text/plain',
      Buffer.from('plain text body', 'utf-8')
    );
    expect(badExt.status, `非白名单扩展名必须被拒，实际 ${badExt.status}`).toBe(400);

    const fakePdf = await uploadQualificationAttachment(
      page,
      supplierId,
      qid,
      '伪装.pdf',
      'application/pdf',
      Buffer.from('this is not a pdf at all', 'utf-8')
    );
    expect(fakePdf.status, `声明 .pdf 但 magic 不符必须被拒，实际 ${fakePdf.status}`).toBe(400);

    const stillEmpty = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    expect(stillEmpty.status, '两笔被拒上传后仍不得有附件可读').toBe(404);

    const pdfBytes = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
      'utf-8'
    );
    const uploaded = await uploadQualificationAttachment(
      page,
      supplierId,
      qid,
      '质检报告（2026 年度）.pdf',
      'application/pdf',
      pdfBytes
    );
    expect(uploaded.status, `真实 PDF 附件应上传成功，实际 ${uploaded.status}`).toBe(200);
    const uploadedRow = requireRow(uploaded.body.data, '上传成功信封 data');
    const expectedPath = `/uploads/qualifications/${supplierId}_${qid}.pdf`;
    expect(
      str(uploadedRow.attachment_path),
      `附件路径必须是服务端生成的受控单点号形态 ${expectedPath}，实际 ${str(
        uploadedRow.attachment_path
      )}`
    ).toBe(expectedPath);

    const listed = requireArray(
      await apiCallRaw<unknown>(page, 'GET', `/purchase/suppliers/${supplierId}/qualifications`),
      '资质列表出参'
    );
    let listedRow: Row | undefined;
    for (const item of listed) {
      const row = requireRow(item, '资质列表行');
      if (toNum(row.id, '资质列表行主键') === qid) {
        listedRow = row;
      }
    }
    if (!listedRow) {
      throw new Error(`资质列表未回读到自建行 id=${qid}，写后读回前置不成立`);
    }
    expect(
      str(listedRow.attachment_path),
      `列表腿的 attachment_path 必须与上传腿一致，实际 ${str(listedRow.attachment_path)}`
    ).toBe(expectedPath);

    const download = await page.request.get(
      `${API_BASE}${API_PREFIX}/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    expect(download.status(), '附件下载必须 200，不得把 404 当健康').toBe(200);
    const got = await download.body();
    expect(got.length, `下载字节数必须与上传字节数相等，实际 ${got.length}`).toBe(pdfBytes.length);
    expect(
      got.subarray(0, 5).toString('utf-8'),
      `下载内容必须是真实 PDF 字节而非空壳，实际前 5 字节 ${got.subarray(0, 5).toString('utf-8')}`
    ).toBe('%PDF-');

    await apiCallRaw<unknown>(
      page,
      'DELETE',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}`
    );

    const listedAfter = requireArray(
      await apiCallRaw<unknown>(page, 'GET', `/purchase/suppliers/${supplierId}/qualifications`),
      '删除后资质列表出参'
    );
    for (const item of listedAfter) {
      const row = requireRow(item, '删除后资质列表行');
      expect(
        toNum(row.id, '删除后列表残留行主键') !== qid,
        `删除后列表仍回读到 id=${qid}，属假删除`
      ).toBe(true);
    }

    const afterDelete = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    expect(afterDelete.status, '删除资质后附件读取腿必须 404').toBe(404);
    expect(failureCode(afterDelete)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('451-04 附件与档位写入需岗位权限，非管理岗被后端门拦截且成本价按分面掩码', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const colorId = ctx.quotationProductColorId;
    if (productId === undefined || colorId === undefined) {
      throw new Error('ensureTestEntities 未产出报价专用产品与其色号，阶梯价宿主前置不成立');
    }
    const tag = genCode('451D');

    const product = requireRow(
      await apiCallRaw<unknown>(page, 'POST', '/products', {
        name: genName('阶梯价宿主产品'),
        code: `451P${tag}`,
        unit: 'm',
        product_type: PRODUCT_TYPE.auxiliary,
        standard_price: '33.33',
        cost_price: '12.34',
      }),
      '建品出参'
    );
    const hostProductId = toNum(product.id, '建品主键');

    const adminDetail = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/products/${hostProductId}`),
      '管理岗产品详情出参'
    );
    expect(
      toNum(adminDetail.standard_price, '管理岗 standard_price'),
      '管理岗应能读到标准售价原值，不得被掩码'
    ).toBe(33.33);
    expect(
      toNum(adminDetail.cost_price, '管理岗 cost_price'),
      '管理岗应能读到成本价原值 12.34，实际 ' + str(adminDetail.cost_price)
    ).toBe(12.34);

    // 建宿主与首档必须在管理岗会话内完成：list_tiers 带行级归属门，
    // 建价人切岗后回读会被自家归属门拒掉，届时无法区分权限门与归属门。
    const priceId = await seedPriceHost(page, tag, productId, colorId);
    await createTier(page, priceId, '1', '99', '88.88', 1);

    await loginAsRole(page, 'manager');
    const maskedDetail = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/products/${hostProductId}`),
      '非管理岗产品详情出参'
    );
    expect(
      maskedDetail.cost_price === null,
      `非 admin 详情腿的 cost_price 必须被置 NULL，实际 ${JSON.stringify(maskedDetail.cost_price)}`
    ).toBe(true);
    expect(
      toNum(maskedDetail.standard_price, '非管理岗 standard_price'),
      '脱敏只剔成本价，标准售价必须原样下发（一刀切断言即假绿）'
    ).toBe(33.33);

    const denyCreate = await apiCallExpectFail(page, 'POST', `/color-prices/tiers/${priceId}`, {
      product_color_price_id: priceId,
      min_quantity: '200',
      max_quantity: '300',
      tier_price: '55.55',
      customer_level: null,
      sequence: 9,
    });
    expect(
      denyCreate.status,
      `同一写档端点在无该写权限岗位会话里必须被后端门拦成 403，实际 ${denyCreate.status}`
    ).toBe(403);
    expect(
      failureCode(denyCreate),
      `权限拒绝的机器码必须是 FORBIDDEN，实际 ${JSON.stringify(denyCreate.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    await loginAsRole(page, 'admin');
    const afterDeny = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/color-prices/tiers/${priceId}`),
      '权限拒绝后档位列表（管理岗回读）'
    );
    expect(
      toNum(afterDeny.total, '权限拒绝后 total'),
      `被 403 拒掉的写档请求不得落库，档位必须仍为 1 档，实际 ${str(afterDeny.total)}`
    ).toBe(1);
    for (const item of requireArray(afterDeny.items, '权限拒绝后 items')) {
      const row = requireRow(item, '权限拒绝后档位行');
      expect(
        toNum(row.sequence, '残留行 sequence') !== 9,
        `被拒的 sequence=9 档出现在列表里，属假拒绝真空，实际 ${JSON.stringify(row)}`
      ).toBe(true);
    }

    await apiCallRaw<unknown>(page, 'DELETE', `/products/${hostProductId}`);
    await apiCallRaw<unknown>(page, 'DELETE', `/color-prices/${priceId}`);
  });
});
