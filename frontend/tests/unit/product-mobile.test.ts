/**
 * 产品域手机端适配契约锁（3 弹窗 + 容器 + 分类表）。
 * 功能：pin 住 product 域 4 页在手机端（<768）弹窗/表单/表格响应式。
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

describe('产品域手机端适配契约锁', () => {
  const dialogPages: Array<[string, string]> = [
    ['src/views/product/tabs/ProductFormDialogTab.vue', '700px'],
    ['src/views/product/tabs/CategoryDialogTab.vue', '600px'],
    ['src/views/product/tabs/ImportDialogTab.vue', '500px'],
  ];
  for (const [f, px] of dialogPages) {
    it(`${f} 弹窗宽度响应式`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      expect(s, `${f} 宽度未响应式`).toContain(`:width="isPhone ? '95%' : '${px}'"`);
      expect(s, `${f} 仍有固定宽度`).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"/);
    });
  }

  it('产品表单 label 顶置', () => {
    expect(read('src/views/product/tabs/ProductFormDialogTab.vue')).toMatch(
      /:label-position="isPhone \? 'top' : 'right'"/
    );
  });

  it('分类表格手机端卡片化，字段与动作保留', () => {
    const s = read('src/views/product/tabs/CategoryDialogTab.vue');
    const i = s.indexOf('<section v-if="isPhone"');
    expect(i, '分类表未卡片化').toBeGreaterThanOrEqual(0);
    const pk = s.slice(i, s.indexOf('</section>', i));
    for (const f of ['id', 'name', 'description']) {
      expect(pk, `分类卡缺少 ${f}`).toContain(f);
    }
    expect(pk).toContain('handleRename');
    expect(pk).toContain('handleDelete');
    expect(s).toMatch(/<el-table\s+v-if="!isPhone"/);
  });

  it('产品容器手机端内边距收缩', () => {
    const s = read('src/views/product/index.vue');
    const i = s.indexOf('@media (max-width: 767px)');
    expect(i, '容器缺媒体查询').toBeGreaterThanOrEqual(0);
    expect(s.slice(i)).toContain('padding: 12px');
  });
});
