/**
 * 色价两个子 Tab 手机端适配契约锁。
 * 功能：pin 住 CustomerSpecial/SeasonalRules 在手机端（<768）表格改卡片、弹窗响应式。
 * 调用方：vitest（tests/unit，CI vitest job）。
 * 入参：仅 fs 读取仓库内前端源码文本，不执行组件、不发网络请求。
 * 传给谁：纯断言，无下游；存什么/存哪里：不落盘、不存储。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const read = (p: string) =>
  readFileSync(path.join(FRONTEND_ROOT, p), 'utf8').replace(/\r\n/g, '\n');

describe('色价两个子 Tab 手机端适配契约锁', () => {
  for (const f of [
    'src/views/color-prices/tabs/CustomerSpecialTab.vue',
    'src/views/color-prices/tabs/SeasonalRulesTab.vue',
  ]) {
    it(`${f} 声明 isPhone 且表格改卡片、弹窗响应式`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      expect(s, `${f} 桌面表格未保留`).toMatch(/<el-table\s+v-if="!isPhone"/);
      expect(s, `${f} 弹窗未响应式`).toMatch(/:width="isPhone \? '95%' : '\d+px'"/);
      expect(s, `${f} 缺少手机卡`).toContain('<section v-if="isPhone"');
    });
  }

  it('客户专属价手机卡 10 字段 + 价格格式化', () => {
    const s = read('src/views/color-prices/tabs/CustomerSpecialTab.vue');
    const i = s.indexOf('<section v-if="isPhone"');
    const pk = s.slice(i, s.indexOf('</section>', i));
    for (const fld of [
      'customer_id',
      'product_id',
      'color_id',
      'special_price',
      'discount_percent',
      'currency',
      'valid_from',
      'valid_until',
      'notes',
    ]) {
      expect(pk, `客户专属价卡缺少 ${fld}`).toContain(fld);
    }
    expect(pk).toContain('formatPrice');
  });

  it('季节规则手机卡 9 字段 + 状态标签', () => {
    const s = read('src/views/color-prices/tabs/SeasonalRulesTab.vue');
    const i = s.indexOf('<section v-if="isPhone"');
    const pk = s.slice(i, s.indexOf('</section>', i));
    for (const fld of [
      'rule_name',
      'season',
      'product_category_id',
      'adjustment_type',
      'adjustment_value',
      'valid_from',
      'valid_until',
      'is_active',
      'description',
    ]) {
      expect(pk, `季节规则卡缺少 ${fld}`).toContain(fld);
    }
  });
});
