/**
 * CRM 公海池列表手机端适配契约锁。
 * 功能：pin 住 pool 页在手机端（<768）改为卡片列表，字段与动作与桌面表格等价。
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
const SRC = readFileSync(path.join(FRONTEND_ROOT, 'src/views/crm/pool.vue'), 'utf8').replace(
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

describe('CRM 公海池列表手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡片字段覆盖桌面表格全部 8 列，删任一列即失败', () => {
    const pk = phoneBlock();
    const fields = [
      'customer_name',
      'contact_person',
      'phone',
      'customer_type',
      'released_at',
      'released_by_name',
      'days_in_pool',
      'release_reason',
    ];
    for (const f of fields) {
      expect(pk, `手机卡片缺少字段 ${f}`).toContain(f);
    }
  });

  it('客户类型/在池天数标签复用既有函数绑定行数据', () => {
    const pk = phoneBlock();
    expect(pk).toContain('getCustomerTypeLabel(row.customer_type)');
    expect(pk).toContain('getCustomerTypeTag(row.customer_type)');
    expect(pk).toContain('getDaysTag(row.days_in_pool)');
  });

  it('手机卡片保留领取/转派/释放 3 动作，释放门控与桌面一致', () => {
    const pk = phoneBlock();
    for (const action of ['openClaimDialog', 'openTransferDialog', 'openReleaseDialog']) {
      expect(pk, `手机卡片缺少动作 ${action}`).toContain(action);
    }
    expect(pk).toContain('row.previous_owner_id');
  });

  it('桌面 el-table 保留在 v-if=!isPhone 分支，批量领取与分页未删除', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('handleClaimSelected');
    expect(SRC).toContain('handleSelectionChange');
    expect(SRC).toContain('<el-pagination');
  });
});
