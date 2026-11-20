/**
 * 质检记录 Tab 手机端适配契约锁。
 * 功能：pin 住 RecordTab 在手机端（<768）V2Table 改卡片、7 字段与标签工具等价。
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
  path.join(FRONTEND_ROOT, 'src/views/quality/tabs/RecordTab.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('质检记录 Tab 手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 7 字段，标签/名称工具与桌面 columns 同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'inspection_no',
      'inspection_type',
      'product_id',
      'batch_no',
      'inspection_date',
      'inspector_id',
      'inspection_result',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    for (const fn of [
      'inspectionTypeLabel',
      'productName',
      'inspectorName',
      'resultTagType',
      'resultLabel',
    ]) {
      expect(pk, `手机卡缺少工具 ${fn}`).toContain(fn);
    }
  });

  it('手机卡保留查看动作与分页', () => {
    const pk = phoneBlock();
    expect(pk).toContain('handleView');
    expect(pk).toContain('<ElPagination');
  });

  it('筛选表单与 V2Table 在手机端响应式', () => {
    expect(SRC).toMatch(/:inline="!isPhone"/);
    expect(SRC).toMatch(/<V2Table\s+v-if="!isPhone"/);
  });
});
