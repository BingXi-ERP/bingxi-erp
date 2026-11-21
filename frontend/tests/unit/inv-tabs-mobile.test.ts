/**
 * 库存主域 4 个子 Tab 手机端适配契约锁。
 * 功能：pin 住 Fabric/Alert/Reservation/Transaction 各 tab 在手机端（<768）表格改卡片。
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

const phoneBlock = (s: string) => {
  const i = s.indexOf('<section v-if="isPhone"');
  expect(i, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return s.slice(i, s.indexOf('</section>', i));
};

describe('库存主域 4 Tab 手机端适配契约锁', () => {
  for (const f of [
    'src/views/inventory/tabs/FabricStockTab.vue',
    'src/views/inventory/tabs/InventoryAlertTab.vue',
    'src/views/inventory/tabs/InventoryReservationTab.vue',
    'src/views/inventory/tabs/InventoryTransactionTab.vue',
  ]) {
    it(`${f} 声明 isPhone 断点且桌面表格保留`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      expect(s, `${f} 桌面表格未保留`).toMatch(/<el-table\s+v-if="!isPhone"/);
    });
  }

  it('Fabric 手机卡 9 字段 + 内置弹窗响应式', () => {
    const s = read('src/views/inventory/tabs/FabricStockTab.vue');
    const pk = phoneBlock(s);
    for (const fld of [
      'product_id',
      'warehouse_id',
      'batch_no',
      'color_no',
      'grade',
      'quantity_meters',
      'quantity_kg',
      'created_at',
    ]) {
      expect(pk, `Fabric 手机卡缺少 ${fld}`).toContain(fld);
    }
    expect(s).toMatch(/:width="isPhone \? '95%' : '500px'"/);
    expect(s).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('Alert 手机卡 7 字段 + purchase 动作', () => {
    const s = read('src/views/inventory/tabs/InventoryAlertTab.vue');
    const pk = phoneBlock(s);
    for (const fld of [
      'product_code',
      'product_name',
      'warehouse_name',
      'quantity_on_hand',
      'reorder_point',
      'unit',
      'alert_type',
    ]) {
      expect(pk, `Alert 手机卡缺少 ${fld}`).toContain(fld);
    }
    expect(pk).toContain("$emit('purchase'");
  });

  it('Reservation 手机卡 7 字段 + lock/release/cancel 动作', () => {
    const s = read('src/views/inventory/tabs/InventoryReservationTab.vue');
    const pk = phoneBlock(s);
    for (const fld of ['product_id', 'warehouse_id', 'quantity', 'status', 'notes', 'created_at']) {
      expect(pk, `Reservation 手机卡缺少 ${fld}`).toContain(fld);
    }
    for (const fn of ['lockReservationRow', 'releaseReservationRow', 'cancelReservationRow']) {
      expect(pk, `Reservation 手机卡缺少动作 ${fn}`).toContain(fn);
    }
  });

  it('Transaction 手机卡 8 字段纯展示', () => {
    const s = read('src/views/inventory/tabs/InventoryTransactionTab.vue');
    const pk = phoneBlock(s);
    for (const fld of [
      'transaction_no',
      'transaction_type',
      'product_name',
      'batch_no',
      'quantity',
      'warehouse_name',
      'created_at',
    ]) {
      expect(pk, `Transaction 手机卡缺少 ${fld}`).toContain(fld);
    }
  });
});
