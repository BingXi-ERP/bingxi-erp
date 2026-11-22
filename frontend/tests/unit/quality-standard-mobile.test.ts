/**
 * 质量标准 Tab 手机端适配契约锁。
 * 功能：pin 住 StandardTab 在手机端（<768）表格改卡片、5 动作与状态门控等价。
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
  path.join(FRONTEND_ROOT, 'src/views/quality/tabs/StandardTab.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('质量标准 Tab 手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 7 字段，类型/状态标签与空值占位同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'standard_code',
      'standard_name',
      'standard_type',
      'version',
      'status',
      'created_by_name',
      'approved_by_name',
      'approved_at',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('getTypeLabel');
    expect(pk).toContain('getStatusLabel');
    expect(pk).toContain('getStatusType');
    expect(pk).toContain("row.approved_by_name || '-'");
  });

  it('手机卡保留 5 动作与状态/权限门控', () => {
    const pk = phoneBlock();
    for (const ev of [
      'handleView',
      "emit('openHistory'",
      'openEdit',
      "emit('openApprove'",
      'handlePublish',
    ]) {
      expect(pk, `手机卡缺少动作 ${ev}`).toContain(ev);
    }
    expect(pk).toContain("row.status !== 'draft'");
    expect(pk).toContain("row.status === 'draft'");
    expect(pk).toContain("row.status === 'approved'");
    expect(pk).toContain('PERMISSIONS.QUALITY_STANDARD_UPDATE');
  });

  it('桌面表格保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
  });
});
