import { test, expect } from '../diagnose-fixture';
import type { Response } from '@playwright/test';
import { loginViaUI, BASE_URL, apiCall, apiCallRaw, genCode, tryCleanup } from './helpers';

test.describe('列表交互与状态显示', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('采购订单列表：分页切换+状态标签显示', async ({ page }) => {
    await page.goto(`${BASE_URL}/purchase`);
    await page.waitForTimeout(3000);

    await page
      .locator(
        '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    // 验证订单状态标签（el-tag）渲染出真实文案。
    // 注意：PurchaseTable 里 payment_status 列先于 status 列渲染，而后端
    // PurchaseOrderDto 不含 payment_status 字段，usePurchList.ts
    // getPaymentStatusText 对缺值恒返回空串——该列 el-tag 恒为空文本。
    // 因此不能直接取 .first()（拿到的是空的付款标签），需校验订单状态列渲染出非空标签。
    const statusTags = page.locator('.el-table .el-tag');
    const tagCount = await statusTags.count();
    expect(tagCount, '采购订单列表应渲染状态 el-tag').toBeGreaterThan(0);
    let sawNonEmptyStatusTag = false;
    for (let i = 0; i < tagCount; i++) {
      const text = (await statusTags.nth(i).textContent())?.trim() ?? '';
      if (text.length > 0) {
        sawNonEmptyStatusTag = true;
        break;
      }
    }
    expect(sawNonEmptyStatusTag, '应至少有一个订单状态 el-tag 渲染出非空文案').toBe(true);

    // 测试分页
    const pagination = page.locator('.el-pagination').first();
    const paginationVisible = await pagination.isVisible();
    if (paginationVisible) {
      const page2 = pagination.locator('.el-pager .number:has-text("2")').first();
      const page2Visible = await page2.isVisible();
      if (page2Visible) {
        await page2.click();
        await page.waitForTimeout(2000);
        await page
          .locator(
            '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
          )
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 });
      }
    }
  });

  test('库存列表：构造空筛选结果集并验证空态展示', async ({ page }) => {
    await page.goto(`${BASE_URL}/inventory`);

    // 库存台账 tab 默认加载（V2Table/el-table-v2，非 .el-table）
    const table = page.locator('.v2-table-wrapper, [role="table"]').first();
    await table.waitFor({ state: 'visible', timeout: 15_000 });

    // 原实现在此处直接 waitFor .el-table__empty-block 可见——表格有数据时
    // 空态块恒 hidden（call log: resolved to hidden ×14），前提不成立。
    // 改为用可构造的筛选条件构造空集：关键词在后端按产品编码/名称 LIKE 下推，
    // 无任何产品命中时显式返回空集。
    const keywordInput = page.locator('.filter-card input:visible').first();
    await keywordInput.waitFor({ state: 'visible', timeout: 5_000 });
    const noMatchKeyword = `NOMATCH-${Date.now()}`;
    await keywordInput.fill(noMatchKeyword);

    const responsePromise = page.waitForResponse(
      res => res.url().includes('/inventory/stock') && res.url().includes('page='),
      { timeout: 30_000 }
    );
    await page.locator('.filter-card button:has-text("查询")').first().click();
    const res = await responsePromise;
    // 先断状态再看集合：4xx（权限/契约回归）同样会让 waitForResponse 命中，
    // 此时 body.data 缺失会让下面的 total 断言以"undefined≠0"的形式报出错误原因。
    expect(
      res.status(),
      `GET /inventory/stock 列表读应 200，实际 ${res.status()} ${(await res.text()).slice(0, 200)}`
    ).toBe(200);
    const body = await res.json();

    // 后端真实形态：分页对象 {items,total}，非匹配关键词必须返回 total=0 空集
    expect(body?.data?.total, `关键词 ${noMatchKeyword} 应命中 0 条`).toBe(0);
    expect(
      Array.isArray(body?.data?.items) && body.data.items.length,
      '空筛选结果的 items 应为空数组'
    ).toBe(0);

    // 空态呈现：el-table-v2 空占位必须可见
    const emptyBlock = page
      .locator('.el-table-v2__empty, .el-empty, .el-table__empty-block')
      .first();
    await emptyBlock.waitFor({ state: 'visible', timeout: 10_000 });
    expect(await emptyBlock.isVisible()).toBe(true);
  });

  test('仪表盘加载状态和图表渲染', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(3000);

    const container = page.locator('.dashboard-container, .el-card, .el-row').first();
    await container.waitFor({ state: 'visible', timeout: 30_000 });

    const hasStats = await page
      .locator('.el-statistic, .el-card, [class*="stat"]')
      .first()
      .isVisible();
    const hasChart = await page.locator('canvas, .echarts, [class*="chart"]').first().isVisible();
    expect(hasStats || hasChart).toBe(true);
  });

  test('供应商列表：搜索过滤交互', async ({ page }) => {
    // 真实路由：/purchase/supplier
    await page.goto(`${BASE_URL}/supplier`);
    await page.waitForTimeout(3000);

    await page
      .locator('.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-card')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    // 查找搜索输入框（真实 placeholder 含"供应商名称"或类似）
    const searchInput = page.locator('.filter-form input, .filter-card input').first();
    await searchInput.waitFor({ state: 'visible', timeout: 5000 });
    const searchVisible = await searchInput.isVisible();
    if (searchVisible) {
      await searchInput.fill('测试');
      await page.waitForTimeout(1000);

      // 点击查询按钮（真实文本"查询"）
      const searchBtn = page.locator('button:has-text("查询")').first();
      await searchBtn.waitFor({ state: 'visible', timeout: 3000 });
      const searchBtnVisible = await searchBtn.isVisible();
      if (searchBtnVisible) {
        await searchBtn.click();
        await page.waitForTimeout(2000);
      }

      const tableStillVisible = await page
        .locator(
          '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
        )
        .first()
        .isVisible();
      expect(tableStillVisible).toBe(true);

      await searchInput.clear();
      await page.waitForTimeout(500);
    }
  });

  test('Tab 切换触发数据重新加载', async ({ page }) => {
    await page.goto(`${BASE_URL}/api-gateway`);
    await page.waitForTimeout(3000);

    // 等待 el-tabs 加载
    const tabs = page.locator('.el-tabs');
    await tabs.first().waitFor({ state: 'visible', timeout: 15_000 });
    const tabsVisible = await tabs.first().isVisible();
    if (tabsVisible) {
      // 点击第二个 tab
      const secondTab = page.locator('.el-tabs__item').nth(1);
      await secondTab.waitFor({ state: 'visible', timeout: 5000 });
      const secondTabVisible = await secondTab.isVisible();
      if (secondTabVisible) {
        await secondTab.click();
        await page.waitForTimeout(2000);

        // 验证 tab 内容加载
        const afterClickPanes = page.locator('.el-tab-pane');
        const newPaneCount = await afterClickPanes.count();
        expect(newPaneCount).toBeGreaterThanOrEqual(1);
      }
    }
  });

  test('应付付款申请：手动刷新不重置滚动位置', async ({ page }) => {
    // 清理队列为本用例私有（try/finally 逆序 flush），不新增 afterEach 影响文件内既有用例。
    const cleanup: Array<{ path: string; label: string }> = [];
    const createdRequestIds = new Set<number>();
    type PaymentRequestRow = { id: number; request_no: string; payment_method: string };
    const expectPositiveId = (value: unknown, label: string): number => {
      const id = Number(value);
      expect(Number.isInteger(id), `${label}：id 应为整数，实际=${JSON.stringify(value)}`).toBe(
        true
      );
      expect(id, `${label}：id 应为正整数，实际=${JSON.stringify(value)}`).toBeGreaterThan(0);
      return id;
    };
    const isPaymentRequestListGet = (res: Response): boolean =>
      res.request().method() === 'GET' &&
      new URL(res.url()).pathname.endsWith('/ap/payment-requests');

    try {
      const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
      const stamp = `${Date.now()}${rand}`;
      const supplier = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
        supplier_name: `E2E滚动${stamp}${genCode('S')}`,
        supplier_short_name: 'E2E滚动',
        credit_code: `91${stamp}`,
      });
      const supplierId = expectPositiveId(supplier.data?.id, '建供应商');
      cleanup.push({ path: `/purchase/suppliers/${supplierId}`, label: 'supplier' });

      const requestDate = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < 30; i += 1) {
        // items 可缺省（CreateApPaymentRequest.items 是 #[serde(default)] Option），
        // 逐条 await 顺序建单；任何一条失败 apiCallRaw 立即抛错判红，绝不静默继续。
        const created = await apiCallRaw<Record<string, unknown>>(
          page,
          'POST',
          '/ap/payment-requests',
          {
            supplier_id: supplierId,
            request_date: requestDate,
            payment_type: 'PURCHASE',
            payment_method: '银行转账',
            request_amount: '100.00',
            notes: `${stamp}-scroll-${i + 1}`,
          }
        );
        const requestId = expectPositiveId(created.id, `第 ${i + 1} 条付款申请`);
        createdRequestIds.add(requestId);
        cleanup.push({
          path: `/ap/payment-requests/${requestId}`,
          label: `payment_request_${i + 1}`,
        });
      }

      await page.goto(`${BASE_URL}/ap`);
      const tab = page.getByRole('tab', { name: '付款申请' });
      await tab.waitFor({ state: 'visible', timeout: 30_000 });
      const initialList = page.waitForResponse(isPaymentRequestListGet, { timeout: 30_000 });
      await tab.click();
      const initialRes: Response = await initialList;
      expect(initialRes.status(), '进入付款申请 tab 的 GET /ap/payment-requests 应 200').toBe(200);
      const initialBody = (await initialRes.json()) as { data: { items: PaymentRequestRow[] } };
      const initialItems = initialBody.data.items;
      expect(Array.isArray(initialItems), 'GET /ap/payment-requests 应返回 data.items 数组').toBe(
        true
      );
      expect(initialItems?.length, '列表 data.items 应至少 20 条').toBeGreaterThanOrEqual(20);

      const table = page.locator('.payment-request-tab > .el-table').first();
      await table.waitFor({ state: 'visible', timeout: 30_000 });
      const rows = table.locator('.el-table__body tbody tr');
      await expect(rows.first(), '付款申请表格应真实渲染数据行').toBeVisible({ timeout: 30_000 });
      expect(await rows.count(), '付款申请列表应真实渲染至少 20 行').toBeGreaterThanOrEqual(20);
      const marker = initialItems.find(row => createdRequestIds.has(row.id));
      if (!marker) throw new Error('付款申请首屏没有本用例自建行，无法验证刷新渲染');
      expect(marker.payment_method, '初始响应付款方式').toBe('银行转账');
      const markerRow = rows.filter({ has: page.getByText(marker.request_no, { exact: true }) });
      await expect(markerRow, '刷新标记行必须唯一').toHaveCount(1);
      await expect(markerRow.locator('td').nth(5)).toHaveText('银行转账');
      const updated = await apiCallRaw<PaymentRequestRow>(
        page,
        'PUT',
        `/ap/payment-requests/${marker.id}`,
        { payment_method: '现金支付' }
      );
      expect(updated.id, '仅更新本用例自建行').toBe(marker.id);
      expect(updated.payment_method, '真实更新响应').toBe('现金支付');
      await expect(markerRow.locator('td').nth(5), '手动刷新前仍显示旧值').toHaveText('银行转账');

      const scroller = page.locator('.main-content').first();
      await scroller.waitFor({ state: 'visible', timeout: 30_000 });
      const metrics = await scroller.evaluate(el => ({
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
      expect(
        metrics.scrollHeight,
        `主内容区应可滚动（scrollHeight=${metrics.scrollHeight}, clientHeight=${metrics.clientHeight}）`
      ).toBeGreaterThan(metrics.clientHeight);
      await scroller.evaluate(el => {
        el.scrollTop = el.scrollHeight - el.clientHeight;
      });
      const before = await scroller.evaluate(el => el.scrollTop);
      expect(before, '滚到底后 .main-content scrollTop 必须 > 0').toBeGreaterThan(0);

      // Playwright 原生 click() 会先把按钮滚入视口，把 .main-content 的 scrollTop 归零从而污染基线；
      // 这里派发真实 DOM click 事件（仍走 Vue @click → fetchRequests → 真实 GET），不改变滚动位置，
      // 也不是 mock。
      const refreshButton = page
        .locator('.payment-request-tab')
        .first()
        .getByRole('button', { name: '刷新' });
      await expect(refreshButton, '付款申请 tab 应有且仅有一个刷新按钮').toHaveCount(1);
      const refreshResponse = page.waitForResponse(isPaymentRequestListGet, { timeout: 30_000 });
      await refreshButton.dispatchEvent('click');
      const refreshed: Response = await refreshResponse;
      expect(refreshed.status(), '刷新触发的 GET /ap/payment-requests 应 200').toBe(200);
      const refreshedBody = (await refreshed.json()) as { data: { items: PaymentRequestRow[] } };
      const refreshedItems = refreshedBody.data.items;
      expect(Array.isArray(refreshedItems), '刷新响应应返回 data.items 数组').toBe(true);
      expect(refreshedItems.length, '刷新响应 data.items 应至少 20 条').toBeGreaterThanOrEqual(20);
      expect(
        refreshedItems.find(row => row.id === marker.id),
        '刷新响应应含已更新的自建行'
      ).toMatchObject({
        id: marker.id,
        request_no: marker.request_no,
        payment_method: '现金支付',
      });
      await expect(markerRow.locator('td').nth(5), '新响应必须实际渲染后才测量滚动').toHaveText(
        '现金支付'
      );
      await expect(table.locator('.el-loading-mask')).toBeHidden();

      await expect(rows.first(), '刷新后表格行应回到可见').toBeVisible({ timeout: 30_000 });
      expect(await rows.count(), '刷新后列表仍应至少 20 行').toBeGreaterThanOrEqual(20);
      const after = await scroller.evaluate(el => el.scrollTop);
      expect(after, '刷新后 .main-content 仍应保持滚动位置（>0）').toBeGreaterThan(0);
      expect(
        Math.abs(after - before),
        `刷新前后 scrollTop 偏差应 ≤2px（before=${before}, after=${after}）`
      ).toBeLessThanOrEqual(2);

      // 次级判据：刷新后仍有一行落在主内容区可视范围内，避免只凭 scrollTop 数字通过。
      const scrollerBox = await scroller.boundingBox();
      const rowBoxes = await rows.evaluateAll(elements =>
        elements.map(element => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        })
      );
      if (!scrollerBox) {
        throw new Error('刷新后主内容区无测量盒子，滚动保持无法核验');
      }
      expect(
        rowBoxes.some(
          row => row.top < scrollerBox.y + scrollerBox.height && row.bottom > scrollerBox.y
        ),
        '刷新后主内容区仍应显示至少一行列表数据'
      ).toBe(true);
    } finally {
      for (const item of cleanup.slice().reverse()) {
        await tryCleanup(page, 'DELETE', item.path, item.label);
      }
    }
  });
});
