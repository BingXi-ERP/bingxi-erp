/**
 * 报价单详情页手机端适配契约锁。
 * 功能：pin 住 quotations/detail 在手机端（<768）描述单列、明细表格改卡片。
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
  path.join(FRONTEND_ROOT, 'src/views/quotations/detail.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('报价单详情页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('描述列表手机端改单列，桌面保留三列', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 3"/);
  });

  it('手机明细卡覆盖 8 列，删任一即失败', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少手机明细 section').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of [
      'product_name',
      'color_code',
      'specification',
      'unit',
      'quantity',
      'unit_price',
      'unit_price_with_tax',
      'amount',
    ]) {
      expect(pk, `明细卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('formatAmount');
  });

  it('桌面明细表格与 5 个状态门控动作保留', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    for (const fn of [
      'handleSubmit',
      'handleApprove',
      'handleReject',
      'handleConvert',
      'handleCancel',
    ]) {
      expect(SRC, `缺少动作 ${fn}`).toContain(fn);
    }
  });
});
