/**
 * 色价批量调价页手机端适配契约锁。
 * 功能：pin 住 batch-adjust 在手机端（<768）双栏单列、筛选堆叠、价格表卡片。
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
  path.join(FRONTEND_ROOT, 'src/views/color-prices/batch-adjust.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('色价批量调价页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('双栏在手机端改单列堆叠，筛选表单响应式', () => {
    expect(SRC).toMatch(/:span="isPhone \? 24 : 14"/);
    expect(SRC).toMatch(/:span="isPhone \? 24 : 10"/);
    expect(SRC).toMatch(/:inline="!isPhone"/);
  });

  it('价格手机卡覆盖 5 字段 + 标签工具，选择动作保留', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少价格手机卡').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of ['id', 'product_id', 'color_id', 'customer_level', 'base_price', 'currency']) {
      expect(pk, `价格卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('getLevelLabel');
    expect(pk).toContain('formatPrice');
    expect(SRC).toContain('handleSelectionChange');
  });

  it('桌面价格表与批量调价表单保留', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('handleSubmit');
    expect(SRC).toContain('handleCalculate');
  });
});
