/**
 * 坏账管理页手机端适配契约锁。
 * 功能：pin 住 bad-debts/index 两个表格在手机端（<768）改动态列卡片、4 动作与门控等价。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/bad-debts/index.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('坏账管理页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('坏账手机卡复用动态列定义与状态标签映射，确认/冲销动作带门控', () => {
    const cls = SRC.indexOf('class="debt-mobile"');
    expect(cls, '缺少坏账手机卡').toBeGreaterThanOrEqual(0);
    const s = SRC.lastIndexOf('<section', cls);
    const pk = SRC.slice(s, SRC.indexOf('</section>', cls));
    expect(pk).toContain('debtExtraCols');
    expect(pk).toContain('BAD_DEBT_STATUS_LABEL');
    expect(pk).toContain("row.status === 'confirmed'");
    expect(pk).toContain('onConfirm');
    expect(pk).toContain('onReverse');
    expect(pk).toContain("row.status === 'pending'");
  });

  it('催收手机卡复用动态列定义，转派/取消动作带门控', () => {
    const cls = SRC.indexOf('class="task-mobile"');
    expect(cls, '缺少催收手机卡').toBeGreaterThanOrEqual(0);
    const s = SRC.lastIndexOf('<section', cls);
    const pk = SRC.slice(s, SRC.indexOf('</section>', cls));
    expect(pk).toContain('taskExtraCols');
    expect(pk).toContain('COLLECTION_TASK_STATUS_LABEL');
    expect(pk).toContain('onReassign');
    expect(pk).toContain('onCancelTask');
    expect(pk).toContain("row.status !== 'cancelled' && row.status !== 'completed'");
  });

  it('两个桌面表格保留在 v-if=!isPhone 分支，计提弹窗宽度响应式', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/g);
    const tables = (SRC.match(/<el-table\s+v-if="!isPhone"/g) || []).length;
    expect(tables, '应有 2 个桌面表格保留').toBe(2);
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '460px'"/);
    expect(SRC).not.toMatch(/<el-dialog[^>]*\swidth="460"/);
  });
});
