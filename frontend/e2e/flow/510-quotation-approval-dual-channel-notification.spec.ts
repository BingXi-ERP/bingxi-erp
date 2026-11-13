import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  genCode,
  tryCleanup,
} from './helpers';

/**
 * 510 报价审批双通道通知腿（站内 + 微信公众号报价结果模板）
 *
 * 覆盖面取证（写断言前逐字对过 backend 源码，非设想）：
 * - 站内腿：handlers/quotation_handler.rs notify_quotation_result →
 *   EventNotificationService::notify_approval_result（notification_type=Internal，
 *   title=审批通过/审批拒绝，content 含报价单号与审批人，business_type=APPROVAL，
 *   dedup_key 含报价单号与审批人 id）。
 * - 微信腿：EventNotificationService::send_quotation_result_wechat →
 *   send_wechat_notification（按 user_wechat_mp_binding 反查 openid；凭证未配置时
 *   is_available 显式 WARN 后跳过，发送失败回收去重占位，均不影响主业务流）。
 *   CI 环境无 WECHAT_MP_* 凭证，微信腿按设计跳过，本 spec 断言站内腿落库与
 *   报价审批主流程不受通知腿影响；微信腿发送面由凭证环境实测覆盖。
 * - 前置：当前会话用户自建报价单（created_by=自己），sales_manager 会话审批，
 *   端点形态照抄 123 号 spec 实测（POST /quotations/{id}/approve 带 approval_reason、
 *   POST /quotations/{id}/reject 带 reason；状态词表 sales.rs::quotation 小写
 *   approved/rejected）。
 * - 站内信断言用"基线计数 + 触发后 +1"（共享库上绝对计数不隔离，漏测清单第九节）。
 */

interface NotificationRow {
  id: number;
  title: string;
  content?: string;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function readInbox(page: Page, tag: string): Promise<NotificationRow[]> {
  const res = await apiCall<{ items?: NotificationRow[] }>(
    page,
    'GET',
    '/notifications?page=1&page_size=50'
  );
  const rows = res.data?.items;
  expect(
    Array.isArray(rows),
    `[510] ${tag} 通知列表应带 items 数组，实际 ${JSON.stringify(res.data)}`
  ).toBe(true);
  return rows as NotificationRow[];
}

function countApproval(rows: NotificationRow[], quotationNo: string, tag: string): number {
  const hits = rows.filter(
    r =>
      (r.title === '审批通过' || r.title === '审批拒绝') && (r.content ?? '').includes(quotationNo)
  );
  console.log(`[510] ${tag} 命中 ${hits.length} 条（报价单号 ${quotationNo}）`);
  return hits.length;
}

async function createSelfQuotation(page: Page, tag: string): Promise<{ id: number; no: string }> {
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
        quantity: '5',
        unit_price: '2',
        unit_price_with_tax: '2',
      },
    ],
    notes: `${tag}-${genCode('QT')}`,
  });
  const id = created.id;
  expect(
    id,
    `[510] ${tag} 前置不成立：报价创建未返回主键，实际 ${JSON.stringify(created)}`
  ).toBeTruthy();
  const detail = await apiCallRaw<{ quotation_no?: string; status?: string }>(
    page,
    'GET',
    `/quotations/${id}`
  );
  const quotationNo = detail.quotation_no;
  expect(
    typeof quotationNo === 'string' && quotationNo.length > 0,
    `[510] ${tag} 前置不成立：详情未带报价单号，实际 ${JSON.stringify(detail)}`
  ).toBe(true);
  expect(detail.status, `[510] ${tag} 前置状态应为词表原值 draft，实际 ${detail.status}`).toBe(
    'draft'
  );
  return { id: id as number, no: quotationNo as string };
}

test.describe('510 报价审批双通道通知腿（真实契约正腿）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('510-01 审批通过腿：创建人站内信落审批通过且微信腿无凭证环境不影响主流程', async ({
    page,
  }) => {
    const tag = '510-01';
    const { id, no: quotationNo } = await createSelfQuotation(page, tag);
    await apiCallRaw(page, 'POST', `/quotations/${id}/submit`);
    const inboxBefore = await readInbox(page, '触发前');
    const baseline = countApproval(inboxBefore, quotationNo, '基线');

    await loginViaUI(page, 'sales_manager', undefined, true);
    await apiCallRaw(page, 'POST', `/quotations/${id}/approve`, {
      approval_reason: `${tag} 审批通过`,
    });

    await loginViaUI(page, undefined, undefined, true);
    await ensureTestEntities(page);
    const inboxAfter = await readInbox(page, '触发后');
    const after = countApproval(inboxAfter, quotationNo, '触发后');
    expect(
      after,
      `[510-01] 审批通过应给创建人落一条站内信（${quotationNo}），基线 ${baseline}→触发后 ${after}`
    ).toBe(baseline + 1);
    const hit = (inboxAfter as NotificationRow[]).find(
      r => r.title === '审批通过' && (r.content ?? '').includes(quotationNo)
    );
    expect(hit, '[510-01] 审批通过命中行应存在').toBeTruthy();

    await tryCleanup(page, 'DELETE', `/quotations/${id}`, `${tag} 清理报价`);
  });

  test('510-02 审批拒绝腿：创建人站内信落审批拒绝', async ({ page }) => {
    const tag = '510-02';
    const { id, no: quotationNo } = await createSelfQuotation(page, tag);
    await apiCallRaw(page, 'POST', `/quotations/${id}/submit`);
    const inboxBefore = await readInbox(page, '触发前');
    const baseline = countApproval(inboxBefore, quotationNo, '基线');

    await loginViaUI(page, 'sales_manager', undefined, true);
    await apiCallRaw(page, 'POST', `/quotations/${id}/reject`, {
      reason: `${tag} 拒绝原因`,
    });

    await loginViaUI(page, undefined, undefined, true);
    await ensureTestEntities(page);
    const inboxAfter = await readInbox(page, '触发后');
    const after = countApproval(inboxAfter, quotationNo, '触发后');
    expect(
      after,
      `[510-02] 审批拒绝应给创建人落一条站内信（${quotationNo}），基线 ${baseline}→触发后 ${after}`
    ).toBe(baseline + 1);
    const hit = (inboxAfter as NotificationRow[]).find(
      r => r.title === '审批拒绝' && (r.content ?? '').includes(quotationNo)
    );
    expect(hit, '[510-02] 审批拒绝命中行应存在').toBeTruthy();

    await tryCleanup(page, 'DELETE', `/quotations/${id}`, `${tag} 清理报价`);
  });
});
