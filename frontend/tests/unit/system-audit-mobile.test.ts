/**
 * 审计日志页手机端适配契约锁。
 * 功能：pin 住 audit-log 在手机端（<768）V2Table 改卡片、筛选堆叠、详情单列。
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
  path.join(FRONTEND_ROOT, 'src/views/system/audit-log/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('审计日志页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 11 字段，标签/时间工具同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'id',
      'created_at',
      'operation_type',
      'severity',
      'username',
      'resource_type',
      'resource_id',
      'resource_name',
      'ip_address',
      'request_id',
      'description',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('formatDateTime');
    expect(pk).toContain('getOpTypeLabel');
    expect(pk).toContain('getSeverityLabel');
    expect(pk).toContain('handleViewDetail');
  });

  it('详情描述列表手机端改单列，筛选堆叠，V2Table 保留桌面', () => {
    expect(SRC).toMatch(/:column="isPhone \? 1 : 2"/);
    expect(SRC).toMatch(/:inline="!isPhone"/);
    expect(SRC).toMatch(/<V2Table\s+v-if="!isPhone"/);
  });
});
