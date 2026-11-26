import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  ensureTestEntities,
  expectDenied,
  failureCode,
  genCode,
  getCtx,
  getRoleCredential,
  loginInIsolatedContext,
  loginViaUI,
  tryCleanup,
  type ApiFailureBody,
} from '../flow/helpers';
import { withNumberRuleConfigLock } from '../flow/number-rule-config-lock.mjs';
import { pickSelectIn } from '../flow/ui-helpers';
import type {
  NumberRule,
  NumberRuleConfig,
  NumberRuleDetail,
  NumberRuleResetMode,
} from '../../src/api/system-number-rule';
import type { PaginatedResponse } from '../../src/types/api-response';

const RULE_KEY = 'SO';
const SEED_RULE_KEYS = ['SO', 'PO', 'QT', 'PR', 'DN', 'LD'];
const CREATED_ORDER_IDS: number[] = [];

function numberRuleConfigTest(
  title: string,
  body: (args: { page: Page }) => Promise<void>,
  setup?: (page: Page) => Promise<void>
): void {
  test(title, async ({ page }) => {
    if (setup) await setup(page);
    await withNumberRuleConfigLock(() => body({ page }));
  });
}

interface SalesOrderIdentity {
  id: number;
  order_no: string;
  created_at: string;
}

function configOf(rule: NumberRule): NumberRuleConfig {
  return {
    prefix: rule.prefix,
    seq_width: rule.seq_width,
    reset_mode: rule.reset_mode,
  };
}

function sameConfig(left: NumberRuleConfig, right: NumberRuleConfig): boolean {
  return (
    left.prefix === right.prefix &&
    left.seq_width === right.seq_width &&
    left.reset_mode === right.reset_mode
  );
}

async function readDetail(page: Parameters<typeof apiCall>[0]): Promise<NumberRuleDetail> {
  const list = await apiCall<PaginatedResponse<NumberRule>>(
    page,
    'GET',
    `/system/number-rules?page=1&page_size=20`
  );
  expect(list.code, '编码规则列表应返回成功信封').toBe(200);
  const rule = list.data.items.find(item => item.rule_key === RULE_KEY);
  expect(rule, '种子规则 SO 必须存在').toBeTruthy();
  if (!rule) throw new Error('种子规则 SO 不存在');
  const detail = await apiCall<NumberRuleDetail>(page, 'GET', `/system/number-rules/${rule.id}`);
  expect(detail.code, '编码规则详情应返回成功信封').toBe(200);
  return detail.data;
}

async function restoreSnapshot(
  page: Parameters<typeof apiCall>[0],
  snapshot: NumberRuleDetail
): Promise<void> {
  await withNumberRuleConfigLock(async () => {
    const current = await readDetail(page);
    if (!sameConfig(configOf(current.rule), configOf(snapshot.rule))) {
      console.warn(`[586] 恢复 SO 配置快照：${JSON.stringify(configOf(snapshot.rule))}`);
      const restored = await apiCall<NumberRuleDetail>(
        page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...configOf(snapshot.rule),
          version: current.rule.version,
          change_reason: 'E2E 清理：恢复编码规则测试前配置',
        }
      );
      expect(restored.code, '恢复编码规则配置应成功').toBe(200);
      expect(sameConfig(configOf(restored.data.rule), configOf(snapshot.rule))).toBe(true);
    } else {
      console.warn('[586] SO 配置未偏离快照，无需追加恢复版本');
    }
  });
}

function changedConfig(snapshot: NumberRuleDetail, suffix: string): NumberRuleConfig {
  if (suffix.length === 0 || suffix.length >= 50) {
    throw new Error(`编码规则测试后缀长度非法：${suffix.length}`);
  }
  const mode: NumberRuleResetMode = snapshot.rule.reset_mode === 'never' ? 'month' : 'never';
  return {
    prefix: `${snapshot.rule.prefix.slice(0, 50 - suffix.length)}${suffix}`,
    seq_width: snapshot.rule.seq_width === 4 ? 5 : 4,
    reset_mode: mode,
  };
}

function resetModeText(mode: NumberRuleResetMode): string {
  switch (mode) {
    case 'day':
      return '每日重置';
    case 'month':
      return '每月重置';
    case 'never':
      return '永不重置';
  }
}

function formatExample(config: NumberRuleConfig, now: Date): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const period =
    config.reset_mode === 'day'
      ? `${year}${month}${day}`
      : config.reset_mode === 'month'
        ? `${year}${month}`
        : '';
  return `${config.prefix}${period}${String(1).padStart(config.seq_width, '0')}`;
}

function numberPattern(config: NumberRuleConfig, createdAt: string): RegExp {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`销售订单创建时间无法解析：${createdAt}`);
  }
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const period =
    config.reset_mode === 'day'
      ? `${year}${month}${day}`
      : config.reset_mode === 'month'
        ? `${year}${month}`
        : '';
  const escapedPrefix = config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedPrefix}${period}\\d{${config.seq_width}}$`);
}

async function fillEditForm(
  page: Page,
  config: NumberRuleConfig,
  changeReason: string
): Promise<void> {
  await page.getByTestId('number-rule-prefix-input').fill(config.prefix);
  await page.getByTestId('number-rule-width-input').locator('input').fill(String(config.seq_width));
  await pickSelectIn(page, page, '重置周期', { optionText: resetModeText(config.reset_mode) });
  await page.getByTestId('number-rule-change-reason-input').fill(changeReason);
}

async function createSalesOrder(page: Page): Promise<SalesOrderIdentity> {
  return withNumberRuleConfigLock(async () => {
    const ctx = getCtx();
    expect(ctx.customerId, '销售订单前置客户必须存在').toBeTruthy();
    expect(ctx.productIds[0], '销售订单前置产品必须存在').toBeTruthy();
    const marker = genCode('NR586');
    console.warn(`[586] POST /sales/orders 创建真实销售订单 marker=${marker}`);
    const created = await apiCallRaw<SalesOrderIdentity>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      items: [{ product_id: ctx.productIds[0], quantity: '1', unit_price: '10.00' }],
      notes: `E2E-586-${marker}`,
    });
    if (!Number.isInteger(created.id) || created.id <= 0) {
      throw new Error(`销售订单创建未返回合法 id：${JSON.stringify(created)}`);
    }
    CREATED_ORDER_IDS.push(created.id);
    const detail = await apiCallRaw<SalesOrderIdentity>(page, 'GET', `/sales/orders/${created.id}`);
    expect(detail.id, '销售订单回读 id 必须与创建结果一致').toBe(created.id);
    expect(typeof detail.order_no, '销售订单回读必须包含 order_no').toBe('string');
    expect(detail.order_no.length, '销售订单回读 order_no 不得为空').toBeGreaterThan(0);
    console.warn(`[586] 销售订单取号回读 id=${detail.id} order_no=${detail.order_no}`);
    return detail;
  });
}

test.describe('系统管理 - 586 编码规则参数化', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async ({ page }) => {
    while (CREATED_ORDER_IDS.length) {
      const id = CREATED_ORDER_IDS.pop();
      if (id !== undefined) {
        await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `sales_order#${id}`);
      }
    }
  });

  test('管理员从真实页面读取六枚种子规则', async ({ page }) => {
    await loginViaUI(page);
    const response = await apiCall<PaginatedResponse<NumberRule>>(
      page,
      'GET',
      `/system/number-rules?page=1&page_size=20`
    );
    expect(response.code).toBe(200);
    expect(response.data.total, '种子规则总数必须为六').toBe(6);
    expect(response.data.items.map(rule => rule.rule_key).sort()).toEqual(
      [...SEED_RULE_KEYS].sort()
    );

    await page.goto('/system/number-rules');
    await expect(page.getByTestId('number-rules-page')).toBeVisible();
    await expect(page.getByTestId('number-rules-table')).toBeVisible();
    for (const ruleKey of SEED_RULE_KEYS) {
      await expect(page.getByTestId(`number-rule-${ruleKey}-prefix`)).toHaveText(ruleKey);
    }
    await expect(page.locator('[class*="number-rule-row-"]')).toHaveCount(6);
  });

  numberRuleConfigTest('页面编辑规则后刷新仍能读到持久化配置与嵌套历史快照', async ({ page }) => {
    await loginViaUI(page);
    const snapshot = await readDetail(page);
    const changed = changedConfig(snapshot, 'UI');

    try {
      await page.goto('/system/number-rules');
      await page.getByTestId(`number-rule-${RULE_KEY}-edit`).click();
      await expect(page.getByTestId('number-rule-edit-dialog')).toBeVisible();
      await expect(page.getByTestId('number-rule-number-example')).toHaveText(
        formatExample(configOf(snapshot.rule), new Date())
      );
      await fillEditForm(page, changed, 'E2E：验证编码规则编辑持久化');
      await expect(page.getByTestId('number-rule-number-example')).toHaveText(
        formatExample(changed, new Date())
      );
      await page.getByTestId('number-rule-save').click();
      await expect(page.getByTestId('number-rule-edit-dialog')).toBeHidden();
      await expect(page.getByTestId(`number-rule-${RULE_KEY}-prefix`)).toHaveText(changed.prefix);

      await page.reload();
      await expect(page.getByTestId(`number-rule-${RULE_KEY}-prefix`)).toHaveText(changed.prefix);
      const persisted = await readDetail(page);
      expect(persisted.rule.version, '编辑必须追加新版本').toBe(snapshot.rule.version + 1);
      expect(sameConfig(configOf(persisted.rule), changed), '刷新后配置必须与编辑值一致').toBe(
        true
      );
      expect(persisted.revisions[0]?.config, '历史快照必须使用嵌套 config 字段').toEqual(changed);
      expect(persisted.revisions[0]?.change_reason).toBe('E2E：验证编码规则编辑持久化');

      await page.getByTestId(`number-rule-${RULE_KEY}-detail`).click();
      await expect(page.getByTestId('number-rule-detail-drawer')).toBeVisible();
      const version = persisted.rule.version;
      await expect(page.getByTestId(`number-rule-revision-${version}-prefix`)).toHaveText(
        changed.prefix
      );
      await expect(page.getByTestId(`number-rule-revision-${version}-width`)).toHaveText(
        String(changed.seq_width)
      );
      await expect(page.getByTestId(`number-rule-revision-${version}-reset-mode`)).toHaveText(
        resetModeText(changed.reset_mode)
      );
    } finally {
      await restoreSnapshot(page, snapshot);
    }
  });

  numberRuleConfigTest('过期 version 返回明确业务冲突且不覆盖新配置', async ({ page }) => {
    await loginViaUI(page);
    const snapshot = await readDetail(page);
    const firstChange = changedConfig(snapshot, 'V1');
    const staleChange = changedConfig(snapshot, 'V2');

    try {
      const first = await apiCall<NumberRuleDetail>(
        page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...firstChange,
          version: snapshot.rule.version,
          change_reason: 'E2E：制造编码规则新版本',
        }
      );
      expect(first.code).toBe(200);
      expect(first.data.rule.version).toBe(snapshot.rule.version + 1);

      const conflict = await apiCallExpectFail(
        page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...staleChange,
          version: snapshot.rule.version,
          change_reason: 'E2E：过期版本不得覆盖新配置',
        }
      );
      expect(conflict.status, '过期版本必须返回 HTTP 400').toBe(400);
      expect(failureCode(conflict as ApiFailureBody)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(typeof conflict.message === 'string' && conflict.message.includes('刷新')).toBe(true);

      const unchanged = await readDetail(page);
      expect(unchanged.rule.version).toBe(first.data.rule.version);
      expect(sameConfig(configOf(unchanged.rule), firstChange)).toBe(true);
    } finally {
      await restoreSnapshot(page, snapshot);
    }
  });

  numberRuleConfigTest('编辑弹窗保留输入并刷新版本后重试乐观锁冲突', async ({ page }) => {
    await loginViaUI(page);
    const snapshot = await readDetail(page);
    const firstChange = changedConfig(snapshot, 'LCV1');
    const retryChange = changedConfig(snapshot, 'LCV2');

    try {
      await page.goto('/system/number-rules');
      await page.getByTestId(`number-rule-${RULE_KEY}-edit`).click();
      await fillEditForm(page, retryChange, 'E2E：刷新版本后重试编辑');

      const first = await apiCall<NumberRuleDetail>(
        page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...firstChange,
          version: snapshot.rule.version,
          change_reason: 'E2E：弹窗外制造版本冲突',
        }
      );
      expect(first.code).toBe(200);
      expect(first.data.rule.version).toBe(snapshot.rule.version + 1);

      await page.getByTestId('number-rule-save').click();
      await expect(page.getByTestId('number-rule-version-conflict')).toBeVisible();
      await expect(page.getByTestId('number-rule-save')).toBeDisabled();
      await expect(page.getByTestId('number-rule-prefix-input')).toHaveValue(retryChange.prefix);
      const unchanged = await readDetail(page);
      expect(sameConfig(configOf(unchanged.rule), firstChange)).toBe(true);

      await page.getByTestId('number-rule-version-conflict').getByRole('button').click();
      await expect(page.getByTestId('number-rule-version-conflict')).toBeHidden();
      await expect(page.getByTestId('number-rule-save')).toBeEnabled();
      await expect(page.locator('.form-hint').filter({ hasText: '当前编辑版本' })).toContainText(
        String(first.data.rule.version)
      );
      await expect(page.getByTestId('number-rule-prefix-input')).toHaveValue(retryChange.prefix);

      await page.getByTestId('number-rule-save').click();
      await expect(page.getByTestId('number-rule-edit-dialog')).toBeHidden();
      const retried = await readDetail(page);
      expect(retried.rule.version).toBe(snapshot.rule.version + 2);
      expect(sameConfig(configOf(retried.rule), retryChange)).toBe(true);
    } finally {
      await restoreSnapshot(page, snapshot);
    }
  });

  numberRuleConfigTest('POST 回滚恢复历史配置并追加新版本', async ({ page }) => {
    await loginViaUI(page);
    const snapshot = await readDetail(page);
    const target = snapshot.revisions.find(revision => revision.version === snapshot.rule.version);
    expect(target, '当前版本必须存在对应历史快照').toBeTruthy();
    if (!target) throw new Error('当前编码规则版本缺少历史快照');
    const changed = changedConfig(snapshot, 'RB');

    try {
      const updated = await apiCall<NumberRuleDetail>(
        page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...changed,
          version: snapshot.rule.version,
          change_reason: 'E2E：回滚前修改编码规则',
        }
      );
      expect(updated.code).toBe(200);
      expect(sameConfig(configOf(updated.data.rule), changed)).toBe(true);

      const rolledBack = await apiCall<NumberRuleDetail>(
        page,
        'POST',
        `/system/number-rules/${snapshot.rule.id}/rollback`,
        {
          revision_id: target.id,
          version: updated.data.rule.version,
          change_reason: 'E2E：验证编码规则历史回滚',
        }
      );
      expect(rolledBack.code, '回滚应成功').toBe(200);
      expect(sameConfig(configOf(rolledBack.data.rule), configOf(snapshot.rule))).toBe(true);
      expect(rolledBack.data.rule.version).toBe(updated.data.rule.version + 1);
      expect(rolledBack.data.revisions).toHaveLength(snapshot.revisions.length + 2);
      expect(rolledBack.data.revisions[0]?.version).toBe(rolledBack.data.rule.version);
      expect(rolledBack.data.revisions[0]?.change_reason).toBe('E2E：验证编码规则历史回滚');

      const reread = await readDetail(page);
      expect(sameConfig(configOf(reread.rule), configOf(snapshot.rule))).toBe(true);
      expect(reread.revisions).toHaveLength(snapshot.revisions.length + 2);
    } finally {
      await restoreSnapshot(page, snapshot);
    }
  });

  const setupRealOrder = async (page: Page) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  };

  numberRuleConfigTest(
    'SO 规则变更与回滚立即生效',
    async ({ page }) => {
      test.setTimeout(420_000);
      const snapshot = await readDetail(page);
      const rollbackTarget = snapshot.revisions.find(
        revision => revision.version === snapshot.rule.version
      );
      expect(rollbackTarget, '真实取号回滚需要当前版本快照').toBeTruthy();
      if (!rollbackTarget) throw new Error('当前编码规则版本缺少历史快照');
      const changed = changedConfig(snapshot, `NR${Date.now().toString().slice(-8)}`);

      try {
        console.warn(`[586] SO 初始配置=${JSON.stringify(configOf(snapshot.rule))}`);
        const baseline = await createSalesOrder(page);
        expect(baseline.order_no, '初始订单号必须符合初始 SO 规则').toMatch(
          numberPattern(configOf(snapshot.rule), baseline.created_at)
        );

        console.warn(`[586] PUT SO 新配置=${JSON.stringify(changed)}`);
        const updated = await apiCall<NumberRuleDetail>(
          page,
          'PUT',
          `/system/number-rules/${snapshot.rule.id}`,
          {
            ...changed,
            version: snapshot.rule.version,
            change_reason: 'E2E：验证真实销售订单立即使用新编码规则',
          }
        );
        expect(updated.code).toBe(200);
        expect(sameConfig(configOf(updated.data.rule), changed)).toBe(true);

        const modified = await createSalesOrder(page);
        expect(modified.order_no, '新订单号必须立即使用新前缀、宽度与周期').toMatch(
          numberPattern(changed, modified.created_at)
        );
        expect(modified.order_no, '不同配置下新旧订单号不得相同').not.toBe(baseline.order_no);
        const baselineAfterChange = await apiCallRaw<SalesOrderIdentity>(
          page,
          'GET',
          `/sales/orders/${baseline.id}`
        );
        expect(baselineAfterChange.order_no, '修改规则不得改写旧订单号').toBe(baseline.order_no);

        console.warn(`[586] POST SO 回滚 revision=${rollbackTarget.id}`);
        const rolledBack = await apiCall<NumberRuleDetail>(
          page,
          'POST',
          `/system/number-rules/${snapshot.rule.id}/rollback`,
          {
            revision_id: rollbackTarget.id,
            version: updated.data.rule.version,
            change_reason: 'E2E：验证回滚后真实销售订单恢复取号',
          }
        );
        expect(rolledBack.code).toBe(200);
        expect(sameConfig(configOf(rolledBack.data.rule), configOf(snapshot.rule))).toBe(true);

        const restored = await createSalesOrder(page);
        expect(restored.order_no, '回滚后新订单号必须立即恢复初始 SO 规则').toMatch(
          numberPattern(configOf(snapshot.rule), restored.created_at)
        );
        expect(restored.order_no).not.toBe(baseline.order_no);
        expect(restored.order_no).not.toBe(modified.order_no);
        const baselineAfterRollback = await apiCallRaw<SalesOrderIdentity>(
          page,
          'GET',
          `/sales/orders/${baseline.id}`
        );
        const modifiedAfterRollback = await apiCallRaw<SalesOrderIdentity>(
          page,
          'GET',
          `/sales/orders/${modified.id}`
        );
        expect(baselineAfterRollback.order_no, '回滚不得改写初始订单号').toBe(baseline.order_no);
        expect(modifiedAfterRollback.order_no, '回滚不得改写新规则下的历史订单号').toBe(
          modified.order_no
        );
        console.warn(
          `[586] 真实取号闭环 baseline=${baseline.order_no} modified=${modified.order_no} restored=${restored.order_no}`
        );
      } finally {
        await restoreSnapshot(page, snapshot);
        const verified = await readDetail(page);
        expect(sameConfig(configOf(verified.rule), configOf(snapshot.rule))).toBe(true);
        console.warn('[586] finally 已恢复并回读验证 SO 配置');
      }
    },
    setupRealOrder
  );

  test('无 number-rules 权限角色访问列表、更新与 POST 回滚均返回 403 FORBIDDEN', async ({
    page,
    browser,
  }) => {
    await loginViaUI(page);
    const snapshot = await readDetail(page);
    const target = snapshot.revisions[0];
    expect(target, '权限负例需要真实历史快照').toBeTruthy();
    if (!target) throw new Error('编码规则历史快照缺失，无法验证回滚权限');
    const credential = getRoleCredential('salesperson');
    if (!credential) throw new Error('salesperson 角色凭证缺失，无法验证真实权限拒绝');

    const session = await loginInIsolatedContext(browser, credential.username, credential.password);
    try {
      const listDenied = await apiCallExpectFail(
        session.page,
        'GET',
        `/system/number-rules?page=1&page_size=20`
      );
      expectDenied(listDenied, 'salesperson 读取编码规则列表');

      const updateDenied = await apiCallExpectFail(
        session.page,
        'PUT',
        `/system/number-rules/${snapshot.rule.id}`,
        {
          ...configOf(snapshot.rule),
          version: snapshot.rule.version,
          change_reason: 'E2E：无权限角色不得更新编码规则',
        }
      );
      expectDenied(updateDenied, 'salesperson 更新编码规则');

      const rollbackDenied = await apiCallExpectFail(
        session.page,
        'POST',
        `/system/number-rules/${snapshot.rule.id}/rollback`,
        {
          revision_id: target.id,
          version: snapshot.rule.version,
          change_reason: 'E2E：无权限角色不得回滚编码规则',
        }
      );
      expectDenied(rollbackDenied, 'salesperson 回滚编码规则');
    } finally {
      await session.close();
    }
  });
});
