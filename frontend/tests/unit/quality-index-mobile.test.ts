/**
 * 质量管理主页手机端适配契约锁。
 * 功能：pin 住 quality/index 4 个对话框在手机端（<768）宽度不溢出、label 顶置。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/quality/index.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('质量管理主页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('4 个对话框宽度响应式，桌面无固定宽度', () => {
    const widths = (SRC.match(/:width="isPhone \? '95%' : '\d+px'"/g) || []).length;
    expect(widths, '应有 4 个对话框宽度响应式').toBe(4);
    expect(SRC).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"[\s>]/);
  });

  it('3 个表单 label 顶置', () => {
    const labels = (SRC.match(/:label-position="isPhone \? 'top' : 'right'"/g) || []).length;
    expect(labels, '应有 3 个表单 label 顶置').toBe(3);
  });

  it('3 个子 Tab 保留', () => {
    for (const name of ['standard', 'record', 'defect']) {
      expect(SRC, `缺少 tab ${name}`).toContain(`name="${name}"`);
    }
  });
});
