// 4.7 消息不推错人：报价审批结果站内信只落创建人，不落无关岗位。
// 后端判据：handlers/quotation_handler.rs:262 notify_quotation_result 收件人取
//   model.created_by（:272，即发起人），审批人只作 sender_id（:281）；通过 :330、
//   驳回 :358。services/event_notification_service.rs:549 notify_approval_result
//   把 created_by 写进 user_id（:578）、business_type=APPROVAL（:583）、
//   title=审批通过（:580）、content 含报价单号（:568-571）；dedup_key 由单号+
//   审批人 id 组成（:588），每次新建单号唯一故本例不触发 5 分钟去重。
//   notify_pending_approval 已删除（:542-546），审批人不会因"待审批"通知误伤负向腿。
//   落库 user_id = req.user_id（services/notification_service.rs:120），列表按
//   auth.user_id 过滤（handlers/notification_handler.rs:70-72），出参 list（:74-79）。
// 与既有覆盖分工：510 spec 已钉通过/驳回→创建人收到（正腿），本例补"不推错人"
//   负腿；warehouse_keeper 与报价无业务关联且能读通知（501 实测范式），
//   若通知被群发或广播给无关岗位，其收件箱出现该单号即红。
// 检测力：创建人 +1 与无关岗 0 条成对断言，漏挂收件人过滤或错填 user_id 即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  loginAsRole,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface NotificationRow {
  id: number;
  title?: string;
  content?: string;
  business_type?: string;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function readInbox(page: Page, tag: string): Promise<NotificationRow[]> {
  const res = await apiCall<{ list?: NotificationRow[] }>(
    page,
    'GET',
    '/notifications?page=1&page_size=50'
  );
  expect(
    Array.isArray(res.data?.list),
    `[445] ${tag} 通知列表应带 list 数组，实际 ${JSON.stringify(res.data)}`
  ).toBe(true);
  return res.data!.list!;
}

function countForQuotation(rows: NotificationRow[], quotationNo: string): number {
  return rows.filter(
    r =>
      (r.title === '审批通过' || r.title === '审批拒绝') && (r.content ?? '').includes(quotationNo)
  ).length;
}

async function createApprovalQuotation(
  page: Page,
  tag: string
): Promise<{ id: number; no: string }> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: ctx.userIds[0],
    quotation_date: isoDate(0),
    valid_until: isoDate(30),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: true,
    tax_rate: '0',
    items: [
      {
        product_id: ctx.quotationProductId,
        unit: ctx.quotationProductUnit,
        // 合计 12.5 万落 10 到 50 万主管审批档：10 万以下 submit 自批直接 approved，
        // 主管 approve 会撞"不在待审批状态"状态门，故金额必须留在主管档。
        quantity: '500',
        unit_price: '250',
        unit_price_with_tax: '250',
      },
    ],
    notes: `${tag}-${genCode('QT')}`,
  });
  const id = created.id;
  expect(id, `[445] ${tag} 报价创建须返回主键，实际 ${JSON.stringify(created)}`).toBeTruthy();
  const detail = await apiCallRaw<{ quotation_no?: string; status?: string }>(
    page,
    'GET',
    `/quotations/${id}`
  );
  const no = detail.quotation_no;
  expect(
    typeof no === 'string' && no.length > 0,
    `[445] ${tag} 详情须带报价单号，实际 ${JSON.stringify(detail)}`
  ).toBe(true);
  expect(detail.status, `[445] ${tag} 初始状态须为词表原值 draft`).toBe('draft');
  return { id: id as number, no: no as string };
}

test('445-01 报价审批站内信只推创建人，不推无关岗位', async ({ page }) => {
  const tag = '445-01';
  await loginViaUI(page);
  const { id, no: quotationNo } = await createApprovalQuotation(page, tag);

  await apiCallRaw(page, 'POST', `/quotations/${id}/submit`);
  const submitted = await apiCallRaw<{ status?: string }>(page, 'GET', `/quotations/${id}`);
  expect(
    submitted.status,
    `[445] 提交后须落 pending_approval（主管审批档），实际 ${submitted.status}`
  ).toBe('pending_approval');

  const creatorBefore = countForQuotation(await readInbox(page, '创建人触发前'), quotationNo);
  expect(creatorBefore, `[445] 单号 ${quotationNo} 触发前创建人不应已有审批通知`).toBe(0);

  await loginAsRole(page, 'sales_manager');
  await apiCallRaw(page, 'POST', `/quotations/${id}/approve`, {
    approval_reason: `${tag} 审批通过`,
  });

  // 切回创建人：force 重新登录，避免沿用 sales_manager 的 cookie 读错收件箱。
  await loginViaUI(page, undefined, undefined, true);
  await ensureTestEntities(page);
  const creatorAfter = countForQuotation(await readInbox(page, '创建人触发后'), quotationNo);
  expect(
    creatorAfter,
    `[445] 审批通过应给创建人落一条站内信（${quotationNo}），基线 ${creatorBefore}→触发后 ${creatorAfter}`
  ).toBe(creatorBefore + 1);

  // 负向腿：无关岗位收件箱不得出现该单号的审批结果通知。
  // 单号为新建唯一值，该岗位与报价无业务关联，基线必为 0，断言绝对 0 条。
  await loginAsRole(page, 'warehouse_keeper');
  const otherInbox = await readInbox(page, '无关岗位触发后');
  const otherHit = otherInbox.filter(r => (r.content ?? '').includes(quotationNo));
  expect(
    otherHit.length,
    `[445] 审批通知不得推给无关岗位 warehouse_keeper（${quotationNo}），实际 ${otherHit.length} 条`
  ).toBe(0);

  await loginAsRole(page, 'admin');
  await tryCleanup(page, 'DELETE', `/quotations/${id}`, `${tag} 清理报价`);
});
