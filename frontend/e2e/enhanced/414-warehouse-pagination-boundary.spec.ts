/**
 * 4.14 搜索筛选分页：仓库列表页码越界须返回空页、页码原样回显、总数不被分页改写。
 *
 * 调用面：GET /api/v1/erp/warehouses?page=&page_size=
 *   routes/catalog.rs 挂载 → handlers/warehouse_handler.rs:28-30 WarehouseListQuery{page,page_size}
 * 判据链（后端源码逐行核对）：
 *   services/warehouse_service.rs:75 先 count 全量总数（不受分页参数影响）；
 *   :77 page = query.page.unwrap_or(1)——**不 clamp 页码上界**，越界页码原样带出；
 *   :78 page_size = unwrap_or(10).clamp(1,100)——仅页宽钳位防 DoS；
 *   :83 offset = (page-1)*page_size，越界页码 offset 远超总数 → 查询返回空集；
 *   :89-91 PaginatedResponse::new(items, total, page, page_size) 原样装入四字段
 *   （utils/response.rs:56-67 结构体逐字段序列化，无二次加工）。
 * 判据三元组：越界页 items=[]（offset 越界）/ page=请求值（不 clamp）/ total=全量（分页不改总数）。
 * 真检测：若后端改成把页码 clamp 到末页，items 非空即红；若改成越界回 400，status 即红；
 * 若 total 被当页条数改写，total 对比即红。
 * 与现有覆盖的差别：161 spec 断的是 AP 付款申请端点（clamp 到 1000、page 回显 1000），
 * 本例断仓库端点（不 clamp、page 原样回显）——两种后端契约形态，非重复建设。
 * 前置：ensureTestEntities 保证至少一间仓库（total>0），否则空库越界恒空、判据失去意义。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, ensureTestEntities, loginViaUI } from '../flow/helpers';

interface WarehousePage {
  items: Array<{ id: number; warehouse_code?: string }>;
  total: number;
  page: number;
  page_size: number;
}

test.describe('4.14 仓库列表分页越界', () => {
  test('4.14-01 越界页码返回空页、页码原样回显、总数不被分页改写', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);

    // 基准页：取全量总数，并确认非空前置（空库下越界判据无意义）
    const base = await apiCallRaw<WarehousePage>(page, 'GET', '/warehouses?page=1&page_size=100');
    expect(
      Array.isArray(base.items),
      `仓库列表缺 items 数组：${JSON.stringify(base).slice(0, 200)}`
    ).toBe(true);
    expect(base.total, '前置：ensureTestEntities 后仓库总数应大于 0').toBeGreaterThan(0);
    console.log(`[4.14] 仓库基准 total=${base.total}`);

    // 越界页：offset 远超总数 → 空 items；page 原样回显 99999；total 仍为全量
    const far = await apiCallRaw<WarehousePage>(page, 'GET', '/warehouses?page=99999&page_size=10');
    expect(
      Array.isArray(far.items),
      `越界页缺 items 数组：${JSON.stringify(far).slice(0, 200)}`
    ).toBe(true);
    expect(far.items.length, '越界页码 offset 远超总数，items 应为空页').toBe(0);
    expect(far.page, '仓库端点页码不 clamp，越界页码须原样回显').toBe(99999);
    expect(far.page_size, 'page_size 应回显请求值').toBe(10);
    expect(far.total, '分页参数不得改写全量总数').toBe(base.total);
    console.log(`[4.14] 越界页 page=${far.page} items=${far.items.length} total=${far.total}`);

    // 页宽钳位对照：page_size 超上界应被 clamp 到 100（与 AP 端点同构的防 DoS 门）
    const wide = await apiCallRaw<WarehousePage>(page, 'GET', '/warehouses?page=1&page_size=1000');
    expect(wide.page_size, 'page_size 超 100 应钳位到 100 并回显').toBe(100);
    expect(
      wide.items.length,
      `钳位后首页数据行不得超过页宽 100，实际 ${wide.items.length}`
    ).toBeLessThanOrEqual(100);
    expect(wide.total, '页宽钳位不得改写总数').toBe(base.total);
    console.log(`[4.14] 页宽钳位 page_size=${wide.page_size} total=${wide.total}`);
  });
});
