/**
 * CRM 高级分析页手机端响应式契约锁。
 * 功能：pin 住 enhanced 页在手机端（<768）描述列表单列、日期选择器全宽、工具栏换行。
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
  path.join(FRONTEND_ROOT, 'src/views/crm/enhanced/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('CRM 高级分析页手机端响应式契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('5 个描述列表在手机端改为单列，桌面保留原列数', () => {
    const col3 = (SRC.match(/:column="isPhone \? 1 : 3"/g) || []).length;
    const col2 = (SRC.match(/:column="isPhone \? 1 : 2"/g) || []).length;
    expect(col3, '应有 4 个三列描述列表改为响应式').toBe(4);
    expect(col2, '应有 1 个两列描述列表改为响应式').toBe(1);
  });

  it('日期选择器固定宽度改为响应式全宽，删任一即失败', () => {
    const widths = (SRC.match(/:style="\{ width: isPhone \? '100%' : '260px' \}"/g) || []).length;
    expect(widths, '应有 2 个日期选择器改为响应式宽度').toBe(2);
    expect(SRC).not.toMatch(/style="width: 260px"/);
  });

  it('手机端工具栏换行且页面内边距收缩（CSS 媒体查询）', () => {
    expect(SRC).toMatch(/@media\s*\(max-width:\s*767px\)/);
    const mediaStart = SRC.indexOf('@media (max-width: 767px)');
    const mediaBlock = SRC.slice(mediaStart);
    expect(mediaBlock).toContain('flex-wrap: wrap');
    expect(mediaBlock).toContain('padding: 12px');
  });
});
