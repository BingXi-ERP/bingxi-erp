import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  BASE_URL,
  apiCall,
  apiCallRaw,
  getCtx,
  ensureTestEntities,
  tryCleanup,
} from './helpers';

test.describe('前端状态显示与业务逻辑验证', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('采购订单列表：状态标签颜色映射', async ({ page }) => {
    const ctx = getCtx();
    const warehouseId = ctx.warehouseIds[0];
    const departmentId = ctx.departmentIds[0];
    for (const [label, value] of Object.entries({
      supplierId: ctx.supplierId,
      materialId: ctx.quotationProductId,
      warehouseId,
      departmentId,
    })) {
      expect(Number.isInteger(value), `${label} 必须是整数 ID`).toBe(true);
      expect(value, `${label} 必须是正整数 ID`).toBeGreaterThan(0);
    }

    // 与「金额千分位格式化显示」同源的建单 DTO：1 行 / 1 米 / 1234.56 / 税率 0。
    // A/B/C 三支草稿同参数，仅 notes 末尾字母不同（可判创建顺序）；备注与取消原因带 E2E 标识。
    const e2eTag = `E2E 状态标签颜色映射 ${Date.now()}`;
    const orderBody = (notes: string) => ({
      supplier_id: ctx.supplierId,
      warehouse_id: warehouseId,
      department_id: departmentId,
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          material_id: ctx.quotationProductId,
          quantity_ordered: '1',
          unit_price: '1234.56',
          tax_rate: 0,
          discount_percent: 0,
        },
      ],
      notes,
    });
    type SelfOrder = { id: number; orderNo: string; label: string };
    const created: SelfOrder[] = [];

    try {
      for (const label of ['A', 'B', 'C']) {
        const result = await apiCall<{ id: number; order_no: string }>(
          page,
          'POST',
          '/purchase/orders',
          orderBody(`${e2eTag} ${label}`)
        );
        const { id, order_no: orderNo } = result.data;
        expect(Number.isInteger(id), `订单 ${label} ID 必须是整数`).toBe(true);
        expect(id, `订单 ${label} ID 必须为正`).toBeGreaterThan(0);
        expect(typeof orderNo, `订单 ${label} 订单号必须是字符串`).toBe('string');
        expect(orderNo.trim().length, `订单 ${label} 订单号不得为空`).toBeGreaterThan(0);
        created.push({ id, orderNo, label });
      }
      const [a, b, c] = created;
      expect(new Set(created.map(o => o.orderNo)).size, '三支自建订单号必须互不相同').toBe(3);

      const readStatus = async (order: SelfOrder, expected: string) => {
        const detail = await apiCallRaw<{ status: string }>(
          page,
          'GET',
          `/purchase/orders/${order.id}`
        );
        expect(
          detail.status,
          `订单 ${order.label} ${order.orderNo} 应回读为 ${expected}，实际 ${detail.status}`
        ).toBe(expected);
      };

      await readStatus(a, 'DRAFT');

      // B：DRAFT --submit--> PENDING_APPROVAL（本轮停在待审批）。
      await apiCall(page, 'POST', `/purchase/orders/${b.id}/submit`);
      await readStatus(b, 'PENDING_APPROVAL');

      // C：DRAFT --submit--> PENDING_APPROVAL --cancel(含 E2E 标识的原因)--> CANCELLED。
      await apiCall(page, 'POST', `/purchase/orders/${c.id}/submit`);
      await readStatus(c, 'PENDING_APPROVAL');
      await apiCall(page, 'POST', `/purchase/orders/${c.id}/cancel`, {
        reason: `${e2eTag} 取消状态映射自建单 C`,
      });
      await readStatus(c, 'CANCELLED');

      await page.goto(`${BASE_URL}/purchase`);
      const filter = page.locator('.filter-card:visible');
      const keywordInput = filter.locator('input[placeholder="订单号/供应商名"]:visible');
      const queryBtn = filter.getByRole('button', { name: '查询', exact: true });

      // 沿用表头逐字匹配定位「订单状态」列：付款状态列也渲染 el-tag（且为空文本），
      // 不能用 .el-table .el-tag 前缀命中；列缺失/文案漂移按真实缺陷判负。
      const headerCells = page.locator('.el-table__header-wrapper th .cell');
      await headerCells.first().waitFor({ state: 'visible' });
      const headerCount = await headerCells.count();
      let statusColIdx = -1;
      for (let i = 0; i < headerCount; i++) {
        const text = ((await headerCells.nth(i).textContent()) ?? '').trim();
        if (text === '订单状态') {
          statusColIdx = i;
          break;
        }
      }
      expect(statusColIdx, '[状态映射] 未定位到"订单状态"列（表头逐字符匹配失败）').not.toBe(-1);

      const expectations = [
        { order: a, status: 'DRAFT', typeClass: 'el-tag--info', text: '草稿' },
        { order: b, status: 'PENDING_APPROVAL', typeClass: 'el-tag--warning', text: '待审批' },
        { order: c, status: 'CANCELLED', typeClass: 'el-tag--danger', text: '已取消' },
      ];
      const allTypeClasses = [
        'el-tag--success',
        'el-tag--warning',
        'el-tag--info',
        'el-tag--danger',
      ];

      for (const { order, status, typeClass, text } of expectations) {
        // 每支订单各自按订单号精确查询（keyword 回包断言），不依赖清空/宽松匹配。
        await keywordInput.fill(order.orderNo);
        const [response] = await Promise.all([
          page.waitForResponse(res => {
            const url = new URL(res.url());
            return (
              res.request().method() === 'GET' &&
              url.pathname === '/api/v1/erp/purchase/orders' &&
              url.searchParams.get('keyword') === order.orderNo
            );
          }),
          queryBtn.click(),
        ]);
        expect(response.status(), `订单 ${order.label} 查询应返回 200`).toBe(200);
        const body = await response.json();
        expect(body.data.total, `订单 ${order.orderNo} 精确查询应只命中 1 条`).toBe(1);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].id).toBe(order.id);
        expect(body.data.items[0].order_no).toBe(order.orderNo);
        expect(body.data.items[0].status, `订单 ${order.label} 列表出参状态`).toBe(status);

        const row = page
          .locator('.el-table__body-wrapper .el-table__row:visible')
          .filter({ has: page.getByText(order.orderNo, { exact: true }) });
        await expect(row, `订单 ${order.label} 应且仅应渲染 1 行`).toHaveCount(1);
        const statusTag = row.locator('td').nth(statusColIdx).locator('.el-tag');
        await expect(statusTag, `订单 ${order.label} 订单状态列应且仅应有 1 个 el-tag`).toHaveCount(
          1
        );
        await expect(statusTag, `订单 ${order.label} 订单状态文案`).toHaveText(text);
        const classTokens = ((await statusTag.getAttribute('class')) ?? '')
          .trim()
          .split(' ')
          .filter(Boolean);
        expect(classTokens, `订单 ${order.label} 应是 el-tag`).toContain('el-tag');
        expect(classTokens, `订单 ${order.label} 应精确带 ${typeClass}`).toContain(typeClass);
        for (const other of allTypeClasses) {
          if (other !== typeClass) {
            expect(classTokens, `订单 ${order.label} 不得同时带 ${other}`).not.toContain(other);
          }
        }
      }
    } finally {
      // 仅草稿可删除，其他状态的清理拒绝由 tryCleanup 显式记录。
      for (const order of created) {
        await tryCleanup(
          page,
          'DELETE',
          `/purchase/orders/${order.id}`,
          `状态映射自建采购单 ${order.label} ${order.orderNo}`
        );
      }
    }
  });

  test('金额千分位格式化显示', async ({ page }) => {
    const ctx = getCtx();
    const warehouseId = ctx.warehouseIds[0];
    const departmentId = ctx.departmentIds[0];
    for (const [label, value] of Object.entries({
      supplierId: ctx.supplierId,
      materialId: ctx.quotationProductId,
      warehouseId,
      departmentId,
    })) {
      expect(Number.isInteger(value), `${label} 必须是整数 ID`).toBe(true);
      expect(value, `${label} 必须是正整数 ID`).toBeGreaterThan(0);
    }

    const created = await apiCall<{
      id: number;
      order_no: string;
      total_amount: string;
    }>(page, 'POST', '/purchase/orders', {
      supplier_id: ctx.supplierId,
      warehouse_id: warehouseId,
      department_id: departmentId,
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          material_id: ctx.quotationProductId,
          quantity_ordered: '1',
          unit_price: '1234.56',
          tax_rate: 0,
          discount_percent: 0,
        },
      ],
    });
    const { id, order_no: orderNo } = created.data;
    expect(Number.isInteger(id), '自建采购订单 ID 必须是整数').toBe(true);
    expect(id, '自建采购订单 ID 必须为正').toBeGreaterThan(0);

    try {
      expect(typeof orderNo).toBe('string');
      expect(orderNo.trim().length, '自建采购订单号不得为空').toBeGreaterThan(0);
      // 服务按 round_dp(2) 计算，订单 total_amount 为 Decimal(18, 2)，JSON 必须是字符串。
      expect(typeof created.data.total_amount).toBe('string');
      expect(created.data.total_amount).toBe('1234.56');

      const detail = await apiCallRaw<{
        id: number;
        order_no: string;
        total_amount: string;
      }>(page, 'GET', `/purchase/orders/${id}`);
      expect(detail.id).toBe(id);
      expect(detail.order_no).toBe(orderNo);
      expect(typeof detail.total_amount).toBe('string');
      expect(detail.total_amount).toBe('1234.56');

      await test.step(`进入采购页并查询自建订单 ${orderNo}`, async () => {
        await page.goto(`${BASE_URL}/purchase`);
        const filter = page.locator('.filter-card:visible');
        await filter.locator('input[placeholder="订单号/供应商名"]:visible').fill(orderNo);
        const [response] = await Promise.all([
          page.waitForResponse(res => {
            const url = new URL(res.url());
            return (
              res.request().method() === 'GET' &&
              url.pathname === '/api/v1/erp/purchase/orders' &&
              url.searchParams.get('keyword') === orderNo
            );
          }),
          filter.getByRole('button', { name: '查询', exact: true }).click(),
        ]);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.data.total).toBe(1);
        expect(body.data.items).toHaveLength(1);
        expect(body.data.items[0].id).toBe(id);
        expect(body.data.items[0].order_no).toBe(orderNo);
        expect(typeof body.data.items[0].total_amount).toBe('string');
        expect(body.data.items[0].total_amount).toBe('1234.56');
      });

      await test.step(`订单 ${orderNo} 的金额必须精确显示 ¥1,234.56`, async () => {
        const row = page
          .locator('.el-table__body-wrapper .el-table__row:visible')
          .filter({ has: page.getByText(orderNo, { exact: true }) });
        await expect(row).toHaveCount(1);
        await expect(row.locator('.amount')).toBeVisible();
        await expect(row.locator('.amount')).toHaveText('¥1,234.56');
      });
    } finally {
      await tryCleanup(page, 'DELETE', `/purchase/orders/${id}`, '金额千分位自建采购草稿');
    }
  });

  test('日期格式化显示为 YYYY-MM-DD', async ({ page }) => {
    // 先确保至少存在一笔采购订单（本用例自建数据，不依赖其他用例/分片），
    // 空表格没有日期单元格可断言
    const ctx = getCtx();
    const list = await apiCallRaw<{ items: Array<{ id: number }> }>(
      page,
      'GET',
      '/purchase/orders?page=1&page_size=1'
    );
    if ((list.items?.length ?? 0) === 0) {
      await apiCall(page, 'POST', '/purchase/orders', {
        supplier_id: ctx.supplierId,
        warehouse_id: ctx.warehouseIds[0] || 1,
        department_id: ctx.departmentIds[0] || 1,
        order_date: new Date().toISOString().slice(0, 10),
        items: [
          {
            material_id: ctx.productIds[0] || 1,
            quantity_ordered: '10',
            unit_price: '9.90',
            tax_rate: 13,
          },
        ],
        notes: 'E2E 日期格式显示验证',
      });
    }

    await page.goto(`${BASE_URL}/purchase`);
    await page.waitForTimeout(3000);

    await page
      .locator(
        '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    const cells = page.locator('.el-table__body td');
    const cellCount = await cells.count();

    let foundDate = false;
    for (let i = 0; i < Math.min(cellCount, 30); i++) {
      const text = await cells.nth(i).textContent();
      if (text && text.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/)) {
        foundDate = true;
        break;
      }
    }
    expect(foundDate).toBeTruthy();
  });

  test('权限不足时按钮行为验证', async ({ page }) => {
    // admin 用户应能看到所有操作按钮
    await page.goto(`${BASE_URL}/purchase`);
    await page.waitForTimeout(3000);

    await page
      .locator('.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-card')
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    // 验证新建按钮可见（admin 有全部权限）
    const newBtn = page.locator('button:has-text("新建采购单")').first();
    await newBtn.waitFor({ state: 'visible', timeout: 5000 });
    const newBtnVisible = await newBtn.isVisible();
    expect(newBtnVisible).toBe(true);
  });

  test('空数据时 el-empty 或空表格展示', async ({ page }) => {
    // 该用例不能假设 /voucher 天然为空：ensureTestEntities/其它用例可能已建凭证，
    // 空态块自然永不出现 → 原 waitFor 超时。正确做法：用一个必然无匹配的凭证号
    // 触发查询，使列表进入"真实空态"（后端返回 0 行 → ElTable 渲染空块），再断言空块。
    const noMatch = `ZZZ-NO-MATCH-${Date.now().toString().slice(-8)}`;
    await page.goto(`${BASE_URL}/voucher`);
    await page.waitForTimeout(3000);

    const table = page
      .locator(
        '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
      )
      .first();
    await table.waitFor({ state: 'visible', timeout: 15_000 });

    // 凭证号筛选框（VoucherListFilter.vue placeholder=凭证号）+ 查询按钮（文本"查询"）
    const noInput = page.getByPlaceholder('凭证号').first();
    await noInput.waitFor({ state: 'visible', timeout: 5000 });
    await noInput.fill(noMatch);
    await page.getByRole('button', { name: '查询' }).first().click();

    // 后端返回空 → ElTable 空态块（.el-table__empty-block/.el-table__empty-text）出现
    const emptyBlock = page
      .locator('.el-table__empty-block, .el-table__empty-text, .el-empty')
      .first();
    await emptyBlock.waitFor({ state: 'visible', timeout: 10_000 });
    const emptyText = await emptyBlock.textContent();
    expect((emptyText ?? '').trim().length, '空态块应渲染占位文案').toBeGreaterThan(0);
  });

  test('加载完成后内容可见', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(3000);

    const content = page.locator('.dashboard-container, .el-card, .el-row').first();
    await content.waitFor({ state: 'visible', timeout: 10_000 });
    const contentVisible = await content.isVisible();
    expect(contentVisible).toBe(true);
  });

  test('响应式布局：窄屏不崩溃', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(3000);

    // 验证页面在窄屏下不崩溃
    const body = page.locator('body');
    await body.waitFor({ state: 'visible', timeout: 10_000 });
    const bodyVisible = await body.isVisible();
    expect(bodyVisible).toBe(true);

    // 恢复宽屏
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
  });

  test('消息提示自动消失', async ({ page }) => {
    await page.goto(`${BASE_URL}/purchase`);
    await page.waitForTimeout(3000);

    await page
      .locator(
        '.el-table, .el-table-v2, [role="table"], .v2-table-wrapper, .el-table-v2, [role="table"], .v2-table-wrapper'
      )
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 });

    // 触发点用"导出"而非"查询"：usePurchList.handleQuery 仅调 fetchData，
    // 而 fetchData 只在 catch 分支弹 ElMessage.error（成功路径不弹），后端健康时
    // 点查询永不出消息 → .el-message waitFor 超时（本用例原失败根因）。
    // 导出 exportFromBackend 成功走 msg.exportOk、失败走 msg.error（utils/export.ts），
    // 两条路径都经 ElMessage 弹出且不改业务数据，是验证提示行为的稳定触发点。
    const exportBtn = page.locator('button:has-text("导出")').first();
    await exportBtn.waitFor({ state: 'visible', timeout: 5000 });
    await exportBtn.click();

    // ElMessage 出现在页面顶部
    const message = page.locator('.el-message').first();
    await message.waitFor({ state: 'visible', timeout: 5000 });
    expect(await message.isVisible(), '导出应弹出 ElMessage 提示').toBe(true);

    // ElMessage 未显式设 duration（默认 3000ms），到期自动移除——断言其自动消失
    await message.waitFor({ state: 'hidden', timeout: 10_000 });
    expect(await message.isVisible(), '消息提示应在默认时长后自动消失').toBe(false);
  });
});
