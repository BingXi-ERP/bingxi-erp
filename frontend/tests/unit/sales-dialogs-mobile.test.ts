/**
 * 销售弹窗手机端适配契约锁（6 个对话框）。
 * 功能：pin 住 sales 各对话框在手机端（<768）宽度不溢出、表单 label 顶置。
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

const dialogFiles = [
  'src/views/sales/BulkColorCreateDialog.vue',
  'src/views/sales/ConvertToContractDialog.vue',
  'src/views/sales/DeliveryDialog.vue',
  'src/views/sales/OrderFormDialog.vue',
  'src/views/sales/OrderViewDialog.vue',
  'src/views/sales/ReservationCreateDialog.vue',
];

describe('销售弹窗手机端适配契约锁', () => {
  for (const f of dialogFiles) {
    it(`${f} 对话框宽度随 isPhone 响应式`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      expect(s, `${f} 对话框宽度未响应式`).toMatch(/:width="isPhone \? '95%' : '/);
      expect(s, `${f} 仍有固定宽度对话框`).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"/);
    });
  }

  it('含表单的弹窗 label 顶置', () => {
    for (const f of [
      'src/views/sales/BulkColorCreateDialog.vue',
      'src/views/sales/ConvertToContractDialog.vue',
      'src/views/sales/OrderFormDialog.vue',
      'src/views/sales/ReservationCreateDialog.vue',
    ]) {
      expect(read(f), `${f} 表单 label 未顶置`).toMatch(
        /:label-position="isPhone \? 'top' : 'right'"/
      );
    }
  });
});
