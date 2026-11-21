/**
 * CRM 客户详情页手机端适配契约锁。
 * 功能：pin 住 detail 页在手机端（<768）栅格单栏、描述列表单列、联系人卡片化。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/crm/detail.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('CRM 客户详情页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('左右栅格在手机端改为单栏（span 24），桌面保留 16/8', () => {
    expect(SRC).toMatch(/<el-col\s+:span="isPhone \? 24 : 16"/);
    expect(SRC).toMatch(/<el-col\s+:span="isPhone \? 24 : 8"/);
  });

  it('描述列表在手机端改为单列，桌面保留双列', () => {
    const columns = (SRC.match(/:column="isPhone \? 1 : 2"/g) || []).length;
    expect(columns, '应有 2 个描述列表改为响应式单列').toBe(2);
  });

  it('联系人手机卡片覆盖表格 5 字段 + 编辑/删除动作', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少联系人手机 section').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of ['name', 'title', 'phone', 'email', 'is_primary']) {
      expect(pk, `联系人卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('handleEditContact');
    expect(pk).toContain('handleDeleteContact');
  });

  it('桌面联系人表格与 PII 揭示、子组件未删除', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('handleRevealPii');
    expect(SRC).toContain('<FollowUpTab');
    expect(SRC).toContain('<TagsPanelTab');
  });
});
