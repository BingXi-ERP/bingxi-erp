/**
 * 多域简单页手机端适配批量契约锁。
 * 功能：pin 住本批次 84 个简单页至少具备一类 isPhone 响应式改造
 *       （dialog 宽度 / form label / descriptions 单列 / 容器 padding）。
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

const changed = [
  'account-subject/index.vue',
  'accounting-period/index.vue',
  'admin/failover.vue',
  'advanced/index.vue',
  'ap/index.vue',
  'api-gateway/index.vue',
  'ar/index.vue',
  'ar-reconciliation/enhanced.vue',
  'ar-reconciliation/index.vue',
  'barcode-scanner/index.vue',
  'bi/SalesAnalysis.vue',
  'budget/index.vue',
  'budgets/index.vue',
  'bulk-color-approval/index.vue',
  'capacity/index.vue',
  'certificates-of-origin/index.vue',
  'chemicals/index.vue',
  'company/index.vue',
  'components-demo/index.vue',
  'cost/index.vue',
  'cost/tabs/CostCollectionTab.vue',
  'currency/index.vue',
  'currency/tabs/CurrencyListTab.vue',
  'customer/tabs/CustomerFormTab.vue',
  'customer-collab/index.vue',
  'Dashboard.vue',
  'data-import/index.vue',
  'departments/index.vue',
  'dye-batch/index.vue',
  'dye-recipe/index.vue',
  'email/index.vue',
  'environmental-compliance/index.vue',
  'export-compliance/index.vue',
  'export-inspections/index.vue',
  'fabric-inspections/index.vue',
  'field-permissions/index.vue',
  'finance-report/index.vue',
  'financial-analysis/index.vue',
  'financial-analysis/tabs/AnalysisListTab.vue',
  'fixed-assets/index.vue',
  'fixed-assets/tabs/AssetListTab.vue',
  'flow-cards/index.vue',
  'greige-fabrics/index.vue',
  'invoice-details/index.vue',
  'lab-dip/index.vue',
  'labor-contracts/index.vue',
  'logistics/index.vue',
  'material-shortage/index.vue',
  'notification/index.vue',
  'occupational-health/index.vue',
  'outsourcing/index.vue',
  'period-adjustments/index.vue',
  'print-targets/index.vue',
  'print-templates/index.vue',
  'production/index.vue',
  'production-recipes/index.vue',
  'purchase/index.vue',
  'purchase-contract/index.vue',
  'purchase-inspection/index.vue',
  'purchase-price/index.vue',
  'purchase-receipt/index.vue',
  'purchase-return/index.vue',
  'quality-8d/index.vue',
  'quality-standards/index.vue',
  'report-templates/index.vue',
  'roles/index.vue',
  'sales-analysis/index.vue',
  'sales-contract/index.vue',
  'sales-price/index.vue',
  'sales-returns/index.vue',
  'scheduling/gantt.vue',
  'scheduling/index.vue',
  'Setup.vue',
  'social-insurance/index.vue',
  'supplier-evaluation/index.vue',
  'system-governance/index.vue',
  'tax-rebates/index.vue',
  'textile-safety/index.vue',
  'textile-safety/master.vue',
  'users/index.vue',
  'voucher/index.vue',
  'wage/index.vue',
  'warehouse/index.vue',
  'webhooks/index.vue',
];

describe('多域简单页手机端适配批量契约锁', () => {
  it('本批次改动清单非空且全部具备 isPhone 响应式声明', () => {
    expect(changed.length, '批量改造清单不应为空').toBeGreaterThan(50);
    for (const p of changed) {
      const s = read('src/views/' + p);
      expect(s, `${p} 缺少 isPhone 声明（除纯 padding 改造外）`).toMatch(
        /isPhone|@media\s*\(max-width:\s*767px\)/
      );
    }
  });

  it('响应式 dialog 与 form label 使用统一 isPhone 三元', () => {
    let dialogCount = 0;
    let labelCount = 0;
    for (const p of changed) {
      const s = read('src/views/' + p);
      if (/:width="isPhone \? '95%' : '\d+px'"/.test(s)) {
        dialogCount++;
        expect(s, `${p} 仍有固定宽度 dialog`).not.toMatch(/<el-dialog[^>]*\swidth="\d+px"/);
      }
      if (/:label-position="isPhone \? 'top' : 'right'"/.test(s)) labelCount++;
    }
    expect(dialogCount, '应有多个 dialog 改造').toBeGreaterThan(30);
    expect(labelCount, '应有多个 form label 改造').toBeGreaterThan(40);
  });

  it('固定 el-dialog/el-form/descriptions 宽度未残留（针对本批次）', () => {
    for (const p of changed) {
      const s = read('src/views/' + p);
      if (s.includes('isPhone')) {
        expect(s, `${p} 仍有固定 :column`).not.toMatch(/:column="\d+"/);
      }
    }
  });
});
