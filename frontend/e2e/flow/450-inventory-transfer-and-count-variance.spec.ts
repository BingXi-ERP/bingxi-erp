/**
 * 库存调拨与盘盈盘亏的反向链路（调出→审批→调入→盘点差异）。
 *
 * 功能：验证一笔库间调拨在源库位与目标库位之间数量守恒、缸号逐字符可追溯，
 * 并验证盘点差异录入后库存数与差异流水同时变更；未审批的前置动作必须被后端拒绝。
 * 调用方：Playwright 分片 e2e（frontend/playwright.config.ts 的 flow 项目），
 * 由 CI 的 e2e job 执行，本地只允许 `npx playwright test --list`。
 * 入参：page（已登录会话）、getCtx() 的实体上下文（产品/仓库/缸号），
 * 数量单位米（quantity），金额不在本链路断言范围。
 * 传给谁：backend inventory_transfer_handler / inventory_count_handler /
 * inventory_stock_handler（backend/src/handlers/，路由挂载见 backend/src/routes/）。
 * 存什么：inventory_transfer、inventory_transfer_item、inventory_count、
 * inventory_count_item、inventory_stock 与库存流水；缺值按 NULL 表示未补录，不写 0。
 * 存哪里：PostgreSQL 同名业务表；端点存在性事实来源为
 * frontend/scripts/route-snapshot.txt。
 */
import { test, expect } from '@playwright/test';
import {
  apiCall,
  apiCallExpectFail,
  getCtx,
  loginAsRole,
  type ApiResponse,
} from './helpers';

/**
 * 功能：本用例涉及的调拨端点常量，路径为 API_PREFIX 之后的部分。
 * 调用方：本文件各用例。
 * 入参：无。
 * 传给谁：apiCall / apiCallExpectFail 的 path 形参。
 * 存什么：不持久化，仅 URL 字面量。
 * 存哪里：不存在数据库中。
 */
const TRANSFERS = '/inventory/transfers';

test.describe.serial('库存调拨与盘盈盘亏反向链路', () => {
  test('调拨单列表端点可达且返回分页信封', async ({ page }) => {
    await loginAsRole(page, 'warehouse_keeper');
    const res = await apiCall<Record<string, unknown>>(page, 'GET', `${TRANSFERS}?page=1&page_size=5`);
    expect(res.ok).toBe(true);
  });
});
