import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCallRaw, loginViaUI } from './helpers';

/**
 * 655 邮件队列首轮重试证据（4.7.3）
 *
 * 契约真相（逐段对过 backend 源码，非推测）：
 * - 仅入队不发送：handlers/email_handler.rs:79-130 POST /send（挂载路径
 *   /api/v1/erp/send，route-snapshot.txt:1630）只写 email_logs 一行
 *   status=PENDING 并返回 {message_id, status, queued_at}，message_id 即 email_logs.id。
 * - Worker 快速失败分支（CI 实际走这条）：services/email_queue_worker.rs:100-116，
 *   EMAIL_PROVIDER/EMAIL_API_KEY/EMAIL_FROM 任一缺失时 EmailService::from_env() 返回 None
 *   （email_service.rs:334-337），process_one_email 直接 update_status(id, "FAILED",
 *   Some("邮件服务未配置（EMAIL_PROVIDER/EMAIL_API_KEY/EMAIL_FROM 缺失）"))，**不经过
 *   increment_retry**。已核实 CI 与 backend 均无 EMAIL_* env（grep .github 与 backend
 *   配置仅 .env.example 注释），故本轮断言按源码钉死：status=FAILED、error_message
 *   非空且含"邮件服务未配置"、retry_count 保持 0、next_retry_at 保持 NULL。
 *   任务判据里"retry_count=1、next_retry_at 非空"只在 EMAIL_PROVIDER 已配置且
 *   provider 发送失败时成立（email_log_service.rs:127-158 increment_retry：FAILED →
 *   retry_count+1 → 未达 MAX_RETRY_COUNT=3 时回到 PENDING 并设退避 next_retry_at），
 *   CI 无该配置不可达——按源码实际写入断言，不硬编码猜测。
 * - 回读面：GET /email-records（email_log_service.rs:218-244）支持 keyword 对
 *   subject/recipients contains 过滤，出参 PagedResponse{items,...}，键为
 *   email_log.rs 的 snake_case 字段（status/retry_count/error_message/next_retry_at）。
 * - 触发与历史：POST /scheduler/jobs/{name}/trigger 走 run_once_recorded 同步执行
 *   （scheduler_handler.rs:74-91），返回 {scheduler_name, triggered:true}；执行历史
 *   GET /scheduler/jobs/runs?scheduler_name= 按 started_at 倒序分页
 *   （scheduler_handler.rs:43-71），行键 scheduler_name/trigger/started_at/status
 *   （models/scheduler_job_run.rs:16-34），手动触发落 trigger='manual'。
 * - M-1 限额：email_handler.rs:27-29 每用户每小时 50 封，单次用例一条入队远低于上限；
 *   worker 会话账号由 globalSetup 建为 admin 角色，满足 /send 的管理员门。
 *
 * 死信（3 次退避后 FAILED 不再重试）在本文件不立：CI 无 EMAIL_* 配置时 worker 走
 * 快速失败分支，重试计数器根本不前进；即使配置了坏 provider，退避序列
 * 60s/300s/1800s（email_log_service.rs increment_retry）累计超过 6 分钟，超出 E2E
 * 单用例时限与 CI 稳定性预算，只在此登记不设断言。
 */
test.describe('655 邮件队列首轮重试证据', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('655-01 必败收件入队 PENDING，手动触发后落 FAILED 与 manual 执行历史', async ({ page }) => {
    test.setTimeout(180_000);
    const tag = uniq();
    const subject = `E2E-655 队列首轮探针 ${tag}`;
    const beforeTriggerMs = Date.now();

    // ── 判据一：POST /send 只入队，回 {message_id,status:'PENDING',queued_at} ──
    // 收件域名 .invalid 保证即使 provider 被配置也必败；text_content 纯文本绕开
    // reject_dangerous_html_before_queue 的危险 HTML 拦截（email_handler.rs:93,257）。
    const send = await apiCallRaw<{ message_id: number; status: string; queued_at: string }>(
      page,
      'POST',
      '/send',
      {
        to: [`e2e-655-queue-${tag}@example.invalid`],
        subject,
        text_content: `655 邮件队列首轮重试证据探针 ${tag}`,
      }
    );
    expect(
      Number.isInteger(send.message_id) && send.message_id > 0,
      `655-01 /send 应回正整数 message_id（即 email_logs.id），实际 ${JSON.stringify(send)}`
    ).toBe(true);
    expect(
      send.status,
      `655-01 /send 响应 status 必须是 PENDING（仅入队不发送），实际 ${String(send.status)}`
    ).toBe('PENDING');
    expect(
      send.queued_at,
      `655-01 /send 应回 queued_at 时间戳，实际 ${JSON.stringify(send)}`
    ).toBeTruthy();
    console.log(`[655-01] 入队成功 email_log id=${send.message_id} queued_at=${send.queued_at}`);

    // ── 判据二：触发前回读该行 status=PENDING、retry_count=0、无 error ──
    const before = await findRowBySubject(page, subject, send.message_id, '触发前');
    expect(before.status, `655-01 触发前行 status 必须 PENDING，实际 ${before.status}`).toBe(
      'PENDING'
    );
    expect(
      before.retry_count,
      `655-01 触发前行 retry_count 必须 0（入队不改计数），实际 ${before.retry_count}`
    ).toBe(0);
    if (before.error_message) {
      throw new Error(`655-01 触发前 error_message 应为空，实际 ${before.error_message}`);
    }

    // ── 判据三：手动触发 email-queue-worker，同步返回 triggered=true ──
    const trig = await apiCallRaw<{ scheduler_name: string; triggered: boolean }>(
      page,
      'POST',
      '/scheduler/jobs/email-queue-worker/trigger'
    );
    expect(trig.triggered, `655-01 trigger 应回 triggered=true，实际 ${JSON.stringify(trig)}`).toBe(
      true
    );
    expect(
      trig.scheduler_name,
      `655-01 trigger 应回显任务名 email-queue-worker，实际 ${String(trig.scheduler_name)}`
    ).toBe('email-queue-worker');
    console.log(`[655-01] 手动触发成功 ${JSON.stringify(trig)}`);

    // ── 判据四：触发后该行按无配置快速失败分支落 FAILED（源码钉死，见文件头）──
    const after = await findRowBySubject(page, subject, send.message_id, '触发后');
    expect(
      after.status,
      `655-01 触发后行 status 必须FAILED（CI 无 EMAIL_* 配置，worker 快速失败分支
email_queue_worker.rs:100-116 直接写 FAILED），实际 ${after.status}`
    ).toBe('FAILED');
    expect(
      typeof after.error_message === 'string' && after.error_message.length > 0,
      `655-01 触发后 error_message 必须非空，实际 ${JSON.stringify(after.error_message)}`
    ).toBe(true);
    expect(
      after.error_message?.includes('邮件服务未配置'),
      `655-01 error_message 必须落在无配置分支原文（email_queue_worker.rs:109），实际 ${after.error_message}`
    ).toBe(true);
    expect(
      after.retry_count,
      `655-01 无配置分支不经过 increment_retry，retry_count 必须保持 0，实际 ${after.retry_count}`
    ).toBe(0);
    expect(
      after.next_retry_at,
      `655-01 无配置分支不设退避，next_retry_at 必须保持 null，实际 ${String(after.next_retry_at)}`
    ).toBeNull();
    console.log(
      `[655-01] 触发后回读 status=${after.status} retry_count=${after.retry_count} next_retry_at=${String(
        after.next_retry_at
      )} error_message=${after.error_message?.slice(0, 60)}`
    );

    // ── 判据五：执行历史出现本轮 manual 行（started_at 落在触发窗口内）──
    const runs = await apiCallRaw<{ items?: RunRow[] }>(
      page,
      'GET',
      '/scheduler/jobs/runs?scheduler_name=email-queue-worker&page=1&page_size=50'
    );
    const runRows = requireItems(runs, '655-01 GET /scheduler/jobs/runs');
    if (runRows.length === 0) {
      throw new Error('655-01 执行历史 0 行：手动触发的落历史证据缺失（run_once_recorded 未落库）');
    }
    const manualRuns = runRows.filter(
      r => r.trigger === 'manual' && Date.parse(r.started_at) >= beforeTriggerMs - 5_000
    );
    expect(
      manualRuns.length,
      `655-01 执行历史必须含本轮 trigger=manual 的新行（started_at>=触发时刻），实际 ${JSON.stringify(
        runRows.slice(0, 3).map(r => ({
          scheduler_name: r.scheduler_name,
          trigger: r.trigger,
          started_at: r.started_at,
          status: r.status,
        }))
      )}`
    ).toBeGreaterThanOrEqual(1);
    console.log(
      `[655-01] 执行历史本轮行：trigger=${manualRuns[0].trigger} status=${manualRuns[0].status} started_at=${manualRuns[0].started_at}`
    );
  });
});

type EmailRow = {
  id: number;
  subject: string;
  status: string;
  retry_count: number;
  error_message: string | null;
  next_retry_at: string | null;
};

type RunRow = {
  id: number;
  scheduler_name: string;
  trigger: string;
  started_at: string;
  status: string;
};

function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 功能：按唯一 subject keyword 读回 email_logs 行并核对主键，作为逐行回读唯一通道。
 * 调用方：655-01 触发前/后两处回读。
 * 入参：page 为已登录会话；subject 为本用例唯一主题；id 为 /send 回的 message_id；
 *       where 为取证标签。
 * 传给谁：返回行供 status/retry_count/error_message/next_retry_at 判据。
 * 存什么/存哪里：不落库；判据行来自 email_logs 表（GET /email-records keyword 过滤）。
 * 找不到目标行即抛错点名，绝不把"没读到"当成"没有"。
 */
async function findRowBySubject(
  page: Page,
  subject: string,
  id: number,
  where: string
): Promise<EmailRow> {
  const data = await apiCallRaw<{ items?: EmailRow[] }>(
    page,
    'GET',
    `/email-records?keyword=${encodeURIComponent(subject)}&page=1&page_size=20`
  );
  const rows = requireItems(data, `655-01 GET /email-records（${where}）`);
  const row = rows.find(r => r.id === id);
  if (!row) {
    throw new Error(
      `655-01 ${where}回读缺 id=${id} 行，实际 ${JSON.stringify(
        rows.map(r => ({ id: r.id, subject: r.subject, status: r.status }))
      )}`
    );
  }
  return row;
}

/**
 * 功能：列表信封缺 items 即点名抛出，绝不把"读不到键"降级成 0 行。
 * 调用方：findRowBySubject 与执行历史读取点。
 * 入参：data 是分页信封，where 是点名用的端点标签。
 * 传给谁：仅用例内 expect 判据与 console 取证行。
 * 存什么/存哪里：不落库。
 */
function requireItems<T>(data: { items?: T[] } | null | undefined, where: string): T[] {
  if (!Array.isArray(data?.items)) {
    throw new Error(
      `${where} 响应缺少 items 数组，实际 keys=${JSON.stringify(Object.keys(data ?? {}))}`
    );
  }
  return data.items;
}
