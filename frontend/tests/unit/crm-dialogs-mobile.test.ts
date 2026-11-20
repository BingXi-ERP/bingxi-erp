/**
 * CRM 弹窗表单手机端适配契约锁（10 个 tab/对话框组件）。
 * 功能：pin 住各对话框在手机端（<768）宽度不溢出、表单 label 顶置。
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
  'src/views/crm/leads/tabs/LeadFormTab.vue',
  'src/views/crm/opportunities/tabs/OpportunityFollowTab.vue',
  'src/views/crm/opportunities/tabs/OpportunityFormTab.vue',
  'src/views/crm/tabs/ClaimDialogTab.vue',
  'src/views/crm/tabs/FollowUpTab.vue',
  'src/views/crm/tabs/ManualAssignDialogTab.vue',
  'src/views/crm/tabs/ReleaseDialogTab.vue',
  'src/views/crm/tabs/RuleDialogTab.vue',
  'src/views/crm/tabs/TagsPanelTab.vue',
  'src/views/crm/tabs/TransferDialogTab.vue',
];

describe('CRM 弹窗表单手机端适配契约锁', () => {
  for (const f of dialogFiles) {
    it(`${f} 对话框宽度与表单 label 随 isPhone 响应式`, () => {
      const s = read(f);
      expect(s, `${f} 未声明 isPhone`).toMatch(
        /const\s+isPhone\s*=\s*computed\(\(\)\s*=>\s*width\.value\s*<\s*768\)/
      );
      expect(s, `${f} 未导入 useBreakpoint`).toMatch(/from\s*'@\/composables\/useBreakpoint'/);
      // 至少有一个响应式对话框宽度
      expect(s, `${f} 对话框宽度未响应式`).toMatch(/:width="isPhone \? '95%' : '/);
      // 至少有一个响应式表单 label 位置
      expect(s, `${f} 表单 label 未顶置`).toMatch(/:label-position="isPhone \? 'top' : 'right'"/);
      // 固定宽度对话框属性不应残留（TagsPanel 的 2 个都要改）
      expect(s, `${f} 仍有固定宽度对话框`).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"/);
    });
  }
});
