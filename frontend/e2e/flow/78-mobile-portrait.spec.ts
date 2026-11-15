import { test, expect, type Page } from '../diagnose-fixture';
import { randomUUID } from 'node:crypto';
import { loginViaUI, BASE_URL, apiCall, tryCleanup } from './helpers';

/**
 * 移动端竖屏布局与操作锁（补 CI 桌面视口测不到移动端的盲区）
 *
 * 视口取国内 2025 中高端手机竖屏代表（物理像素除以 DPR 得 CSS 逻辑像素）：360x780（华为/小米/
 * 红米 1080x2340@3，最严档）、393x852（iPhone 15/16 系）、412x915（高端 Android 旗舰 1080x2400
 * 与 1440x3200@3.5 的常见 CSS 宽），另含 320x640 窄屏边界。断言列表页族在这四档竖屏下：
 * - 整页文档不横向溢出撑破（documentElement.scrollWidth 不超过 clientWidth，容差 2px）；
 *   el-table 列多时靠其内部横向滚动（el-main 自带 overflow:auto），不撑大文档宽，故本判定只针对
 *   整页被固定宽元素/头部撑破这一真缺陷，不误伤"表格内部可滑"的正常移动端形态；
 * - 主内容区已渲染（非白屏）；
 * - 移动端导航可操作（汉堡按钮可见且能开合侧边抽屉）。
 *
 * 说明：表格列挤压后的"字是否可读"（症状四）属内容排版，不体现在文档溢出上，仍由逐表 min-width
 * 批单独处理；本测锁的是"布局是否撑破整屏 + 移动端导航是否可用"。
 */

const MOBILE_VIEWPORTS = [
  { name: '320x640', width: 320, height: 640 },
  { name: '360x780', width: 360, height: 780 },
  { name: '393x852', width: 393, height: 852 },
  { name: '412x915', width: 412, height: 915 },
];

const LIST_PAGES = [
  { route: '/sales', label: '销售订单' },
  { route: '/purchase', label: '采购单' },
  { route: '/inventory', label: '库存' },
  { route: '/customer', label: '客户' },
  { route: '/supplier', label: '供应商' },
  { route: '/product', label: '产品' },
  { route: '/finance', label: '财务' },
];

async function measureDocumentOverflowX(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

for (const vp of MOBILE_VIEWPORTS) {
  test.describe(`移动端竖屏 ${vp.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await loginViaUI(page);
    });

    test('汉堡可开合侧边抽屉（移动端导航可操作）', async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});

      const hamburger = page.locator('.hamburger-btn');
      await expect(hamburger, `${vp.name} 竖屏应以汉堡按钮替代固定侧栏`).toBeVisible();
      await hamburger.click();

      const drawer = page.locator('.el-drawer').first();
      await expect(drawer, `${vp.name} 点击汉堡应打开侧边导航抽屉`).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(drawer, `${vp.name} Escape 应真实关闭导航抽屉`).toBeHidden();
    });

    test('手机搜索面板可输入、关闭并在桌面断点清理', async ({ page }) => {
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
      const search = page.getByRole('button', { name: '打开全局搜索', exact: true });
      const panel = page.getByRole('dialog', { name: '全局搜索', exact: true });
      const drawer = page.getByRole('dialog', { name: '系统导航菜单', exact: true });

      await test.step('搜索入口可见且触控尺寸为 44×44', async () => {
        const title = page.locator('.mobile-current-title');
        await expect(title, '手机保留当前页标识').toBeVisible();
        await expect(title).toHaveText(/\S/);
        await expect(page.locator('.header .el-breadcrumb')).toHaveCount(0);
        await expect(search, `${vp.name} 手机应显示搜索入口`).toBeVisible();
        await expect(search, '搜索入口应有中文 title').toHaveAttribute('title', '打开全局搜索');
        await expect(search, '未打开时 expanded 应为 false').toHaveAttribute(
          'aria-expanded',
          'false'
        );
        const box = await search.boundingBox();
        expect(box?.width, '搜索按钮宽度应为 44px').toBe(44);
        expect(box?.height, '搜索按钮高度应为 44px').toBe(44);
        for (const control of [
          search,
          page.locator('.hamburger-btn'),
          page.locator('.theme-toggle-btn'),
        ]) {
          await expect(control).toBeVisible();
          const bounds = await control.boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(vp.width);
        }
        expect(await measureDocumentOverflowX(page)).toBeLessThanOrEqual(2);
      });

      await test.step('打开唯一面板并验证输入控件（不代表搜索成功）及关闭', async () => {
        await search.click();
        await expect(panel, '应打开搜索面板').toBeVisible();
        await expect(page.getByRole('dialog'), '只应有一个可见 dialog').toHaveCount(1);
        await expect(drawer, '搜索期间侧栏应关闭').toBeHidden();
        await expect(search, '打开时 expanded 应为 true').toHaveAttribute('aria-expanded', 'true');
        const input = panel.getByRole('combobox');
        await input.fill('a');
        await expect(input, '搜索输入框应接受输入').toHaveValue('a');
        await panel.getByRole('button', { name: /关闭|close/i }).click();
        await expect(panel, '关闭按钮应关闭搜索面板').toBeHidden();
        await expect(search, '关闭后 expanded 应恢复 false').toHaveAttribute(
          'aria-expanded',
          'false'
        );
      });

      await test.step('Escape 关闭搜索，侧栏仍能独立打开与关闭', async () => {
        await search.click();
        await expect(panel, '再次打开搜索面板').toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel, 'Escape 应关闭搜索面板').toBeHidden();
        await page.getByRole('button', { name: '展开或收起侧边栏菜单' }).click();
        await expect(drawer, '搜索关闭后可打开侧栏').toBeVisible();
        await expect(panel, '侧栏打开时搜索应保持关闭').toBeHidden();
        await page.keyboard.press('Escape');
        await expect(drawer, 'Escape 应关闭侧栏').toBeHidden();
      });

      await test.step('左右非对称安全区内弹窗与输入框均不溢出', async () => {
        for (const [left, right] of [
          [0, 0],
          [28, 4],
          [4, 28],
        ]) {
          console.log(`[mobile-search] ${vp.name} safe-left=${left}, safe-right=${right}`);
          await page.evaluate(
            ({ left, right }) => {
              document.documentElement.style.setProperty('--bx-safe-left', `${left}px`);
              document.documentElement.style.setProperty('--bx-safe-right', `${right}px`);
            },
            { left, right }
          );
          await search.click();
          await expect(panel).toBeVisible();
          await expect(async () => {
            const box = await panel.boundingBox();
            expect(box).not.toBeNull();
            expect(box!.x).toBeGreaterThanOrEqual(16 + left - 1);
            expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width - 16 - right + 1);
            expect(box!.width).toBeCloseTo(Math.min(480, vp.width - 32 - left - right), 0);
            const inputBox = await panel.getByRole('combobox').boundingBox();
            expect(inputBox).not.toBeNull();
            expect(inputBox!.x).toBeGreaterThanOrEqual(box!.x);
            expect(inputBox!.x + inputBox!.width).toBeLessThanOrEqual(box!.x + box!.width);
          }).toPass();
          await page.keyboard.press('Escape');
          await expect(panel).toBeHidden();
        }
        await page.evaluate(() => {
          document.documentElement.style.removeProperty('--bx-safe-left');
          document.documentElement.style.removeProperty('--bx-safe-right');
        });
      });

      await test.step('1280 桌面恢复搜索且返回手机不残留弹层', async () => {
        await search.click();
        await expect(panel, '切换断点前搜索面板已打开').toBeVisible();
        await page.setViewportSize({ width: 1280, height: 900 });
        await expect(panel, '桌面断点应关闭手机搜索面板').toBeHidden();
        await expect(search, '桌面应隐藏手机搜索入口').toBeHidden();
        await expect(page.locator('.header .el-breadcrumb')).toBeVisible();
        await expect(page.locator('.mobile-current-title')).toHaveCount(0);
        await expect(
          page.locator('.header-search').getByRole('combobox'),
          '恢复桌面搜索'
        ).toBeVisible();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await expect(search, '返回手机应恢复入口').toBeVisible();
        await expect(search, '返回手机不应残留展开状态').toHaveAttribute('aria-expanded', 'false');
        await expect(panel, '返回手机面板仍应关闭').toBeHidden();
      });
    });

    test('真实客户搜索选择及同路径 query 历史导航收起面板', async ({ page }) => {
      const name = `MobileSearch${randomUUID().replaceAll('-', '')}`;
      let id: number | undefined;
      try {
        console.log('[mobile-search] 创建真实客户');
        const created = await apiCall<{ id: number }>(page, 'POST', '/customers', {
          customer_name: name,
          status: 'active',
        });
        expect(created.data?.id, '客户创建必须返回真实 id').toBeGreaterThan(0);
        id = created.data!.id;
        await expect
          .poll(
            async () => {
              const result = await apiCall<{ hits: { id: number; name: string }[] }>(
                page,
                'GET',
                `/search/customers?q=${encodeURIComponent(name)}`
              );
              console.log(`[mobile-search] 索引查询 id=${id}`);
              return result.data!.hits.some(hit => hit.id === id && hit.name === name);
            },
            { timeout: 30000, intervals: [250, 500, 1000] }
          )
          .toBe(true);

        await page.goto(`${BASE_URL}/customer`, { waitUntil: 'domcontentloaded' });
        const search = page.getByRole('button', { name: '打开全局搜索', exact: true });
        const panel = page.getByRole('dialog', { name: '全局搜索', exact: true });
        await search.click();
        await panel.getByRole('combobox').fill(name);
        const option = page.getByRole('option').filter({ hasText: name });
        await expect(option, '真实索引客户必须出现在 UI，不以单字符输入代替搜索').toBeVisible();
        await option.click();
        await expect(page).toHaveURL(`${BASE_URL}/customer?id=${id}`);
        await expect(panel, '选择客户后应收起搜索面板').toBeHidden();
        console.log(`[mobile-search] 已选择客户 id=${id}，检查同路径 query 回退`);
        await search.click();
        await expect(panel).toBeVisible();
        await page.goBack();
        await expect(page).toHaveURL(`${BASE_URL}/customer`);
        await expect(panel, '仅 query 变化也应通过 fullPath watcher 收起面板').toBeHidden();
        await expect(search).toHaveAttribute('aria-expanded', 'false');
      } finally {
        if (id !== undefined) {
          await tryCleanup(page, 'DELETE', `/customers/${id}`, '清理真实搜索客户');
        }
      }
    });

    for (const p of LIST_PAGES) {
      test(`${p.label} ${p.route} 无横向溢出且主区渲染`, async ({ page }) => {
        await page.goto(`${BASE_URL}${p.route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(200);

        const main = page.locator('.el-main');
        await expect(main.first(), `${p.route} 主内容区应已渲染（非白屏）`).toBeVisible();

        const overflow = await measureDocumentOverflowX(page);
        expect(
          overflow,
          `${p.label}(${p.route}) 在 ${vp.name} 竖屏不应整页横向溢出撑破，实测 ${overflow}px`
        ).toBeLessThanOrEqual(2);
      });
    }
  });
}
