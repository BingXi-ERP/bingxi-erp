/**
 * 安全中心手机端适配契约锁（3 表格组件 + 改密表单 + 2 容器）。
 * 功能：pin 住 security 域在手机端（<768）表格改卡片、表单 label 顶置、容器 padding。
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

describe('安全中心手机端适配契约锁', () => {
  const tables: Array<[string, string[]]> = [
    [
      'src/views/security/components/SecurityLogTable.vue',
      ['username', 'login_type', 'ip_address', 'user_agent', 'status', 'fail_reason', 'login_time'],
    ],
    [
      'src/views/security/components/SecurityLockTable.vue',
      ['username', 'lock_reason', 'locked_at', 'unlock_at'],
    ],
    [
      'src/views/security/components/SecurityAlertTable.vue',
      ['alert_type', 'username', 'ip_address', 'description', 'created_at', 'status'],
    ],
  ];
  for (const [f, fields] of tables) {
    it(`${f} 手机卡字段与动作同源`, () => {
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

  it('LockTable 解锁动作保留', () => {
    const s = read('src/views/security/components/SecurityLockTable.vue');
    const i = s.indexOf('<section v-if="isPhone"');
    expect(s.slice(i, s.indexOf('</section>', i))).toContain("emit('unlock'");
  });

  it('改密表单 label 顶置', () => {
    const s = read('src/views/security/ChangePassword.vue');
    expect(s).toMatch(/const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/);
    expect(s).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
  });

  it('两个容器手机端 padding 收缩', () => {
    for (const f of ['src/views/security/index.vue', 'src/views/security/TwoFactorSetup.vue']) {
      const s = read(f);
      const i = s.indexOf('@media (max-width: 767px)');
      expect(i, `${f} 缺媒体查询`).toBeGreaterThanOrEqual(0);
      expect(s.slice(i)).toContain('padding: 12px');
    }
  });
});
