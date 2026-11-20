// 质检记录自动判级边界：grade 键缺席时按合格率 95/80 两阈值判 A/B/C。
// 后端判据：services/quality_inspection_service.rs:33-72 定义 A=95、B=80 与 determine_quality_grade；
// :347-381 仅在 grade 缺席时调用该判定；handlers/quality_inspection_handler.rs:192-206 校验
// inspection_type 与 inspection_result 后落库。状态词来自
// models/status/quality_dyeing.rs:307-343（inspection_type 小写、结果中文逐字符），
// 等级出参为 A/B/C（service:33-35）。质检记录无删除端点，故以唯一 inspection_no 隔离。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, ensureTestEntities, genCode, getCtx, loginViaUI } from '../flow/helpers';

interface RecordRow {
  id?: number;
  inspection_no?: string;
  qualification_rate?: string | number;
  inspection_result?: string;
  grade?: string;
}

function int(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[511] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function rateOf(value: unknown, label: string): number {
  expect(
    typeof value === 'string' || typeof value === 'number',
    `[511] ${label} 须数值或 Decimal 字符串，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return Number(value);
}

async function createRecord(
  page: Page,
  productId: number,
  inspectionNo: string,
  rate: string
): Promise<RecordRow> {
  const created = await apiCallRaw<RecordRow>(
    page,
    'POST',
    '/production/quality-inspection/records',
    {
      inspection_no: inspectionNo,
      inspection_type: 'finished',
      product_id: productId,
      inspection_date: new Date().toISOString().slice(0, 10),
      total_qty: '100',
      inspected_qty: '100',
      qualified_qty: rate,
      unqualified_qty: '0',
      qualification_rate: rate,
      inspection_result: '待检',
    }
  );
  int(created?.id, `建质检记录 ${inspectionNo} 返回 id`);
  expect(created.inspection_no, `[511] ${inspectionNo} 单号逐字符落库`).toBe(inspectionNo);
  expect(created.inspection_result, `[511] ${inspectionNo} 中文结论逐字符落库`).toBe('待检');
  return created;
}

async function readRecord(page: Page, id: number, label: string): Promise<RecordRow> {
  const found = await apiCallRaw<RecordRow>(
    page,
    'GET',
    `/production/quality-inspection/records/${id}`
  );
  expect(found.id, `[511] ${label} 详情 id`).toBe(id);
  return found;
}

test.describe('511 质检自动判级边界', () => {
  test('511-01 grade 缺席时 95/94.99/80/79.99 精确判 A/B/B/C', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `[511] 夹具缺产品，productIds=${ctx.productIds.length}`).toBe(
      true
    );
    const productId = ctx.productIds[0];
    const tag = genCode('E511');
    const cases = [
      { suffix: 'A95', rate: '95', grade: 'A' },
      { suffix: 'B9499', rate: '94.99', grade: 'B' },
      { suffix: 'B80', rate: '80', grade: 'B' },
      { suffix: 'C7999', rate: '79.99', grade: 'C' },
    ];

    for (const item of cases) {
      const inspectionNo = `${tag}-${item.suffix}`;
      const created = await createRecord(page, productId, inspectionNo, item.rate);
      expect(created.grade, `[511] ${item.rate}% 建单响应自动判级`).toBe(item.grade);

      const found = await readRecord(page, int(created.id, '质检记录 id'), item.suffix);
      expect(found.inspection_no, '[511] 详情单号与建单一致').toBe(inspectionNo);
      expect(found.inspection_result, '[511] 详情中文结论逐字符一致').toBe('待检');
      expect(
        rateOf(found.qualification_rate, `${item.suffix} 回读合格率`),
        `[511] ${item.suffix} 合格率须原值回读`
      ).toBe(Number(item.rate));
      expect(found.grade, `[511] ${item.rate}% 详情回读自动判级`).toBe(item.grade);
    }
  });
});
