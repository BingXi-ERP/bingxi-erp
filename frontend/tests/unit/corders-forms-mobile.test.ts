/**
 * 自定义订单创建/编辑页手机端适配契约锁。
 * 功能：pin 住 create/edit 表单在手机端（<768）label 顶置。
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

describe('自定义订单创建/编辑页手机端适配契约锁', () => {
  for (const f of ['src/views/custom-orders/create.vue', 'src/views/custom-orders/edit.vue']) {
    it(`${f} label 顶置且字段保留`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      expect(s, `${f} label 未顶置`).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
      expect(s, `${f} 缺少表单字段`).toContain('prop="spec"');
      expect(s, `${f} 缺少提交动作`).toContain('handleSubmit');
    });
  }
});
