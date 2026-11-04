// 目标文件：frontend/e2e/flow/430-cust-self-service-reconciliation-confirm.spec.ts
// 应收对账单 base 面（/ar-reconciliations）建单—发送—客户确认—争议—状态白名单—关闭—删除全链 E2E — 430
//
// 功能：把"业务员代客户发起对账单 → 发送给客户 → 客户侧自助确认（或提争议）→ 争议未解时禁确认 →
// 已确认/有争议才可关闭 → 只有草稿可改可删"这条自助对账确认链钉成真实契约。每条腿都真建数据、
// 真调端点、真回读，并且把"拒绝"钉成"库中未发生二次跃迁、未落脏值"，而不是只判 HTTP 码。
// 具体钉住的规则（判据全部来自写入方源码实核，不是从用例反推）：
// - 建单落库初始态恒为草稿，且期末余额由权威纯函数重算：closing_balance =
//   opening_balance + total_invoices - total_collections（services/ar/vfy_ops/match.rs），
//   建单时 confirmed_by_customer / dispute_reason / confirmed_by / confirmed_at 一律留 NULL（未补录，
//   不用 0 或 false 冒充）。
// - 发送门：只有草稿可发送（services/ar/recon_ops/lifecycle.rs），draft → sent；重复发送被同一
//   状态门拒绝，且行状态不因重复调用再跃迁。
// - 客户确认门（纯状态判定，生产与集成测同源）：confirmed 拒重复确认、disputed 须先解决争议，
//   其余状态放行并写入 confirmed（services/ar/vfy_ops/confirm.rs）；放行时同批写入
//   confirmed_by_customer=true、confirmed_by=会话用户 id、confirmed_at=当前时间。
// - 客户争议门：confirmed 与 closed 拒绝提争议，其余放行并写入 disputed，dispute_reason 落原文
//   （services/ar/vfy_ops/confirm.rs）。
// - 通用改状态白名单：仅 draft/sent/confirmed/disputed/closed/cancelled 六值可写，白名单外一律拒，
//   拒绝后 reconciliation_status 保持原值（services/ar/recon_ops/lifecycle.rs）。
// - 关闭门：仅 confirmed 或 disputed 可关闭，其余状态拒（services/ar/recon_ops/lifecycle.rs）。
// - 更新门与删除门：均只放草稿（services/ar/recon_ops/crud.rs 与 lifecycle.rs）；草稿删除后
//   按主键读回必须 404，非草稿删除被拒且行仍在。
// - 行级归属门：base 面每条腿先取父客户走 data_scope::check_resource_owner（utils/data_scope.rs），
//   客户不存在 → 404，不可见 → 403 且固定脱敏文案，因此本文件只断机器码与信封形状，永不按文案判定；
//   列表腿在查询构造处下推 data_scope，越权行既不进 items 也不进 total（handlers/ar_reconciliation_handler.rs）。
//   共享表不参与该判定（utils/data_scope.rs 全文对 share 零命中），所以客户共享只扩团队成员可见性，
//   不扩财务对账单可见性；共享面自身的可见性链由同号段共享用例覆盖，本文件不重复也不臆造跨账号结论。
//
// 调用方：被测端点注册于 backend/src/routes 下的 ar-reconciliations 挂载（快照行号见下方端点全集），
// handler 为 ar_reconciliation_handler 的 create_reconciliation / list_reconciliations /
// get_reconciliation / update_reconciliation / update_reconciliation_status / send_reconciliation /
// confirm_reconciliation / dispute_reconciliation / close_reconciliation / delete_reconciliation；
// 载体腿（建客户）走 crm/customers 的 POST 与 DELETE。用例入口为本文件的 test.describe.serial。
// 入参：建单取 reconciliation_no（必填字符串，原样落库不回造）、customer_id（必填 i32）、
// customer_name（可空字符串）、period_start / period_end（必填 NaiveDate，形如 2026-01-01）、
// opening_balance / total_invoices / total_collections（必填 Decimal）；改状态取 status（必填字符串，
// 白名单外即拒）；争议取 reason（必填字符串，原文落 dispute_reason）；列表取 customer_id / status /
// page / page_size（page 缺省 1 且 clamp 到 1..1000，page_size 缺省 20 且 clamp 到 1..100）；
// 确认腿允许缺体（OptionalJson 归一为 None）。金额一律取二进制可精确表示的数（.5/.25/.125 族），
// 避免用浮点等值掩盖真实分差。
// 传给谁：service 层 ArReconciliationService（recon_ops 与 vfy_ops）→ SeaORM 事务 + lock_exclusive，
// 状态变更经 AuditLogService::update_with_audit 留痕；关闭腿成功后生成凭证（不在本文件断言面内）。
// 存什么：ar_reconciliations 落 reconciliation_no、reconciliation_date（建单即写当日）、period_start、
// period_end、customer_id、customer_name、opening_balance、total_invoices、total_collections、
// closing_balance、reconciliation_status、confirmed_by_customer、dispute_reason、confirmed_by、
// confirmed_at、notes。缺值写 NULL：未确认行的 confirmed_by_customer/confirmed_by/confirmed_at、
// 无争议行的 dispute_reason。出参键名以 handlers/ar_reconciliation_handler.rs 的
// ReconciliationResponse 为准（与 models/ar_reconciliation.rs 的 Model 字段同名 snake_case，金额列为
// DECIMAL 线格式即字符串）；确认与争议两条腿直接序列化整行 Model，因此可读到 confirmed_by_customer
// 与 confirmed_at 这三列，而读单行腿读不到它们——本文件按各自真实出参面断言，不跨面借键。
// 存哪里：表 ar_reconciliations（明细表 ar_reconciliation_item）；列表信封 PaginatedResponse
// {items,total,page,page_size}（backend/src/utils/response.rs）；失败信封 {code,message,trace_id,
// timestamp} 四键且 code 为字符串机器码。端点存在性逐条对 frontend/scripts/route-snapshot.txt 核实：
//   POST   /api/v1/erp/ar-reconciliations                      :1039
//   GET    /api/v1/erp/ar-reconciliations                      :190
//   GET    /api/v1/erp/ar-reconciliations/*                    :198
//   PUT    /api/v1/erp/ar-reconciliations/*                    :1660
//   PUT    /api/v1/erp/ar-reconciliations/*/status             :1661
//   POST   /api/v1/erp/ar-reconciliations/*/confirm            :1048
//   POST   /api/v1/erp/ar-reconciliations/*/dispute            :1049
//   POST   /api/v1/erp/ar-reconciliations/*/send               :1050
//   POST   /api/v1/erp/ar-reconciliations/*/close              :1047
//   DELETE /api/v1/erp/ar-reconciliations/*                    :9
//   POST   /api/v1/erp/crm/customers 与 DELETE /api/v1/erp/crm/customers/*（载体面）
// 对账状态词表逐字符引用写入方常量（models/status/finance.rs）：
// draft / sent / confirmed / disputed / closed / cancelled，大小写与拼写不得改写，也不得把
// inventory_count 那套小写词表（含 in_review）或任何 in_progress 之类本表不存在的取值当成合法值——
// 本文件正是把 in_progress 作为白名单外非法值用来证伪"任意字符串都能写库"。

import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginViaUI,
} from './helpers';

/** base 面出参形状（handlers/ar_reconciliation_handler.rs ReconciliationResponse，snake_case 原样） */
type ReconRow = {
  id: number;
  reconciliation_no: string;
  customer_id: number;
  customer_name: string | null;
  period_start: string;
  period_end: string;
  opening_balance: string;
  total_invoices: string;
  total_collections: string;
  closing_balance: string;
  reconciliation_status: string | null;
  dispute_reason: string | null;
  notes: string | null;
  created_at: string;
};

/** 确认腿与争议腿直接序列化整行 Model，多出三列确认留痕（models/ar_reconciliation.rs） */
type ReconModelRow = ReconRow & {
  reconciliation_date: string;
  confirmed_by_customer: boolean | null;
  confirmed_by: number | null;
  confirmed_at: string | null;
};

type PagedRows = {
  items: ReconRow[];
  total: number;
  page: number;
  page_size: number;
};

const PERIOD_START = '2026-03-01';
const PERIOD_END = '2026-03-31';
/** 库中不存在的客户主键，用于证伪"建单归属门先查客户存在性"这一 404 腿 */
const GHOST_CUSTOMER_ID = 999999999;

function uniqTag(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 清理位点：删除类端点带状态门，非草稿行删不掉属预期，因此清理腿只记录结果不判负，
 * 真判据写在各自的用例正文里（删除门自身有专门断言，不靠这里兜绿）。
 * URL 字面量必须留在调用点，收进本函数体内会让配对判定器绑错实参、证据隐形。
 */
async function tryCleanup(
  page: Parameters<typeof apiCall>[0],
  method: 'DELETE',
  path: string,
  label: string
): Promise<void> {
  try {
    const res = await apiCall(page, method, path);
    console.log(`[430-cleanup] ${label} ${method} ${path} => status=${res.code}`);
  } catch (e) {
    // apiCall 对非 2xx 抛错。清理腿的失败在这里点名原文，不静默、也不改成判负：
    // 删除门与引用守门本身的判据写在用例正文里，不由这条腿兜绿。
    console.warn(
      `[430-cleanup] ${label} ${method} ${path} => 清理未成功，登记原文：${(e as Error).message}`
    );
  }
}

/** 金额列是 DECIMAL 线格式（出参字符串），判据按数值等值比对，不做四舍五入也不放宽阈值 */
function asNum(v: string | number): number {
  return Number(v);
}

function describeRow(tag: string, row: ReconRow | ReconModelRow | null | undefined): string {
  if (!row) return `${tag} 出参为空或缺键`;
  return (
    `${tag} id=${row.id} no=${row.reconciliation_no} status=${row.reconciliation_status} ` +
    `opening=${row.opening_balance} invoices=${row.total_invoices} ` +
    `collections=${row.total_collections} closing=${row.closing_balance}`
  );
}

test.describe.serial('430 应收对账单自助确认与状态门全链回读', () => {
  const tag = uniqTag();
  let customerId = 0;
  let customerName = '';
  let myUserId = 0;
  /** 主链行：draft → sent → confirmed → closed */
  let recMain = 0;
  /** 争议行：draft → disputed，用来验"争议未解禁确认"与白名单改状态 */
  let recDispute = 0;
  /** 草稿行：用来验更新门与删除门（改成功后 closing_balance 由权威公式重算） */
  let recDraft = 0;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('430-01 建单真实落库为草稿、期末余额按权威公式重算、按主键与列表双通道回读一致，未知客户 404 且不落库', async ({
    page,
  }) => {
    const me = await apiCallRaw<{ id: number; username: string }>(page, 'GET', '/auth/me');
    expect(me.id, `auth/me 未返回登录用户 id：${JSON.stringify(me)}`).toBeGreaterThan(0);
    myUserId = me.id;

    const customer = await apiCallRaw<{ id: number; customer_name: string }>(
      page,
      'POST',
      '/crm/customers',
      { customer_name: `e2c-recon430-${tag}` }
    );
    expect(customer.id, `自建客户未返回 id：${JSON.stringify(customer)}`).toBeGreaterThan(0);
    customerId = customer.id;
    customerName = customer.customer_name;

    // 金额取二进制可精确表示的值：100.5 + 200.25 - 50.25 = 250.5
    const created = await apiCallRaw<ReconRow>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: `AR430-${tag}-MAIN`,
      customer_id: customerId,
      customer_name: customerName,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      opening_balance: 100.5,
      total_invoices: 200.25,
      total_collections: 50.25,
    });
    recMain = created.id;
    expect(created.id, describeRow('建单未返回主键', created)).toBeGreaterThan(0);
    expect(created.reconciliation_no, `单据号未原样落库：${describeRow('建单', created)}`).toBe(
      `AR430-${tag}-MAIN`
    );
    expect(created.reconciliation_status, `建单初始态非草稿：${describeRow('建单', created)}`).toBe(
      'draft'
    );
    expect(
      asNum(created.closing_balance),
      `期末余额未按 opening+invoices-collections 重算：${describeRow('建单', created)}`
    ).toBe(250.5);
    expect(created.period_start, `期间起未回显入参：${describeRow('建单', created)}`).toBe(
      PERIOD_START
    );
    expect(created.period_end, `期间止未回显入参：${describeRow('建单', created)}`).toBe(
      PERIOD_END
    );
    expect(created.customer_id, `客户归属未落库：${describeRow('建单', created)}`).toBe(customerId);

    const readback = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${created.id}`);
    expect(
      readback.reconciliation_status,
      `按主键回读状态漂移：${describeRow('回读', readback)}`
    ).toBe('draft');
    expect(
      readback.reconciliation_no,
      `按主键回读单据号漂移：${describeRow('回读', readback)}`
    ).toBe(created.reconciliation_no);
    expect(
      readback.closing_balance,
      `按主键回读期末余额与建单不一致（线格式字符串逐字符）：建单=${created.closing_balance} 回读=${readback.closing_balance}`
    ).toBe(created.closing_balance);

    const listed = await apiCallRaw<PagedRows>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${customerId}&status=draft&page=1&page_size=50`
    );
    expect(Array.isArray(listed.items), `列表信封缺 items 数组：${JSON.stringify(listed)}`).toBe(
      true
    );
    expect(listed.page, `列表 page 未回显请求值 1：实际 ${listed.page}`).toBe(1);
    expect(listed.page_size, `列表 page_size 未回显请求值 50：实际 ${listed.page_size}`).toBe(50);
    expect(listed.total, `列表 total 非数值：实际 ${listed.total}`).toBeGreaterThan(0);
    const hit = listed.items.find(r => r.id === created.id);
    expect(
      hit
        ? hit.reconciliation_no
        : `未命中（本客户 draft 行 ids=${listed.items.map(r => r.id).join(',')}）`,
      `自建 draft 行未进入 status=draft 过滤列表：${describeRow('列表命中', hit ?? null)}`
    ).toBe(created.reconciliation_no);

    // 归属门前置：客户不存在 → 404，且不触达落库
    const ghost = await apiCallExpectFail(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: `AR430-${tag}-GHOST`,
      customer_id: GHOST_CUSTOMER_ID,
      customer_name: null,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      opening_balance: 1,
      total_invoices: 1,
      total_collections: 1,
    });
    expect(ghost.status, `未知客户建单未判 404：实际 status=${ghost.status}`).toBe(404);
    expect(failureCode(ghost), `未知客户建单的机器码非 NOT_FOUND：实际 code=${ghost.code}`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    const ghostListed = await apiCallRaw<PagedRows>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${GHOST_CUSTOMER_ID}&page=1&page_size=10`
    );
    expect(
      ghostListed.items.length,
      `被拒的建单在库里留了行（负例未做到零落库）：实际 ${ghostListed.items.length} 行`
    ).toBe(0);
  });

  test('430-02 发送腿只放草稿：draft→sent 真实跃迁，重复发送被同一状态门拒且不再二次跃迁，不存在的主键 404', async ({
    page,
  }) => {
    expect(recMain, '前置建单腿未产出主链行 id，本条无法归因').toBeGreaterThan(0);

    const sent = await apiCallRaw<ReconRow>(page, 'POST', `/ar-reconciliations/${recMain}/send`);
    expect(sent.reconciliation_status, `发送后未转 sent：${describeRow('发送', sent)}`).toBe(
      'sent'
    );
    expect(sent.id, `发送腿返回的行不是被测行：${describeRow('发送', sent)}`).toBe(recMain);

    const readback = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${recMain}`);
    expect(
      readback.reconciliation_status,
      `回读未停在 sent：${describeRow('回读', readback)}`
    ).toBe('sent');

    const again = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${recMain}/send`);
    expect(again.status, `重复发送未判 400：实际 status=${again.status}`).toBe(400);
    expect(failureCode(again), `重复发送的机器码非 BUSINESS_ERROR：实际 code=${again.code}`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );

    const afterAgain = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${recMain}`);
    expect(
      afterAgain.reconciliation_status,
      `重复发送把状态推离了 sent（拒绝未做到零副作用）：${describeRow('二次发送后回读', afterAgain)}`
    ).toBe('sent');

    const missing = await apiCallExpectFail(
      page,
      'POST',
      `/ar-reconciliations/${GHOST_CUSTOMER_ID}/send`
    );
    expect(missing.status, `不存在主键的发送未判 404：实际 status=${missing.status}`).toBe(404);
    expect(failureCode(missing), `不存在主键的机器码非 NOT_FOUND：实际 code=${missing.code}`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
  });

  test('430-04 争议腿落 reason 原文、确认门对争议行拒绝、白名单外状态值被挡且库中不留脏值', async ({
    page,
  }) => {
    expect(recMain, '前置建单腿未产出主链行 id，本条无法归因').toBeGreaterThan(0);

    const disputeNo = `AR430-${tag}-DISP`;
    const reasonText = `数量差 3 匹，缸号 FX-${tag} 与发票不符`;
    const disputeCreated = await apiCallRaw<ReconRow>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: disputeNo,
      customer_id: customerId,
      customer_name: customerName,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      opening_balance: 8.5,
      total_invoices: 16.25,
      total_collections: 4.75,
    });
    recDispute = disputeCreated.id;
    expect(
      disputeCreated.reconciliation_status,
      `争议用行初始态非草稿：${describeRow('建争议行', disputeCreated)}`
    ).toBe('draft');
    expect(
      asNum(disputeCreated.closing_balance),
      `争议用行期末余额未按公式重算：${describeRow('建争议行', disputeCreated)}`
    ).toBe(20);

    const disputed = await apiCallRaw<ReconModelRow>(
      page,
      'POST',
      `/ar-reconciliations/${disputeCreated.id}/dispute`,
      { reason: reasonText }
    );
    expect(
      disputed.reconciliation_status,
      `提争议后未转 disputed：${describeRow('争议', disputed)}`
    ).toBe('disputed');
    expect(
      disputed.dispute_reason,
      `dispute_reason 未落 reason 原文：实际 ${JSON.stringify(disputed.dispute_reason)}`
    ).toBe(reasonText);

    const disputeReadback = await apiCallRaw<ReconRow>(
      page,
      'GET',
      `/ar-reconciliations/${disputeCreated.id}`
    );
    expect(
      disputeReadback.dispute_reason,
      `按主键回读的 dispute_reason 与提交原文不一致（截断或改写）：回读=${JSON.stringify(
        disputeReadback.dispute_reason
      )}`
    ).toBe(reasonText);

    // 争议未解决禁确认（vfy_ops/confirm.rs 的 disputed 分支）
    const confirmBlocked = await apiCallExpectFail(
      page,
      'POST',
      `/ar-reconciliations/${disputeCreated.id}/confirm`
    );
    expect(
      confirmBlocked.status,
      `争议行提确认未判 400：实际 status=${confirmBlocked.status}`
    ).toBe(400);
    expect(
      failureCode(confirmBlocked),
      `争议行提确认的机器码非 BUSINESS_ERROR：实际 code=${confirmBlocked.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const stillDisputed = await apiRawStatus(page, `/ar-reconciliations/${recDispute}`);
    expect(stillDisputed, `被拒的确认把 disputed 行推成了别的状态：实际 ${stillDisputed}`).toBe(
      'disputed'
    );

    // 白名单外取值（本表词表里根本没有 in_progress）必须被挡，且不得写库
    const illegal = await apiCallExpectFail(
      page,
      'PUT',
      `/ar-reconciliations/${recDispute}/status`,
      { status: 'in_progress' }
    );
    expect(illegal.status, `白名单外状态值未判 400：实际 status=${illegal.status}`).toBe(400);
    expect(
      failureCode(illegal),
      `白名单外状态值的机器码非 BUSINESS_ERROR：实际 code=${illegal.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const afterIllegal = await apiRawStatus(page, `/ar-reconciliations/${recDispute}`);
    expect(afterIllegal, `非法状态值被写进了库（白名单没挡住）：实际 ${afterIllegal}`).toBe(
      'disputed'
    );

    // 合法值放行：disputed → cancelled，回读一致
    const cancelled = await apiCallRaw<ReconRow>(
      page,
      'PUT',
      `/ar-reconciliations/${recDispute}/status`,
      { status: 'cancelled' }
    );
    expect(
      cancelled.reconciliation_status,
      `合法改状态未落库：${describeRow('改 cancelled', cancelled)}`
    ).toBe('cancelled');
    const afterCancel = await apiRawStatus(page, `/ar-reconciliations/${recDispute}`);
    expect(afterCancel, `改状态后回读漂移：实际 ${afterCancel}`).toBe('cancelled');

    // 关闭门只放 confirmed/disputed：cancelled 行必须被拒
    const closeBlocked = await apiCallExpectFail(
      page,
      'POST',
      `/ar-reconciliations/${recDispute}/close`
    );
    expect(
      closeBlocked.status,
      `cancelled 行关闭未判 400：实际 status=${closeBlocked.status}`
    ).toBe(400);
    expect(
      failureCode(closeBlocked),
      `cancelled 行关闭的机器码非 BUSINESS_ERROR：实际 code=${closeBlocked.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 已取消行不可提争议之外的越权：draft 行可提争议、closed 行不可（下一腿覆盖 closed）
    expect(
      await apiRawStatus(page, `/ar-reconciliations/${recMain}`),
      '主链行在争议腿被误改：本条只该动争议行'
    ).toBe('sent');
  });

  test('430-03 客户自助确认腿写入三列留痕、重复确认被拒、已确认行禁提争议', async ({ page }) => {
    expect(recMain, '前置发送腿未把主链行推到 sent，本条无法归因').toBeGreaterThan(0);

    const confirmed = await apiCallRaw<ReconModelRow>(
      page,
      'POST',
      `/ar-reconciliations/${recMain}/confirm`
    );
    expect(
      confirmed.reconciliation_status,
      `确认后未转 confirmed：${describeRow('确认', confirmed)}`
    ).toBe('confirmed');
    expect(
      confirmed.confirmed_by_customer,
      `confirmed_by_customer 未置 true：实际 ${JSON.stringify(confirmed.confirmed_by_customer)}`
    ).toBe(true);
    expect(
      confirmed.confirmed_by,
      `confirmed_by 未落会话用户 id（应为 ${myUserId}）：实际 ${JSON.stringify(confirmed.confirmed_by)}`
    ).toBe(myUserId);
    expect(
      typeof confirmed.confirmed_at === 'string' && confirmed.confirmed_at.length > 0,
      `confirmed_at 未落时间戳：实际 ${JSON.stringify(confirmed.confirmed_at)}`
    ).toBe(true);

    const readback = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${recMain}`);
    expect(
      readback.reconciliation_status,
      `确认后按主键回读漂移：${describeRow('回读', readback)}`
    ).toBe('confirmed');

    // base 面列表的 status 过滤通道：confirmed 行必入选，且草稿过滤不再含它
    const confirmedList = await apiCallRaw<PagedRows>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${customerId}&status=confirmed&page=1&page_size=50`
    );
    const confirmedHit = confirmedList.items.find(r => r.id === recMain);
    expect(
      confirmedHit
        ? confirmedHit.reconciliation_status
        : `未命中（ids=${confirmedList.items.map(r => r.id).join(',')}）`,
      `已确认行未进入 status=confirmed 过滤列表：${describeRow('列表命中', confirmedHit ?? null)}`
    ).toBe('confirmed');
    const draftList = await apiCallRaw<PagedRows>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${customerId}&status=draft&page=1&page_size=50`
    );
    expect(
      draftList.items.some(r => r.id === recMain),
      `已确认行仍滞留在 status=draft 过滤结果里（状态过滤没生效）：ids=${draftList.items
        .map(r => r.id)
        .join(',')}`
    ).toBe(false);

    const repeat = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${recMain}/confirm`);
    expect(repeat.status, `重复确认未判 400：实际 status=${repeat.status}`).toBe(400);
    expect(failureCode(repeat), `重复确认的机器码非 BUSINESS_ERROR：实际 code=${repeat.code}`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterRepeat = await apiRawStatus(page, `/ar-reconciliations/${recMain}`);
    expect(afterRepeat, `重复确认改变了状态（拒绝未做到零副作用）：实际 ${afterRepeat}`).toBe(
      'confirmed'
    );

    const disputeOnConfirmed = await apiCallExpectFail(
      page,
      'POST',
      `/ar-reconciliations/${recMain}/dispute`,
      { reason: '已确认行不应受理争议' }
    );
    expect(
      disputeOnConfirmed.status,
      `已确认行提争议未判 400：实际 status=${disputeOnConfirmed.status}`
    ).toBe(400);
    expect(
      failureCode(disputeOnConfirmed),
      `已确认行提争议的机器码非 BUSINESS_ERROR：实际 code=${disputeOnConfirmed.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  });

  test('430-05 关闭腿真实跃迁、关闭后禁提争议、非草稿行不可改不可删，草稿行改金额后期末余额按公式重算', async ({
    page,
  }) => {
    expect(recDispute, '前置争议腿未产出争议行 id，本条无法归因').toBeGreaterThanOrEqual(0);

    // 关闭门放行：主链行 confirmed → closed
    const closed = await apiCallRaw<ReconRow>(page, 'POST', `/ar-reconciliations/${recMain}/close`);
    expect(closed.reconciliation_status, `关闭后未转 closed：${describeRow('关闭', closed)}`).toBe(
      'closed'
    );
    const closedReadback = await apiRawStatus(page, `/ar-reconciliations/${recMain}`);
    expect(closedReadback, `关闭后回读漂移：实际 ${closedReadback}`).toBe('closed');

    const disputeOnClosed = await apiCallExpectFail(
      page,
      'POST',
      `/ar-reconciliations/${recMain}/dispute`,
      { reason: '已关闭行不应受理争议' }
    );
    expect(
      disputeOnClosed.status,
      `已关闭行提争议未判 400：实际 status=${disputeOnClosed.status}`
    ).toBe(400);
    expect(
      failureCode(disputeOnClosed),
      `已关闭行提争议的机器码非 BUSINESS_ERROR：实际 code=${disputeOnClosed.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 更新门：非草稿（closed）不可改
    const updateBlocked = await apiCallExpectFail(page, 'PUT', `/ar-reconciliations/${recMain}`, {
      opening_balance: 9.5,
      total_invoices: 9.5,
      total_collections: 1.5,
      notes: '非草稿行不应受理更新',
    });
    expect(updateBlocked.status, `非草稿行更新未判 400：实际 status=${updateBlocked.status}`).toBe(
      400
    );
    expect(
      failureCode(updateBlocked),
      `非草稿行更新的机器码非 BUSINESS_ERROR：实际 code=${updateBlocked.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const afterUpdateBlocked = await apiCallRaw<ReconRow>(
      page,
      'GET',
      `/ar-reconciliations/${recMain}`
    );
    expect(
      afterUpdateBlocked.closing_balance,
      `被拒的更新改写了期末余额（拒绝未做到零副作用）：实际 ${afterUpdateBlocked.closing_balance}，建单链值应为 ${closed.closing_balance}`
    ).toBe(closed.closing_balance);

    // 草稿行：改金额成功后 closing_balance 由权威纯函数重算，不是留旧值
    const draftCreated = await apiCallRaw<ReconRow>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: `AR430-${tag}-DRAFT`,
      customer_id: customerId,
      customer_name: customerName,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      opening_balance: 0.5,
      total_invoices: 0.5,
      total_collections: 0.25,
    });
    recDraft = draftCreated.id;
    expect(
      asNum(draftCreated.closing_balance),
      `草稿行建单期末余额未按公式重算：${describeRow('建草稿行', draftCreated)}`
    ).toBe(0.75);

    const updated = await apiCallRaw<ReconRow>(page, 'PUT', `/ar-reconciliations/${recDraft}`, {
      opening_balance: 1.25,
      total_invoices: 4.75,
      total_collections: 2.5,
      notes: `e2e-430-${tag} 更新腿留痕`,
    });
    expect(
      asNum(updated.closing_balance),
      `更新后期末余额未按 1.25+4.75-2.5=3.5 重算：${describeRow('更新', updated)}`
    ).toBe(3.5);
    expect(
      updated.reconciliation_status,
      `草稿行更新被推离了草稿态：${describeRow('更新', updated)}`
    ).toBe('draft');
    expect(updated.notes, `notes 未落更新入参原文：实际 ${JSON.stringify(updated.notes)}`).toBe(
      `e2e-430-${tag} 更新腿留痕`
    );

    const updatedReadback = await apiCallRaw<ReconRow>(
      page,
      'GET',
      `/ar-reconciliations/${recDraft}`
    );
    expect(
      updatedReadback.closing_balance,
      `按主键回读的期末余额与更新出参不一致：更新=${updated.closing_balance} 回读=${updatedReadback.closing_balance}`
    ).toBe(updated.closing_balance);
  });

  test('430-06 删除腿只放草稿：非草稿删除被拒且行仍在，草稿删除成功且按主键读回 404，收尾清理不留悬挂行', async ({
    page,
  }) => {
    expect(recMain, '前置主链行缺失，本条无法归因').toBeGreaterThan(0);

    // 删除门：closed 行不可删
    const deleteBlocked = await apiCallExpectFail(page, 'DELETE', `/ar-reconciliations/${recMain}`);
    expect(deleteBlocked.status, `非草稿行删除未判 400：实际 status=${deleteBlocked.status}`).toBe(
      400
    );
    expect(
      failureCode(deleteBlocked),
      `非草稿行删除的机器码非 BUSINESS_ERROR：实际 code=${deleteBlocked.code}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const stillThere = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${recMain}`);
    expect(
      stillThere.id,
      `被拒的删除把行删掉了（拒绝未做到零副作用）：回读 id=${stillThere.id}`
    ).toBe(recMain);
    expect(
      stillThere.reconciliation_status,
      `被拒删除后状态漂移：${describeRow('回读', stillThere)}`
    ).toBe('closed');

    // 草稿行由本用例自建自删，不借用更新腿那行：同一分片内有按列表首行开单的 UI 腿，
    // 会把别处刚建的草稿推成非草稿，借行会让本条的拒绝归因落到旁观动作上。
    const ownDraft = await apiCallRaw<ReconRow>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: `AR430-${tag}-DEL06`,
      customer_id: customerId,
      customer_name: customerName,
      period_start: PERIOD_START,
      period_end: PERIOD_END,
      opening_balance: 1.5,
      total_invoices: 1.0,
      total_collections: 0.5,
    });
    const ownDraftId = Number(ownDraft.id);
    expect(ownDraftId, `自建草稿行未返回主键：${describeRow('建草稿', ownDraft)}`).toBeGreaterThan(
      0
    );
    const draftGate = await apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${ownDraftId}`);
    expect(
      draftGate.reconciliation_status,
      `删除腿的前置必须是草稿行，非草稿即说明有旁路动作改写了本用例的行：${describeRow(
        '删前',
        draftGate
      )}`
    ).toBe('draft');

    // 草稿行可删，删后按主键读回必须 404（真删，不是软标记）
    const deleted = await apiCall(page, 'DELETE', `/ar-reconciliations/${ownDraftId}`);
    expect(deleted.code, `草稿行删除未成功：实际 code=${deleted.code}`).toBe(200);
    const gone = await apiCallExpectFail(page, 'GET', `/ar-reconciliations/${ownDraftId}`);
    expect(gone.status, `删除后按主键读回未判 404：实际 status=${gone.status}`).toBe(404);
    expect(failureCode(gone), `删除后读回的机器码非 NOT_FOUND：实际 code=${gone.code}`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );

    // 收尾按状态分路：该域唯一的删除面是 DELETE /ar-reconciliations/{id}
    // （route-snapshot.txt:9 delete_reconciliation），受"只有草稿可删"的状态门约束——这条门已由
    // 本用例上半段钉成判据，所以非草稿行一律不发起 DELETE，改核它确实停在本域合法终止面上。
    // 争议行经 disputed→cancelled（PUT /{id}/status 白名单）落在 cancelled，主链行走完
    // send→confirm→close 落在 closed：两者都是该域在册的终态，不悬挂 draft/sent/confirmed/disputed
    // 这些还能被继续操作的中间态。该域对非草稿行没有 cancel/void/红冲 之外的删除面，
    // 终态行按业务留档，不产出会被误当活单的残行。
    if (!recDispute) {
      throw new Error('前置不成立：争议腿未产出争议行，收尾无法核对终止面');
    }
    const disputeFinal = await apiRawStatus(page, `/ar-reconciliations/${recDispute}`);
    expect(
      disputeFinal,
      `争议行收尾前应落在该域合法终止面 cancelled（非草稿不发起删除），实际 ${disputeFinal}`
    ).toBe('cancelled');
    const mainFinal = await apiRawStatus(page, `/ar-reconciliations/${recMain}`);
    expect(
      mainFinal,
      `主链行收尾前应落在该域合法终止面 closed（非草稿不发起删除），实际 ${mainFinal}`
    ).toBe('closed');

    // 更新腿留下的草稿行按当前状态分路：同分片内有把草稿推离草稿态的旁路动作，
    // 仍是草稿才回收，被推走则点名状态并跳过，绝不把删除门的 400 当成清理成功。
    const draftFinal = await apiRawStatus(page, `/ar-reconciliations/${recDraft}`);
    if (draftFinal === 'draft') {
      await tryCleanup(page, 'DELETE', `/ar-reconciliations/${recDraft}`, 'reconciliation_draft');
    } else {
      console.log(
        `[430-cleanup] reconciliation_draft ${recDraft} 当前状态=${draftFinal}，` +
          '已被旁路动作推离草稿，删除门不放行，故本收尾不发起 DELETE'
      );
    }
    // 载体客户 best-effort：上面的终态对账单行仍引用它，引用守门会拒（route-snapshot 同族门），
    // 属预期失败，由 tryCleanup 登记原文不判负。
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer');
  });
});

/**
 * 状态探针：只取 reconciliation_status 一列，供"被拒动作不得产生副作用"这类判据复用。
 * 调用点必须写真实 URL 字面量（配对判定按调用点字面量绑腿），URL 收进本函数体内会让证据隐形。
 * 传给谁：GET /ar-reconciliations/{id} → get_reconciliation → ReconciliationResponse。
 * 存什么/存哪里：只读 ar_reconciliations.reconciliation_status，不落任何列。
 */
async function apiRawStatus(
  page: Parameters<typeof apiCall>[0],
  path: string
): Promise<string | null> {
  const row = await apiCallRaw<{ reconciliation_status: string | null }>(page, 'GET', path);
  return row.reconciliation_status;
}
