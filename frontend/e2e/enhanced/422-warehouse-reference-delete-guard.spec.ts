// 4.22 主数据引用完整性：仓库被库位引用时禁止删除。
// 后端判据：services/warehouse_service.rs:431-435 delete 前真调 find_warehouse_references(id)，
//   hit 即 Err(AppError::business_displayable("该仓库已被 {count}{label}占用，无法删除，请先处理关联数据"))；
//   :534-557 的引用表含 location（label "个库位"）、greige_fabric、inventory_stock 等十余张。
// 检测力：若删掉引用预检，带库位的仓库会被 DELETE 200 掉，负例即红；若把空仓也拒，正例即红。
// 与 31b-deletion-matrix 正交：那条只断空仓可删（createApi /warehouses），没有引用占用负例。
// 与 465 号正交：那条断库位自身 CRUD 与字段回读，不碰所属仓库的删除门。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id?: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  // reverse 保证先删库位再删仓库；即便断言中途失败也按序清干净。
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

test.describe('4.22 仓库引用删除门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('422-01 仓库被库位引用时禁止删除，解除引用后空仓可删', async ({ page }) => {
    const tag = genCode('E422WH');
    const warehouse = await apiCall<Row>(page, 'POST', '/warehouses', {
      warehouse_name: `${tag}仓`,
      warehouse_code: `${tag}`,
      warehouse_type: 'finished',
    });
    const warehouseId = warehouse.data?.id;
    expect(warehouseId, '前置：仓库建档须返回主键').toBeTruthy();
    CLEANUP.push({ path: `/warehouses/${warehouseId}`, label: `4.22 仓库 ${warehouseId}` });

    // 建一条库位占用该仓库，构成 find_warehouse_references 的 location 命中。
    const loc = await apiCall<Row>(page, 'POST', '/warehouses/locations', {
      warehouse_id: warehouseId,
      location_code: genCode('E422LOC'),
      location_type: 'rack',
      max_weight: 12.34,
      max_height: 3.5,
    });
    const locId = loc.data?.id;
    expect(locId, '前置：库位建档须返回主键').toBeTruthy();
    CLEANUP.push({ path: `/warehouses/locations/${locId}`, label: `4.22 库位 ${locId}` });

    // 带引用删仓库：须被业务错误拒绝，拒因点名占用数量与"无法删除"。
    const blocked = await apiCallExpectFail(page, 'DELETE', `/warehouses/${warehouseId}`);
    expectStateGateRejection(blocked, '被引用仓库删除');
    expect(failureCode(blocked), '引用占用拒绝须归 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      String(blocked.message ?? ''),
      '拒因须点名库位占用与无法删除，实际 ' + JSON.stringify(blocked.message)
    ).toContain('无法删除');
    expect(String(blocked.message ?? ''), '拒因须点名库位，实际 ' + blocked.message).toContain(
      '库位'
    );

    // 被拒后仓库必须还在，不能"拒了却删了"。
    const still = await apiCallRaw<Row>(page, 'GET', `/warehouses/${warehouseId}`);
    expect(still.id, '被引用删除被拒后仓库仍应可回读').toBe(warehouseId);

    // 解除引用（删库位）后，空仓删除须放行——证明门是引用判定而非一律禁删。
    await apiCall(page, 'DELETE', `/warehouses/locations/${locId}`);
    CLEANUP.splice(
      CLEANUP.findIndex(c => c.path === `/warehouses/locations/${locId}`),
      1
    );
    await apiCall(page, 'DELETE', `/warehouses/${warehouseId}`);
    CLEANUP.splice(
      CLEANUP.findIndex(c => c.path === `/warehouses/${warehouseId}`),
      1
    );

    const gone = await apiCallExpectFail(page, 'GET', `/warehouses/${warehouseId}`);
    expect(gone.status, '空仓删除成功后详情应不可得（404）').toBe(404);
  });
});
