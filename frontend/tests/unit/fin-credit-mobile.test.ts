/**
 * 客户信用页手机端适配契约锁。
 * 功能：pin 住 customer-credit/index 在手机端（<768）表格改卡片、8 动作与权限等价。
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
  path.join(FRONTEND_ROOT, 'src/views/customer-credit/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('客户信用页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 6 数据列，等级/状态/可用额度渲染与桌面同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'customer_name',
      'credit_level',
      'credit_limit',
      'used_credit',
      'available_credit',
      "row.status === 'active'",
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('isUnratedCreditLevel');
    expect(pk).toContain('creditLevelTagType');
    expect(pk).toContain('isAvailableCreditPositive');
  });

  it('手机卡保留 8 动作与权限/状态门控', () => {
    const pk = phoneBlock();
    for (const fn of [
      'handleViewDetail',
      'handleEdit',
      'openAdjustDialog',
      'openOccupyDialog',
      'openReleaseDialog',
      'handleEvaluate',
      'handleDeactivate',
      'handleDelete',
    ]) {
      expect(pk, `手机卡缺少动作 ${fn}`).toContain(fn);
    }
    for (const perm of [
      'CUSTOMER_CREDIT_READ',
      'CUSTOMER_CREDIT_UPDATE',
      'CUSTOMER_CREDIT_CREATE',
      'CUSTOMER_CREDIT_RELEASE',
      'CUSTOMER_CREDIT_DELETE',
    ]) {
      expect(pk, `手机卡缺少权限 ${perm}`).toContain(`PERMISSIONS.${perm}`);
    }
    expect(pk).toContain("row.status === 'active'");
  });

  it('桌面表格与分页保留，2 个内置弹窗宽度响应式', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
    const widths = (SRC.match(/:width="isPhone \? '95%' : '\d+px'"/g) || []).length;
    expect(widths, '应有 2 个内置弹窗宽度响应式').toBe(2);
  });
});
