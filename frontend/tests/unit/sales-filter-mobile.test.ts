/**
 * 销售订单筛选栏手机端适配契约锁。
 * 功能：pin 住 SalesOrderFilter 在手机端（<768）表单纵向堆叠、label 顶置、日期全宽。
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
  path.join(FRONTEND_ROOT, 'src/views/sales/components/SalesOrderFilter.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('销售订单筛选栏手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('表单 inline 与 label 位置随 isPhone 响应式，桌面保持 inline', () => {
    expect(SRC).toMatch(/:inline="!isPhone"/);
    expect(SRC).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('4 个筛选项与查询/重置按钮保留，日期选择器手机全宽', () => {
    for (const f of [
      'localFilterForm.order_no',
      'localFilterForm.customer_name',
      'localFilterForm.status',
      'localFilterForm.dateRange',
    ]) {
      expect(SRC, `筛选项 ${f} 丢失`).toContain(f);
    }
    expect(SRC).toContain("emit('query')");
    expect(SRC).toContain("emit('reset')");
    expect(SRC).toMatch(/isPhone \? '100%' : /);
  });
});
