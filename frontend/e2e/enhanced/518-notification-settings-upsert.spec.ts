// 518 用户通知设置按 business_type 隔离 upsert：同键复用 id、三开关精确回读、异键不互写。
//
// 后端判据（逐字段核源，端点相对 baseURL '/api/v1/erp'）：
// - backend/src/routes/analytics.rs:440 `.route("/settings", get(get_settings).put(update_setting))`；
//   frontend/scripts/route-snapshot.txt:607 GET、:1726 PUT，**没有 DELETE /notifications/settings**，
//   故本用例不写假清理端点，只用 genCode 的唯一 business_type 留痕并在日志里登记。
// - backend/src/handlers/notification_handler.rs:37-42 请求 DTO 仅四个键：
//   business_type:String / enable_internal:bool / enable_email:bool / enable_sms:bool；
//   :172-186 GET 只返回 auth.user_id 自己的 Vec<Model>（data 是裸数组，不是 items）；
//   :188-209 PUT 调 service 后 success_with_message，data 为落库实体，断言读回而非仅 200。
// - backend/src/services/notification_service.rs:538-548 get_user_settings 按 UserId 过滤；
//   :551-588 update_setting 按 (user_id, business_type) 查存量：存在则只改三开关 + updated_at，
//   不存在则插入并把 user_id 取会话值、enable_webhook 固定 false。业务类型无 trim/归一，原样入库。
// - backend/src/models/notification_setting.rs:13-33 实体键全集：
//   id/user_id/business_type/enable_internal/enable_email/enable_sms/enable_webhook/created_at/updated_at。
// 布尔一律严格比较 true/false，不做 truthy 归一；时间戳为 DECIMAL 无关的 ISO 字符串，按原值比较。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI } from '../flow/helpers';

interface SettingRow {
  id: number;
  user_id: number;
  business_type: string;
  enable_internal: boolean;
  enable_email: boolean;
  enable_sms: boolean;
  enable_webhook: boolean;
  created_at: string;
  updated_at: string;
}

interface FlagTriple {
  enable_internal: boolean;
  enable_email: boolean;
  enable_sms: boolean;
}

const SETTING_KEYS = [
  'id',
  'user_id',
  'business_type',
  'enable_internal',
  'enable_email',
  'enable_sms',
  'enable_webhook',
  'created_at',
  'updated_at',
] as const;

const BOOL_KEYS = ['enable_internal', 'enable_email', 'enable_sms', 'enable_webhook'] as const;

function requireSelfId(me: { id?: number }): number {
  expect(Number.isInteger(me.id), `[518] /auth/me 应返回整数 id，实际 ${JSON.stringify(me)}`).toBe(
    true
  );
  if (me.id === undefined) {
    throw new Error(`[518] /auth/me 缺少 id，实际 ${JSON.stringify(me)}`);
  }
  return me.id;
}

function assertSettingShape(row: SettingRow, label: string): void {
  expect(
    Object.keys(row).sort(),
    `[518] ${label} 出参键须与 notification_setting::Model 逐字相同`
  ).toEqual([...SETTING_KEYS].sort());
  expect(Number.isInteger(row.id) && row.id > 0, `[518] ${label} id 须正整数`).toBe(true);
  expect(Number.isInteger(row.user_id) && row.user_id > 0, `[518] ${label} user_id 须正整数`).toBe(
    true
  );
  expect(typeof row.business_type, `[518] ${label} business_type 须字符串`).toBe('string');
  for (const key of BOOL_KEYS) {
    expect(typeof row[key], `[518] ${label} ${key} 须严格布尔值`).toBe('boolean');
  }
  expect(typeof row.created_at, `[518] ${label} created_at 须字符串`).toBe('string');
  expect(row.created_at.length > 0, `[518] ${label} created_at 不得为空`).toBe(true);
  expect(typeof row.updated_at, `[518] ${label} updated_at 须字符串`).toBe('string');
  expect(row.updated_at.length > 0, `[518] ${label} updated_at 不得为空`).toBe(true);
}

function assertFlags(row: SettingRow, expected: FlagTriple, label: string): void {
  expect(row.enable_internal, `[518] ${label} enable_internal 精确回读`).toBe(
    expected.enable_internal
  );
  expect(row.enable_email, `[518] ${label} enable_email 精确回读`).toBe(expected.enable_email);
  expect(row.enable_sms, `[518] ${label} enable_sms 精确回读`).toBe(expected.enable_sms);
  expect(row.enable_webhook, `[518] ${label} enable_webhook 建单后恒 false`).toBe(false);
}

async function getSettings(page: Page, label: string): Promise<SettingRow[]> {
  const data = await apiCallRaw<unknown>(page, 'GET', '/notifications/settings');
  if (!Array.isArray(data)) {
    throw new Error(
      `[518] ${label} GET /notifications/settings 的 data 须为裸数组，实际 ${JSON.stringify(data)}`
    );
  }
  const rows = data as SettingRow[];
  for (const row of rows) {
    assertSettingShape(row, `${label} 列表行`);
  }
  return rows;
}

function pickByBusinessType(rows: SettingRow[], key: string, label: string): SettingRow {
  const hits = rows.filter(row => row.business_type === key);
  expect(
    hits.length,
    `[518] ${label} business_type=${key} 应恰好命中 1 行，实际 ${hits.length}`
  ).toBe(1);
  const row = hits[0];
  if (row === undefined) {
    throw new Error(`[518] ${label} 命中行解析失败：${key}`);
  }
  return row;
}

function requireById(rows: SettingRow[], id: number, label: string): SettingRow {
  const row = rows.find(item => item.id === id);
  if (row === undefined) {
    throw new Error(`[518] ${label} 按 id=${id} 找不到设置行`);
  }
  return row;
}

async function putSetting(
  page: Page,
  payload: Record<string, unknown>,
  label: string
): Promise<SettingRow> {
  const data = await apiCallRaw<SettingRow>(page, 'PUT', '/notifications/settings', payload);
  assertSettingShape(data, `${label} PUT 响应`);
  expect(data.business_type, `[518] ${label} PUT 响应 business_type 原样回写`).toBe(
    payload.business_type
  );
  return data;
}

test.describe.serial('518 用户通知设置 upsert 隔离', () => {
  test('518-01 同键复用 id 精确翻转三开关，异键独立落库不覆盖且留痕', async ({ page }) => {
    await loginViaUI(page);
    const selfId = requireSelfId(await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me'));

    const before = await getSettings(page, '初始');
    expect(
      before.every(row => row.user_id === selfId),
      '[518] GET /notifications/settings 只应返回当前用户自己的设置'
    ).toBe(true);
    const beforeById = new Map(before.map(row => [row.id, row]));

    const keyA = genCode('E518NOTIFA');
    const keyB = genCode('E518NOTIFB');
    expect(keyA === keyB, '[518] 两个 business_type marker 必须不同').toBe(false);

    const firstWrite = await putSetting(
      page,
      {
        business_type: keyA,
        enable_internal: true,
        enable_email: false,
        enable_sms: true,
      },
      'A 首写'
    );
    expect(firstWrite.user_id, '[518] A 首写响应 user_id 取会话值').toBe(selfId);
    assertFlags(
      firstWrite,
      { enable_internal: true, enable_email: false, enable_sms: true },
      'A 首写响应'
    );

    const afterA1 = await getSettings(page, 'A 首写后');
    const rowA1 = pickByBusinessType(afterA1, keyA, 'A 首写后');
    expect(rowA1.id, '[518] A 首写 GET 回读 id 应与 PUT 响应一致').toBe(firstWrite.id);
    expect(rowA1.user_id, '[518] A 首写 GET 回读 user_id').toBe(selfId);
    assertFlags(
      rowA1,
      { enable_internal: true, enable_email: false, enable_sms: true },
      'A 首写回读'
    );
    for (const [id, baseline] of beforeById) {
      expect(requireById(afterA1, id, 'A 首写后基线'), `[518] A 首写不应改动基线行 ${id}`).toEqual(
        baseline
      );
    }

    const secondWrite = await putSetting(
      page,
      {
        business_type: keyA,
        enable_internal: false,
        enable_email: true,
        enable_sms: false,
      },
      'A 同键再写'
    );
    expect(secondWrite.id, '[518] 同 business_type upsert 必须复用同一 id').toBe(rowA1.id);
    expect(secondWrite.user_id, '[518] A 同键再写 user_id 不变').toBe(selfId);
    assertFlags(
      secondWrite,
      { enable_internal: false, enable_email: true, enable_sms: false },
      'A 同键再写响应'
    );

    const afterA2 = await getSettings(page, 'A 同键再写后');
    const rowA2 = pickByBusinessType(afterA2, keyA, 'A 同键再写后');
    expect(rowA2.id, '[518] A 同键再写 GET 回读 id 不变').toBe(rowA1.id);
    expect(rowA2.created_at, '[518] A 同键再写不重建行，created_at 不变').toBe(rowA1.created_at);
    expect(rowA2.user_id, '[518] A 同键再写 GET 回读 user_id').toBe(selfId);
    assertFlags(
      rowA2,
      { enable_internal: false, enable_email: true, enable_sms: false },
      'A 同键再写回读'
    );
    for (const [id, baseline] of beforeById) {
      expect(requireById(afterA2, id, 'A 再写后基线'), `[518] A 再写不应改动基线行 ${id}`).toEqual(
        baseline
      );
    }

    const writeB = await putSetting(
      page,
      {
        business_type: keyB,
        enable_internal: false,
        enable_email: false,
        enable_sms: true,
      },
      'B 首写'
    );
    expect(writeB.id, '[518] 不同 business_type 必须生成新 id').not.toBe(rowA1.id);
    expect(writeB.user_id, '[518] B 首写响应 user_id 取会话值').toBe(selfId);
    assertFlags(
      writeB,
      { enable_internal: false, enable_email: false, enable_sms: true },
      'B 首写响应'
    );

    const afterB = await getSettings(page, 'B 首写后');
    expect(
      pickByBusinessType(afterB, keyA, 'B 首写后'),
      '[518] 写 B 不得覆盖 A 的三开关与 id'
    ).toEqual(rowA2);
    const rowB = pickByBusinessType(afterB, keyB, 'B 首写后');
    expect(rowB.id, '[518] B GET 回读 id 应与 PUT 响应一致').toBe(writeB.id);
    expect(rowB.user_id, '[518] B GET 回读 user_id').toBe(selfId);
    assertFlags(
      rowB,
      { enable_internal: false, enable_email: false, enable_sms: true },
      'B 首写回读'
    );
    for (const [id, baseline] of beforeById) {
      expect(requireById(afterB, id, 'B 首写后基线'), `[518] B 首写不应改动基线行 ${id}`).toEqual(
        baseline
      );
    }

    // 路由表没有 DELETE /notifications/settings：唯一 marker 留痕，不伪造清理端点。
    console.warn(
      `[518] 无删除端点，留痕 business_type=${keyA}(id=${rowA2.id}) / ${keyB}(id=${rowB.id}) user_id=${selfId}`
    );
  });
});
