/**
 * 报价单列表手机端适配契约锁。
 * 功能：pin 住 quotations/list 在手机端（<768）表格改卡片、6 动作与 2 弹窗响应式。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/quotations/list.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('报价单列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 7 数据列，删任一即失败', () => {
    const pk = phoneBlock();
    for (const f of [
      'quotation_no',
      'customer_name',
      'quotation_date',
      'valid_until',
      'price_terms',
      'total_amount',
      'row.status',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('formatAmount');
    expect(pk).toContain('QUOTATION_STATUS_LABELS');
    expect(pk).toContain('tagType(');
  });

  it('手机卡保留 6 动作与状态/权限门控', () => {
    const pk = phoneBlock();
    for (const fn of [
      'goDetail',
      'goCopy',
      'goEdit',
      'handleConvert',
      'handleCancel',
      'showTerms',
    ]) {
      expect(pk, `手机卡缺少动作 ${fn}`).toContain(fn);
    }
    expect(pk).toContain("row.status === 'draft'");
    expect(pk).toContain("row.status === 'approved'");
    expect(pk).toContain('PERMISSIONS.QUOTATION_UPDATE');
    expect(pk).toContain('PERMISSIONS.QUOTATION_CANCEL');
  });

  it('两个内置弹窗宽度响应式，桌面表格保留', () => {
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '720px'"/);
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '600px'"/);
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
  });
});
