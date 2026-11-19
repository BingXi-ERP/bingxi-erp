/**
 * 色价详情页手机端适配契约锁。
 * 功能：pin 住 color-prices/detail 在手机端（<768）描述单列、阶梯表卡片、3 弹窗响应式。
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
const SRC = readFileSync(
  path.join(FRONTEND_ROOT, 'src/views/color-prices/detail.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('色价详情页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('描述列表手机端改单列，桌面保留双列', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 2"/);
  });

  it('阶梯手机卡覆盖 5 列 + 删除动作，等级标签同源', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少阶梯手机卡').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of ['sequence', 'min_quantity', 'max_quantity', 'tier_price', 'customer_level']) {
      expect(pk, `阶梯卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('getLevelLabel');
    expect(pk).toContain('handleDeleteTier');
    expect(pk).toContain('tier.unlimited');
  });

  it('3 个弹窗宽度响应式，桌面阶梯表保留', () => {
    const widths = (SRC.match(/:width="isPhone \? '95%' : '\d+px?'"/g) || []).length;
    expect(widths, '应有 3 个弹窗宽度响应式').toBe(3);
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).not.toMatch(/<el-dialog[^>]*\swidth="\d+px?"[\s>]/);
  });
});
