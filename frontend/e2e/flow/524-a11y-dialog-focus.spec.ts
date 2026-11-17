// 弹窗焦点管理端到端验证
// 覆盖用户新建弹窗打开时焦点进入弹窗内部，以及取消、按键关闭后焦点回到触发按钮。
import { test, expect, type Page } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';

// 判断当前焦点是否落在弹窗内部：只判祖先关系，不绑定具体控件，
// 避免组件内部可聚焦元素顺序变化造成脆弱断言。
const isFocusInsideDialog = async (page: Page): Promise<boolean> =>
  await page.evaluate(() => Boolean(document.activeElement?.closest('.el-dialog')));

test.describe('弹窗焦点管理', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible({ timeout: 30000 });
  });

  // 打开新建用户弹窗：点击页头触发按钮并等待弹窗可见，后续断言再判焦点。
  const openCreateDialog = async (page: Page) => {
    await page.getByRole('button', { name: '新建用户' }).click();
    const dialog = page.locator('.el-dialog');
    await expect(dialog).toBeVisible({ timeout: 30000 });
    return dialog;
  };

  test('打开弹窗后焦点进入弹窗内部', async ({ page }) => {
    await openCreateDialog(page);
    // 弹窗过渡动画期间焦点可能尚未落位，用轮询等待焦点真正进入弹窗。
    await expect
      .poll(async () => await isFocusInsideDialog(page), {
        message: '弹窗打开后焦点应落在弹窗内部',
        timeout: 10000,
      })
      .toBeTruthy();
  });

  test('取消关闭后焦点回到新建用户按钮', async ({ page }) => {
    const dialog = await openCreateDialog(page);
    await dialog.getByRole('button', { name: '取消' }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
    await expect(page.getByRole('button', { name: '新建用户' })).toBeFocused({ timeout: 10000 });
  });

  test('按 Esc 键关闭后焦点回到新建用户按钮', async ({ page }) => {
    const dialog = await openCreateDialog(page);
    // 先确认焦点已在弹窗内，保证按键关闭由弹窗自身处理而非页面其他监听。
    await expect
      .poll(async () => await isFocusInsideDialog(page), {
        message: '弹窗打开后焦点应落在弹窗内部',
        timeout: 10000,
      })
      .toBeTruthy();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 30000 });
    await expect(page.getByRole('button', { name: '新建用户' })).toBeFocused({ timeout: 10000 });
  });
});
