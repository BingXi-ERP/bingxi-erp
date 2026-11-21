/**
 * CRM 商机列表手机端适配契约锁。
 * 功能：pin 住 opportunities 页在手机端（<768）改为卡片列表，字段与动作与桌面表格等价。
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
  path.join(FRONTEND_ROOT, 'src/views/crm/opportunities/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const start = SRC.indexOf('<section v-if="isPhone"');
  const end = SRC.indexOf('</section>', start);
  expect(start, '缺少手机端 section 起始').toBeGreaterThanOrEqual(0);
  expect(end, '缺少手机端 section 闭合').toBeGreaterThan(start);
  return SRC.slice(start, end);
};

describe('CRM 商机列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡片字段覆盖桌面表格全部 9 列，删任一列即失败', () => {
    const pk = phoneBlock();
    const fields = [
      'opportunity_no',
      'opportunity_name',
      'customer_name',
      'expected_close_date',
      'owner_name',
      'last_follow_up_date',
    ];
    for (const f of fields) {
      expect(pk, `手机卡片缺少字段 ${f}`).toContain(f);
    }
  });

  it('金额/概率/阶段三列复用既有显示函数绑定行数据，未自造映射', () => {
    const pk = phoneBlock();
    // 这三列桌面用显示函数而非裸 prop，手机必须同样绑定 row，否则删掉渲染即失败
    expect(pk).toContain('displayEstimatedAmount(row)');
    expect(pk).toContain('displayWinProbability(row)');
    expect(pk).toContain('getStageLabel(row.opportunity_stage');
    expect(pk).toContain('getStageType(row.opportunity_stage');
  });

  it('手机卡片保留 7 个动作，阶段门控与桌面一致', () => {
    const pk = phoneBlock();
    for (const action of [
      'handleView',
      'openEditDialog',
      'openFollowDialog',
      'handleWin',
      'handleLost',
      'handleConvertToOrder',
      'handleCrmAnalytics',
    ]) {
      expect(pk, `手机卡片缺少动作 ${action}`).toContain(action);
    }
    expect(pk).toContain('OPPORTUNITY_STAGE.CLOSED_WON');
    expect(pk).toContain('PERMISSIONS.CRM_OPPORTUNITY_UPDATE');
  });

  it('桌面 el-table 保留在 v-if=!isPhone 分支，分页未删除', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
  });
});
