/**
 * CRM 线索列表手机端适配契约锁。
 * 功能：pin 住 leads 页在手机端（<768）改为卡片列表，字段与动作与桌面表格等价。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/crm/leads/index.vue'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

const phoneBlock = () => {
  const start = SRC.indexOf('<section v-if="isPhone"');
  const end = SRC.indexOf('</section>', start);
  expect(start, '缺少手机端 section 起始').toBeGreaterThanOrEqual(0);
  expect(end, '缺少手机端 section 闭合').toBeGreaterThan(start);
  return SRC.slice(start, end);
};

describe('CRM 线索列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡片字段覆盖桌面表格全部 10 列，删任一列即失败', () => {
    const pk = phoneBlock();
    const fields = [
      'lead_no',
      'company_name',
      'contact_name',
      'mobile_phone',
      'lead_source',
      'lead_status',
      'priority',
      'owner_name',
      'last_follow_up_date',
      'next_follow_up_date',
    ];
    for (const f of fields) {
      expect(pk, `手机卡片缺少字段 ${f}`).toContain(f);
    }
  });

  it('状态与优先级标签复用既有工具函数，未自造映射', () => {
    const pk = phoneBlock();
    expect(pk).toContain('leadStatusLabelKey');
    expect(pk).toContain('leadStatusTagType');
    expect(pk).toContain('getPriorityLabel');
    expect(pk).toContain('getPriorityType');
    expect(pk).toContain('getSourceLabel');
  });

  it('手机卡片保留 5 个动作，状态门控与桌面一致', () => {
    const pk = phoneBlock();
    for (const action of [
      'handleView',
      'openEditDialog',
      'handleContact',
      'handleConvert',
      'handleLost',
      'handleScore',
    ]) {
      expect(pk, `手机卡片缺少动作 ${action}`).toContain(action);
    }
    expect(pk).toContain('LEAD_STATUS.CONVERTED');
  });

  it('桌面 el-table 保留在 v-else 分支，既有分页与批量动作未删除', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"|v-else[\s\S]{0,80}<el-table/);
    expect(SRC).toContain('handleSelectionChange');
    expect(SRC).toContain('<el-pagination');
    expect(SRC).toContain('type="selection"');
  });

  it('手机卡片走 v-permission 门控编辑，且复用列表数据与加载态', () => {
    const pk = phoneBlock();
    expect(pk).toContain('v-permission="PERMISSIONS.CRM_LEAD_UPDATE"');
    expect(pk).toContain('leadList');
    expect(pk).toContain('v-loading="loading"');
  });
});
