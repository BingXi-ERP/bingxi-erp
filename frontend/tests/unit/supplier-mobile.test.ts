/**
 * 供应商域手机端适配契约锁（容器 + 弹窗 + 分析页）。
 * 功能：pin 住 supplier 域在手机端（<768）弹窗/表单/描述列表响应式。
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

describe('供应商域手机端适配契约锁', () => {
  it('SupplierDialog 弹窗宽度与 label 响应式', () => {
    const s = read('src/views/supplier/SupplierDialog.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    expect(s).toMatch(/:width="isPhone \? '95%' : '800px'"/);
    expect(s).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('供应商容器手机端 padding 收缩', () => {
    const s = read('src/views/supplier/index.vue');
    const i = s.indexOf('@media (max-width: 767px)');
    expect(i, '容器缺媒体查询').toBeGreaterThanOrEqual(0);
    expect(s.slice(i)).toContain('padding: 12px');
  });

  it('增强分析页描述列表响应式单列', () => {
    const s = read('src/views/supplier/enhanced/index.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    const responsive = (s.match(/:column="isPhone \? 1 : 4"/g) || []).length;
    expect(responsive, '应有 2 个描述列表改为响应式单列').toBe(2);
    const fixed = (s.match(/:column="\d+"/g) || []).length;
    expect(fixed, '不应残留固定列数').toBe(0);
  });
});
