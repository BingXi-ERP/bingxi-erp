/**
 * 功能：把「供应商停用后状态列翻转、显式过滤面命中、历史采购单仍可查」钉成真实 API 链。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属供应商，建关联采购单后走 toggle 口停用，再用列表过滤口与详情口回读。
 * - 入参：唯一 supplier_name 建商体；toggle 体 {enable:false}；PO 最小建单体（夹具仓库/部门/产品）；
 *   列表口用唯一名称作 keyword 分别叠加 ?status=inactive 与 ?is_enabled=false。
 * - 传给谁：POST /purchase/suppliers、POST /purchase/orders、POST /purchase/suppliers/{id}/status、
 *   GET /purchase/suppliers、GET /purchase/suppliers/{id}、GET /purchase/orders/{id}。
 * - 存什么：断言落在 toggle 回读与详情口的 is_enabled/status 两列、两条过滤面的命中行、历史 PO 详情 200。
 * - 存哪里：suppliers 与 purchase_orders 各一行；收尾先撤 PO 再撤供应商（停用行删除走引用守卫语义外路径，
 *   自建无引用面之外的 PO 已先撤，保证清理成功）。
 *
 * 源码判据：
 * - services/supplier_service.rs::toggle_supplier_status 写 is_enabled=Some(false)、
 *   status=Some(INACTIVE)（词表 models/status/general.rs 小写 active/inactive，比较值逐字符照抄）。
 * - apply_supplier_filters 仅在显式传参时过滤：status 精确等值、is_enabled 布尔等值；
 *   无默认剔除，故 ?status=inactive 与 ?is_enabled=false 都必须命中本行。
 * - PO 详情按主键直查，供应商停用不级联改单据 → GET /purchase/orders/{id} 仍 200。
 * 与 15-07（双向跃迁）不重复：本用例钉的是过滤面命中与历史单据可查，15 号未覆盖。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, ensureTestEntities, genName, getCtx, tryCleanup } from './helpers';

interface SupplierRow {
  id: number;
  supplier_name: string;
  status: string | null;
  is_enabled: boolean | null;
}

interface SupplierPage {
  items: SupplierRow[];
  total: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe.serial('612 供应商停用后过滤面命中且历史采购单可查', () => {
  test('612-1 toggle 落 inactive、双过滤面命中、历史 PO 仍 200', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();

    const name = genName('612停用供应商');
    const sup = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', {
      supplier_name: name,
      contact_person: '612校验员',
      contact_phone: '13800000045',
    });
    const supplierId = Number(sup?.id);
    expect(supplierId, '[612-1] 自建供应商必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/purchase/suppliers/${supplierId}`, label: '[612-1] 自建供应商' });

    const po = await apiCallRaw<{ id?: number }>(page, 'POST', '/purchase/orders', {
      supplier_id: supplierId,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      items: [
        {
          material_id: ctx.productIds[0],
          quantity_ordered: '1',
          unit_price: '1.00',
          tax_rate: 13,
        },
      ],
    });
    const poId = Number(po?.id);
    expect(poId, '[612-1] 关联采购单必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/purchase/orders/${poId}`, label: '[612-1] 历史采购单' });

    const toggled = await apiCallRaw<SupplierRow>(
      page,
      'POST',
      `/purchase/suppliers/${supplierId}/status`,
      { enable: false }
    );
    expect(
      toggled?.is_enabled === false,
      `[612-1] toggle 回读 is_enabled 必须为 false，实际 ${JSON.stringify(toggled?.is_enabled)}`
    ).toBe(true);
    expect(
      String(toggled?.status ?? ''),
      `[612-1] toggle 回读 status 必须为词表小写 inactive，实际 ${JSON.stringify(toggled?.status)}`
    ).toBe('inactive');

    const detail = await apiCallRaw<SupplierRow>(page, 'GET', `/purchase/suppliers/${supplierId}`);
    expect(detail?.is_enabled === false, '[612-1] 停用后详情口 is_enabled 必须为 false').toBe(true);
    expect(String(detail?.status ?? ''), '[612-1] 停用后详情口 status 必须为 inactive').toBe(
      'inactive'
    );

    const byStatusPath = `/purchase/suppliers?status=inactive&keyword=${encodeURIComponent(
      name
    )}&page=1&page_size=100`;
    const byStatus = await apiCallRaw<SupplierPage>(page, 'GET', byStatusPath);
    expect(Array.isArray(byStatus.items), '[612-1] status 过滤面必须回 items 数组').toBe(true);
    expect(
      byStatus.total,
      `[612-1] ?status=inactive 必须命中自建供应商 1 行，实际 ${byStatus.total}`
    ).toBe(1);
    expect(
      byStatus.items.some(row => Number(row.id) === supplierId && row.is_enabled === false),
      '[612-1] status 过滤面命中的必须是自建停用行'
    ).toBe(true);

    const byEnabledPath = `/purchase/suppliers?is_enabled=false&keyword=${encodeURIComponent(
      name
    )}&page=1&page_size=100`;
    const byEnabled = await apiCallRaw<SupplierPage>(page, 'GET', byEnabledPath);
    expect(Array.isArray(byEnabled.items), '[612-1] is_enabled 过滤面必须回 items 数组').toBe(true);
    expect(
      byEnabled.total,
      `[612-1] ?is_enabled=false 必须命中自建供应商 1 行，实际 ${byEnabled.total}`
    ).toBe(1);
    expect(
      byEnabled.items.some(
        row => Number(row.id) === supplierId && String(row.status ?? '') === 'inactive'
      ),
      '[612-1] is_enabled 过滤面命中的必须是自建停用行'
    ).toBe(true);

    // apiCallRaw 只在 2xx 且信封 code=200 时返回数据，成功回读即证明历史 PO 未被停用级联影响。
    const poAfter = await apiCallRaw<{ id?: number }>(page, 'GET', `/purchase/orders/${poId}`);
    expect(Number(poAfter?.id), '[612-1] 历史采购单回读主键必须仍是自建 PO（2xx）').toBe(poId);
  });
});
