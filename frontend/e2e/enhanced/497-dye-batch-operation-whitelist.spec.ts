// Wave3 库存细码：缸号操作记录创建口的类型白名单与操作人身份派生。
// 后端判据：services/dye_batch_state_machine_ops/operation.rs:28-46 create() 先校验
//   operation_type，再把 handler 传入的会话 user_id 写入 operator_id；
//   services/dye_batch_state_machine_validation.rs:139-161 仅接受六值小写；
//   models/dto/dye_batch_dto.rs:130-145 请求 DTO 无 operator_id，多传被 serde 忽略。
// 该端点无 DELETE 清理腿，全部行按唯一 target_batch_no / operation_name 隔离，不断言全局总数。
import { expect, test } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/production/dye-batch-operations';
const TARGET_BATCH_ID = 90041402;
const SOURCE_BATCH_ID = 90041403;
const FORGED_OPERATOR_ID = 9999999;
const VALID_TYPES = [
  'merge',
  'split',
  'priority_adjust',
  'batch_change',
  'schedule_change',
  'terminate',
] as const;
const WHITELIST_MESSAGE =
  '缸号操作类型必须是 merge/split/priority_adjust/batch_change/schedule_change/terminate';

interface OperationRow {
  id?: unknown;
  operation_type?: unknown;
  operation_name?: unknown;
  target_batch_id?: unknown;
  target_batch_no?: unknown;
  source_batch_ids?: unknown;
  source_batch_nos?: unknown;
  operation_data?: unknown;
  operator_id?: unknown;
  operator_name?: unknown;
  operation_at?: unknown;
  remarks?: unknown;
}

interface OperationBody {
  operation_type: string;
  operation_name: string;
  target_batch_id: number;
  target_batch_no: string;
  source_batch_ids: number[];
  source_batch_nos: string[];
  operation_data: { before: number; after: number };
  operator_name: string;
  remarks: string;
}

function bodyFor(operationType: string, tag: string): OperationBody {
  return {
    operation_type: operationType,
    operation_name: `${tag}-${operationType || 'EMPTY'}`,
    target_batch_id: TARGET_BATCH_ID,
    target_batch_no: tag,
    source_batch_ids: [SOURCE_BATCH_ID],
    source_batch_nos: [`${tag}-SRC`],
    operation_data: { before: 1, after: 2 },
    operator_name: `${tag}-NAME`,
    remarks: tag,
  };
}

async function currentUserId(page: Page): Promise<number> {
  const me = await apiCallRaw<{ id?: unknown }>(page, 'GET', '/auth/me');
  const id = Number(me?.id);
  expect(id, `[497] /auth/me 须返回有效用户 id，实得：${JSON.stringify(me)}`).toBeGreaterThan(0);
  return id;
}

async function createWithForgedOperator(page: Page, body: OperationBody): Promise<OperationRow> {
  const forgedBody: Record<string, unknown> = { ...body, operator_id: FORGED_OPERATOR_ID };
  return apiCallRaw<OperationRow>(page, 'POST', PATH, forgedBody);
}

async function readByBatch(page: Page): Promise<OperationRow[]> {
  const rows = await apiCallRaw<OperationRow[]>(page, 'GET', `${PATH}/by-batch/${TARGET_BATCH_ID}`);
  expect(Array.isArray(rows), `[497] by-batch 应回读数组，实得：${JSON.stringify(rows)}`).toBe(
    true
  );
  return rows;
}

test.describe('缸号操作类型白名单与操作人派生', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('六值白名单全部受理，operator_id 取会话用户而非请求伪造值', async ({ page }) => {
    const sessionUserId = await currentUserId(page);
    const tag = genCode('W3OPS414');
    const created: Array<{ type: string; row: OperationRow }> = [];

    for (const operationType of VALID_TYPES) {
      const body = bodyFor(operationType, tag);
      const row = await createWithForgedOperator(page, body);
      const id = Number(row?.id);

      expect(
        id,
        `[497] ${operationType} 应落库并返回主键，实得：${JSON.stringify(row)}`
      ).toBeGreaterThan(0);
      expect(String(row?.operation_type), `[497] ${operationType} 回读类型`).toBe(operationType);
      expect(String(row?.operation_name), `[497] ${operationType} 回读操作名称`).toBe(
        body.operation_name
      );
      expect(Number(row?.target_batch_id), `[497] ${operationType} 回读目标缸号`).toBe(
        TARGET_BATCH_ID
      );
      expect(String(row?.target_batch_no), `[497] ${operationType} 回读目标缸号编码`).toBe(tag);
      expect(row?.source_batch_ids, `[497] ${operationType} 回读源缸号 id`).toEqual([
        SOURCE_BATCH_ID,
      ]);
      expect(row?.source_batch_nos, `[497] ${operationType} 回读源缸号编码`).toEqual([
        `${tag}-SRC`,
      ]);
      expect(row?.operation_data, `[497] ${operationType} 回读操作数据`).toEqual({
        before: 1,
        after: 2,
      });
      expect(String(row?.operator_name), `[497] ${operationType} 回读操作人姓名`).toBe(
        body.operator_name
      );
      expect(String(row?.remarks), `[497] ${operationType} 回读备注`).toBe(body.remarks);
      expect(String(row?.operation_at ?? ''), `[497] ${operationType} 回读操作时间`).not.toBe('');
      expect(Number(row?.operator_id), `[497] ${operationType} 操作人应取会话用户`).toBe(
        sessionUserId
      );
      expect(Number(row?.operator_id), `[497] ${operationType} 请求体伪造 id 必须被忽略`).not.toBe(
        FORGED_OPERATOR_ID
      );

      created.push({ type: operationType, row });
    }

    const first = created[0];
    if (!first) throw new Error('[497] 六值白名单未产生任何行');

    const detail = await apiCallRaw<OperationRow>(page, 'GET', `${PATH}/${Number(first.row.id)}`);
    expect(Number(detail?.id), '[497] 详情应按新建 id 回读').toBe(Number(first.row.id));
    expect(String(detail?.operation_type), '[497] 详情类型应与创建回包一致').toBe(first.type);
    expect(Number(detail?.operator_id), '[497] 详情操作人仍应为会话用户').toBe(sessionUserId);

    const byBatch = await readByBatch(page);
    for (const { row } of created) {
      expect(
        byBatch.some(item => Number(item?.id) === Number(row?.id)),
        `[497] by-batch 应含新建行 ${String(row?.id)}`
      ).toBe(true);
    }

    const byType = await apiCallRaw<OperationRow[]>(page, 'GET', `${PATH}/by-type/merge`);
    expect(
      byType.some(item => Number(item?.id) === Number(first.row.id)),
      '[497] by-type/merge 应含新建的合法 merge 行'
    ).toBe(true);
  });

  test('白名单外类型四类变体被拒且不落库', async ({ page }) => {
    const tag = genCode('W3OPS414-NEG');
    const invalid = [
      { type: 'merge_batch', reason: '把合缸误写为 merge_batch' },
      { type: 'MERGE', reason: '大小写变体' },
      { type: 'merge ', reason: '合法词带尾空格' },
      { type: '', reason: '空操作类型' },
    ];
    const rejectedNames: string[] = [];

    for (const item of invalid) {
      const body = bodyFor(item.type, tag);
      rejectedNames.push(body.operation_name);
      const fail = await apiCallExpectFail(page, 'POST', PATH, {
        ...body,
        operator_id: FORGED_OPERATOR_ID,
      });
      expect(fail.status, `[497] ${item.reason} 应 400，实得：${JSON.stringify(fail)}`).toBe(400);
      expect(failureCode(fail), `[497] ${item.reason} 机器码`).toBe(
        APP_ERROR_CODES.VALIDATION_ERROR
      );
      expect(String(fail.message ?? ''), `[497] ${item.reason} 文案须点名六值白名单`).toContain(
        WHITELIST_MESSAGE
      );
    }

    const byBatch = await readByBatch(page);
    for (const name of rejectedNames) {
      expect(
        byBatch.some(item => String(item?.operation_name) === name),
        `[497] 被拒请求不得留下操作记录 ${name}`
      ).toBe(false);
    }
  });
});
