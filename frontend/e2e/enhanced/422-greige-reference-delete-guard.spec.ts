/**
 * 4.22 主数据引用完整性：被活染色批次引用的坯布禁止删除，且拒因点名缸号。
 *
 * 调用面：DELETE /api/v1/erp/production/greige-fabrics/{id}
 *   后端 handlers/greige_fabric_handler.rs:755-797 delete_greige_fabric 的删除门顺序：
 *   :780-784 先 find_greige_reference_rejection（染色批次/委外发料引用），
 *   :786-788 再 remaining_stock_rejection（在架库存）。拒因经
 *   utils/error.rs:209 business_displayable 构造，:851 明确出参 message 原文外显
 *   （测试 error.rs:914-918 锁该行为），与 31b 在库态那条脱敏的 business 门是不同路径。
 *   染色批次引用文案见 greige_fabric_handler.rs:688-693：
 *   「坯布 {fabric_no} 已被染色批次引用（缸号 {doc_list}），请先删除这些染色批次或把它们改配到其他坯布」。
 * 判据：自建零库存坯布 + 一个白坯染色批次引用它 → DELETE 该坯布须 400、
 *   code=BUSINESS_ERROR、message 点名「已被染色批次引用」与该批次 batch_no；
 *   GET 回读仍 200（删除被拒无副作用）。去掉引用门时该断言即红，是真检测。
 *   现有 31b 删除矩阵只断在库态 400 与回读（31b:926-958），无活单据引用拒因文案断言——
 *   本例补上「被下游单据引用」这条独立拒绝原因，且文案可外显故逐字断言。
 * 前置：白坯染色批次（color_no 空）免色号/缸号前置（dye_batch_handler.rs:191-197），
 *   零库存坯布不先撞库存门；每步显式日志，afterEach 先删批次再删坯布清理。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];

test.describe('4.22 坯布引用删除守卫', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    // 逆序清理：先删染色批次，再删坯布，避免坯布仍被引用时删不掉
    for (const c of CLEANUP.reverse()) {
      await tryCleanup(page, 'DELETE', c.path, c.label);
    }
    CLEANUP.length = 0;
  });

  test('4.22-01 被活染色批次引用的坯布删除被拒且点名批次号', async ({ page }) => {
    const tag = genCode('E2E-422');
    const fabricNo = `E2E-GFG-${tag}`;

    // 零库存坯布：weight/length 显式 0，status 在库但不撞库存门（引用门在库存门之前）
    const fabric = await apiCall<{ id?: number }>(page, 'POST', '/production/greige-fabrics', {
      fabric_no: fabricNo,
      fabric_name: `E2E 引用守卫坯布 ${tag}`,
      fabric_type: '梭织',
      product_id: 1,
      supplier_id: 1,
      warehouse_id: 1,
      weight_kg: 0,
      length_m: 0,
      quantity_meters: 0,
      quantity_kg: 0,
      status: '在库',
      remarks: 'E2E 4.22 引用守卫前置',
    });
    const fabricId = fabric.data?.id;
    expect(fabricId, `引用守卫坯布建档失败：${JSON.stringify(fabric)}`).toBeTruthy();
    CLEANUP.push({ path: `/production/greige-fabrics/${fabricId}`, label: 'greige_fabric' });

    // 白坯染色批次引用该坯布：color_no 空免色号前置，dye_lot_no 归一为空串
    const batchNo = `E2E-DB-${tag}`;
    const batch = await apiCall<{ id?: number }>(page, 'POST', '/production/dye-batches', {
      batch_no: batchNo,
      greige_fabric_id: fabricId,
      planned_quantity: 100,
    });
    const batchId = batch.data?.id;
    expect(batchId, `引用坯布的染色批次创建失败：${JSON.stringify(batch)}`).toBeTruthy();
    CLEANUP.push({ path: `/production/dye-batches/${batchId}`, label: 'dye_batch' });

    // 删除被活染色批次引用的坯布：须 400 + BUSINESS_ERROR + 外显文案点名批次号
    const rejected = await apiCallExpectFail(
      page,
      'DELETE',
      `/production/greige-fabrics/${fabricId}`
    );
    expect(rejected.status, '被引用坯布删除应 400（业务规则拒绝）').toBe(400);
    expect(String(rejected.code ?? ''), '机器码应为业务错误').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const msg = String(rejected.message ?? '');
    expect(msg, '拒因须外显「已被染色批次引用」而非脱敏常量').toContain('已被染色批次引用');
    expect(msg, '拒因须点名引用它的批次号，便于用户定位下游单据').toContain(batchNo);
    console.log(`[4.22] DELETE 被引用坯布 → 400 msg=${msg}`);

    // 删除被拒不应产生副作用：详情回读仍 200
    const stillThere = await page.request.get(
      `${process.env.API_BASE || 'http://localhost:8082'}/api/v1/erp/production/greige-fabrics/${fabricId}`
    );
    expect(stillThere.status(), '删除被拒后坯布记录不应消失').toBe(200);

    const again = await apiCallExpectFail(page, 'DELETE', `/production/greige-fabrics/${fabricId}`);
    expect(again.status, '引用未解除前重复删除仍应被拒，不得静默成功').toBe(400);
  });

  test('4.22-02 有在架库存的坯布删除被拒且拒因点名库存事实', async ({ page }) => {
    const tag = genCode('E2E-422B');
    const fabricNo = `E2E-GFG-${tag}`;

    // 有在架库存、无任何下游引用：只撞库存门（greige_fabric_handler.rs:786-788）。
    // 拒因文案 remaining_stock_rejection（:737-753）走 business_displayable 外显（error.rs:851）。
    const fabric = await apiCall<{ id?: number }>(page, 'POST', '/production/greige-fabrics', {
      fabric_no: fabricNo,
      fabric_name: `E2E 库存守卫坯布 ${tag}`,
      fabric_type: '梭织',
      product_id: 1,
      supplier_id: 1,
      warehouse_id: 1,
      weight_kg: 12.5,
      length_m: 0,
      quantity_meters: 0,
      quantity_kg: 12.5,
      status: '在库',
      remarks: 'E2E 4.22 库存守卫前置',
    });
    const fabricId = fabric.data?.id;
    expect(fabricId, `库存守卫坯布建档失败：${JSON.stringify(fabric)}`).toBeTruthy();
    CLEANUP.push({ path: `/production/greige-fabrics/${fabricId}`, label: 'greige_fabric' });

    const rejected = await apiCallExpectFail(
      page,
      'DELETE',
      `/production/greige-fabrics/${fabricId}`
    );
    expect(rejected.status, '有在架库存坯布删除应 400').toBe(400);
    expect(String(rejected.code ?? ''), '机器码应为业务错误').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const msg = String(rejected.message ?? '');
    expect(msg, '拒因须外显「仍有在架库存」而非脱敏常量').toContain('仍有在架库存');
    expect(msg, '拒因须点名坯布号，便于用户定位').toContain(fabricNo);
    expect(msg, '只登记重量的坯布，拒因须带重量单位公斤').toContain('公斤');
    console.log(`[4.22] DELETE 有库存坯布 → 400 msg=${msg}`);

    // 删除被拒不应产生副作用：详情回读仍 200
    const stillThere = await page.request.get(
      `${process.env.API_BASE || 'http://localhost:8082'}/api/v1/erp/production/greige-fabrics/${fabricId}`
    );
    expect(stillThere.status(), '删除被拒后坯布记录不应消失').toBe(200);
  });
});
