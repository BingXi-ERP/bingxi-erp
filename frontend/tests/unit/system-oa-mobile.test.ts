/**
 * OA 公告页手机端适配契约锁。
 * 功能：pin 住 oa-announcements 在手机端（<768）表格改卡片、4 动作与弹窗等价。
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
  path.join(FRONTEND_ROOT, 'src/views/system/oa-announcements/index.vue'),
  'utf8'
).replace(/\r\n/g, '\n');

const phoneBlock = () => {
  const s = SRC.indexOf('<section v-if="isPhone"');
  expect(s, '缺少手机 section').toBeGreaterThanOrEqual(0);
  return SRC.slice(s, SRC.indexOf('</section>', s));
};

describe('OA 公告页手机端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768', () => {
    expect(SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(SRC).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
  });

  it('手机卡覆盖 6 字段，状态标签同源', () => {
    const pk = phoneBlock();
    for (const f of [
      'title',
      'announcement_type',
      'status',
      'visibility_scope',
      'publish_date',
      'created_at',
    ]) {
      expect(pk, `手机卡缺少字段 ${f}`).toContain(f);
    }
    expect(pk).toContain('statusTagType');
    expect(pk).toContain('statusLabel');
  });

  it('手机卡保留 4 动作与状态/权限门控', () => {
    const pk = phoneBlock();
    for (const fn of ['openDialog', 'handlePublish', 'handleArchive', 'handleDelete']) {
      expect(pk, `手机卡缺少动作 ${fn}`).toContain(fn);
    }
    expect(pk).toContain("row.status === 'DRAFT'");
    expect(pk).toContain("row.status === 'PUBLISHED'");
    expect(pk).toContain("'oa-announcements:update'");
  });

  it('桌面表格与分页保留，弹窗宽度响应式', () => {
    expect(SRC).toMatch(/<el-table\s+v-if="!isPhone"/);
    expect(SRC).toContain('<el-pagination');
    expect(SRC).toMatch(/:width="isPhone \? '95%' : '650px'"/);
  });
});
