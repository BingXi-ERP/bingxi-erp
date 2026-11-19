/**
 * 色价创建页手机端适配契约锁。
 * 功能：pin 住 color-prices/create 表单在手机端（<768）label 顶置。
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
  path.join(FRONTEND_ROOT, 'src/views/color-prices/create.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('色价创建页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('表单 label 手机端顶置，桌面保留 120px 左标签', () => {
    expect(SRC).toMatch(/label-width="120px"/);
    expect(SRC).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('核心字段与提交动作保留', () => {
    for (const f of ['product_id', 'color_id', 'base_price', 'customer_level', 'season']) {
      expect(SRC, `缺少字段 ${f}`).toContain(f);
    }
    expect(SRC).toContain('handleSubmit');
  });
});
