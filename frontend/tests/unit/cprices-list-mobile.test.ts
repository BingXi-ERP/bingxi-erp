/**
 * 色价列表手机端适配契约锁。
 * 功能：pin 住 color-prices/list 在手机端（<768）表格改卡片、3 动作与标签工具等价。
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
  path.join(FRONTEND_ROOT, 'src/views/color-prices/list.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('色价列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 10 数据列，标签/价格渲染与桌面同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'row.id',
      'product_id',
      'color_id',
      'customer_level',
      'season',
      'base_price',
      'currency',
      'approval_status',
      'effective_from',
      'is_active',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    for (const fn of ['getLevelLabel', 'getSeasonLabel', 'getApprovalLabel', 'formatPrice']) {
      expect(pk, `手机卡缺少工具 ${fn}`).toContain(fn);
    }
  });

  it('手机卡保留 3 动作与 is_active 门控', () => {
    const pk = phoneBlock();
    for (const fn of ['handleView', 'handleAdjust', 'handleDelete']) {
      expect(pk, `手机卡缺少动作 ${fn}`).toContain(fn);
    }
    expect(pk).toContain('row.is_active');
  });

  it('桌面表格与分页保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
    expect(SRC).toContain('handleSelectionChange');
  });
});
