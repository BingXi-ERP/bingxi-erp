/**
 * CRM 客户分配页手机端适配契约锁。
 * 功能：pin 住 assignment 页两个 tab（规则/客户）在手机端（<768）改为卡片列表。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/crm/assignment.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

function block(cls: string) {
  // 两个 section 用各自 class 区分（rule-mobile / customer-mobile）
  const marker = `class="${cls}"`;
  const s = SRC.indexOf(marker);
  expect(s, `缺少 ${cls} section`).toBeGreaterThanOrEqual(0);
  const sectionStart = SRC.lastIndexOf('<section', s);
  const e = SRC.indexOf('</section>', s);
  expect(e, `${cls} section 未闭合`).toBeGreaterThan(sectionStart);
  return SRC.slice(sectionStart, e);
}

describe('CRM 客户分配页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('规则卡覆盖规则表 5 列，删任一列即失败', () => {
    const pk = block('rule-mobile');
    for (const f of ['name', 'days', 'is_enabled', 'created_at', 'updated_at']) {
      expect(pk, `规则卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('openEditRuleDialog');
    expect(pk).toContain('handleDeleteRule');
    expect(pk).toContain("'crm_assignment:update'");
    expect(pk).toContain("'crm_assignment:delete'");
  });

  it('客户卡覆盖客户表 4 列，领取动作保留', () => {
    const pk = block('customer-mobile');
    for (const f of ['customer_name', 'contact_person', 'phone', 'owner_name']) {
      expect(pk, `客户卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('openAssignDialog');
  });

  it('两个桌面 el-table 保留在 v-if=!isPhone 分支', () => {
    const tables = (SRC.match(/<el-table\s+v-if="!isPhone"/g) || []).length;
    expect(tables, '应有 2 个桌面表格保留').toBe(2);
    expect(SRC).toContain('batchAssignVisible');
  });
});
