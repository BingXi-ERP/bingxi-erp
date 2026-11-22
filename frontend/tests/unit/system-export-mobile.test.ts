/**
 * 导出审批页手机端适配契约锁。
 * 功能：pin 住 ExportApprovals 表格改卡片、4 弹窗与表单响应式。
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
  path.join(FRONTEND_ROOT, 'src/views/system/ExportApprovals.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('导出审批页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 7 字段，令牌指纹与状态标签同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'id',
      'resource_type',
      'applicant_username',
      'status',
      'estimated_rows',
      'created_at',
      'token_fingerprint',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('exportApprovalResourceLabelKey');
    expect(pk).toContain('exportApprovalStatusTagType');
    expect(pk).toContain('isMine(row)');
  });

  it('4 个弹窗宽度响应式，表单 label 顶置', () => {
    const widths = (SRC.match(/:width="isPhone \? '95%' : '\d+px'"/g) || []).length;
    expect(widths, '应有 4 个弹窗宽度响应式').toBe(4);
    expect(SRC).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('桌面表格保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<ElTable\s+v-if="!isPhone"/);
  });
});
