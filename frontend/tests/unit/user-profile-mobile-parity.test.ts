/**
 * 个人中心移动端适配契约锁。
 * 功能：pin 住 profile 页在手机端（<768）改为单列卡片、字段与安全动作不丢失。
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

function readRepoSource(absPath: string): string {
  return readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
}

const PROFILE_SRC = readRepoSource(path.join(FRONTEND_ROOT, 'src/views/user-profile/index.vue'));

describe('个人中心移动端适配契约锁', () => {
  it('声明 isPhone 断点为 width < 768，与全仓手机卡片范式一致', () => {
    expect(PROFILE_SRC).toMatch(
      /import\s*\{[^}]*useBreakpoint[^}]*\}\s*from\s*'@\/composables\/useBreakpoint'/
    );
    expect(PROFILE_SRC).toMatch(
      /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
    );
  });

  it('存在手机端单列卡片分支，且桌面分支用 v-else 保留原布局', () => {
    expect(PROFILE_SRC).toMatch(/<template\s+v-if="isPhone"/);
    expect(PROFILE_SRC).toMatch(/<template\s+v-else/);
  });

  it('手机端身份卡展示头像、姓名、角色与部门字段', () => {
    const phoneStart = PROFILE_SRC.indexOf('<template v-if="isPhone"');
    const phoneEnd = PROFILE_SRC.indexOf('<template v-else');
    const phoneBlock = PROFILE_SRC.slice(phoneStart, phoneEnd);
    for (const key of [
      'profileForm.avatar',
      'profileForm.real_name',
      'role_names',
      'department_name',
    ]) {
      expect(phoneBlock, `手机端身份卡缺少字段 ${key}`).toContain(key);
    }
  });

  it('手机端资料表单保留桌面端全部 6 字段，删除任一字段即失败', () => {
    const phoneStart = PROFILE_SRC.indexOf('<template v-if="isPhone"');
    const phoneEnd = PROFILE_SRC.indexOf('<template v-else');
    const phoneBlock = PROFILE_SRC.slice(phoneStart, phoneEnd);
    // 与桌面分支等价的字段集合：用户名不可编辑、姓名/邮箱/手机可编辑、部门/角色只读
    const fields = [
      'v-model="profileForm.username"',
      'v-model="profileForm.real_name"',
      'v-model="profileForm.email"',
      'v-model="profileForm.phone"',
      'v-model="profileForm.department_name"',
      "profileForm.role_names?.join(', ')",
    ];
    for (const field of fields) {
      expect(phoneBlock, `手机端资料表单缺少字段 ${field}`).toContain(field);
    }
  });

  it('手机端表单字段 label 顶部对齐，避免窄屏挤压', () => {
    const phoneStart = PROFILE_SRC.indexOf('<template v-if="isPhone"');
    const phoneEnd = PROFILE_SRC.indexOf('<template v-else');
    const phoneBlock = PROFILE_SRC.slice(phoneStart, phoneEnd);
    expect(phoneBlock).toMatch(/label-position="top"/);
  });

  it('手机端保留修改密码卡与 2FA 入口，动作不丢失', () => {
    const phoneStart = PROFILE_SRC.indexOf('<template v-if="isPhone"');
    const phoneEnd = PROFILE_SRC.indexOf('<template v-else');
    const phoneBlock = PROFILE_SRC.slice(phoneStart, phoneEnd);
    expect(phoneBlock).toContain('handleSaveProfile');
    expect(phoneBlock).toContain('handleChangePassword');
    expect(phoneBlock).toContain('goTo2fa');
  });

  it('仍调用加载与保存/改密三个既有 API，未新增或删除契约调用', () => {
    for (const fn of ['getUserProfile', 'updateUserProfile', 'changePassword']) {
      expect(PROFILE_SRC, `缺少 API 调用 ${fn}`).toContain(fn);
    }
  });
});
