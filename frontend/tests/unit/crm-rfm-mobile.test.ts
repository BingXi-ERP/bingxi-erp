/**
 * CRM RFM 客户分级页手机端适配契约锁。
 * 功能：pin 住 RfmTab 在手机端（<768）分布卡两列、客户表格改卡片。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/crm/tabs/RfmTab.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

describe('CRM RFM 客户分级页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('分布卡在手机端改两列（span 12），桌面保留五列（span 4）', () => {
    expect(SRC).toMatch(/:span="isPhone \? 12 : 4"/);
  });

  it('手机卡片覆盖表格 4 字段 + 详情动作', () => {
    const s = SRC.indexOf('<section v-if="isPhone"');
    const e = SRC.indexOf('</section>', s);
    expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
    const pk = SRC.slice(s, e);
    for (const f of ['customer_code', 'customer_name', 'owner_name', 'segmentText', 'viewDetail']) {
      expect(pk, `手机卡缺少字段/动作 ${f}`).toContain(f);
    }
  });

  it('桌面表格保留在 v-if=!isPhone 分支', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
  });
});
