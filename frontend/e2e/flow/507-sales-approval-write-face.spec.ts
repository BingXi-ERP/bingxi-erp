import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  genCode,
  tryCleanup,
  failureCode,
  expectStateGateRejection,
  APP_ERROR_CODES,
} from './helpers';

/**
 * 507 销售域两枚「前端可达 + 全仓零覆盖」写面端点：订单转合同 与 单条客户价格改单
 *
 * 覆盖面取证（写断言前逐字对过 backend 源码，非设想）：
 * - POST /api/v1/erp/sales/sales-contracts/from-order/{order_id}
 * 路由 routes/sales.rs（`sales_contracts()` merge 进 `sales::routes()`，
 * nest 前缀 `/api/v1/erp/sales` 见 routes/mod.rs）→ handler
 * handlers/sales_contract_handler.rs `convert_from_order`。
 * 入参 DTO ConvertFromOrderDto（handler）+ ConvertItemDto：
 * 表头 contract_name 必填且 1..=200；明细 items 全量一一对应订单行，行内只接受
 * order_item_id / quantity / unit_price / delivery_date / color_no /
 * quantity_tolerance_pct / remarks 七个键，金额、折扣率、税率**不在 DTO 内**，
 * 客户端即便构造这些键也被 serde 丢弃（服务端回读订单行经 amounts 重算）。
 * 客户不可改派：合同 customer_id 直取来源订单（convert_service）。
 * - PUT /api/v1/erp/sales/sales-prices/{id}
 * 路由 routes/sales.rs（`get_price().put(update_price).delete(delete_price)`）
 * → handlers/sales_price_handler.rs → services/sales_price_service.rs。
 * UpdateSalesPriceInput（service）全字段 Option；effective_date/expiry_date 走
 * double_option 三态（键缺席=不改、显式 null、有值=覆盖），price_level 是单层 Option
 * 透传通道（显式 null 等同键缺席，**不支持**清空回标准价，源码注释 self 声明）。
 *
 * 出参形态（断言回读用的真实序列化键，snake_case）：
 * - 合同详情 GET /sales/sales-contracts/{id} 直接序列化 models/sales_contract.rs::Model
 * （id/contract_no/contract_name/status/customer_id/source_order_id/total_amount/...）；
 * 合同明细 GET /sales/sales-contracts/{id}/items 序列化 sales_contract_item::Model 裸数组
 * （contract_id/source_order_item_id/quantity/unit_price/sort_order/...）。
 * - 价格 GET /sales/sales-prices/{id} 序列化 models/sales_price.rs::Model
 * （price/currency/unit/min_order_qty/price_level/effective_date/expiry_date/status）。
 * 合同状态词表唯一来源 models/status/bpm_crm_contract.rs `contract`（小写
 * draft/active/cancelled/rejected）；销售订单状态词表 models/status/sales.rs
 * `sales_order`（小写 draft/pending/approved/...，可转放行集 approved/partial_shipped/
 * shipped/completed 见 convert_service）。
 *
 * 失败信封的可外显性差异是本 spec 断言强度的关键，逐条按源码取真值（禁止臆造文案）：
 * - 可转状态门（未审核源单）走 `AppError::business`（convert_service）——**非**
 * Displayable 变体，出参 message 恒为脱敏常量 "业务处理失败"（utils/messages.rs +
 * utils/error.rs），真实原因「…尚未审核通过，不能转销售合同…」只进服务端日志。
 * 故本腿只钉 HTTP 400 + code=BUSINESS_ERROR（共用判据 expectStateGateRejection），
 * 并反向钉「脱敏常量、内部文案不外泄」，不去断言不可达的文案内容。
 * - 重复转换门走 `business_displayable`（convert_service）→ message 逐字可断。
 * - 明细归属/全量覆盖门走 `AppError::validation`（，非 Displayable）
 * → 400 + VALIDATION_ERROR + message 恒 "请求参数验证失败"。
 * - 不存在订单：handler 在 DTO 校验之后、service 之前由行级归属门
 * `SalesService::assert_order_ownership`（services/so/order_query.rs）抛
 * `AppError::not_found`（非 Displayable）→ 404 + NOT_FOUND + message 恒 "资源未找到"。
 * - 价格侧三条拒绝全是 Displayable（生效日期清空、等级越界、
 * 日期格式、坏产品引用）→ message 逐字可断。
 *
 * 前置数据自建自清：approved 源单走「建单 → submit → approve」既有 URL 序列
 * （既有同类用例，审批回读小写 approved）；草稿源单只建单不提交。合同与价格行
 * 用后即删（tryCleanup，源单为 approved 态、服务端删除门只拦 shipped/completed，
 * 见 services/so/order_crud.rs，故可清；清理次序先合同后订单，避免
 * sales_contract_items → sales_order_items 溯源外键先断主表）。
 */

type Row = Record<string, unknown>;

/** GET /sales/orders/{id} 出参切片：SalesOrderDto + items（SalesOrderItemDetail，services/so/mod.rs，无 rename_all） */
interface OrderLine {
  id: number;
  product_id: number;
  quantity: string | number;
  unit_price: string | number;
}
interface OrderDetail {
  id: number;
  order_no: string;
  status: string;
  customer_id: number;
  items: OrderLine[];
}

/** GET /sales/sales-contracts/{id} 出参切片（sales_contract::Model 真实键） */
interface ContractRead {
  id: number;
  contract_no: string;
  contract_name: string;
  status: string;
  customer_id: number;
  source_order_id: number | null;
  total_amount: string | number | null;
}

/** GET /sales/sales-contracts/{id}/items 出参切片（sales_contract_item::Model 真实键） */
interface ContractItemRead {
  id: number;
  contract_id: number;
  source_order_item_id: number | null;
  quantity: string | number;
  unit_price: string | number;
  sort_order: number;
}

/** GET /sales/sales-prices/{id} 出参切片（sales_price::Model 真实键） */
interface PriceRead {
  id: number;
  product_id: number;
  price: string | number;
  currency: string;
  unit: string;
  min_order_qty: string | number;
  price_level: string | null;
  effective_date: string;
  expiry_date: string | null;
  status: string;
}

/** GET preview-from-order 出参切片：只需既有非终态转换合同指针（零副作用自证的判据） */
interface PreviewRead {
  order_id: number;
  existing_contract: { id: number; contract_no: string; status: string } | null;
}

/** 金额列按字符串序列化，断言前统一 Number 归一（不断字符串形态，避免 scale 漂移误红） */
function dec(value: string | number | null, label: string): number {
  if (value === null || value === undefined) {
    throw new Error(`前置不成立：${label} 为 ${String(value)}（该列是实体必出字段）`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`前置不成立：${label} 非数值形态，实际 ${JSON.stringify(value)}`);
  }
  return n;
}

/** i32 上界：用作「结构上必然不属于本单/必然不存在」的标识，避免与真实主键撞号 */
const IMPOSSIBLE_ID = 2147483647;

/** 建销售订单；approve=true 时再走「提交 → 审批」到 approved（转合同的合法前置状态） */
async function seedSalesOrder(page: Page, tag: string, approve: boolean): Promise<OrderDetail> {
  const ctx = getCtx();
  if (!ctx.customerId) {
    throw new Error(`${tag} 前置不成立：ctx.customerId 未就绪（销售订单必填客户外键）`);
  }
  const productId = ctx.productIds[0];
  if (productId === undefined) {
    throw new Error(`${tag} 前置不成立：ctx.productIds[0] 未就绪`);
  }
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [
      { product_id: productId, quantity: '120.00', unit_price: '8.50' },
      { product_id: productId, quantity: '30.00', unit_price: '9.25' },
    ],
    notes: `E2E507${tag}-${genCode('SO')}`,
  });
  const id = Number(created.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${tag} 前置不成立：建销售订单未返回主键，实际 ${JSON.stringify(created)}`);
  }
  if (approve) {
    await apiCall(page, 'POST', `/sales/orders/${id}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${id}/approve`);
  }
  const detail = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${id}`);
  expect(
    detail.status,
    `${tag} 源单前置状态必须是词表原值（未审核=draft、已审核=approved），实际 ${detail.status}`
  ).toBe(approve ? 'approved' : 'draft');
  if (!Array.isArray(detail.items) || detail.items.length !== 2) {
    throw new Error(
      `${tag} 前置不成立：订单详情 items 应为 2 行（全量覆盖门需要两行才分得清「缺行」与「非本单行」），实际 ${JSON.stringify(detail.items)}`
    );
  }
  console.log(
    `[507] ${tag} 源单就绪 id=${detail.id} order_no=${detail.order_no} status=${detail.status} 行 id=${detail.items
      .map(i => i.id)
      .join(',')}`
  );
  return detail;
}

/** 取源单某行的真实数量/单价：找不到就点名抛错，绝不兜默认值（假前置会伪装成契约缺陷） */
function lineValues(
  order: OrderDetail,
  orderItemId: number
): { quantity: string; unit_price: string } {
  const hit = order.items.find(i => i.id === orderItemId);
  if (hit === undefined) {
    throw new Error(
      `前置不成立：源单 ${order.id} 的详情里没有行 ${orderItemId}，实际 ${JSON.stringify(
        order.items.map(i => i.id)
      )}`
    );
  }
  return { quantity: String(hit.quantity), unit_price: String(hit.unit_price) };
}

/** 整单转换请求体：行键只送 DTO 白名单内的三键，数量单价一律回读源单真值 */
function convertBody(order: OrderDetail): Row {
  return {
    contract_name: `507转单合同_${genCode('C507')}`,
    items: order.items.map(i => ({ order_item_id: i.id, ...lineValues(order, i.id) })),
  };
}

/** 只携带部分真实行（构造「缺行」腿） */
function convertBodyPartial(order: OrderDetail, keepOrderItemIds: number[]): Row {
  return {
    contract_name: `507转单部分行_${genCode('C507P')}`,
    items: keepOrderItemIds.map(id => ({ order_item_id: id, ...lineValues(order, id) })),
  };
}

test.describe('507 销售审批写面：订单转合同 与 客户价格改单（真实契约正负双腿）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('507-01 未审核（draft）源单转合同被状态门拒为 400 BUSINESS_ERROR，原因文案按源码脱敏不外泄，且拒绝零副作用（无合同落库）', async ({
    page,
  }) => {
    const order = await seedSalesOrder(page, '草稿', false);
    const contractEp = `/sales/sales-contracts/from-order/${order.id}`;

    const fail = await apiCallExpectFail(page, 'POST', contractEp, convertBody(order));
    expectStateGateRejection(fail, '[507-01] draft 源单转合同应被可转状态门拒绝');
    expect(
      failureCode(fail),
      `[507-01] 机器码必须是 BUSINESS_ERROR（convert_service:193 AppError::business），实际 ${JSON.stringify(
        fail.code
      )}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // 源码真值：该门用非 Displayable 的 AppError::business，出参 message 恒为脱敏常量
    // "业务处理失败"（utils/error.rs public_message + utils/messages.rs），
    // 内部原因只进日志。本断言把这条安全边界钉住：改回外显内部文案即红。
    expect(
      fail.message,
      `[507-01] 未审核拒绝的出参 message 必须是脱敏常量「业务处理失败」，实际 ${JSON.stringify(fail.message)}`
    ).toBe('业务处理失败');
    expect(
      String(fail.message).includes('尚未审核通过'),
      '[507-01] 内部拒绝原因（含订单状态词）不得外泄到出参文案'
    ).toBe(false);
    console.log(
      `[507-01] 状态门拒绝形态：status=${fail.status} code=${fail.code} message=${fail.message}`
    );

    // 零副作用自证：preview 的 existing_contract 仍为 null（幂等判据读的正是这个非终态指针）
    const preview = await apiCallRaw<PreviewRead>(
      page,
      'GET',
      `/sales/sales-contracts/preview-from-order/${order.id}`
    );
    expect(
      preview.existing_contract,
      `[507-01] 被拒转换不得落任何合同，实际 ${JSON.stringify(preview.existing_contract)}`
    ).toBeNull();

    await tryCleanup(page, 'DELETE', `/sales/orders/${order.id}`, '[507-01] 草稿销售订单');
  });

  test('507-02 approved 源单整单转合同：200 回草稿 + 表头/明细逐列落库回读；缺行与非本单行被拒 400 VALIDATION；重复转换被拒并逐字点名既有合同号', async ({
    page,
  }) => {
    const order = await seedSalesOrder(page, '已审核', true);
    const contractEp = `/sales/sales-contracts/from-order/${order.id}`;

    // —— 负腿 1：明细含非本订单的行（order_item_id 归属门，convert_service）
    const foreignBody: Row = {
      contract_name: `507非本单行_${genCode('C507F')}`,
      items: [{ order_item_id: IMPOSSIBLE_ID, quantity: '1.00', unit_price: '1.00' }],
    };
    const foreign = await apiCallExpectFail(page, 'POST', contractEp, foreignBody);
    expect(
      [foreign.status, failureCode(foreign)],
      `[507-02] 非本单行应被拒为 400/VALIDATION_ERROR，实际 ${JSON.stringify(foreign)}`
    ).toEqual([400, APP_ERROR_CODES.VALIDATION_ERROR]);
    expect(
      foreign.message,
      '[507-02] 覆盖门用非 Displayable 的 AppError::validation，出参须为脱敏常量'
    ).toBe('请求参数验证失败');
    console.log(`[507-02] 非本单行拒绝：status=${foreign.status} code=${foreign.code}`);

    // —— 负腿 2：只送其中一行（整单转换要求全量一一对应，convert_service）
    const partialLineId = order.items[0].id;
    const partial = await apiCallExpectFail(
      page,
      'POST',
      contractEp,
      convertBodyPartial(order, [partialLineId])
    );
    expect(
      [partial.status, failureCode(partial)],
      `[507-02] 缺行应被拒为 400/VALIDATION_ERROR，实际 ${JSON.stringify(partial)}`
    ).toEqual([400, APP_ERROR_CODES.VALIDATION_ERROR]);

    // 两条负腿之后仍不得有合同落库（事务回滚自证）
    const previewBefore = await apiCallRaw<PreviewRead>(
      page,
      'GET',
      `/sales/sales-contracts/preview-from-order/${order.id}`
    );
    expect(
      previewBefore.existing_contract,
      '[507-02] 被拒转换应零副作用（明细校验在取号建头之前，事务内不落行）'
    ).toBeNull();

    // —— 正腿：全量行转草稿合同
    const body = convertBody(order);
    const created = await apiCall<ContractRead>(page, 'POST', contractEp, body);
    expect(created.code, `[507-02] 成功信封 code=200，实际 ${JSON.stringify(created)}`).toBe(200);
    expect(
      created.message,
      '[507-02] 成功文案取 handler:519 的固定提示（写面回执是契约的一部分）'
    ).toBe('已按销售订单生成销售合同草稿，请审阅后再提交审批');
    const contract = created.data;
    expect(
      Number.isInteger(contract.id),
      `正腿应回合同主键，实际 ${JSON.stringify(contract)}`
    ).toBe(true);
    expect(
      contract.status,
      `[507-02] 转换产出必须是 draft（词表 models/status/bpm_crm_contract.rs:37），实际 ${contract.status}`
    ).toBe('draft');
    expect(contract.source_order_id, '[507-02] 溯源列 source_order_id 必须落来源订单 ID').toBe(
      order.id
    );
    expect(
      contract.customer_id,
      '[507-02] 合同客户必须与来源订单一致（客户不可改派，convert_service:395）'
    ).toBe(order.customer_id);
    console.log(
      `[507-02] 转单成功 contract_id=${contract.id} contract_no=${contract.contract_no} status=${contract.status}`
    );

    // 表头回读：详情端点序列化 Model，逐列对请求体与来源订单
    const read = await apiCallRaw<ContractRead>(
      page,
      'GET',
      `/sales/sales-contracts/${contract.id}`
    );
    expect(read.contract_no, '回读合同号非空（系统取号产物）').toBeTruthy();
    expect(read.contract_name, '回读合同名=提交值').toBe(String(body.contract_name));
    expect(read.status, '回读状态仍为 draft').toBe('draft');
    expect(read.source_order_id, '回读溯源列落库').toBe(order.id);
    expect(
      dec(read.total_amount, 'contract.total_amount'),
      `[507-02] 表头合计必须服务端重算 120*8.50 + 30*9.25 = 1297.50，实际 ${JSON.stringify(
        read.total_amount
      )}`
    ).toBeCloseTo(1297.5, 2);

    // 明细回读：两行、溯源列逐行对齐、数量单价逐字、sort_order 与请求行序同源
    const items = await apiCallRaw<ContractItemRead[]>(
      page,
      'GET',
      `/sales/sales-contracts/${contract.id}/items`
    );
    expect(Array.isArray(items), `明细端点出参应为裸数组，实际 ${JSON.stringify(items)}`).toBe(
      true
    );
    expect(items.length, '整单转换应落 2 行明细').toBe(2);
    const wantQty = [
      dec(order.items[0].quantity, 'order.items[0].quantity'),
      dec(order.items[1].quantity, 'order.items[1].quantity'),
    ];
    const wantPrice = [
      dec(order.items[0].unit_price, 'order.items[0].unit_price'),
      dec(order.items[1].unit_price, 'order.items[1].unit_price'),
    ];
    for (const it of items) {
      expect(it.contract_id, `明细行 ${it.id} 必须挂到本合同`).toBe(contract.id);
      expect(
        it.source_order_item_id,
        `[507-02] 明细行 ${it.id} 的溯源列必须指向来源订单行，实际 ${JSON.stringify(
          it.source_order_item_id
        )}`
      ).not.toBeNull();
      const idx = order.items.findIndex(i => i.id === it.source_order_item_id);
      expect(idx, `溯源列 ${it.source_order_item_id} 必须是本订单的行`).toBeGreaterThanOrEqual(0);
      expect(dec(it.quantity, `item[${idx}].quantity`), '行数量逐字落库').toBe(wantQty[idx]);
      expect(dec(it.unit_price, `item[${idx}].unit_price`), '行单价逐字落库').toBe(wantPrice[idx]);
    }
    expect(
      items.map(i => i.sort_order).sort((a, b) => a - b),
      'sort_order 与请求行序 0..n 同源'
    ).toEqual([0, 1]);

    // —— 负腿 3：同一订单二次转换被幂等门拒，出参逐字点名既有合同号（business_displayable）
    const dup = await apiCallExpectFail(page, 'POST', contractEp, convertBody(order));
    expect(
      [dup.status, failureCode(dup)],
      `[507-02] 重复转换应被拒为 400/BUSINESS_ERROR，实际 ${JSON.stringify(dup)}`
    ).toEqual([400, APP_ERROR_CODES.BUSINESS_ERROR]);
    expect(dup.message, '[507-02] 重复转换门是 Displayable 变体，文案须逐字回显既有合同号').toBe(
      `该销售订单已存在有效销售合同 ${contract.contract_no}，不能重复转换；请先处理既有合同（编辑或作废）或使用该合同`
    );
    console.log(`[507-02] 重复转换拒绝：status=${dup.status} message=${dup.message}`);

    // 清理次序：先合同（连带明细）再订单
    await tryCleanup(page, 'DELETE', `/sales/sales-contracts/${contract.id}`, '[507-02] 销售合同');
    await tryCleanup(page, 'DELETE', `/sales/orders/${order.id}`, '[507-02] 销售订单');
  });

  test('507-03 转合同入参存在性前置：不存在的 order_id 由行级归属门拒为 404 NOT_FOUND（文案脱敏），不落任何合同', async ({
    page,
  }) => {
    const fail = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-contracts/from-order/${IMPOSSIBLE_ID}`,
      {
        contract_name: `507不存在源单_${genCode('C507X')}`,
        items: [{ order_item_id: 1, quantity: '1.00', unit_price: '1.00' }],
      }
    );
    expect(
      fail.status,
      `[507-03] 不存在订单必须落 404（so/order_query.rs:441 AppError::not_found），实际 ${JSON.stringify(
        fail
      )}`
    ).toBe(404);
    expect(failureCode(fail), '[507-03] 机器码须 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      fail.message,
      '[507-03] not_found 非 Displayable，出参须为脱敏常量「资源未找到」（记录 ID 不外泄）'
    ).toBe('资源未找到');
    expect(
      String(fail.message).includes(String(IMPOSSIBLE_ID)),
      '[507-03] 出参文案不得回显记录 ID'
    ).toBe(false);
    console.log(
      `[507-03] 404 形态：status=${fail.status} code=${fail.code} message=${fail.message}`
    );
  });

  test('507-04 PUT 客户价格改单：可改列逐字落库回读，可空列 expiry_date 送显式 null 真的清空，未触碰列不被洗掉', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) throw new Error('前置不成立：ctx.productIds[0] 未就绪');
    const created = await apiCallRaw<PriceRead>(page, 'POST', '/sales/sales-prices', {
      product_id: productId,
      price: '7777.100000',
      unit: 'meter',
      price_type: 'STANDARD',
      expiry_date: '2026-12-31',
    });
    expect(
      created.id,
      `[507-04] 价格 seed 应回 id，实际 ${JSON.stringify(created)}`
    ).toBeGreaterThan(0);
    expect(created.status, '新建价格状态词 = 写入方小写 pending').toBe('pending');
    expect(
      created.price_level,
      '创建未带等级 → 落 NULL（NULL 是标准价语义，禁止写空串顶替）'
    ).toBeNull();
    const id = created.id;
    const ep = `/sales/sales-prices/${id}`;

    const updated = await apiCallRaw<PriceRead>(page, 'PUT', ep, {
      price: '9654.321000',
      currency: 'USD',
      min_order_qty: '12.5',
      price_level: '二等品',
      expiry_date: null,
    });
    expect(dec(updated.price, 'update 出参 price'), '改价响应回显新值').toBeCloseTo(9654.321, 3);
    console.log(
      `[507-04] PUT 200：price=${updated.price} currency=${updated.currency} level=${updated.price_level}`
    );

    const read = await apiCallRaw<PriceRead>(page, 'GET', ep);
    expect(dec(read.price, 'price'), '回读单价逐字为新值').toBeCloseTo(9654.321, 3);
    expect(read.currency, '回读币种逐字为 USD').toBe('USD');
    expect(dec(read.min_order_qty, 'min_order_qty'), '回读最小订购量逐字为 12.5').toBeCloseTo(
      12.5,
      3
    );
    expect(
      read.price_level,
      `[507-04] 回读等级必须是词表原值「二等品」，实际 ${JSON.stringify(read.price_level)}`
    ).toBe('二等品');
    expect(
      read.expiry_date,
      `[507-04] 可空列显式 null 必须真清成 NULL（仍为 2026-12-31 即 service 把 null 塌成"保持原值"），实际 ${JSON.stringify(
        read.expiry_date
      )}`
    ).toBeNull();
    expect(read.effective_date, '未触碰的 NOT NULL 生效日期列保持建单值，不被整行更新洗掉').toBe(
      created.effective_date
    );
    expect(read.product_id, '未触碰的 product_id 保持原值').toBe(productId);
    expect(read.status, '改单不得动审批状态列（pending 保持）').toBe('pending');

    await tryCleanup(page, 'DELETE', ep, '[507-04] 销售价格');
  });

  test('507-05 PUT 客户价格的四条拒绝腿：清空必填生效日期 400 BUSINESS、越界等级/非法日期/坏产品引用 400 VALIDATION、不存在行 404，且被拒更新零副作用', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) throw new Error('前置不成立：ctx.productIds[0] 未就绪');
    const seeded = await apiCallRaw<PriceRead>(page, 'POST', '/sales/sales-prices', {
      product_id: productId,
      price: '5555.050000',
      unit: 'meter',
      price_type: 'STANDARD',
      currency: 'CNY',
    });
    const ep = `/sales/sales-prices/${seeded.id}`;
    const untouched = await apiCallRaw<PriceRead>(page, 'GET', ep);

    // 腿 1：effective_date 是 NOT NULL 列，三态里的「显式 null」必须 fail-visible 拒绝
    const clearRequired = await apiCallExpectFail(page, 'PUT', ep, { effective_date: null });
    expect(
      [clearRequired.status, failureCode(clearRequired)],
      `[507-05] 清空必填生效日期应 400/BUSINESS_ERROR，实际 ${JSON.stringify(clearRequired)}`
    ).toEqual([400, APP_ERROR_CODES.BUSINESS_ERROR]);
    expect(
      clearRequired.message,
      '[507-05] business_displayable 出参逐字取 service:530-532 源码文案'
    ).toBe('生效日期不能清空：该字段为必填项');

    // 腿 2：等级越界（等外品在库存等级词表里存在，但未开放手工定价入口）
    const badLevel = await apiCallExpectFail(page, 'PUT', ep, { price_level: '等外品' });
    expect(
      [badLevel.status, failureCode(badLevel)],
      `[507-05] 越界价格等级应 400/VALIDATION_ERROR，实际 ${JSON.stringify(badLevel)}`
    ).toEqual([400, APP_ERROR_CODES.VALIDATION_ERROR]);
    expect(badLevel.message, '[507-05] 越界等级文案逐字回显允许值集合（一等品/二等品）').toBe(
      '价格等级 等外品 不是合法取值，允许值：一等品/二等品'
    );

    // 腿 3：非法日期串严格解析失败，不静默吞成 NULL
    const badDate = await apiCallExpectFail(page, 'PUT', ep, { effective_date: '2026-13-45' });
    expect(
      [badDate.status, failureCode(badDate)],
      `[507-05] 非法生效日期应 400/VALIDATION_ERROR，实际 ${JSON.stringify(badDate)}`
    ).toEqual([400, APP_ERROR_CODES.VALIDATION_ERROR]);
    expect(
      String(badDate.message).startsWith('日期格式错误：'),
      `[507-05] 日期失败文案前缀逐字取源码（后缀是 chrono 原文，只钉前缀），实际 ${JSON.stringify(
        badDate.message
      )}`
    ).toBe(true);

    // 腿 4：坏产品引用走应用层预检，不落 23503/500
    const badProduct = await apiCallExpectFail(page, 'PUT', ep, { product_id: IMPOSSIBLE_ID });
    expect(
      [badProduct.status, failureCode(badProduct)],
      `[507-05] 坏产品引用应被预检拦为 400/VALIDATION_ERROR（不得裸 500），实际 ${JSON.stringify(
        badProduct
      )}`
    ).toEqual([400, APP_ERROR_CODES.VALIDATION_ERROR]);
    expect(badProduct.message, '[507-05] 预检文案只给资源名与指引，不回显记录 ID').toBe(
      '所选产品不存在，请重新选择'
    );

    // 腿 5：行不存在 → 404（not_found 非 Displayable）
    const missing = await apiCallExpectFail(page, 'PUT', `/sales/sales-prices/${IMPOSSIBLE_ID}`, {
      price: '1.000000',
    });
    expect(missing.status, `[507-05] 不存在的价格行应 404，实际 ${JSON.stringify(missing)}`).toBe(
      404
    );
    expect(failureCode(missing), '[507-05] 机器码须 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(missing.message, '[507-05] 出参文案脱敏为常量，不回显记录 ID').toBe('资源未找到');

    // 零副作用自证：五条腿逐列不得改动原行
    const after = await apiCallRaw<PriceRead>(page, 'GET', ep);
    for (const key of [
      'price',
      'currency',
      'price_level',
      'effective_date',
      'product_id',
    ] as const) {
      expect(
        JSON.stringify(after[key]),
        `[507-05] 被拒更新后列 ${key} 必须纹丝不动，实际由 ${JSON.stringify(
          untouched[key]
        )} 变成 ${JSON.stringify(after[key])}`
      ).toBe(JSON.stringify(untouched[key]));
    }
    console.log(`[507-05] 四条拒绝腿 + 404 全数命中，原行 ${seeded.id} 逐列未变`);

    await tryCleanup(page, 'DELETE', ep, '[507-05] 销售价格');
  });
});
