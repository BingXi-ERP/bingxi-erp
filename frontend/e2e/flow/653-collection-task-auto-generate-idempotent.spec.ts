import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  loginViaUI,
  flushDeferredCleanups,
  type DeferredCleanup,
} from './helpers';

/**
 * 653 催收任务自动生成幂等守恒（4.6.2）
 *
 * 契约真相（逐段对过 backend 源码，非推测）：
 * - 扫描与聚合：services/collection_task_service.rs:160-201 scan_overdue_invoices
 *   取 approved 且 unpaid_amount>0 且 due_date < as_of_date 的 ar_invoice，按客户聚合
 *   total_overdue（多张发票求和）与 max_overdue_days。
 * - 幂等去重：collection_task_service.rs:204-219 customer_has_active_task 按
 *   customer_id + status ∈ {pending, in_progress} 判重，已有活动任务的客户整轮跳过
 *   （:330-338 逐客户跳过，不更新既有行）。
 * - 取号防撞：collection_task_service.rs:354-366 在数据库事务内取号，防并发撞号。
 * - 出参：handlers/collection_task_handler.rs:99-138 AutoGenerateResponse =
 *   {created: TaskInfo[], created_count}；TaskInfo 键为 snake_case
 *   （id/task_no/customer_id/overdue_amount/overdue_days/status…），
 *   overdue_amount 是 rust_decimal serde 默认的字符串形态，比较一律经 String() 归一。
 * - 列表：GET /collection-tasks?customer_id=X 出参 PagedResponse{items,total,page,page_size}，
 *   过滤键 customer_id 见 models/collection_task_dto.rs:57-67。
 * - 状态词表小写：pending/in_progress/completed/cancelled（collection_task_service.rs:64-79，
 *   写入方唯一事实来源，比较逐字符同源）。
 *
 * 为什么挑"无活动任务"的客户再落前置发票：auto-generate 无客户过滤参数，一轮扫描会为
 * 所有逾期客户建任务；判据"created_count>=1 且本客户 created>=1"只有在所选客户当前
 * 没有 pending/in_progress 任务时才稳定成立（种子数据或上一轮残留都会让它假红）。
 *
 * 测试后置：用例末尾把本客户本轮创建的任务 cancel（POST /collection-tasks/{id}/cancel
 * {cancel_reason}），让重跑能再次命中"无活动任务"前置；cancel 必须在幂等判据全部读完
 * 之后执行，故放在 finally 而非 deferCleanup 队列（cancel 需要请求体，deferCleanup
 * 的 tryCleanup 只支持无体调用）。
 */
test.describe('653 催收任务自动生成幂等守恒', () => {
  let cleanup: DeferredCleanup[] = [];

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    await flushDeferredCleanups(page, cleanup);
    cleanup = [];
  });

  test('653-01 auto-generate 同请求二发对本客户零新建且首行字段不被改写', async ({ page }) => {
    test.setTimeout(240_000);
    const tag = uniq();

    // ── 前置一：挑一个当前无 pending/in_progress 催收任务的客户 ──
    const custs = await apiCall<{ items?: CustRow[]; total?: number }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const custRows = requireItems(custs.data, '653-01 /crm/customers');
    if (custRows.length === 0) {
      throw new Error('653-01 前置不成立：/crm/customers 返回 0 行，无法构造按客户聚合的逾期事实');
    }
    let customer: CustRow | undefined;
    for (const c of custRows) {
      const existing = await apiCallRaw<{ items?: TaskRow[] }>(
        page,
        'GET',
        `/collection-tasks?customer_id=${c.id}&page=1&page_size=100`
      );
      const rows = requireItems(existing, '653-01 GET /collection-tasks');
      if (!rows.some(r => r.status === 'pending' || r.status === 'in_progress')) {
        customer = c;
        break;
      }
    }
    if (!customer) {
      throw new Error(
        '653-01 前置不成立：前 50 个客户全部已有 pending/in_progress 催收任务，幂等判据失去独立客户载体'
      );
    }
    console.log(
      `[653-01] 选中无活动任务的客户 id=${customer.id} name=${customer.customer_name} tag=${tag}`
    );

    // ── 前置二：建已审批且已过 due_date 的应收发票（approved + 逾期 45 天）──
    const invoice = await apiCallRaw<{ id: number }>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      customer_name: `${customer.customer_name}-653${tag}`,
      invoice_amount: 7654.32,
      invoice_date: pastDate(60),
      due_date: pastDate(45),
    });
    expect(
      Number.isInteger(invoice.id) && invoice.id > 0,
      `653-01 建应收发票应回主键 id，实际 ${JSON.stringify(invoice)}`
    ).toBe(true);
    await apiCallRaw(page, 'POST', `/ar/invoices/${invoice.id}/approve`);
    console.log(`[653-01] 应收发票 id=${invoice.id} 已审批，due_date=${pastDate(45)}`);

    // ── 判据一：首轮 auto-generate 必须为本客户新建任务且 created_count>=1 ──
    const gen1 = await apiCallRaw<AutoGenResult>(page, 'POST', '/collection-tasks/auto-generate', {
      min_overdue_days: 1,
    });
    expect(
      gen1.created_count,
      `653-01 首轮 auto-generate created_count 应 >=1（本客户无活动任务必被建单），实际 ${gen1.created_count}`
    ).toBeGreaterThanOrEqual(1);
    const firstRow = gen1.created.find(r => r.customer_id === customer.id);
    if (!firstRow) {
      throw new Error(
        `653-01 首轮 created 数组缺本客户（customer_id=${customer?.id}）的行，实际 customer_id 集合 ${JSON.stringify(
          gen1.created.map(r => r.customer_id)
        )}`
      );
    }
    expect(
      firstRow.task_no,
      `653-01 新建行缺 task_no，实际 ${JSON.stringify(firstRow)}`
    ).toBeTruthy();
    expect(
      Number(firstRow.overdue_amount),
      `653-01 新建行 overdue_amount 应为正数（本客户逾期发票 unpaid=7654.32），实际 ${String(
        firstRow.overdue_amount
      )}`
    ).toBeGreaterThan(0);
    expect(
      ['pending', 'in_progress'],
      `653-01 新建行 status 应为活动态小写词表，实际 ${String(firstRow.status)}`
    ).toContain(String(firstRow.status));
    console.log(
      `[653-01] 首轮 created_count=${gen1.created_count}，本客户 task_no=${firstRow.task_no} overdue_amount=${String(
        firstRow.overdue_amount
      )} status=${firstRow.status}`
    );

    try {
      // ── 判据二：同请求二发，本客户因 customer_has_active_task 整轮跳过 ──
      const gen2 = await apiCallRaw<AutoGenResult>(
        page,
        'POST',
        '/collection-tasks/auto-generate',
        { min_overdue_days: 1 }
      );
      const mineSecond = gen2.created.filter(r => r.customer_id === customer.id);
      expect(
        mineSecond.length,
        `653-01 二发对本客户必须 created=0（customer_has_active_task 去重），实际新建 ${mineSecond.length} 行`
      ).toBe(0);
      console.log(
        `[653-01] 二发 created_count=${gen2.created_count}，本客户命中 ${mineSecond.length} 行（全局计数只留证不作判据）`
      );

      // ── 判据三：本客户至多一条活动任务，且首行 task_no/overdue_amount 不被改写 ──
      const list = await apiCallRaw<{ items?: TaskRow[] }>(
        page,
        'GET',
        `/collection-tasks?customer_id=${customer.id}&page=1&page_size=100`
      );
      const listRows = requireItems(list, '653-01 GET /collection-tasks 二发后回读');
      const active = listRows.filter(r => r.status === 'pending' || r.status === 'in_progress');
      expect(
        active.length,
        `653-01 本客户活动态（pending/in_progress）任务至多一条，实际 ${active.length} 行：${JSON.stringify(
          active.map(r => ({ id: r.id, task_no: r.task_no }))
        )}`
      ).toBeLessThanOrEqual(1);
      const stored = active.find(r => r.task_no === firstRow.task_no);
      if (!stored) {
        throw new Error(
          `653-01 回读列表缺首轮行 task_no=${firstRow.task_no}，实际 ${JSON.stringify(
            listRows.map(r => ({ id: r.id, task_no: r.task_no, status: r.status }))
          )}`
        );
      }
      expect(
        String(stored.overdue_amount),
        `653-01 二发后 overdue_amount 必须保持首轮值不被改写，首轮=${String(
          firstRow.overdue_amount
        )} 回读=${String(stored.overdue_amount)}`
      ).toBe(String(firstRow.overdue_amount));
      expect(
        stored.status,
        `653-01 二发后 status 必须保持首轮值，首轮=${firstRow.status} 回读=${stored.status}`
      ).toBe(firstRow.status);
      console.log(
        `[653-01] 二发后回读：task_no=${stored.task_no} overdue_amount=${String(
          stored.overdue_amount
        )} status=${stored.status}（与首轮逐字段守恒）`
      );
    } finally {
      // 测试后置：取消本轮创建的任务，恢复"该客户无活动任务"的可重跑前置。
      // cancel 失败仅告警不掩盖判据：失败会留给下一轮的"挑客户"前置自然规避。
      await apiCallRaw<unknown>(page, 'POST', `/collection-tasks/${firstRow.id}/cancel`, {
        cancel_reason: `653-01 用例清理 ${tag}`,
      }).catch(e => {
        console.warn(`[653-01] 清理催收任务 ${firstRow.task_no} 失败（不影响判据）: ${String(e)}`);
      });
    }
  });
});

type CustRow = { id: number; customer_name: string };

type TaskRow = {
  id: number;
  task_no: string;
  customer_id: number;
  overdue_amount: string | number;
  overdue_days: number;
  status: string;
};

type AutoGenResult = { created: TaskRow[]; created_count: number };

function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 距今 days 天前的纯日期字符串（后端候选谓词按 NaiveDate 比较） */
function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 功能：列表信封缺 items 即点名抛出，绝不把"读不到键"降级成 0 行。
 * 调用方：653-01 的客户清单、催收任务清单两个读取点。
 * 入参：data 是分页信封（items 为数组），where 是点名用的端点标签。
 * 传给谁：仅用例内 expect 判据与 console 取证行。
 * 存什么/存哪里：不落库；判据行来自 collection_tasks / customers 表。
 */
function requireItems<T>(data: { items?: T[] } | null | undefined, where: string): T[] {
  if (!Array.isArray(data?.items)) {
    throw new Error(
      `${where} 响应缺少 items 数组，实际 keys=${JSON.stringify(Object.keys(data ?? {}))}`
    );
  }
  return data.items;
}
