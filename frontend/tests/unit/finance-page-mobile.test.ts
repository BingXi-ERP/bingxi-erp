/**
 * 财务管理页手机端适配契约锁（科目树 + 容器）。
 * 功能：pin 住 SubjectTab 树表在手机端（<768）改卡片、弹窗表单响应式。
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

describe('财务管理页手机端适配契约锁', () => {
  const SRC = read('src/views/finance/tabs/SubjectTab.vue');
  const phoneBlock = () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
    return SRC.slice(s, SRC.indexOf('</section>', s));
  };

  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 7 字段，分类/借贷方向标签同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'code',
      'name',
      'category',
      'balance_direction',
      'level',
      'children?.length',
      'status',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('getCategoryLabel');
    expect(pk).toContain('getDirectionLabel');
  });

  it('手机卡保留 2 动作与权限门控，层级缩进', () => {
    const pk = phoneBlock();
    expect(pk).toContain('openSubjectDialog');
    expect(pk).toContain('deleteSubject');
    expect(pk).toContain('PERMISSIONS.SUBJECT_UPDATE');
    expect(pk).toContain('PERMISSIONS.SUBJECT_DELETE');
    expect(pk).toContain('padding-left');
  });

  it('桌面树表保留，弹窗宽度与 label 响应式', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '500px'"/);
    expect(SRC).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('finance 容器手机端 padding 收缩', () => {
    const s = read('src/views/finance/index.vue');
    const i = s.indexOf('@media (max-width: 767px)');
    expect(i, '容器缺媒体查询').toBeGreaterThanOrEqual(0);
    expect(s.slice(i)).toContain('padding: 12px');
  });
});
