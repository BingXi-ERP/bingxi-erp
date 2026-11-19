/**
 * 库存调整列表手机端适配契约锁。
 * 功能：pin 住 AdjustmentListTab 在手机端（<768）筛选堆叠、表格改卡片、动作等价。
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
  path.join(FRONTEND_ROOT, 'src/views/inventory-adjustment/tabs/AdjustmentListTab.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('库存调整列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('筛选表单在手机端由 inline 改纵向堆叠', () => {
    expect(SRC).toMatch(/:inline="!isPhone"/);
  });

  it('手机卡覆盖表格 8 字段 + 状态标签工具', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of [
      'adjustment_no',
      'adjustment_date',
      'warehouse_name',
      'reason_type',
      'total_quantity',
      'status',
      'created_by_name',
      'created_at',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('inventoryAdjustmentStatusTagType');
    expect(pk).toContain('inventoryAdjustmentStatusLabelKey');
  });

  it('手机卡保留 4 动作与 PENDING 状态门控', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const pk = SRC.slice(s, SRC.indexOf('</section>', s));
    for (const ev of [
      "emit('openForm', 'view'",
      "emit('openForm', 'edit'",
      "emit('openApprove'",
      "emit('delete'",
    ]) {
      expect(pk, `手机卡缺少动作 ${ev}`).toContain(ev);
    }
    expect(pk).toContain('INVENTORY_ADJUSTMENT_STATUS.PENDING');
  });

  it('桌面表格与分页保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
  });
});
