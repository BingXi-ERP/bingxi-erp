/**
 * BPM 域手机端适配契约锁（6 弹窗 + 3 容器）。
 * 功能：pin 住 bpm 域在手机端（<768）弹窗宽度与 label 响应式、容器 padding。
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

describe('BPM 域手机端适配契约锁', () => {
  const dialogs = [
    'src/views/bpm/approval/components/BpmApprovalApproveDialog.vue',
    'src/views/bpm/approval/components/BpmApprovalChainDialog.vue',
    'src/views/bpm/approval/components/BpmApprovalTransitionDialog.vue',
    'src/views/bpm/definitions/components/BpmDefinitionForm.vue',
    'src/views/bpm/definitions/components/BpmDefinitionTemplateDialog.vue',
    'src/views/bpm/definitions/components/BpmDefinitionVersionDialog.vue',
  ];
  for (const f of dialogs) {
    it(`${f} 弹窗宽度与 label 响应式`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 宽度未响应式`).toMatch(/:width="isPhone \? '95%' : '\d+px'"/);
      expect(s, `${f} 仍有固定宽度`).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"/);
    });
  }

  const containers: Array<[string, string]> = [
    ['src/views/bpm/index.vue', 'bpm-page'],
    ['src/views/bpm/definitions.vue', 'bpm-definitions'],
    ['src/views/bpm/approval/index.vue', 'bpm-approval-page'],
  ];
  for (const [f, cls] of containers) {
    it(`${f} 手机端 padding 收缩`, () => {
      const s = read(f);
      const i = s.indexOf('@media (max-width: 767px)');
      expect(i, `${f} 缺媒体查询`).toBeGreaterThanOrEqual(0);
      expect(s.slice(i), `${f} padding 未收缩`).toContain('padding: 12px');
    });
  }
});
