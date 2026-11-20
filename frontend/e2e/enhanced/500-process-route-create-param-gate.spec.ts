// Wave3 工序域：工序路线新建口的入参门与"非软删唯一"判据。
// 后端判据：routes/production.rs:229-230 POST /process-routes → flow_card_handler.rs:87-95
//   （建单人取 AuthContext，不取请求体）；models/dto/flow_card_dto.rs:15-23 请求字段；
//   services/flow_card_ops/route.rs:24-54 先 trim+大写归一，再按字节长 1..=32、seq>=1、
//   小写类型白名单 [pretreat,dye,print,finish,inspect,other]、is_deleted=false 唯一逐道拒绝；
//   :57-71 落库默认 require_scan=true / is_active=true / is_deleted=false / created_by=会话用户。
//   这些拒绝均为 AppError::business（error.rs:201-202）→ 400/BUSINESS_ERROR，
//   外显文案固定为 messages.rs:43 的脱敏常量，真实原因只进日志，故只断言机器码与脱敏文案。
// 造数隔离：route_code 全部由 genCode 唯一标记派生，详情按自建 id 回读；DELETE 是软删，
//   tryCleanup 在 afterEach 清理自建行；不查询也不断言全局列表总数。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const PATH = '/production/process-routes';
const MASKED_BUSINESS_MESSAGE = '业务处理失败';

interface ProcessRoute {
  id?: number;
  route_code?: string;
  route_name?: string;
  seq?: number;
  process_type?: string;
  require_scan?: boolean;
  is_active?: boolean;
  is_deleted?: boolean;
  created_by?: number;
}

type CreateBody = {
  route_code: string;
  route_name: string;
  seq: number;
  process_type: string;
};

const createdIds: number[] = [];
const softDeletedIds = new Set<number>();

function body(code: string, marker: string, overrides: Partial<CreateBody> = {}): CreateBody {
  return {
    route_code: code,
    route_name: `wave3-route-${marker}`,
    seq: 1,
    process_type: 'dye',
    ...overrides,
  };
}

/** genCode 派生纯 ASCII 唯一标记；route.rs:28 的 len() 按字节计，故用 length 做边界自检 */
function uniqueTail(): string {
  return genCode('W3P414').replace(/-/g, '').toUpperCase();
}

async function createRoute(page: Page, payload: CreateBody, reason: string): Promise<ProcessRoute> {
  const row = await apiCallRaw<ProcessRoute>(page, 'POST', PATH, payload);
  expect(typeof row?.id, `[500] ${reason} 必须返回自建路线 id，实际 ${JSON.stringify(row)}`).toBe(
    'number'
  );
  createdIds.push(Number(row.id));
  return row;
}

async function readOwnRoute(page: Page, id: number, reason: string): Promise<ProcessRoute> {
  const row = await apiCallRaw<ProcessRoute>(page, 'GET', `${PATH}/${id}`);
  expect(Number(row?.id), `[500] ${reason} 详情 id 应等于 ${id}，实际 ${JSON.stringify(row)}`).toBe(
    id
  );
  return row;
}

async function expectGateReject(page: Page, payload: CreateBody, reason: string): Promise<void> {
  const fail = await apiCallExpectFail(page, 'POST', PATH, payload);
  expect(fail.status, `[500] ${reason} 须 400，实际 ${fail.status}`).toBe(400);
  expect(
    failureCode(fail),
    `[500] ${reason} 机器码须 BUSINESS_ERROR，实际 ${String(failureCode(fail))}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(String(fail.message), `[500] ${reason} 须为脱敏文案，实际 ${String(fail.message)}`).toBe(
    MASKED_BUSINESS_MESSAGE
  );
}

test.afterEach(async ({ page }) => {
  for (const id of createdIds) {
    if (softDeletedIds.has(id)) continue;
    await tryCleanup(page, 'DELETE', `${PATH}/${id}`, `process_route#${id}`);
  }
  createdIds.length = 0;
  softDeletedIds.clear();
});

test.describe('500 工序路线新建参数门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('500-01 编码 trim+大写归一与默认值回读，空码/长度/序号/类型门前置拒绝', async ({ page }) => {
    const tail = uniqueTail();
    const code = `W3P${tail}`;

    const created = await createRoute(
      page,
      body(`  ${code.toLowerCase()}  `, 'trim-upper'),
      'trim+小写编码'
    );
    const createdId = Number(created.id);
    const row = await readOwnRoute(page, createdId, '创建后');
    expect(row.route_code, '[500] route_code 必须回读为 trim+大写归一后的值').toBe(code);
    expect(row.route_name, '[500] route_name 不应被后端改写').toBe('wave3-route-trim-upper');
    expect(Number(row.seq), '[500] seq 必须保持请求值 1').toBe(1);
    expect(row.process_type, '[500] process_type 必须保持小写白名单值 dye').toBe('dye');
    expect(row.require_scan, '[500] require_scan 缺席应取后端默认 true').toBe(true);
    expect(row.is_active, '[500] is_active 必须取后端默认 true').toBe(true);
    expect(row.is_deleted, '[500] 新建行 is_deleted 必须为 false').toBe(false);
    expect(Number(row.created_by), '[500] created_by 必须取会话用户且大于 0').toBeGreaterThan(0);

    await expectGateReject(page, body('   ', 'blank-code'), '全空白编码');
    await expectGateReject(page, body('', 'empty-code'), '空编码');
    await expectGateReject(page, body(`${code}L0`, 'seq-zero', { seq: 0 }), '序号 0');
    await expectGateReject(page, body(`${code}LN`, 'seq-negative', { seq: -1 }), '序号 -1');
    await expectGateReject(
      page,
      body(`${code}TU`, 'type-uppercase', { process_type: 'DYE' }),
      '大写类型 DYE 不得被归一化放行'
    );
    await expectGateReject(
      page,
      body(`${code}TB`, 'type-bogus', { process_type: 'bogus' }),
      '白名单外类型 bogus'
    );

    const code32 = `${tail}${'A'.repeat(32 - tail.length)}`;
    const code33 = `${code32}B`;
    expect(code32.length, '[500] 边界码须为 32 个 ASCII 字节').toBe(32);
    expect(code33.length, '[500] 越界码须为 33 个 ASCII 字节').toBe(33);
    const atLimit = await createRoute(page, body(code32, 'len-32'), '32 字节编码');
    const atLimitRow = await readOwnRoute(page, Number(atLimit.id), '32 字节编码后');
    expect(atLimitRow.route_code, '[500] 32 字节编码应放行并原样回读').toBe(code32);
    await expectGateReject(page, body(code33, 'len-33'), '33 字节编码越界');
  });

  test('500-02 唯一判据使用归一后的非软删编码，软删后同码可重建', async ({ page }) => {
    const code = `W3P${uniqueTail()}`;
    const first = await createRoute(
      page,
      body(`  ${code.toLowerCase()}  `, 'unique-base'),
      '唯一判据基准行'
    );
    const firstId = Number(first.id);

    await expectGateReject(
      page,
      body(`  ${code.toLowerCase()}  `, 'duplicate-normalized'),
      'trim+小写重复编码'
    );
    await expectGateReject(page, body(code, 'duplicate-exact'), '归一后大写精确重复编码');

    const afterConflicts = await readOwnRoute(page, firstId, '重复冲突后');
    expect(Number(afterConflicts.id), '[500] 重复冲突不得改写基准行').toBe(firstId);
    expect(afterConflicts.route_code, '[500] 重复冲突不得改写基准行编码').toBe(code);

    await apiCallRaw(page, 'DELETE', `${PATH}/${firstId}`);
    softDeletedIds.add(firstId);

    const recreated = await createRoute(page, body(code, 'after-soft-delete'), '软删后同码重建');
    expect(
      Number(recreated.id),
      `[500] 软删后同码应分配新 id，实际仍为 ${String(recreated.id)}`
    ).not.toBe(firstId);
    const recreatedRow = await readOwnRoute(page, Number(recreated.id), '软删后重建');
    expect(recreatedRow.route_code, '[500] 重建行应回读同一归一编码').toBe(code);
    expect(recreatedRow.is_deleted, '[500] 重建行必须是非软删行').toBe(false);
  });
});
