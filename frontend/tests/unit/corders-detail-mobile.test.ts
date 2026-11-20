/**
 * 自定义订单详情页手机端适配契约锁。
 * 功能：pin 住 detail 描述单列、3 弹窗与表单响应式。
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
  path.join(FRONTEND_ROOT, 'src/views/custom-orders/detail.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('自定义订单详情页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('描述列表手机端改单列', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 2"/);
  });

  it('3 个弹窗宽度响应式，桌面无固定宽度', () => {
    const widths = (SRC.match(/:width="isPhone \? '95%' : '480px'"/g) || []).length;
    expect(widths, '应有 3 个弹窗宽度响应式').toBe(3);
    expect(SRC).not.toMatch(/<el-dialog[^>]*\swidth="480"?[\s>]/);
  });

  it('3 个表单 label 顶置', () => {
    const labels = (SRC.match(/:label-position="isPhone \? 'top' : 'right'"/g) || []).length;
    expect(labels, '应有 3 个表单 label 顶置').toBe(3);
  });
});
