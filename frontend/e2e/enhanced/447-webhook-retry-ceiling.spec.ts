// 4.28 异步任务失败重试次数上限：Webhook 投递失败 retry_count 递增至封顶后置永久失败。
// 后端判据：services/webhook_service.rs:10 MAX_RETRY_COUNT=5；
//   :118-136 trigger_webhook 先 mark_webhook_sending（:161-175 不重置 retry_count）
//   再 persist_final_status；:199-224 投递失败（success=false→FAILED / Err→ERROR）
//   递增计数；:227-238 apply_retry_increment 在 current>=5 时置
//   last_status=FAILED_PERMANENT 且不再写 retry_count（保持 5），成功则重置 0。
//   handlers/webhook_handler.rs:117-149 POST /webhooks/{id}/test 触发一次投递，
//   :153-214 POST /webhooks/{id}/retry 用持久化的 last_payload 重投（10 次/分限流）；
//   :232-253 GET /webhooks/{id}/logs 回读 retry_count/max_retry_count/last_status。
// 与既有覆盖分工：124 spec 只建行断言 retry_count=0/max=5、test 后把 last_status
//   放宽为失败族任一值、只 retry 一次；计数递增序列、封顶 5、FAILED_PERMANENT
//   均零覆盖（全 e2e 仅 124 注释提及 FAILED_PERMANENT）。本例专钉封顶链。
// 检测力：封顶判断漏写则第 5 次 retry 后 retry_count 变 6 或状态非 FAILED_PERMANENT 即红；
//   计数不递增则序列断言即红。TEST-NET-3 恒定不可达，失败为确定性前置。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCall, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

interface WebhookRow {
  id: number;
  name?: string;
}

interface WebhookLog {
  retry_count: number;
  max_retry_count: number;
  last_status: string | null;
  last_triggered_at?: string | null;
}

const TESTNET_BASE = 'https://203.0.113.7/e2e-zero-cov';

async function readLogs(page: Page, id: number, tag: string): Promise<WebhookLog> {
  const log = await apiCallRaw<WebhookLog>(page, 'GET', `/webhooks/${id}/logs`);
  expect(
    typeof log.retry_count === 'number' &&
      typeof log.max_retry_count === 'number' &&
      'last_status' in log,
    `[447] ${tag} logs 须带 retry_count/max_retry_count/last_status，实际 ${JSON.stringify(log)}`
  ).toBe(true);
  return log;
}

test('447-01 投递失败重试计数递增至 5 封顶并置永久失败，再重试不再增长', async ({ page }) => {
  await loginViaUI(page);
  const name = `e2e447-retry-${genCode('W')}`;
  const created = await apiCallRaw<WebhookRow>(page, 'POST', '/webhooks', {
    name,
    url: `${TESTNET_BASE}/${name}`,
    events: ['test'],
    is_active: true,
  });
  const id = Number(created.id);
  expect(id, `[447] 建 webhook 须返回正整数主键，实际 ${JSON.stringify(created)}`).toBeGreaterThan(
    0
  );

  try {
    const fresh = await readLogs(page, id, '建行后');
    expect(fresh.retry_count, '[447] 新建 webhook retry_count 须为 0').toBe(0);
    expect(fresh.max_retry_count, '[447] 新建 webhook max_retry_count 须为 5').toBe(5);

    // test 触发一次投递（走 trigger_webhook → persist_final_status），计数 0→1。
    const testRes = await apiCall(page, 'POST', `/webhooks/${id}/test`);
    expect(testRes.code, '[447] test 端点须返回成功信封').toBe(200);
    const afterTest = await readLogs(page, id, 'test 后');
    expect(afterTest.retry_count, '[447] test 失败后 retry_count 须为 1').toBe(1);
    expect(
      ['FAILED', 'ERROR'].includes(afterTest.last_status ?? ''),
      `[447] test 失败后 last_status 须为失败族，实际 ${afterTest.last_status}`
    ).toBe(true);

    // 第 1~4 次 retry：计数依次递增到 5，状态仍在失败族未封顶。
    for (let n = 2; n <= 5; n += 1) {
      const res = await apiCall(page, 'POST', `/webhooks/${id}/retry`);
      expect(res.code, `[447] 第 ${n - 1} 次 retry 须返回成功信封`).toBe(200);
      const log = await readLogs(page, id, `第 ${n - 1} 次 retry 后`);
      expect(log.retry_count, `[447] 第 ${n - 1} 次 retry 后 retry_count 须为 ${n}`).toBe(n);
      expect(
        ['FAILED', 'ERROR'].includes(log.last_status ?? ''),
        `[447] 第 ${n - 1} 次 retry 后尚未封顶，last_status 须在失败族，实际 ${log.last_status}`
      ).toBe(true);
    }

    // 第 5 次 retry：current 已达 5，封顶置 FAILED_PERMANENT 且 retry_count 不再增。
    const capRes = await apiCall(page, 'POST', `/webhooks/${id}/retry`);
    expect(capRes.code, '[447] 第 5 次 retry 须返回成功信封').toBe(200);
    const capped = await readLogs(page, id, '封顶后');
    expect(capped.retry_count, '[447] 封顶时 retry_count 须保持 5，不得变成 6').toBe(5);
    expect(capped.last_status, '[447] 封顶时 last_status 须为 FAILED_PERMANENT').toBe(
      'FAILED_PERMANENT'
    );

    // 第 6 次 retry：已永久失败，计数与状态都不再变化。
    const overRes = await apiCall(page, 'POST', `/webhooks/${id}/retry`);
    expect(overRes.code, '[447] 封顶后再 retry 仍须返回成功信封').toBe(200);
    const over = await readLogs(page, id, '封顶后再重试');
    expect(over.retry_count, '[447] 封顶后重试 retry_count 仍须为 5').toBe(5);
    expect(over.last_status, '[447] 封顶后重试 last_status 仍须为 FAILED_PERMANENT').toBe(
      'FAILED_PERMANENT'
    );
  } finally {
    await tryCleanup(page, 'DELETE', `/webhooks/${id}`, `447 webhook ${id}`);
  }
});
