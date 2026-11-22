// 4.25 错误码 + 3.3 操作审计：埋点 track 端点 payload 序列化字节上限门。
// 后端判据：handlers/omni_audit_handler.rs:62 req.validate()（各文本字段有 max 长度约束）；
//   :64-70 payload=Some 时 serde_json::to_string(payload).len() > 10240 →
//   AppError::validation_displayable("payload 超过 10KB 上限")（400 + VALIDATION_ERROR）。
// 关键判据：按序列化后的 UTF-8 字节数计，纯 ASCII 字符串 value 的 JSON 形态含两端引号，
//   故 'x'.repeat(10238) 序列化=10240 字节恰好放行，'x'.repeat(10239)=10241 字节拒绝。
// 路径判据：finance_audit_routes 注册 "/audit/track"，finance() 经 mod.rs
//   nest("/api/v1/erp/finance", finance::routes())，前端 omni-audit.ts:64 亦调
//   '/finance/audit/track'，故 E2E 路径写 '/finance/audit/track'。
// 与既有覆盖分工：全仓 e2e 无 audit/track 命中；本例专补 payload 10KB 字节门零覆盖点。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/finance/audit/track';
const base = {
  event_type: 'e2e480',
  event_name: 'payload-size-gate',
  resource: 'sales_order',
  action: 'view',
};

test.describe('4.25 审计埋点 payload 字节门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('480-01 payload 序列化恰 10240 放行、10241 拒绝且 400/VALIDATION_ERROR', async ({
    page,
  }) => {
    const ok = await apiCall<unknown>(page, 'POST', PATH, {
      ...base,
      payload: 'x'.repeat(10238),
    });
    expect(ok.code, '[480] 10240 字节边界内须放行（ApiResponse code=200）').toBe(200);

    const over = await apiCallExpectFail(page, 'POST', PATH, {
      ...base,
      payload: 'x'.repeat(10239),
    });
    expect(over.status, `[480] 10241 字节须 400，实际 ${over.status}`).toBe(400);
    expect(
      failureCode(over),
      `[480] 10241 字节机器码须 VALIDATION_ERROR，实际=${failureCode(over)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(over.message ?? '', '[480] 拒因须点名 payload 上限').toContain('payload');
  });
});
