// 4.37 面料计量深度：坯布入库腿的米/公斤双单位一致性门。
// 后端判据：handlers/greige_fabric_handler.rs:834-840 在 stock_in handler 内真调
//   ensure_dual_unit_consistent(in_length, in_weight, gram_weight, width_cm, "本次入库量")；
//   同文件 :302-305 不一致时 validation_displayable "本次入库量的米数与公斤数不一致，请按克重与门幅核对后重新填写"。
//   换算 utils/dual_unit_converter.rs:27-29 kg=米数×克重(g/m²)×幅宽(m)÷1000，容差默认 0.5%（:71-76）。
// 检测力：负例 50 米配 30 公斤（理论 16 公斤，偏差 87.5% 远超 0.5%）必须被拒且库存不动；
//   正例 50 米配 16 公斤必须放行并回读库存累加。若门被删，负例落库成功即红；若门误一概拒，正例即红。
// 与 400-greige-lot-diff 正交：那条断建档腿的双单位门，本条断入库腿；与 01-greige 正向入库正交（那条无偏差断言）。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id?: number;
  length_m?: string | number | null;
  weight_kg?: string | number | null;
  quantity_meters?: string | number | null;
  quantity_kg?: string | number | null;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined) {
    throw new Error(`数值字段缺失，不能当 0 兜底：${JSON.stringify(v)}`);
  }
  return Number(v);
}

async function stockIn(
  page: Page,
  id: number,
  warehouseId: number,
  lengthM: number,
  weightKg: number
) {
  return apiCall(page, 'POST', `/production/greige-fabrics/${id}/stock-in`, {
    warehouse_id: warehouseId,
    length_m: lengthM,
    weight_kg: weightKg,
  });
}

test.describe('4.37 坯布入库双单位一致性门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('437-01 入库米公斤与克重幅宽不一致被拒且库存不动，配平入库放行并累加', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds?.[0];
    const supplierId = ctx.supplierId;
    const warehouseId = ctx.warehouseIds?.[0];
    expect(productId, '前置须有产品用于坯布建档').toBeTruthy();
    expect(supplierId, '前置须有供应商用于坯布建档').toBeTruthy();
    expect(warehouseId, '前置须有仓库用于入库').toBeTruthy();

    const tag = genCode('E437');
    // 建档只给克重与幅宽，不给米数/公斤数：建档腿因缺一项跳过双单位校验（:282-290），
    // 让本用例独占入库腿的判定，不与建档腿混淆。
    const created = await apiCall<Row>(page, 'POST', '/production/greige-fabrics', {
      fabric_no: `${tag}-GF`,
      fabric_name: `${tag}双单位坯布`,
      fabric_type: 'woven',
      product_id: productId,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      color_no: `${tag}-C`,
      dye_lot_no: `${tag}-LOT`,
      gram_weight: 200,
      width_cm: 160,
    });
    const id = created.data?.id;
    expect(id, `坯布建档须返回主键，实际 ${JSON.stringify(created).slice(0, 300)}`).toBeTruthy();

    try {
      const before = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${id}`);
      const lengthBefore = num(before.length_m);
      const weightBefore = num(before.weight_kg);

      // 负例：50 米理论 16 公斤，提交 30 公斤，偏差 87.5% 远超 0.5% 容差。
      const bad = await apiCallExpectFail(
        page,
        'POST',
        `/production/greige-fabrics/${id}/stock-in`,
        {
          warehouse_id: warehouseId,
          length_m: 50,
          weight_kg: 30,
        }
      );
      expectStateGateRejection(bad, '坯布入库双单位不一致');
      expect(
        String(bad.message ?? ''),
        '拒因须点名米数与公斤数不一致，实际 ' + JSON.stringify(bad.message)
      ).toContain('米数与公斤数不一致');

      // 零落库：被拒后库存四列一项都不动，防止"门拒了但腿已经改了库存"的半截写。
      const afterBad = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${id}`);
      expect(num(afterBad.length_m), '拒绝入库后米数不得变化').toBe(lengthBefore);
      expect(num(afterBad.weight_kg), '拒绝入库后公斤数不得变化').toBe(weightBefore);

      // 正例：50 米理论 16 公斤（200×1.6÷1000×50），配平提交须放行。
      await stockIn(page, id!, warehouseId, 50, 16);
      const afterOk = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${id}`);
      expect(num(afterOk.length_m), '配平入库后米数须累加 50').toBe(lengthBefore + 50);
      expect(num(afterOk.weight_kg), '配平入库后公斤数须累加 16').toBe(weightBefore + 16);
      expect(num(afterOk.quantity_meters), '可用米数须与实物米数同步').toBe(num(afterOk.length_m));
      expect(num(afterOk.quantity_kg), '可用公斤须与实物公斤同步').toBe(num(afterOk.weight_kg));
    } finally {
      await tryCleanup(page, 'DELETE', `/production/greige-fabrics/${id}`, '4.37 双单位坯布');
    }
  });
});
