// PUT 更新族五端点契约（排程手动调整 / 排程任务调整 / 慢查询优化状态 / 用户通知偏好 / 仓库更新）
//
// 守的是什么：这五枚 PUT 端点此前在 e2e 语料下零引用，本文件补齐最小契约：
//   - PUT /scheduling/{id}、PUT /scheduling/tasks/{id}/adjust：handler 先查生产订单，
//     不存在即 not_found → 404 + 统一错误信封（code/message/trace_id/timestamp 四键）。
//     生产订单前置链路（物料/工艺/工单）过重，不做全链自建；「订单不存在即 404」是
//     无前置依赖、确定性成立的可达分支。
//   - PUT /slow-queries/{id}/optimization：optimization_status 白名单校验先于存在性检查，
//     非法值恒 400（BadRequest 机器码），白名单内 + 记录不存在恒 404 —— 两分支均为确定性契约。
//   - PUT /user-notification-settings：当前用户偏好全量可写；先读后写再复原，
//     断 ApiResponse 成功信封（code=200 + 固定成功文案 + data 回显）。
//   - PUT /warehouses/{id}：自建仓库 → 更新 name/address → 断回显与编码不变 → 测后清理。
//
// 诚实口径：404/400 分支的 message 为脱敏固定文案（public_message 族），不断言细节文案，
// 只断机器码与信封键；成功分支断真实回显，不放宽、不 mock。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  deferCleanup,
  flushDeferredCleanups,
  loginViaUI,
} from './helpers';
import type { DeferredCleanup } from './helpers';

/** 不存在的生产订单 / 慢查询记录 id：取远超自增序列的高位值，避免撞上真实数据 */
const MISSING_ID = 99999999;

/** 用户通知偏好（backend/src/models/user_notification_setting.rs，snake_case 直出） */
interface NotificationSettingModel {
  user_id: number;
  email_enabled: boolean;
  internal_enabled: boolean;
  order_notification_type: string;
  approval_notification_type: string;
  inventory_notification_type: string;
  purchase_notification_type: string;
  finance_notification_type: string;
  system_notification_type: string;
}

/** 仓库实体（backend/src/models/warehouse.rs：warehouse_code 无 rename；name 列 serde rename
 * 为 warehouse_name，故出参键是 warehouse_code/warehouse_name，请求体字段才是 name）。 */
interface WarehouseModel {
  id: number;
  warehouse_code: string;
  warehouse_name: string;
  address: string | null;
}

test.describe('PUT 更新族五端点契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('PUT /scheduling/{id} 手动调整排程：生产订单不存在 → 404 统一错误信封', async ({ page }) => {
    const fail = await apiCallExpectFail(page, 'PUT', `/scheduling/${MISSING_ID}`, {});
    expect(fail.status, '不存在的生产订单应 404').toBe(404);
    expect(fail.code, '错误机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(typeof fail.message, '错误信封应带 message（脱敏固定文案）').toBe('string');
    expect(typeof fail.trace_id, '错误信封应带 trace_id').toBe('string');
    expect((fail.trace_id as string).length, 'trace_id 应非空').toBeGreaterThan(0);
    expect(typeof fail.timestamp, '错误信封应带 timestamp（epoch 秒数）').toBe('number');
  });

  test('PUT /scheduling/tasks/{id}/adjust 排程任务调整：任务不存在 → 404 统一错误信封', async ({
    page,
  }) => {
    const fail = await apiCallExpectFail(page, 'PUT', `/scheduling/tasks/${MISSING_ID}/adjust`, {});
    expect(fail.status, '不存在的排程任务应 404').toBe(404);
    expect(fail.code, '错误机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(typeof fail.message, '错误信封应带 message').toBe('string');
    expect(typeof fail.trace_id, '错误信封应带 trace_id').toBe('string');
    expect(typeof fail.timestamp, '错误信封应带 timestamp').toBe('number');
  });

  test('PUT /slow-queries/{id}/optimization：optimization_status 非白名单值 → 400（校验先于存在性）', async ({
    page,
  }) => {
    const fail = await apiCallExpectFail(page, 'PUT', `/slow-queries/${MISSING_ID}/optimization`, {
      optimization_status: 'not-a-valid-status',
    });
    expect(fail.status, '白名单外状态应 400').toBe(400);
    expect(fail.code, '错误机器码应为 BAD_REQUEST').toBe(APP_ERROR_CODES.BAD_REQUEST);
    expect(typeof fail.trace_id, '错误信封应带 trace_id').toBe('string');
    expect(typeof fail.timestamp, '错误信封应带 timestamp').toBe('number');
  });

  test('PUT /slow-queries/{id}/optimization：白名单内状态 + 记录不存在 → 404 NOT_FOUND', async ({
    page,
  }) => {
    const fail = await apiCallExpectFail(page, 'PUT', `/slow-queries/${MISSING_ID}/optimization`, {
      optimization_status: 'resolved',
    });
    expect(fail.status, '合法状态但记录不存在应 404').toBe(404);
    expect(fail.code, '错误机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(typeof fail.message, '错误信封应带 message').toBe('string');
    expect(typeof fail.trace_id, '错误信封应带 trace_id').toBe('string');
    expect(typeof fail.timestamp, '错误信封应带 timestamp').toBe('number');
  });

  test('PUT /user-notification-settings：当前用户偏好可写，成功信封回显后复原', async ({
    page,
  }) => {
    const before = await apiCall<NotificationSettingModel>(
      page,
      'GET',
      '/user-notification-settings'
    );
    expect(before.code, '读偏好应成功').toBe(200);
    expect(typeof before.data.email_enabled, '偏好应含 email_enabled').toBe('boolean');
    expect(typeof before.data.internal_enabled, '偏好应含 internal_enabled').toBe('boolean');

    const nextEmail = !before.data.email_enabled;
    const nextInternal = !before.data.internal_enabled;
    const updated = await apiCall<NotificationSettingModel>(
      page,
      'PUT',
      '/user-notification-settings',
      {
        email_enabled: nextEmail,
        internal_enabled: nextInternal,
        order_notification_type: 'both',
      }
    );
    expect(updated.code, '更新偏好应成功').toBe(200);
    expect(updated.message, '更新偏好应带固定成功文案').toBe('通知偏好设置已更新');
    expect(updated.data.email_enabled, 'email_enabled 应回显写入值').toBe(nextEmail);
    expect(updated.data.internal_enabled, 'internal_enabled 应回显写入值').toBe(nextInternal);
    expect(updated.data.order_notification_type, 'order_notification_type 应回显写入值').toBe(
      'both'
    );

    // 复原：把被改动的三键写回读到的原值，本用例不留状态
    const restore = await apiCall<NotificationSettingModel>(
      page,
      'PUT',
      '/user-notification-settings',
      {
        email_enabled: before.data.email_enabled,
        internal_enabled: before.data.internal_enabled,
        order_notification_type: before.data.order_notification_type,
      }
    );
    expect(restore.code, '复原偏好应成功').toBe(200);
    expect(restore.data.email_enabled, '复原后 email_enabled 应回原值').toBe(
      before.data.email_enabled
    );
    expect(restore.data.internal_enabled, '复原后 internal_enabled 应回原值').toBe(
      before.data.internal_enabled
    );
  });

  test('PUT /warehouses/{id}：自建仓库后改名，回显更新值且编码不变，测后清理', async ({ page }) => {
    const stamp = Date.now();
    const cleanupQueue: DeferredCleanup[] = [];
    const created = await apiCall<WarehouseModel>(page, 'POST', '/warehouses', {
      name: `E2E 更新契约仓 ${stamp}`,
      code: `E2E-PUT-${stamp}`,
      address: 'e2e 临时地址',
    });
    expect(created.code, '自建仓库应成功').toBe(200);
    expect(typeof created.data.id, '创建回显应含 id').toBe('number');
    expect(created.data.warehouse_code, '创建回显应含 warehouse_code').toBe(`E2E-PUT-${stamp}`);
    deferCleanup(
      cleanupQueue,
      'DELETE',
      `/warehouses/${created.data.id}`,
      `e2e 更新契约仓 ${stamp}`
    );

    try {
      const updated = await apiCall<WarehouseModel>(page, 'PUT', `/warehouses/${created.data.id}`, {
        name: `E2E 更新契约仓改 ${stamp}`,
        address: 'e2e 改后地址',
      });
      expect(updated.code, '更新仓库应成功').toBe(200);
      expect(updated.message, '更新仓库应带固定成功文案').toBe('更新成功');
      expect(updated.data.id, '更新回显 id 应不变').toBe(created.data.id);
      expect(updated.data.warehouse_name, 'warehouse_name 应回显写入值').toBe(
        `E2E 更新契约仓改 ${stamp}`
      );
      expect(updated.data.address, 'address 应回显写入值').toBe('e2e 改后地址');
      expect(updated.data.warehouse_code, 'warehouse_code 不应被更新改动').toBe(`E2E-PUT-${stamp}`);
    } finally {
      await flushDeferredCleanups(page, cleanupQueue);
    }
  });
});
