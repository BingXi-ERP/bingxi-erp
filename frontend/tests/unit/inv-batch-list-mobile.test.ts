/**
 * 库存批次列表手机端适配契约锁。
 * 功能：pin 住 BatchListTab 在手机端（<768）表格改卡片、13 字段与 4 权限动作等价。
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
  path.join(FRONTEND_ROOT, 'src/views/inventory-batch/tabs/BatchListTab.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('库存批次列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖表格 13 字段，删任一即失败', () => {
    const pk = phoneBlock();
    const fields = [
      'batch_no',
      'product_name',
      'color_no',
      'dye_lot_no',
      'grade',
      'quantity_meters',
      'quantity_kg',
      'gram_weight',
      'width',
      'warehouse_name',
      'stock_status',
      'quality_status',
      'production_date',
    ];
    for (const f of fields) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
  });

  it('双状态标签复用既有 tagType 工具，中文 token 原样显示', () => {
    const pk = phoneBlock();
    expect(pk).toContain('stockStatusTagType(row.stock_status)');
    expect(pk).toContain('qualityStatusTagType(row.quality_status)');
    expect(pk).toContain('{{ row.stock_status }}');
    expect(pk).toContain('{{ row.quality_status }}');
  });

  it('手机卡保留 4 动作与权限门控', () => {
    const pk = phoneBlock();
    for (const ev of ['handleView', 'handleEdit', 'handleTransfer', 'handleDelete']) {
      expect(pk, `手机卡缺少动作 ${ev}`).toContain(ev);
    }
    for (const perm of ['BATCH_UPDATE', 'BATCH_CREATE', 'BATCH_DELETE']) {
      expect(pk, `手机卡缺少权限 ${perm}`).toContain(`PERMISSIONS.${perm}`);
    }
  });

  it('桌面表格与分页保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
  });
});
