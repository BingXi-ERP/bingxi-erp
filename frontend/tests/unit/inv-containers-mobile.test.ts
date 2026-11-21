/**
 * 库存四域容器手机端适配契约锁。
 * 功能：pin 住 4 个容器 index 在手机端（<768）页面内边距收缩。
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

describe('库存四域容器手机端适配契约锁', () => {
  for (const f of [
    'src/views/inventory-adjustment/index.vue',
    'src/views/inventory-count/index.vue',
    'src/views/inventory-transfer/index.vue',
    'src/views/inventory-batch/index.vue',
  ]) {
    it(`${f} 手机端内边距收缩`, () => {
      const s = read(f);
      const i = s.indexOf('@media (max-width: 767px)');
      expect(i, `${f} 缺少手机端媒体查询`).toBeGreaterThanOrEqual(0);
      const block = s.slice(i);
      expect(block, `${f} 手机端未收缩 padding`).toContain('padding: 12px');
    });
  }
});
