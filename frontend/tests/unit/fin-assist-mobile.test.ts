/**
 * 辅助核算页手机端适配契约锁。
 * 功能：pin 住 assist-accounting 两个表格在手机端（<768）改卡片、筛选单列、弹窗响应式。
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
  path.join(FRONTEND_ROOT, 'src/views/assist-accounting/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = (cls: string) => {
  const clsIdx = SRC.indexOf(`class="${cls}"`);
  expect(clsIdx, `缺少手机卡 ${cls}`).toBeGreaterThanOrEqual(0);
  const s = SRC.lastIndexOf('<section', clsIdx);
  return SRC.slice(s, SRC.indexOf('</section>', clsIdx));
};

describe('辅助核算页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('核算记录手机卡覆盖 11 数据字段 + 查看动作', () => {
    const pk = phoneBlock('records-mobile');
    for (const f of [
      'business_type',
      'business_no',
      'batch_no',
      'color_no',
      'grade',
      'warehouse_id',
      'quantity_meters',
      'quantity_kg',
      'debit_amount',
      'credit_amount',
      'created_at',
    ]) {
      expect(pk, `记录卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('getBusinessTypeLabel');
    expect(pk).toContain('openViewDialog');
  });

  it('汇总手机卡覆盖 8 数据字段', () => {
    const pk = phoneBlock('summary-mobile');
    for (const f of [
      'accounting_period',
      'dimension_code',
      'dimension_value_name',
      'total_debit',
      'total_credit',
      'total_quantity_meters',
      'total_quantity_kg',
      'record_count',
    ]) {
      expect(pk, `汇总卡缺少字段 ${f}`).toContain(f);
    }
  });

  it('筛选栏手机单列（span 24），两个桌面表格与分页保留', () => {
    expect(SRC).toMatch(/:span="isPhone \? 24 : 6"/);
    const tables = (SRC.match(/<ElTable\s+v-if="!isPhone"/g) || []).length;
    expect(tables, '应有 2 个桌面表格保留').toBe(2);
    expect(SRC).toContain('<ElPagination');
  });

  it('查看弹窗宽度响应式', () => {
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '\d+px'"/);
    expect(SRC).not.toMatch(/<ElDialog[^>]*\swidth="\d+px"/);
  });
});
