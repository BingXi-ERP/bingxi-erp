import type { Response } from '@playwright/test';
import { test, expect } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, tryCleanup, genCode } from '../flow/helpers';
import { gotoWithRetry } from './_goto';

type SupplierRow = { id: number; supplier_name: string };
type SupplierPage = { items: SupplierRow[]; total: number; page: number; page_size: number };

test.describe('supplier 页面冒烟测试', () => {
  test('页面加载', async ({ page }) => {
    await gotoWithRetry(page, '/supplier');
    await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .locator(
          '.el-table, .el-table-v2, .el-card, .el-form, .el-tabs, .dashboard-container, canvas, .echarts, .el-result, .error-page, .el-empty'
        )
        .first()
    ).toBeAttached({ timeout: 30_000 });
  });

  test('关键词筛选后翻到第2页，请求与页面供应商数据一致', async ({ page }) => {
    const prefix = genCode(`E2E分页-${globalThis.crypto.randomUUID()}`);
    const supplierPath = '/purchase/suppliers';
    const created: SupplierRow[] = [];
    const creditSeed = Date.now().toString();
    const matchesPage = (response: Response, pageNumber: number) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'GET' &&
        url.pathname === '/api/v1/erp/purchase/suppliers' &&
        url.searchParams.get('keyword') === prefix &&
        url.searchParams.get('page') === String(pageNumber) &&
        url.searchParams.get('page_size') === '20'
      );
    };

    try {
      console.warn('[supplier-pagination] 登录并创建21条专属供应商', { prefix });
      await loginViaUI(page);
      for (let i = 0; i < 21; i++) {
        const name = `${prefix}-${i.toString().padStart(2, '0')}`;
        const row = await apiCallRaw<SupplierRow>(page, 'POST', supplierPath, {
          supplier_name: name,
          supplier_short_name: `E2E分页${i}`,
          contact_phone: '13800000002',
          credit_code: `91${creditSeed}${i.toString().padStart(3, '0')}`,
        });
        expect(Number.isSafeInteger(row.id), '创建响应必须返回有效主键供清理').toBe(true);
        expect(row.id, '供应商主键必须为正数').toBeGreaterThan(0);
        created.push({ id: row.id, supplier_name: name });
        console.warn('[supplier-pagination] 已创建', { id: row.id, name });
      }

      const saved = await apiCallRaw<SupplierPage>(
        page,
        'GET',
        `${supplierPath}?keyword=${encodeURIComponent(prefix)}&page=1&page_size=50`
      );
      expect(saved.total, '服务端回读总数必须为21').toBe(21);
      expect(saved.items, '服务端必须返回21条实际落库数据').toHaveLength(21);
      expect(new Set(created.map(row => row.id)).size, '创建ID必须互不重复').toBe(21);
      expect(
        saved.items
          .map(({ id, supplier_name }) => ({ id, supplier_name }))
          .sort((a, b) => a.id - b.id),
        '服务端回读的全部ID与名称必须等于本用例创建集合'
      ).toEqual([...created].sort((a, b) => a.id - b.id));
      console.warn('[supplier-pagination] 21条ID及名称已独立回读确认，进入/supplier');

      await gotoWithRetry(page, '/supplier');
      const filter = page.locator('.filter-form:visible');
      await filter.locator('.el-form-item').first().locator('input').fill(prefix);
      console.warn('[supplier-pagination] 按专属前缀查询，等待第1页响应');
      const [firstResponse] = await Promise.all([
        page.waitForResponse(response => matchesPage(response, 1)),
        filter.getByRole('button', { name: '查询', exact: true }).click(),
      ]);
      expect(firstResponse.status(), '第1页请求必须成功').toBe(200);
      const firstBody = await firstResponse.json();
      expect(firstBody.code, '第1页成功信封').toBe(200);
      const first: SupplierPage = firstBody.data;
      expect(first).toMatchObject({ total: 21, page: 1, page_size: 20 });
      expect(first.items).toHaveLength(20);
      for (const row of first.items) {
        expect(created, '首屏数据必须属于自建集合').toContainEqual({
          id: row.id,
          supplier_name: row.supplier_name,
        });
      }
      const rows = page.locator('.table-card .el-table__body-wrapper .el-table__row:visible');
      const names = rows.locator('td:nth-child(2) .cell');
      await expect(rows, '首屏必须显示20条供应商').toHaveCount(20);
      await expect(names, '首屏名称必须逐行等于响应').toHaveText(
        first.items.map(row => row.supplier_name)
      );
      const pagination = page.locator('.table-card .el-pagination');
      await expect(pagination.locator('.el-pagination__total')).toHaveText('共 21 条');
      await expect(pagination.locator('.el-pager .is-active')).toHaveText('1');

      console.warn('[supplier-pagination] 首屏数据一致，点击第2页并等待精确分页请求');
      const [secondResponse] = await Promise.all([
        page.waitForResponse(response => matchesPage(response, 2), { timeout: 30_000 }),
        pagination.locator('.el-pager .number').filter({ hasText: /^2$/ }).click(),
      ]);
      expect(secondResponse.status(), '第2页请求必须成功').toBe(200);
      const secondBody = await secondResponse.json();
      expect(secondBody.code, '第2页成功信封').toBe(200);
      const second: SupplierPage = secondBody.data;
      expect(second).toMatchObject({ total: 21, page: 2, page_size: 20 });
      expect(second.items, '末页响应必须恰有1条').toHaveLength(1);
      const last = second.items[0];
      expect(created, '末页ID与名称必须属于自建集合').toContainEqual({
        id: last.id,
        supplier_name: last.supplier_name,
      });
      expect(
        first.items.map(row => row.id),
        '末页不应重复首屏数据'
      ).not.toContain(last.id);
      expect(
        [...first.items, ...second.items]
          .map(({ id, supplier_name }) => ({ id, supplier_name }))
          .sort((a, b) => a.id - b.id),
        '两页并集必须完整覆盖本用例创建的21条供应商'
      ).toEqual([...created].sort((a, b) => a.id - b.id));
      await expect(rows, '末页必须恰显示1条').toHaveCount(1);
      await expect(names, '页面名称必须等于末页真实响应').toHaveText([last.supplier_name]);
      await expect(pagination.locator('.el-pager .is-active')).toHaveText('2');
      await expect(pagination.locator('.el-pagination__total')).toHaveText('共 21 条');
      console.warn('[supplier-pagination] 第2页请求及页面数据一致', last);
    } catch (error) {
      console.error('[supplier-pagination] 验证失败', error);
      throw error;
    } finally {
      console.warn('[supplier-pagination] 开始按已创建ID清理', { count: created.length });
      for (const row of [...created].reverse()) {
        await tryCleanup(page, 'DELETE', `${supplierPath}/${row.id}`, `供应商分页 ${row.id}`);
      }
      console.warn('[supplier-pagination] 清理尝试结束；失败项由tryCleanup逐条记录');
    }
  });
});
