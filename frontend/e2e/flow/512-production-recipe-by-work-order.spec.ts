import { test, expect } from '../diagnose-fixture';
import { apiCall } from './helpers';

/**
 * 生产大货处方按工单查询面（by-work-order）。
 *
 * 覆盖面。GET /api/v1/erp/production/production-recipes/by-work-order/{work_order_id}
 * 在 e2e 语料里零覆盖（主干顶点全库检索 by-work-order 零命中），本 spec 把
 * 它的查询语义钉成判据。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 路由装配在 backend/src/routes/production.rs 的 production_recipes()，
 * 挂载前缀 /api/v1/erp/production（routes/mod.rs nest）。handler 在
 * backend/src/handlers/production_recipe_handler.rs 的 get_by_work_order，
 * service 在 backend/src/services/production_recipe_ops/recipe_crud.rs。
 *
 * 查询语义：返回 ApiResponse<Option<production_recipe::Model>>，即 data 可能
 * 为 null 而非空数组或 404。悬空 work_order_id（无任何处方行）返回 200 与
 * data null；同工单号只能开一张大货处方（一工单一处方约束，取
 * created_at 最新一行）。过滤面：is_deleted 为 false 且 status 不为
 * cancelled 的行才参与命中。正腿需要自建工单与处方两步长链，工单建单链路
 * 依赖销售订单转单全链，本轮只钉悬空腿的查询语义，正腿待工单造数 helper
 * 补齐后另开。
 */
test('512-01 悬空 work_order_id 返回 200 与 data null', async ({ page }) => {
  const tag = '512-01';
  const danglingId = 999999999;
  const resp = await apiCall<{ data: unknown }>(
    page,
    'GET',
    `/production/production-recipes/by-work-order/${danglingId}`
  );
  expect(
    resp.data,
    `[${tag}] 悬空工单应返回 data null 而非空数组或 404，实际 ${JSON.stringify(resp)}`
  ).toBeNull();
});

test('512-02 悬空 work_order_id 的信封形状仍是 code 0 的成功信封', async ({ page }) => {
  const tag = '512-02';
  const danglingId = 999999998;
  const resp = await apiCall<{ code: number; data: unknown; message?: string }>(
    page,
    'GET',
    `/production/production-recipes/by-work-order/${danglingId}`
  );
  expect(resp.code, `[${tag}] 悬空工单仍是成功信封 code 0，实际 ${resp.code}`).toBe(0);
  expect(resp.data, `[${tag}] data 应为 null，实际 ${JSON.stringify(resp.data)}`).toBeNull();
});
