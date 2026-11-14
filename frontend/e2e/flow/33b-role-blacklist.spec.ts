import { test, expect } from '../diagnose-fixture';
import { loginAsRole, apiCallRaw, API_BASE, API_PREFIX } from './helpers';
import { pickListArray } from './ui-helpers';

/**
 * 33b 角色黑名单端到端验证（doto 2026-09-09 print/export 角色黑名单缺口）
 *
 * 后端三层黑名单（backend/src/middleware/permission.rs）：
 * - PRINT_DENIED_ROLE_CODES = ["customer", "temporary"]
 * - EXPORT_DENIED_ROLE_CODES = ["customer", "temporary"]
 * - DYE_RECIPE_EXPORT_DENIED_ROLE_CODES（customer/temporary/manager/operator/...）
 *
 * 黑名单独立于权限码：ensureRoleUsers 给 customer/temporary 附加了
 * pieces:print 与 stock:export 权限码——若黑名单失效，持码请求会放行；
 * 黑名单生效 → 403。这是对"持码仍拒"的真实端到端断言。
 *
 * dye_recipe 导出：manager 在 DYE_RECIPE 导出禁单中 → 403。
 * 对照组：admin 打印不被黑名单误伤（区分权限误伤与角色定向命中）。
 *
 * 凭证来源：ensureRoleUsers 幂等补建（global-setup.ts BLACKLIST_TEST_ROLES）
 * 每步显式日志
 */

/** 黑名单角色：持 print/export 权限码仍必须被拒 */
const BLACKLIST_ROLES = ['customer', 'temporary'];

test.describe('33b 角色黑名单（print/export/dye-recipe）', () => {
  /**
   * 打印黑名单断言的宿主端点：/inventory/pieces/{id}/print（piece_routes 挂在
   * routes/mod.rs 的 /api/v1/erp/inventory 前缀下，权限中间件按 segment3 查资源段白名单、
   * 按第 4 段取 resource_type，故裸 /pieces 会被判"未知的资源路径"连 admin 一起拒）。
   * 权限字典（services/init_service_ops/permission.rs）里在册的 print 动作码只有 pieces 与
   * export-inspections 两族，后者无打印路由，故"持码仍 403"只能落在 pieces 上；
   * BOM 族的 boms:print 已随整域下线从字典撤除，不再有合法宿主。
   * 匹号行由验布链（services/fabric_inspection_service.rs）写入，本用例不重建该链：
   * 无该行时打印走 not_found 出 404，非 dyed 或缺打印字段走 400（print_service.rs），
   * 两者都不等于 403，黑名单一旦失效真缺陷照样判红，所以黑名单侧断言不以宿主行存在为前提。
   * 文档真实可达性不在此重验：fabric/05-piece-label-print.spec.ts 已按完整验布链造出
   * 可打匹号并硬断 200 与 docx 容器，取列表首行断可达会因该行未必可打而假红。
   */
  let printPieceId = 0;
  let printPieceDiag = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await loginAsRole(page, 'admin');
      // 出参走 PaginatedResponse，data={items}
      const pieces = await apiCallRaw<unknown>(page, 'GET', '/inventory/pieces?page=1&page_size=1');
      const pieceList = pickListArray<{ id: number }>(pieces, 'items', '33b 匹号打印宿主列表');
      printPieceId = pieceList[0]?.id ?? 0;
      if (printPieceId) {
        console.log(`[33b] 打印黑名单宿主匹号 id=${printPieceId}（验布链既有行）`);
      } else {
        console.warn(
          '[33b] 库中无匹号行：黑名单侧仍硬断 403（无行时打印为 404 或 400，不会误判为通过）；' +
            'admin 侧只断不被黑名单误伤，文档可达性由验布链用例承担'
        );
      }
    } catch (e) {
      printPieceDiag = (e as Error).message;
      console.error(`[33b] ❌ 打印宿主匹号查询失败: ${printPieceDiag}`);
    } finally {
      await page.close().catch(e => {
        console.warn(`[33b] beforeAll 临时 page 关闭失败: ${(e as Error).message}`);
      });
    }
  });

  for (const role of BLACKLIST_ROLES) {
    test(`${role} 持 pieces:print 权限码调用 /pieces/{id}/print → 403`, async ({ page }) => {
      await loginAsRole(page, role);
      console.log(
        `[33b] ${role} 登录成功（print 码附加见 global-setup.ts 的 BLACKLIST_TEST_ROLES）`
      );
      // 无宿主行时退回固定 id：打印会 404，而 404 不等于 403，黑名单失效仍判红
      const targetId = printPieceId || 1;

      const resp = await page.request.get(
        `${API_BASE}${API_PREFIX}/inventory/pieces/${targetId}/print`
      );

      const status = resp.status();
      expect(
        status,
        `${role} 在 PRINT_DENIED 黑名单，对真实在册的打印端点持 pieces:print 码也应 403，` +
          `实际 ${status}（宿主匹号 ${targetId}${printPieceId ? '' : '，库中无匹号行'}）` +
          (status === 200 ? '（黑名单失效——真缺陷）' : '')
      ).toBe(403);
      console.log(`[33b] ✅ ${role} 打印黑名单生效 → 403`);
    });

    test(`${role} 持 stock:export 权限码调用（/inventory/stock/export） /inventory/stock/export → 403`, async ({
      page,
    }) => {
      await loginAsRole(page, role);

      const resp = await page.request.get(`${API_BASE}${API_PREFIX}/inventory/stock/export`);

      // /inventory/stock/export 是非敏感导出：黑名单是唯一防线——403 即黑名单直接生效，
      // 若 200 放行则 EXPORT_DENIED 黑名单失效（真缺陷）
      const status = resp.status();
      expect(
        status,
        `${role} 在 EXPORT_DENIED 黑名单，应 403，实际 ${status}` +
          (status === 200 ? '（黑名单失效——真缺陷）' : '')
      ).toBe(403);
      console.log(`[33b] ✅ ${role} 导出黑名单生效 → 403`);
    });
  }

  test('manager 调染料配方导出 → 403（DYE_RECIPE 导出禁单）', async ({ page }) => {
    await loginAsRole(page, 'manager');

    const resp = await page.request.get(`${API_BASE}${API_PREFIX}/production/dye-recipes/export`);

    // GET /dye-recipes/export 由 routes/production.rs:135 注册（挂在 /api/v1/erp/production
    // 域下），是列表级导出端点，与种子数据无关——404 只会是路由/前缀缺陷，必须硬失败暴露。
    const status = resp.status();
    expect(status, `manager 在 DYE_RECIPE_EXPORT_DENIED 清单，导出应 403，实际 ${status}`).toBe(
      403
    );
    console.log('[33b] ✅ manager 染料配方导出禁单生效 → 403');
  });

  test('admin 对照：打印端点不被黑名单误伤', async ({ page }) => {
    await loginAsRole(page, 'admin');
    // 查询本身抛错说明宿主列表读面或响应形状有问题，必须判红而不是退化成"无宿主"
    expect(
      printPieceDiag,
      `beforeAll 查询匹号宿主失败（${printPieceDiag || '无'}），打印面对照无法执行`
    ).toBe('');

    const targetId = printPieceId || 1;
    const resp = await page.request.get(
      `${API_BASE}${API_PREFIX}/inventory/pieces/${targetId}/print`
    );

    const status = resp.status();
    // admin 不在黑名单：不应 403；不应 5xx
    expect(status, `admin 对打印端点 ${targetId} 不应被黑名单拒绝（403=admin 也被误伤）`).not.toBe(
      403
    );
    expect(status, `admin 打印不应 5xx，实际 ${status}`).toBeLessThan(500);
    if (printPieceId) {
      // 取到的是列表真实行，故 not_found 只可能是路由或取数缺陷，这一档要挡；
      // 而 400（非 dyed 或缺打印字段，print_service.rs 的 fail-closed）对本用例是合法结果——
      // 首行不保证可打，按 2xx 硬断会假红。文档真实可达性由
      // fabric/05-piece-label-print.spec.ts 承担，它按完整验布链造出可打匹号并硬断
      // 200 与 docx 容器，本用例不重复那一层。
      expect(
        status,
        `admin 打印既有匹号 ${printPieceId} 不应 404——行确实存在，404 说明打印路由或取数有缺陷`
      ).not.toBe(404);
    }
    console.log(
      `[33b] ✅ admin 对照 ${status}（黑名单仅命中指定角色；` +
        (printPieceId
          ? `宿主匹号 ${printPieceId} 一并挡了 404，400 属未走验布链的合法不可打状态`
          : '库中无匹号行，只断非 403') +
        `）`
    );
  });
});
