/**
 * 系统更新域手机端适配契约锁（任务/备份表格 + 容器弹窗）。
 * 功能：pin 住 system-update 在手机端（<768）表格改卡片、弹窗响应式。
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

describe('系统更新域手机端适配契约锁', () => {
  const tables: Array<[string, string[]]> = [
    [
      'src/views/system-update/tabs/SystemUpdateTaskTab.vue',
      [
        'task_code',
        'from_version',
        'to_version',
        'status',
        'progress',
        'error_message',
        'started_at',
        'completed_at',
      ],
    ],
    [
      'src/views/system-update/tabs/SystemUpdateBackupTab.vue',
      [
        'backup_code',
        'backup_type',
        'description',
        'file_size',
        'status',
        'created_by_name',
        'created_at',
      ],
    ],
  ];
  for (const [f, fields] of tables) {
    it(`${f} 手机卡字段与桌面同源`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      const i = s.indexOf('<section v-if="isPhone"');
      expect(i, `${f} 缺少手机卡`).toBeGreaterThanOrEqual(0);
      const pk = s.slice(i, s.indexOf('</section>', i));
      for (const fld of fields) {
        expect(pk, `${f} 缺少字段 ${fld}`).toContain(fld);
      }
      expect(s, `${f} 桌面表格未保留`).toMatch(/<el-table\s+v-if="!isPhone"/);
    });
  }

  it('TaskTab 状态/进度标签同源', () => {
    const s = read('src/views/system-update/tabs/SystemUpdateTaskTab.vue');
    const i = s.indexOf('<section v-if="isPhone"');
    const pk = s.slice(i, s.indexOf('</section>', i));
    expect(pk).toContain('getTaskStatusLabel');
    expect(pk).toContain('isInProgress');
  });

  it('index 2 弹窗与备份表单响应式', () => {
    const idx = read('src/views/system-update/index.vue');
    const widths = (idx.match(/:width="isPhone \? '95%' : '520px'"/g) || []).length;
    expect(widths, '应有 2 个弹窗宽度响应式').toBe(2);
    const form = read('src/views/system-update/components/SystemUpdateBackupForm.vue');
    expect(form).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('只有未开始任务显示取消按钮，执行中任务不提供假取消入口', () => {
    const source = read('src/views/system-update/tabs/SystemUpdateTaskTab.vue');
    const cancelButtons = source.match(/<el-button[^>]*@click="emit\('cancel', row\)"[^>]*>/g);
    expect(cancelButtons, '移动端与桌面端应各保留一个取消入口').toHaveLength(2);
    for (const button of cancelButtons || []) {
      expect(button).toContain(`v-if="row.status === 'pending'"`);
      expect(button).not.toContain('downloading');
      expect(button).not.toContain('installing');
    }
  });

  it('系统更新长任务前端超时与后端 30 分钟上界一致', () => {
    const source = read('src/api/system-update.ts');
    expect(source).toContain('const SYSTEM_UPDATE_TIMEOUT_MS = 30 * 60 * 1000');
    expect(
      (source.match(/timeout:\s*SYSTEM_UPDATE_TIMEOUT_MS/g) || []).length
    ).toBeGreaterThanOrEqual(3);
  });
});
