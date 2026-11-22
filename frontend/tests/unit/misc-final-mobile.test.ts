/**
 * 末批数据页手机端适配契约锁（权限/SKU映射/供应商产品）。
 * 功能：pin 住三页在手机端（<768）表格改卡片、筛选堆叠。
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

const phone = (s: string) => {
  const i = s.indexOf('<section v-if="isPhone"');
  expect(i, '缺少手机卡').toBeGreaterThanOrEqual(0);
  return s.slice(i, s.indexOf('</section>', i));
};

describe('末批数据页手机端适配契约锁', () => {
  it('权限页手机卡 4 字段', () => {
    const s = read('src/views/permissions/index.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    const pk = phone(s);
    for (const f of ['resource_type', 'action', 'allowed', 'resource_id']) {
      expect(pk, `权限卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('resourceTypeLabel');
    expect(pk).toContain('actionLabel');
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
  });

  it('SKU 映射手机卡 7 字段 + 编辑/删除', () => {
    const s = read('src/views/sku-mapping/index.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    expect(s).toMatch(/:inline="!isPhone"/);
    const pk = phone(s);
    for (const f of [
      'product_code',
      'color_no',
      'supplier_name',
      'supplier_product_code',
      'supplier_color_no',
      'supplier_price',
      'is_primary',
      'is_enabled',
    ]) {
      expect(pk, `SKU 卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('dialog.openEdit');
    expect(pk).toContain('confirmDelete');
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
  });

  it('供应商产品手机卡 4 字段 + 3 动作', () => {
    const s = read('src/views/supplier-product/index.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    expect(s).toMatch(/:inline="!isPhone"/);
    const pk = phone(s);
    for (const f of ['product_code', 'product_name', 'unit', 'is_enabled']) {
      expect(pk, `供应商产品卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('color.open');
    expect(pk).toContain('dialog.openEdit');
    expect(pk).toContain('list.toggleEnabled');
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
  });
});
