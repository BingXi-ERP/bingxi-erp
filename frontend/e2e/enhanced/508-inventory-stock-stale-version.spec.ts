// 508 库存行旧版本号写门（纯 API E2E）。
//
// 源码判据（与"409 / VALIDATION_ERROR"的猜测不同，此处以源码为准）：
// - backend/src/handlers/inventory_stock_handler.rs:224-228 在一切写列动作之前比对
//   stock.version != payload.version，不等即 AppError::business("库存记录已被其他用户修改，请刷新后重试")。
// - backend/src/utils/error.rs:383 将 BusinessError 映射为 HTTP 400；:824 code=BUSINESS_ERROR；
//   :850 与 utils/messages.rs:43 的 public_message 固定为脱敏文案"业务处理失败"，真实原因只进日志。
//   故本用例断言 400 / BUSINESS_ERROR / "业务处理失败"，而非 409 / VALIDATION_ERROR。
// - 同文件 :236-258 按三态覆盖列后 version = Set(payload.version + 1)；可写键见
//   handlers/inventory_stock_handler_dto.rs:143-166（version 为必填 i32），出参键见 StockResponse :52-115。
// - 端点：POST /inventory/stock/fabric 建隔离行，GET /inventory/stock/{id} 读真实 version，
//   PUT /inventory/stock/{id} 写入，DELETE /inventory/stock/{id} 仅清理本用例建的行。
// DECIMAL 出参为字符串，数值断言一律 Number(String(v)) 归一，不用浮点精确相等。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

type Row = Record<string, unknown>;

const num = (v: unknown): number => Number(String(v));

function positiveId(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[508] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function versionOf(row: Row, label: string): number {
  expect(
    Number.isInteger(row.version) && (row.version as number) >= 0,
    `[508] ${label} 的 version 须非负整数，实际=${JSON.stringify(row.version)}`
  ).toBe(true);
  return row.version as number;
}

function assertQuantity(row: Row, label: string, expected: number): void {
  for (const key of ['quantity_on_hand', 'quantity_available']) {
    expect(
      num(row[key]),
      `[508] ${label} ${key} 须为 ${expected}，实际=${JSON.stringify(row[key])}`
    ).toBe(expected);
  }
  expect(
    num(row.quantity_reserved),
    `[508] ${label} quantity_reserved 须为 0，实际=${JSON.stringify(row.quantity_reserved)}`
  ).toBe(0);
}

async function readStock(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
}

async function updateStock(
  page: Page,
  id: number,
  version: number,
  quantity: string
): Promise<Row> {
  return apiCallRaw<Row>(page, 'PUT', `/inventory/stock/${id}`, {
    version,
    quantity_on_hand: quantity,
    quantity_available: quantity,
  });
}

test.describe('508 库存乐观锁旧版本写门', () => {
  test('508-01 旧 version 第三次写入被拒且零写入 最新 version 仍可推进', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0,
      `[508] 夹具缺产品/仓库，productIds=${ctx.productIds.length} warehouseIds=${ctx.warehouseIds.length}`
    ).toBe(true);

    const tag = genCode('E508');
    let stockId = 0;
    try {
      const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
        warehouse_id: ctx.warehouseIds[0],
        product_id: ctx.productIds[0],
        batch_no: `B-${tag}`,
        color_no: `C-${tag}`,
        dye_lot_no: `L-${tag}`,
        grade: '一等品',
        quantity_meters: '100.00',
        quantity_kg: '100.00',
      });
      stockId = positiveId(created.id, '建库存返回 id');
      console.log(`[508] 建隔离库存行 id=${stockId} batch_no=B-${tag} dye_lot_no=L-${tag}`);

      const baseline = await readStock(page, stockId);
      const baseVersion = versionOf(baseline, '入库基线');
      assertQuantity(baseline, '入库基线', 100);

      const afterFirst = await updateStock(page, stockId, baseVersion, '90.00');
      expect(
        versionOf(afterFirst, '第一次合法更新响应'),
        `[508] 第一次更新后 version 应递增到 ${baseVersion + 1}`
      ).toBe(baseVersion + 1);
      // 第一次读到的 version：当时有效，经第二次合法更新后成为旧版本。
      const firstRead = await readStock(page, stockId);
      const staleVersion = versionOf(firstRead, '第一次读到的 version');
      expect(
        staleVersion,
        `[508] 第一次读到的 version 应与第一次更新响应一致（${baseVersion + 1}）`
      ).toBe(baseVersion + 1);
      assertQuantity(firstRead, '第一次合法更新后回读', 90);
      console.log(`[508] 第一次合法更新成功 version=${staleVersion} quantity=90`);

      const afterSecond = await updateStock(page, stockId, staleVersion, '80.00');
      const secondVersion = versionOf(afterSecond, '第二次合法更新响应');
      expect(secondVersion, `[508] 第二次更新后 version 应递增到 ${staleVersion + 1}`).toBe(
        staleVersion + 1
      );
      // 第二次读到的最新 version：用于证明拒绝后仍能继续推进。
      const secondRead = await readStock(page, stockId);
      const latestVersion = versionOf(secondRead, '第二次读到的 version');
      expect(latestVersion, `[508] 第二次回读 version 应与更新响应一致（${secondVersion}）`).toBe(
        secondVersion
      );
      assertQuantity(secondRead, '第二次合法更新后回读', 80);
      console.log(`[508] 第二次合法更新成功 version=${latestVersion} quantity=80`);

      const rejected = await apiCallExpectFail(page, 'PUT', `/inventory/stock/${stockId}`, {
        version: staleVersion,
        quantity_on_hand: '70.00',
        quantity_available: '70.00',
      });
      expect(rejected.status, `[508] 旧版本写入应返回 400，实际=${rejected.status}`).toBe(400);
      expect(
        failureCode(rejected),
        `[508] 旧版本写入机器码应为 ${APP_ERROR_CODES.BUSINESS_ERROR}，实际=${JSON.stringify(
          rejected.code
        )}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(
        rejected.message,
        `[508] AppError::business 的对外文案应为固定脱敏文案，实际=${JSON.stringify(
          rejected.message
        )}`
      ).toBe('业务处理失败');
      expect(
        rejected.data,
        `[508] 错误信封不得携带 data，实际=${JSON.stringify(rejected.data)}`
      ).toBeUndefined();
      console.log(
        `[508] 旧版本写入被拒 status=${rejected.status} code=${String(
          rejected.code
        )} staleVersion=${staleVersion}`
      );

      const afterReject = await readStock(page, stockId);
      assertQuantity(afterReject, '旧版本拒绝后回读', 80);
      expect(
        versionOf(afterReject, '旧版本拒绝后回读'),
        `[508] 被拒写入不得推进 version，应仍为 ${secondVersion}`
      ).toBe(secondVersion);

      const afterFinal = await updateStock(page, stockId, latestVersion, '60.00');
      expect(
        versionOf(afterFinal, '最新 version 推进响应'),
        `[508] 最新 version 写入应推进到 ${latestVersion + 1}`
      ).toBe(latestVersion + 1);
      const final = await readStock(page, stockId);
      assertQuantity(final, '最新 version 推进后回读', 60);
      expect(
        versionOf(final, '最新 version 推进后回读'),
        `[508] 最终 version 应为 ${latestVersion + 1}`
      ).toBe(latestVersion + 1);
      console.log(`[508] 最新 version 仍可推进 version=${latestVersion + 1} quantity=60`);
    } finally {
      if (stockId > 0) {
        await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `[508] 库存 ${stockId}`);
      }
    }
  });
});
