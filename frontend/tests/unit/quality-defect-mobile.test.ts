/**
 * 不良品 Tab 手机端适配契约锁。
 * 功能：pin 住 DefectTab 在手机端（<768）表格改卡片、8 字段与处置动作等价。
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
  path.join(FRONTEND_ROOT, 'src/views/quality/tabs/DefectTab.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('不良品 Tab 手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 8 字段，等级/处置方式/处理状态标签同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'unqualified_no',
      'batch_no',
      'unqualified_qty',
      'unqualified_reason',
      'grade',
      'handling_method',
      'handling_reason',
      'handling_status',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    for (const fn of [
      'gradeTagType',
      'gradeLabel',
      'handlingMethodLabel',
      'handlingStatusTagType',
      'handlingStatusLabel',
    ]) {
      expect(pk, `手机卡缺少工具 ${fn}`).toContain(fn);
    }
  });

  it('手机卡保留处置动作与门控，弹窗响应式', () => {
    const pk = phoneBlock();
    expect(pk).toContain('canProcess(row)');
    expect(pk).toContain('openProcessDialog');
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '520px'"/);
  });

  it('桌面表格保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
  });
});
