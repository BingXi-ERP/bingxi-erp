// 4.34 无障碍与可访问性专项 —— 深色模式切换与刷新持久化。
// 功能：验证主题切换按钮写入 html.dark 与 data-theme，并在刷新后由 onMounted 从 localStorage 恢复，
//   补 523/524 仅覆盖键盘与弹窗焦点、未覆盖深色模式的缺口。
// 调用方：Playwright 分片（frontend/playwright.config.ts）；依赖 diagnose-fixture 登录会话。
// 入参：无外部入参；主题键与 useTheme.ts 的 STORAGE_KEY 保持一致。
// 传给谁：点击 .theme-toggle-btn 触发 MainLayout 的 toggleTheme；断言交给 readThemeDom 读取真实 DOM。
// 存什么：断言 DOM 类名、data-theme 属性与 localStorage 值，不做零值兜底。
// 存哪里：断言与日志进测试报告，主题值写入浏览器 localStorage（不写业务库）。
import { test, expect, type Page } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';

const THEME_STORAGE_KEY = 'bx-erp-theme';

const readThemeDom = (page: Page) =>
  page.evaluate(() => ({
    darkClass: document.documentElement.classList.contains('dark'),
    dataTheme: document.documentElement.getAttribute('data-theme'),
  }));

const setStoredTheme = (page: Page, mode: 'light' | 'dark') =>
  page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: THEME_STORAGE_KEY,
    value: mode,
  });

const readStoredTheme = (page: Page) =>
  page.evaluate(key => localStorage.getItem(key), THEME_STORAGE_KEY);

test.describe('深色模式（4.34）', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
    await expect(page.locator('.theme-toggle-btn').first()).toBeVisible({ timeout: 30000 });
  });

  test('点击切换按钮写入深色标记并在刷新后恢复', async ({ page }) => {
    await setStoredTheme(page, 'light');
    await page.reload();
    const toggle = page.locator('.theme-toggle-btn').first();
    await expect(toggle).toBeVisible({ timeout: 30000 });

    await toggle.click();
    await expect.poll(async () => (await readThemeDom(page)).darkClass).toBe(true);
    await expect.poll(async () => (await readThemeDom(page)).dataTheme).toBe('dark');
    expect(await readStoredTheme(page), '切换后 localStorage 应记 dark').toBe('dark');

    await page.reload();
    await expect
      .poll(async () => (await readThemeDom(page)).darkClass, '刷新后仍应深色')
      .toBe(true);
    await expect.poll(async () => (await readThemeDom(page)).dataTheme).toBe('dark');
  });

  test('预置深色后加载即应用并可切回亮色', async ({ page }) => {
    await setStoredTheme(page, 'dark');
    await page.reload();
    await expect
      .poll(async () => (await readThemeDom(page)).darkClass, 'onMounted 应加载已存深色')
      .toBe(true);

    await page.locator('.theme-toggle-btn').first().click();
    await expect.poll(async () => (await readThemeDom(page)).darkClass).toBe(false);
    await expect.poll(async () => (await readThemeDom(page)).dataTheme).toBe('light');
    expect(await readStoredTheme(page), '切回后 localStorage 应记 light').toBe('light');
  });
});
