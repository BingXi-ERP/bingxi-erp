/**
 * 库位维护族全腿（建单→回读→列表过滤→三态修改→删除→404 复核→岗位隔离）。
 *
 * 功能：把 `warehouses/locations` 族 5 枚在册端点的写腿从"零断言"钉成"写下去→读回来→
 * 值逐字符相等"：建单字段全量往返、服务端强制位（批次/色号管理恒 true）落库验证、
 * 列表按 warehouse_id 过滤真实下推且跨仓互不可见、PUT 三态语义（缺席保原值、显式 null
 * 清空、有值覆盖）、NOT NULL 列 location_code 显式 null 被拒且零副作用、删除后读回 404、
 * 无权限岗位（仓管仅 warehouses:read）对写删三腿被 403 权限门拦下且拒绝码归因到 FORBIDDEN。
 * 调用方：Playwright 分片 e2e flow 项目（frontend/playwright.config.ts），由 CI e2e job 执行。
 * 入参：page 会话（worker admin 与 warehouse_keeper 两种岗位）、getCtx() 的 warehouseIds
 * （ensureTestEntities 保证 ≥1 个仓库，跨仓过滤腿需 ≥2，不足即显式判红）。
 * 传给谁：backend warehouse_handler::create_location / list_locations / get_location /
 * update_location / delete_location（路由挂载 backend/src/routes/catalog.rs）。
 * 存什么：warehouse_locations 行的 warehouse_id/location_code/location_type/max_weight/
 * max_height/is_batch_managed/is_color_managed；DECIMAL(12,2) 列出参为序列化字符串，
 * 比较一律经 Number() 归一，测试内不做二次舍入。
 * 存哪里：PostgreSQL warehouse_locations（DDL migration/src/domain/business/
 * m0010_add_inventory_extensions.rs，含 FK→warehouses 与唯一索引
 * (warehouse_id, location_code)）；端点存在性唯一事实来源 frontend/scripts/route-snapshot.txt。
 *
 * 覆盖端点（路径均为 API_PREFIX=/api/v1/erp 之后部分）：
 *   POST   /warehouses/locations
 *   GET    /warehouses/locations?warehouse_id={id}&page&page_size
 *   GET    /warehouses/locations/{id}
 *   PUT    /warehouses/locations/{id}
 *   DELETE /warehouses/locations/{id}
 *
 * 未覆盖（如实申报）：
 * 重复 location_code 与不存在 warehouse_id 两条 DB 约束腿——写入方对唯一索引/FK 无前置
 * 校验，当前落 500 DATABASE_ERROR（utils/error.rs From<DbErr>），断 500 等于把缺陷钉成
 * 预期、断 400 必真红，均不取；待后端映射为业务错误后另立新用例。
 */
import { test, expect } from '../diagnose-fixture';
import { PERMISSIONS } from '../../src/constants/permissions';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  deferCleanup,
  ensureTestEntities,
  expectDenied,
  expectStateGateRejection,
  flushDeferredCleanups,
  genCode,
  getCtx,
  isCsrfRejection,
  loginAsRole,
  loginViaUI,
  type ApiFailureResult,
  type DeferredCleanup,
} from './helpers';

/**
 * 功能：库位响应行的最小静态形状（键 = backend/src/models/location.rs Model 字段名，
 * snake_case 逐字符一致；出参由 serde_json::to_value(Model) 直出，无改名层）。
 * 调用方：本文件各回读断言。
 * 入参：无（类型）。
 * 传给谁：apiCallRaw 泛型实参。
 * 存什么：不落库，仅镜像响应键。
 * 存哪里：不存在数据库。
 */
type LocationRow = {
  id?: unknown;
  warehouse_id?: unknown;
  location_code?: unknown;
  location_type?: unknown;
  max_weight?: unknown;
  max_height?: unknown;
  is_batch_managed?: unknown;
  is_color_managed?: unknown;
};

/**
 * 功能：读取库位行的 DECIMAL(12,2) 列并归一为数字，字段缺失或类型异常即显式判红。
 * 调用方：建单/修改用例对 max_weight、max_height 的数值往返断言。
 * 入参：row 为库位响应行；field 为真实 snake_case 列名；context 为失败定位前缀。
 * 传给谁：调用方的 expect 比较。
 * 存什么：不持久化。
 * 存哪里：无。
 */
function decimalFieldAsNumber(row: LocationRow, field: keyof LocationRow, context: string): number {
  const raw = row[field];
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(
      `[465] ${context}：字段 ${field} 不是十进制字符串或数字，实际类型=${typeof raw} ` +
        `值=${JSON.stringify(raw)}——响应键以实体为准，取不到即判红不兜底`
    );
  }
  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`[465] ${context}：字段 ${field}=${JSON.stringify(raw)} 无法解析为数字`);
  }
  return num;
}

/**
 * 功能：断言不存在 ID 的读/删腿落统一信封的 404（NOT_FOUND），不是 5xx 裸崩也不是 CSRF。
 * 调用方：删除后 GET 复核、二次 DELETE、不存在 ID 的 PUT 三处。
 * 入参：result 为 apiCallExpectFail 返回；context 为业务描述。
 * 传给谁：调用方 expect 判定。
 * 存什么：不持久化。
 * 存哪里：无；404 产出方 handlers——get_location/update_location 的 AppError::not_found
 * 与 audit_log_service::delete_with_audit 的 not_found 分支。
 */
function expectNotFoundRejection(result: ApiFailureResult, context: string): void {
  const prefix = `${context}：应落 404 NOT_FOUND`;
  expect(
    result.status,
    `${prefix}，实际 status=${result.status} code=${JSON.stringify(result.code)}——` +
      `2xx 属未拦截、5xx 属裸崩（From<DbErr> 兜底冒头），均判红`
  ).toBe(404);
  expect(
    isCsrfRejection(result.status, result),
    `${prefix}，实际拒绝属 CSRF 中间件（code=${JSON.stringify(result.code)}），` +
      '是会话前置未成立而非 404 归因——假绿拦截'
  ).toBe(false);
  expect(
    result.code,
    `${prefix}：机器码必须是 NOT_FOUND（utils/error.rs AppError::NotFound 分支），` +
      `实际 code=${JSON.stringify(result.code)}`
  ).toBe(APP_ERROR_CODES.NOT_FOUND);
}

test.describe('库位维护族全腿', () => {
  const cleanup: DeferredCleanup[] = [];

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    await flushDeferredCleanups(page, cleanup);
  });

  test('库位建单字段全量往返，服务端强制位落库，列表按仓过滤真实下推', async ({ page }) => {
    const ctx = getCtx();
    const whA = ctx.warehouseIds[0];
    const whB = ctx.warehouseIds.find(id => id !== whA);
    if (whA === undefined || whB === undefined) {
      throw new Error(
        `[465-T1] 前置不成立：ctx.warehouseIds 不足两个互异仓库（实际 ` +
          `${JSON.stringify(ctx.warehouseIds)}）——跨仓过滤腿无从对照`
      );
    }

    const locationCode = genCode('E2E-LOC');
    const created = await apiCallRaw<LocationRow>(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: locationCode,
      location_type: 'rack',
      max_weight: 12.34,
      max_height: 3.5,
    });
    const id = created.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new Error(`[465-T1] 建单未返回合法 data.id，实际 id=${JSON.stringify(created.id)}`);
    }
    deferCleanup(cleanup, 'DELETE', `/warehouses/locations/${id}`, '465-T1 location');

    // 详情回读：写入的每个字段都要逐字符/逐数值相等（写下去→读回来→相等）
    const readBack = await apiCallRaw<LocationRow>(page, 'GET', `/warehouses/locations/${id}`);
    expect(Number(readBack.warehouse_id), '回读仓库归属必须等于建单入参').toBe(whA);
    expect(readBack.location_code, '回读库位编码必须与建单入参逐字符相同').toBe(locationCode);
    expect(readBack.location_type, '回读库位类型必须与建单入参逐字符相同').toBe('rack');
    expect(
      decimalFieldAsNumber(readBack, 'max_weight', `库位 id=${id}`),
      '回读最大承重必须等于写入值 12.34'
    ).toBe(12.34);
    expect(
      decimalFieldAsNumber(readBack, 'max_height', `库位 id=${id}`),
      '回读最大高度必须等于写入值 3.5'
    ).toBe(3.5);
    // 隐藏前置取证：is_batch_managed/is_color_managed 由写入方强制置 Some(true)
    // （warehouse_handler.rs），请求体不承载——断的是服务端写入值，不是入参回显
    expect(readBack.is_batch_managed, '建单批次管理位必须落库为 true（写入方强制值）').toBe(true);
    expect(readBack.is_color_managed, '建单色号管理位必须落库为 true（写入方强制值）').toBe(true);

    // 列表过滤：命中本行 + 逐行 warehouse_id 与过滤值一致（下推真实生效，非摆设）
    const listA = await apiCallRaw<{ items?: unknown; total?: unknown }>(
      page,
      'GET',
      `/warehouses/locations?warehouse_id=${whA}&page=1&page_size=100`
    );
    if (!Array.isArray(listA.items)) {
      throw new Error(
        `[465-T1] GET /warehouses/locations 的 data.items 不是数组（PaginatedResponse 信封漂移），` +
          `实际片段键=${JSON.stringify(Object.keys(listA)).slice(0, 200)}`
      );
    }
    const rowsA = listA.items as LocationRow[];
    for (const row of rowsA) {
      expect(
        Number(row.warehouse_id),
        `列表按 warehouse_id=${whA} 过滤，行 id=${JSON.stringify(row.id)} 的归属必须逐行相等`
      ).toBe(whA);
    }
    expect(
      rowsA.some(r => Number(r.id) === id),
      `本行 id=${id} 必须出现在其仓的过滤列表里，实际 ${rowsA.length} 行未命中`
    ).toBe(true);
    expect(typeof listA.total, `列表 total 必须为数字，实际 ${JSON.stringify(listA.total)}`).toBe(
      'number'
    );

    // 跨仓隔离：换 warehouse_id=${whB} 后本行不得出现在可见集
    const listB = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/warehouses/locations?warehouse_id=${whB}&page=1&page_size=100`
    );
    if (!Array.isArray(listB.items)) {
      throw new Error(`[465-T1] 跨仓列表 items 非数组，前置破坏`);
    }
    expect(
      (listB.items as LocationRow[]).some(r => Number(r.id) === id),
      `库位 id=${id} 建在仓 ${whA}，按仓 ${whB} 过滤的列表不得含本行（过滤下推失效即串仓）`
    ).toBe(false);
  });

  test('PUT 三态语义：覆盖、缺席保原值、显式 null 清空，NOT NULL 列拒绝清空且零副作用', async ({
    page,
  }) => {
    const ctx = getCtx();
    const whA = ctx.warehouseIds[0];
    if (whA === undefined) {
      throw new Error('[465-T2] 前置不成立：ctx.warehouseIds 为空');
    }
    const code0 = genCode('E2E-LOC2');
    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: code0,
      location_type: 'rack',
      max_weight: 12.34,
      max_height: 3.5,
    });
    const id = created.id;
    if (typeof id !== 'number') {
      throw new Error(`[465-T2] 建单未返回 data.id，实际 ${JSON.stringify(created)}`.slice(0, 300));
    }
    deferCleanup(cleanup, 'DELETE', `/warehouses/locations/${id}`, '465-T2 location');

    // 第一腿：有值=覆盖。只提交 code/type/weight/batch 位，height 与 color 位缺席
    const code1 = genCode('E2E-LOC2R');
    await apiCall(page, 'PUT', `/warehouses/locations/${id}`, {
      location_code: code1,
      location_type: 'shelf',
      max_weight: 20,
      is_batch_managed: false,
    });
    const afterOverride = await apiCallRaw<LocationRow>(page, 'GET', `/warehouses/locations/${id}`);
    expect(afterOverride.location_code, '覆盖腿：编码必须换成新值').toBe(code1);
    expect(afterOverride.location_type, '覆盖腿：类型必须换成 shelf').toBe('shelf');
    expect(
      decimalFieldAsNumber(afterOverride, 'max_weight', `库位 id=${id} 覆盖后`),
      '覆盖腿：承重必须换成 20'
    ).toBe(20);
    expect(afterOverride.is_batch_managed, '覆盖腿：批次管理位必须换成 false').toBe(false);
    expect(
      decimalFieldAsNumber(afterOverride, 'max_height', `库位 id=${id} 覆盖后`),
      '缺席键：max_height 未被提交，必须保持原值 3.5（RFC 7386 键缺席=保持）'
    ).toBe(3.5);
    expect(
      afterOverride.is_color_managed,
      '缺席键：is_color_managed 未被提交，必须保持建单强制值 true'
    ).toBe(true);

    // 第二腿：可空列显式 null=清空为 NULL
    await apiCall(page, 'PUT', `/warehouses/locations/${id}`, {
      location_type: null,
      max_height: null,
      is_color_managed: null,
    });
    const afterClear = await apiCallRaw<LocationRow>(page, 'GET', `/warehouses/locations/${id}`);
    expect(afterClear.location_type, '清空腿：location_type 显式 null 必须落 NULL').toBeNull();
    expect(afterClear.max_height, '清空腿：max_height 显式 null 必须落 NULL').toBeNull();
    expect(
      afterClear.is_color_managed,
      '清空腿：is_color_managed 显式 null 必须落 NULL'
    ).toBeNull();
    expect(afterClear.location_code, '清空腿不得波及其他列：编码保持 code1').toBe(code1);
    expect(afterClear.is_batch_managed, '清空腿不得波及其他列：批次位保持 false').toBe(false);

    // NOT NULL 列门：location_code 显式 null 必须在入口被业务拒绝（warehouse_handler.rs）
    const clearGuard = await apiCallExpectFail(page, 'PUT', `/warehouses/locations/${id}`, {
      location_code: null,
    });
    expectStateGateRejection(clearGuard, '库位编码（NOT NULL 列）显式 null 清空');
    const afterGuard = await apiCallRaw<LocationRow>(page, 'GET', `/warehouses/locations/${id}`);
    expect(
      afterGuard.location_code,
      '拒绝必须零副作用：编码门拒绝后库位编码仍是 code1，实际 ' +
        JSON.stringify(afterGuard.location_code)
    ).toBe(code1);

    // 长度校验：location_type 超 20 字符被 DTO validate 拒绝（CreateLocationRequest/
    // UpdateLocationRequest 同注解 length(max=20)）
    const tooLong = await apiCallExpectFail(page, 'PUT', `/warehouses/locations/${id}`, {
      location_type: 'T'.repeat(21),
    });
    expectStateGateRejection(tooLong, '库位类型超过 20 字符');
  });

  test('建单校验负例族与不存在 ID 的读/改腿钉 404 统一信封', async ({ page }) => {
    const ctx = getCtx();
    const whA = ctx.warehouseIds[0];
    if (whA === undefined) {
      throw new Error('[465-T3] 前置不成立：ctx.warehouseIds 为空');
    }

    // 编码空串：validate length(min=1) 拒绝
    const emptyCode = await apiCallExpectFail(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: '',
    });
    expectStateGateRejection(emptyCode, '库位编码空串建单');
    // 编码超 50 字符：validate length(max=50) 拒绝
    const longCode = await apiCallExpectFail(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: 'L'.repeat(51),
    });
    expectStateGateRejection(longCode, '库位编码超过 50 字符建单');
    // 仓库 ID=0：validate range(min=1) 拒绝（FK 面不取——写入方无前置校验会走 500，见文件头申报）
    const zeroWh = await apiCallExpectFail(page, 'POST', '/warehouses/locations', {
      warehouse_id: 0,
      location_code: genCode('E2E-LOC3'),
    });
    expectStateGateRejection(zeroWh, '仓库 ID 为 0 建单');
    // 类型超 20 字符：validate length(max=20) 拒绝
    const longType = await apiCallExpectFail(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: genCode('E2E-LOC3'),
      location_type: 'T'.repeat(21),
    });
    expectStateGateRejection(longType, '库位类型超过 20 字符建单');

    // 不存在 ID：GET/PUT 必须映射为 404 NOT_FOUND（不是 500、不是 CSRF、不是 200 空回显）
    const ghostId = 999999999;
    const getGhost = await apiCallExpectFail(page, 'GET', `/warehouses/locations/${ghostId}`);
    expectNotFoundRejection(getGhost, `读取不存在库位 ${ghostId}`);
    const putGhost = await apiCallExpectFail(page, 'PUT', `/warehouses/locations/${ghostId}`, {
      location_type: 'rack',
    });
    expectNotFoundRejection(putGhost, `修改不存在库位 ${ghostId}`);
  });

  test('删除腿物理删除后读回 404，二次删除同钉 404（幂等可观测）', async ({ page }) => {
    const ctx = getCtx();
    const whA = ctx.warehouseIds[0];
    if (whA === undefined) {
      throw new Error('[465-T4] 前置不成立：ctx.warehouseIds 为空');
    }
    const code = genCode('E2E-LOCD');
    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: code,
      location_type: 'rack',
    });
    const id = created.id;
    if (typeof id !== 'number') {
      throw new Error(`[465-T4] 建单未返回 data.id，实际 ${JSON.stringify(created)}`.slice(0, 300));
    }
    const before = await apiCallRaw<LocationRow>(page, 'GET', `/warehouses/locations/${id}`);
    expect(before.location_code, '删除前行必须可读且编码逐字符相同').toBe(code);

    await apiCall(page, 'DELETE', `/warehouses/locations/${id}`);

    // 物理删除（delete_with_audit delete_by_id，表无软删列）：再读必须 404
    const afterGet = await apiCallExpectFail(page, 'GET', `/warehouses/locations/${id}`);
    expectNotFoundRejection(afterGet, `删除库位 ${id} 后读取`);
    // 二次删除：同样 404（delete_with_audit 先 find_by_id 再删），不得 5xx、不得 2xx 假成
    const afterDelete = await apiCallExpectFail(page, 'DELETE', `/warehouses/locations/${id}`);
    expectNotFoundRejection(afterDelete, `二次删除库位 ${id}`);
    // 删除后列表可见集不得残留本行
    const list = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/warehouses/locations?warehouse_id=${whA}&page=1&page_size=100`
    );
    if (!Array.isArray(list.items)) {
      throw new Error('[465-T4] 删除后列表 items 非数组，前置破坏');
    }
    expect(
      (list.items as LocationRow[]).some(r => Number(r.id) === id),
      `已删库位 id=${id} 不得出现在列表可见集（软删未登记却物理删的漂移证据）`
    ).toBe(false);
  });

  test('岗位隔离：仓管可读库位列表，建/改/删三腿均被权限门拦下', async ({ page }) => {
    const ctx = getCtx();
    const whA = ctx.warehouseIds[0];
    if (whA === undefined) {
      throw new Error('[465-T5] 前置不成立：ctx.warehouseIds 为空');
    }
    // admin 先建一行作为仓管读腿的真实靶（读回命中本行才算读面在位）
    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: genCode('E2E-LOCP'),
      location_type: 'rack',
    });
    const id = created.id;
    if (typeof id !== 'number') {
      throw new Error(`[465-T5] 建单未返回 data.id，实际 ${JSON.stringify(created)}`.slice(0, 300));
    }
    deferCleanup(cleanup, 'DELETE', `/warehouses/locations/${id}`, '465-T5 location');

    await loginAsRole(page, 'warehouse_keeper');
    const keeperList = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/warehouses/locations?warehouse_id=${whA}&page=1&page_size=100`
    );
    if (!Array.isArray(keeperList.items)) {
      throw new Error(
        `[465-T5] 仓管（权限键 ${PERMISSIONS.WAREHOUSE_READ}，init_service_ops/permission.rs 在册）` +
          `读库位列表未返回 items 数组，实际片段=${JSON.stringify(keeperList).slice(0, 200)}`
      );
    }
    expect(
      (keeperList.items as LocationRow[]).some(r => Number(r.id) === id),
      `仓管读列表必须命中 admin 新建的库位 id=${id}（读面真实可达，非空壳 200）`
    ).toBe(true);

    // 同一岗位对写删三腿必须 403 且码归因 FORBIDDEN（非 CSRF、非 404——404 会掩盖"门后裸崩"）
    const deniedCreate = await apiCallExpectFail(page, 'POST', '/warehouses/locations', {
      warehouse_id: whA,
      location_code: genCode('E2E-LOCDENY'),
    });
    expectDenied(
      deniedCreate,
      `仓管建库位 POST /warehouses/locations（键 ${PERMISSIONS.WAREHOUSE_CREATE}，仓管仅 read）`
    );
    expect(
      deniedCreate.code,
      `建腿 403 必须归因权限机器码 ${APP_ERROR_CODES.FORBIDDEN}，实际 code=${JSON.stringify(deniedCreate.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 改/删腿靶=不存在 ID：权限门在 handler 之前，403 即证明门在位；
    // 若门漂移则落 404/5xx，同样不绿——零数据破坏风险
    const ghostId = 999999999;
    const deniedUpdate = await apiCallExpectFail(page, 'PUT', `/warehouses/locations/${ghostId}`, {
      location_type: 'rack',
    });
    expectDenied(
      deniedUpdate,
      `仓管改库位 PUT /warehouses/locations/{id}（键 ${PERMISSIONS.WAREHOUSE_UPDATE}）`
    );
    const deniedDelete = await apiCallExpectFail(
      page,
      'DELETE',
      `/warehouses/locations/${ghostId}`
    );
    expectDenied(
      deniedDelete,
      `仓管删库位 DELETE /warehouses/locations/{id}（键 ${PERMISSIONS.WAREHOUSE_DELETE}）`
    );
    expect(
      deniedDelete.trace_id,
      `权限拒绝同样走 AppError 统一信封，必须携带 trace_id，实际 ${JSON.stringify(deniedDelete.trace_id)}`
    ).toBeTruthy();
  });
});
