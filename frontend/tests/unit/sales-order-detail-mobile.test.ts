/**
 * 销售订单详情页手机端适配契约锁。
 * 功能：pin 住 OrderDetail 在手机端（<768）描述单列、明细表格改卡片。
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
  path.join(FRONTEND_ROOT, 'src/views/sales/OrderDetail.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('销售订单详情页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('描述列表手机端改单列，桌面保留三列', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 3"/);
  });

  it('手机明细卡覆盖表格 8 列，删任一列即失败', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少手机明细 section').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of [
      'product_code',
      'product_name',
      'color_no',
      'dye_lot_requirement',
      'quantity',
      'unit_price',
      'subtotal',
      'quantity_tolerance_pct',
    ]) {
      expect(pk, `明细卡缺少字段 ${f}`).toContain(f);
    }
  });

  it('桌面明细表格与转合同/返回动作保留', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('ConvertToContractDialog');
    expect(SRC).toContain("router.push('/sales')");
  });
});
