// 4.25 错误文案：采购订单非草稿态二次提交的业务拒绝只外显脱敏文案，不外泄内部状态。
//
// 功能 钉 POST /purchase/orders/{id}/submit 第二次提交 400 + BUSINESS_ERROR +
//       message 恰为「业务处理失败」+ 统一四字段，且不带 SUBMITTED/DRAFT/REJECTED 等状态细节。
// 调用方 CI 的 e2e flow 分片按文件粒度调度本文件，无其它调用方。
// 入参 page 来自 diagnose-fixture；供应商、仓库、部门、物料取 ensureTestEntities 自建夹具。
// 传给谁 被测请求发往 API_BASE 指向的后端；断言结果只进 Playwright 报告，不写仓库文件。
// 存什么 仅存本用例自建采购订单主键，不落盘制品、不改共享账号状态。
// 存哪里 业务数据落 CI 现场数据库，finally 删除订单；断言只留在 Playwright 报告。
//
// 判据链（后端源码逐行核对）：
//   services/po/contract.rs:71-85 仅 DRAFT/REJECTED 可提交，其余状态返回 AppError::business
//     并把含当前态/允许态的细节留在内部错误里；utils/error.rs:843-861 对 BusinessError
//     走 public_message() 脱敏；utils/messages.rs:43 的 BUSINESS_PUBLIC 即「业务处理失败」。
//   utils/error.rs:775-780 失败体只有 code/message/trace_id/timestamp，:815-829 机器码 BUSINESS_ERROR。
// 范围说明：销售订单编辑口 business_displayable 外显腿已由 enhanced/488 钉住，本文件只补
//   采购订单 non-displayable 单腿，不重复造 SO、不重写 488 的断言。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  ensureTestEntities,
  failureCode,
  getCtx,
  loginViaUI,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';

const BUSINESS_PUBLIC = '业务处理失败';

function expectBusinessEnvelope(result: ApiFailureResult, label: string): void {
  const { status, ...body } = result;
  expect(status, `${label} HTTP 应为 400`).toBe(400);
  expect(failureCode(result), `${label} 机器码应为字符串 BUSINESS_ERROR`).toBe('BUSINESS_ERROR');
  expect(body.message, `${label} message 必须逐字符等于脱敏常量`).toBe(BUSINESS_PUBLIC);
  expect(String(body.message), `${label} 不得外显内部状态细节`).not.toMatch(
    /DRAFT|REJECTED|SUBMITTED|订单状态/
  );
  expect(Object.keys(body).sort(), `${label} 失败体只许统一四字段，不得夹带订单数据`).toEqual([
    'code',
    'message',
    'timestamp',
    'trace_id',
  ]);
  expect(typeof body.trace_id, `${label} trace_id 应为字符串`).toBe('string');
  expect((body.trace_id as string).length, `${label} trace_id 不应为空`).toBeGreaterThan(0);
  expect(typeof body.timestamp, `${label} timestamp 应为数字`).toBe('number');
}

test('4.25-03 已提交采购订单二次提交：400 业务拒绝仅见脱敏文案', async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();
  expect(
    ctx.supplierId && ctx.warehouseIds[0] && ctx.departmentIds[0] && ctx.productIds[0],
    '前置不成立：夹具未产出供应商/仓库/部门/物料主键，无法自建采购订单'
  ).toBeTruthy();

  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
    supplier_id: ctx.supplierId,
    warehouse_id: ctx.warehouseIds[0],
    department_id: ctx.departmentIds[0],
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    items: [
      {
        material_id: ctx.productIds[0],
        quantity_ordered: '100',
        unit_price: '10.50',
        tax_rate: 13,
      },
    ],
  });
  const orderId = created.data?.id;
  expect(orderId, `PO 创建失败：${JSON.stringify(created)}`).toBeTruthy();

  try {
    const first = await apiCall(page, 'POST', `/purchase/orders/${orderId}/submit`);
    expect(first.code, '首次提交应成功并把状态推离 DRAFT').toBe(200);

    // 第二次提交时状态已非 DRAFT/REJECTED，必须命中 services/po/contract.rs 的状态门。
    const second = await apiCallExpectFail(page, 'POST', `/purchase/orders/${orderId}/submit`);
    expectBusinessEnvelope(second, '非草稿态二次提交');
  } finally {
    await tryCleanup(page, 'DELETE', `/purchase/orders/${orderId}`, '637 一次性采购订单');
  }
});
