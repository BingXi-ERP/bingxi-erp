// 方案 4.34 无障碍承载：高频业务表单（新建报价单）的可访问名称、纯键盘可达与必填错误文案。
// 门禁口径：只用可失败断言（toHaveCount / toBeFocused / toEqual），不写 toBeTruthy 自比、
// 不用 toBeVisible 空壳、不做 ?? / || 兜底。所有中文文案逐字取自 src/locales/zh-CN.ts 的
// quotations.create.* 键，与运行值同源。
import { test, expect, type Page, type Locator } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { safeGoto } from './ui-helpers';

// 从当前焦点起只按 Tab 推进，直到目标成为焦点；超过上限由可失败断言显式报错。
// 不把断言绑定到具体 Tab 次数，布局微调配不出假红。
const MAX_TAB_PRESSES = 60;

async function tabUntilFocused(page: Page, target: Locator, description: string): Promise<void> {
  for (let press = 0; press < MAX_TAB_PRESSES; press++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, `${description}未能在连续 Tab 遍历中获得焦点`).toBeFocused();
}

test.describe('新建报价单表单无障碍', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await safeGoto(page, '/quotations/new');
    // 表单容器以 aria-label 暴露用途，getByRole('form') 只在带可访问名称时命中。
    await expect(
      page.getByRole('form', { name: '报价单创建表单', exact: true }),
      '报价单创建表单容器应以可访问名称暴露'
    ).toHaveCount(1);
  });

  test('表单容器、输入框、下拉与提交按钮具备可访问名称', async ({ page }) => {
    // el-form-item 的 label 经 <label for=inputId> 关联到 el-select 的 combobox input
    // 与 NumericInput 底层的 el-input，故 getByRole 的 name 精确取自 label 文本。
    await expect(
      page.getByRole('combobox', { name: '客户', exact: true }),
      '客户下拉应以可访问名称被识别为 combobox'
    ).toHaveCount(1);
    await expect(
      page.getByRole('combobox', { name: '币种', exact: true }),
      '币种下拉应以可访问名称被识别为 combobox'
    ).toHaveCount(1);
    await expect(
      page.getByRole('textbox', { name: '汇率', exact: true }),
      '汇率录入框应以可访问名称被识别为文本框'
    ).toHaveCount(1);
    await expect(
      page.getByRole('textbox', { name: '税率(%)', exact: true }),
      '税率录入框应以可访问名称被识别为文本框'
    ).toHaveCount(1);

    // 提交按钮的可访问名称来自按钮文本本身。
    await expect(
      page.getByRole('button', { name: '保存草稿', exact: true }),
      '保存草稿按钮应以可访问名称被识别'
    ).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: '提交审批', exact: true }),
      '提交审批按钮应以可访问名称被识别'
    ).toHaveCount(1);
  });

  test('仅用 Tab 键可依次到达关键字段与提交按钮', async ({ page }) => {
    const customer = page.getByRole('combobox', { name: '客户', exact: true });
    const priceTerms = page.getByRole('combobox', { name: '价格条款', exact: true });
    const exchangeRate = page.getByRole('textbox', { name: '汇率', exact: true });
    const taxRate = page.getByRole('textbox', { name: '税率(%)', exact: true });
    const saveDraft = page.getByRole('button', { name: '保存草稿', exact: true });

    // 每一步都只通过 Tab 推进；上一目标已持有焦点，下一目标在 DOM 顺序上更靠后，
    // 因此串联命中即证明「仅 Tab 能依次到达」，而非各自独立可达。
    await tabUntilFocused(page, customer, '客户下拉');
    await expect(customer, 'Tab 遍历应能聚焦客户下拉').toBeFocused();

    await tabUntilFocused(page, priceTerms, '价格条款下拉');
    await expect(priceTerms, '继续 Tab 应能聚焦价格条款下拉').toBeFocused();

    await tabUntilFocused(page, exchangeRate, '汇率录入框');
    await expect(exchangeRate, '继续 Tab 应能聚焦汇率录入框').toBeFocused();

    await tabUntilFocused(page, taxRate, '税率录入框');
    await expect(taxRate, '继续 Tab 应能聚焦税率录入框').toBeFocused();

    await tabUntilFocused(page, saveDraft, '保存草稿按钮');
    await expect(saveDraft, '继续 Tab 应能聚焦保存草稿按钮').toBeFocused();
  });

  test('必填校验错误文案对用户可见', async ({ page }) => {
    // 客户与税率无默认值（customer_id / tax_rate 初始 undefined），点击保存草稿即触发校验。
    await page.getByRole('button', { name: '保存草稿', exact: true }).click();

    // 断言真实错误文案出现（逐字对齐 quotations.create.validateCustomer /
    // validateTaxRateRequired），不是仅断言 .el-form-item__error 可见。
    await expect(
      page.getByText('请选择客户', { exact: true }),
      '客户必填时应显示真实错误文案「请选择客户」'
    ).toHaveCount(1);
    await expect(
      page.getByText('请填写税率（百分数，系统不设默认档位）', { exact: true }),
      '税率必填时应显示真实错误文案'
    ).toHaveCount(1);
  });
});
