// 4.24 参数生效 + 4.3 状态机：能耗分摊规则的状态门与生效查询口径。
// 后端判据：services/energy_ops/allocation_rule.rs
//   :169-176 update 仅 draft（否则 AppError::business "仅草稿(draft)状态可更新"）；
//   :226-234 delete 仅 draft（business_displayable "仅草稿状态的分摊规则可以删除"）；
//   :243-256 activate 仅 draft→active；:259-269 disable 仅 active→disabled；
//   :324-353 get_effective_rule 只认 is_deleted=false + status=ACTIVE + workshop/meter_type
//     精确匹配 + effective_date<=date + (expiry_date 为空或 date<=expiry_date)，
//     无命中返回 Ok(None)→HTTP 200 data=null（不是 404）。
// 状态词表写入方：models/status/wage_energy_chemical_business.rs:118-127
//   energy_rule_status：draft/active/disabled（全小写，禁英文化/大小写混用）。
// 创建日期门：allocation_rule.rs:104-105 expiry <= effective 被 business 拒绝。
// 路由：routes/production.rs energy 路由组，handler energy_handler.rs:321/350/360/369/378/387，
//   前缀 /api/v1/erp/production（前端 baseURL 已含 /api/v1/erp）。
// 与 49 spec 的分工：49 覆盖计量设备/能耗登记/分摊记录三类写端点契约，
//   24 spec 只做规则的正向探针（建→activate→effective 命中），本例专钉规则状态门
//   与"生效查询只认 active"的反向口径，三条断言互不重叠。
// 检测力：漏掉任一状态门则非法流转返回 200 即红；effective 不按 status 过滤则
//   draft/disabled 阶段被命中即红。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallExpectFail, expectStateGateRejection, genCode } from '../flow/helpers';

interface Rule {
  id: number;
  status?: string;
}

const ENDPOINT = '/production/energy-rules';

async function createRule(page: Page, workshop: string, effectiveDate: string): Promise<Rule> {
  const created = await apiCall<Rule>(page, 'POST', ENDPOINT, {
    rule_name: genCode('E424R'),
    meter_type: 'electricity',
    allocation_basis: 'by_workshop',
    workshop,
    effective_date: effectiveDate,
  });
  const id = Number(created.data?.id);
  expect(id, '前置：建分摊规则须返回正整数主键').toBeGreaterThan(0);
  return created.data as Rule;
}

test('424-01 分摊规则状态门与生效查询只认启用态', async ({ page }) => {
  const workshop = genCode('E424W');
  const today = new Date().toISOString().slice(0, 10);
  const effectiveUrl = `${ENDPOINT}/effective?workshop=${encodeURIComponent(
    workshop
  )}&meter_type=electricity&date=${today}`;

  // 创建日期边界：失效日期等于生效日期须被拒（expiry <= effective）。
  const badExpiry = await apiCallExpectFail(page, 'POST', ENDPOINT, {
    rule_name: genCode('E424X'),
    meter_type: 'electricity',
    allocation_basis: 'by_workshop',
    workshop,
    effective_date: today,
    expiry_date: today,
  });
  expectStateGateRejection(badExpiry, '失效日期等于生效日期建档');
  expect(
    String(badExpiry.message ?? ''),
    `失效日期边界拒因须可定位，实际 ${JSON.stringify(badExpiry.message)}`
  ).not.toBe('');

  const rule = await createRule(page, workshop, today);

  // 草稿态：生效查询不得命中本 workshop 下的规则。
  const draftEffective = await apiCall<Rule | null>(page, 'GET', effectiveUrl);
  expect(draftEffective.data ?? null, '草稿态规则不应被生效查询命中').toBeNull();

  // 草稿→启用：状态须落到 active。
  const activated = await apiCall<Rule>(page, 'POST', `${ENDPOINT}/${rule.id}/activate`);
  expect(activated.data?.status, '启用后状态须为 active').toBe('active');

  // 启用态：生效查询须命中本规则（workshop 唯一，命中即本例规则）。
  const activeEffective = await apiCall<Rule | null>(page, 'GET', effectiveUrl);
  expect(
    Number(activeEffective.data?.id),
    '启用后生效查询须命中本规则，证明状态切换真的影响分摊取数'
  ).toBe(rule.id);

  // 启用态禁止：重复启用、更新、删除，三条均须走状态门拒绝。
  const reActivate = await apiCallExpectFail(page, 'POST', `${ENDPOINT}/${rule.id}/activate`);
  expectStateGateRejection(reActivate, '启用态重复启用');
  const updateActive = await apiCallExpectFail(page, 'PUT', `${ENDPOINT}/${rule.id}`, {
    rule_name: genCode('E424U'),
  });
  expectStateGateRejection(updateActive, '启用态更新');
  const deleteActive = await apiCallExpectFail(page, 'DELETE', `${ENDPOINT}/${rule.id}`);
  expectStateGateRejection(deleteActive, '启用态删除');

  // 启用→停用：状态须落到 disabled。
  const disabled = await apiCall<Rule>(page, 'POST', `${ENDPOINT}/${rule.id}/disable`);
  expect(disabled.data?.status, '停用后状态须为 disabled').toBe('disabled');

  // 停用态：生效查询不得再命中。
  const disabledEffective = await apiCall<Rule | null>(page, 'GET', effectiveUrl);
  expect(disabledEffective.data ?? null, '停用态规则不应被生效查询命中').toBeNull();

  // 停用态禁止再次停用。
  const reDisable = await apiCallExpectFail(page, 'POST', `${ENDPOINT}/${rule.id}/disable`);
  expectStateGateRejection(reDisable, '停用态重复停用');
});
