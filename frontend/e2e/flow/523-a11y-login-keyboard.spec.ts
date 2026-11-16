import { test, expect, type Page, type Locator } from '../diagnose-fixture';
import { safeGoto } from './ui-helpers';
import { testUsername, testPassword } from './helpers';

// 连续 Tab 的上限：覆盖表单内的输入框、协议勾选框、协议链接与提交按钮之间的全部可聚焦元素。
const MAX_TAB_PRESSES = 20;

// 从当前焦点起连续按 Tab，直到目标元素成为焦点即停止；超过上限由可失败断言显式报错，
// 避免把断言绑定到具体 DOM 顺序上，表单内部元素微调时不会误报。
async function tabUntilFocused(page: Page, target: Locator, description: string): Promise<void> {
  for (let press = 0; press < MAX_TAB_PRESSES; press++) {
    const isFocused = await target.evaluate(el => el === document.activeElement);
    if (isFocused) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, `${description}未能在连续 Tab 遍历中获得焦点`).toBeFocused();
}

test.describe('登录页无障碍既有能力', () => {
  // 登录页自身不需要预置登录态；预置会话会让路由守卫把页面重定向到首页，表单无从断言。
  test.use({ storageState: { cookies: [], origins: [] } });

  test('表单容器与输入框具备语义化无障碍名称', async ({ page }) => {
    await safeGoto(page, '/login');

    // 表单容器显式声明 role=form，供辅助技术识别这是一块表单区域。
    const form = page.locator('form[role="form"]');
    await expect(form, '登录表单容器应存在且唯一').toHaveCount(1);
    await expect(form, '登录表单容器应带有非空 aria-label').toHaveAttribute('aria-label', /\S/);

    // 用户名输入框的 aria-label 提供非空可访问名称，并能被角色查询直接命中。
    const usernameInput = page.locator('input[placeholder="用户名"]');
    await expect(usernameInput, '用户名输入框应存在且唯一').toHaveCount(1);
    await expect(usernameInput, '用户名输入框应带有明确的 aria-label').toHaveAttribute(
      'aria-label',
      '用户名'
    );
    await expect(
      page.getByRole('textbox', { name: '用户名', exact: true }),
      '用户名输入框应以可访问名称被识别为文本框'
    ).toHaveCount(1);

    // 密码输入框同样以 aria-label 提供非空可访问名称，且能被标签查询定位。
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput, '密码输入框应存在且唯一').toHaveCount(1);
    await expect(passwordInput, '密码输入框应带有明确的 aria-label').toHaveAttribute(
      'aria-label',
      '密码'
    );
    await expect(
      page.getByLabel('密码', { exact: true }),
      '密码输入框应以可访问名称被标签查询定位'
    ).toHaveCount(1);
  });

  test('密码输入框以遮蔽类型渲染', async ({ page }) => {
    await safeGoto(page, '/login');

    // 以 DOM 属性断言密码遮蔽，而非仅判断输入框是否可见。
    const passwordInput = page.locator('input[placeholder="密码"]');
    await expect(passwordInput, '密码输入框应存在且唯一').toHaveCount(1);
    await expect(passwordInput, '密码输入框应为遮蔽类型').toHaveAttribute('type', 'password');
  });

  test('仅用 Tab 键可依次到达用户名、密码与登录按钮', async ({ page }) => {
    await safeGoto(page, '/login');

    const usernameInput = page.getByRole('textbox', { name: '用户名', exact: true });
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.getByRole('button', { name: '登录', exact: true });

    await tabUntilFocused(page, usernameInput, '用户名输入框');
    await expect(usernameInput, 'Tab 遍历应能聚焦用户名输入框').toBeFocused();

    await tabUntilFocused(page, passwordInput, '密码输入框');
    await expect(passwordInput, '继续 Tab 应能聚焦密码输入框').toBeFocused();

    await tabUntilFocused(page, submitButton, '登录按钮');
    await expect(submitButton, '继续 Tab 应能聚焦登录按钮').toBeFocused();
  });

  test('密码框聚焦时按 Enter 可提交登录请求', async ({ page }) => {
    await safeGoto(page, '/login');

    // 表单校验要求用户名、密码非空且已同意协议，先备齐三个前置条件。
    await page.getByRole('textbox', { name: '用户名', exact: true }).fill(testUsername());
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.fill(testPassword());
    const agreementInput = page.locator('.el-checkbox input').first();
    await page.locator('.el-checkbox__inner').first().click();
    await expect(agreementInput, '用户协议复选框应处于勾选状态').toBeChecked();

    // 先注册响应捕获，再按回车，确保请求确实由键盘动作触发。
    const loginResponse = page.waitForResponse(
      resp => resp.url().includes('/auth/login') && resp.request().method() === 'POST',
      { timeout: 30000 }
    );
    await passwordInput.focus();
    await expect(passwordInput, '提交前密码输入框应持有焦点').toBeFocused();
    await page.keyboard.press('Enter');

    const response = await loginResponse;
    expect(response.request().method(), '回车提交应发出 POST 请求').toBe('POST');
    expect(response.url(), '回车提交应命中登录接口').toContain('/auth/login');
  });
});
