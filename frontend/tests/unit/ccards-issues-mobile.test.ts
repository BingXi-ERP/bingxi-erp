/**
 * 色卡发放页手机端适配契约锁。
 * 功能：pin 住 issues 两个表格在手机端（<768）改卡片、4 权限动作与弹窗保留。
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
  path.join(FRONTEND_ROOT, 'src/views/color-cards/issues.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const block = (cls: string) => {
  const c = SRC.indexOf(`class="${cls}"`);
  expect(c, `缺少 ${cls}`).toBeGreaterThanOrEqual(0);
  return SRC.slice(SRC.lastIndexOf('<section', c), SRC.indexOf('</section>', c));
};

describe('色卡发放页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('在发卡片覆盖 8 字段 + 4 权限动作', () => {
    const pk = block('issue-active-mobile');
    for (const f of [
      'color_card_id',
      'customer_id',
      'issue_qty',
      'issued_by',
      'issued_at',
      'expected_return_date',
      'dye_lot_no',
      'purpose',
    ]) {
      expect(pk, `在发卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('formatDate');
    for (const fn of ['handleReturn', 'handleMarkDamaged', 'handleMarkLost', 'handleCancel']) {
      expect(pk, `在发卡缺少动作 ${fn}`).toContain(fn);
    }
    for (const perm of ['return', 'damaged', 'lost', 'cancel']) {
      expect(pk, `在发卡缺少权限 ${perm}`).toContain(`color_card_issue:${perm}`);
    }
  });

  it('历史卡覆盖关键字段', () => {
    const pk = block('issue-history-mobile');
    for (const f of [
      'color_card_id',
      'customer_id',
      'issue_qty',
      'dye_lot_no',
      'status',
      'issued_at',
      'actual_return_date',
      'compensation_amount',
      'purpose',
    ]) {
      expect(pk, `历史卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('getIssueStatusLabel');
  });

  it('两个桌面表格保留，2 个弹窗宽度响应式', () => {
    const tables = (SRC.match(/<el-table\s+v-if="!isPhone"/g) || []).length;
    expect(tables, '应有 2 个桌面表格保留').toBe(2);
    const widths = (SRC.match(/:width="isPhone \? '95%' : '\d+px'"/g) || []).length;
    expect(widths, '应有 4 个弹窗宽度响应式').toBe(4);
    const labels = (SRC.match(/:label-position="isPhone \? 'top' : 'right'"/g) || []).length;
    expect(labels, '应有 5 个表单 label 顶置').toBe(5);
  });
});
