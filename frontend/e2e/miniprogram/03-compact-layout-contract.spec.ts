// 小程序紧凑换行静态契约（03-compact-layout-contract）
// CI 无微信开发者工具，无法跑真机 UI；本用例以 WXSS 源码为面，验用户
// 「UI 布局紧凑化、超长内容自动换行、保留合理行列间距」在全局层与高频列表组件落地。
// 调用方 Playwright；读取 frontend/../miniprogram 源文件；不请求后端、不落库。
// 存什么：读到的 WXSS 文本断言结果；存哪里：测试报告与 Actions 日志。
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), '..');
const readWxss = (relative: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram', relative), 'utf8');

const rule = (css: string, selector: string): string => {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const matches = blocks.filter(([, sel]) => sel.trim() === selector);
  expect(matches.length, `缺少选择器 ${selector}`).toBeGreaterThan(0);
  return matches[matches.length - 1][2];
};

test('03-01 全局紧凑层落地且不覆盖安全区补丁', () => {
  const app = readWxss('app.wxss');
  expect(app).toContain('全局紧凑密度与内容换行');
  expect(rule(app, '.weui-cell')).toContain('padding: 8px 12px');
  expect(rule(app, '.weui-cell')).toContain('line-height: 1.4');
  expect(rule(app, '.weui-panel__hd')).toContain('padding: 10px 12px 8px');
  expect(rule(app, '.weui-cell__bd,\n.weui-cell__ft')).toContain('overflow-wrap: anywhere');
  expect(rule(app, '.weui-media-box__title')).not.toContain('white-space: nowrap');
  expect(rule(app, '.weui-media-box__title')).toContain('word-break: break-word');
  expect(app).toContain('padding-bottom: env(safe-area-inset-bottom)');
});

test('03-02 高频列表组件启用自动换行且保留最小行高', () => {
  const components = [
    'components/color-card-list-block/color-card-list-block.wxss',
    'components/cargo-pass-list-block/cargo-pass-list-block.wxss',
  ];
  for (const file of components) {
    const css = readWxss(file);
    const nameRule = rule(css, '.info-info .name');
    expect(nameRule).toContain('min-height: 80rpx');
    expect(nameRule).not.toContain('overflow: hidden !important');
    expect(nameRule).toContain('overflow-wrap: anywhere');
    expect(nameRule).toContain('white-space: normal');
    expect(rule(css, '.listBottom')).toContain('min-height: 80rpx');
    expect(css).toContain('padding: 14rpx 0');
  }
});

test('03-03 客户列表名称与信息条允许折行', () => {
  const css = readWxss('components/customer-list-block/customer-list-block.wxss');
  expect(rule(css, '.name')).toContain('overflow-wrap: anywhere');
  expect(rule(css, '.name')).toContain('white-space: normal');
  expect(rule(css, '.wrapper')).toContain('padding: 20rpx 0');
  expect(rule(css, '.contain')).toContain('padding: 8rpx 28rpx');
});
