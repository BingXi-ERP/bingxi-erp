import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

/**
 * 444 订单锁缸防超卖与销售退货反向腿
 *
 * 主题 建档可用量基线 锁缸占用 超卖拦截 并发时序 取消释放 退货回补 越权直连
 * 端点族以 frontend/scripts/route-snapshot.txt 在册路径为准。
 */

type Row = Record<string, unknown>;

test.describe.serial('444 订单锁缸防超卖与销售退货反向腿', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 建档与可用量基线读回', async ({ page }) => {
    test.skip(true, '骨架待填');
  });
});
