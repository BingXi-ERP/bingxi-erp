/**
 * 资金管理页手机端适配契约锁（账户 + 转账 + 容器）。
 * 功能：pin 住 fund 域在手机端（<768）表格改卡片、弹窗表单响应式。
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

describe('资金管理页手机端适配契约锁', () => {
  it('AccountTab 手机卡 6 字段 + 状态/余额同源', () => {
    const s = read('src/views/fund/tabs/AccountTab.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    const i = s.indexOf('<section v-if="isPhone"');
    expect(i, '账户卡缺失').toBeGreaterThanOrEqual(0);
    const pk = s.slice(i, s.indexOf('</section>', i));
    for (const f of [
      'account_no',
      'account_name',
      'bank_name',
      'balance',
      'frozen_balance',
      'status',
    ]) {
      expect(pk, `账户卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('getAccountStatusLabel');
    expect(pk).toContain('viewDetail');
    expect(pk).toContain('handleDeposit');
    expect(pk).toContain("row.status === 'active'");
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
  });

  it('AccountTab 3 弹窗宽度响应式, 2 表单 label 顶置', () => {
    const s = read('src/views/fund/tabs/AccountTab.vue');
    const widths = (s.match(/:width="isPhone \? '95%' : '\d+px'"/g) || []).length;
    expect(widths, '应有 3 个弹窗宽度响应式').toBe(3);
    const labels = (s.match(/:label-position="isPhone \? 'top' : 'right'"/g) || []).length;
    expect(labels, '应有 2 个表单 label 顶置').toBe(2);
  });

  it('TransferTab 表格改卡片, 弹窗响应式', () => {
    const s = read('src/views/fund/tabs/TransferTab.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    const i = s.indexOf('<section v-if="isPhone"');
    expect(i, '转账卡缺失').toBeGreaterThanOrEqual(0);
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(s).toMatch(/:width="isPhone \? '95%' : '\d+px'"/);
  });

  it('fund 容器手机端 padding 收缩', () => {
    const s = read('src/views/fund/index.vue');
    const i = s.indexOf('@media (max-width: 767px)');
    expect(i, '容器缺媒体查询').toBeGreaterThanOrEqual(0);
    expect(s.slice(i)).toContain('padding: 12px');
  });
});
