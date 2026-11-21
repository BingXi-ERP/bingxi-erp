/**
 * 报价单审批页手机端适配契约锁。
 * 功能：pin 住 quotations/approval 在手机端（<768）描述单列、动作保留。
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
  path.join(FRONTEND_ROOT, 'src/views/quotations/approval.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

describe('报价单审批页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('描述列表手机端改单列，桌面保留双列', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 2"/);
  });

  it('4 个状态门控动作与返回按钮保留', () => {
    for (const fn of ['handleSubmit', 'handleApprove', 'handleReject', 'handleConvert']) {
      expect(SRC, `缺少动作 ${fn}`).toContain(fn);
    }
    expect(SRC).toContain('router.back()');
  });
});
