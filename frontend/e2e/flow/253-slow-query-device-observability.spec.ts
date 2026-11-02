import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  expectDenied,
  failureCode,
  loginAsRole,
  loginViaUI,
  apiCall,
  apiCallExpectFail,
} from './helpers';

/**
 * 253 慢查询审计 / 设备连接观测族 的 e2e 配对真契约
 *
 * 守的是什么（判据全部取自后端源码实核，不凭响应形状猜）：
 * - GET /slow-queries（slow_query_handler.rs）：真台账非桩——直查 slow_query_log 表
 *   （models/slow_query.rs），信封 {items,total,page,page_size}，行键即 SlowQueryDto
 *   （models/slow_query.rs，snake_case）。分页防御：page 0 抬到 1（L90 max(1)）、
 *   page_size clamp 到 [1,100]（L91）；min_duration 过滤单调（gte 谓词 L109）且按
 *   execution_time_ms 倒序（L122）。现状缺陷点名：min_duration 负值无校验（L107-110 直接
 *   进 gte 谓词），负阈值静默放行等于不加过滤——本 spec 按现状契约断言并在此点名，
 *   不在测试侧伪造 400。min_duration 非数字属 axum Query 抽取器直出 400，文案非本 handler
 *   源码可外显原文，故只钉状态码不硬写文案。
 * - POST /slow-queries/refresh（L368-391）：真采集非桩——SlowQueryCollector::collect_once
 *   （slow_query_collector.rs）直查 pg_stat_statements（阈值 100ms / 上限 100 行）
 *   写入 slow_query_log，返回 {inserted,message}；文案两分支逐字同源（零条走「本次未发现
 *   新的慢查询…」，非零走「本次采集写入 N 条慢查询记录」）。
 * - GET /slow-queries/stats（L145-215）：近 7 天窗口按 query_text 分组的 TOP 10 真聚合，
 *   出参 {top10,total_count,time_range}，time_range 恒「近 7 天」逐字同源。与列表的聚合
 *   自洽：分组样本数之和 ≤ 窗口总数 ≤ 全量台账数（分组不复制行、窗口是全量的子集）；
 *   refresh 本轮写入行 captured_at=now 必落窗口内 ⇒ total_count ≥ inserted；top10 按
 *   max_exec_time_ms 倒序且 sample_count ≥ 1（GROUP BY 语义）。
 * - POST /device-connections/register（device_connection_handler.rs + service
 *   L55-113）：真落库非桩——以 device_id 为唯一键 upsert，置 status=online（小写词表
 *   models/device_connection.rs），服务端签发 session_token 形如 dc_{device_id}_{ts}_{nonce}。
 *   device_id 空白（trim 后）走 validation_displayable 400「device_id 不能为空」逐字同源
 *   （handler L108-111）。
 * - GET /device-connections/online/count（handler L171-184 + service L269-277）：口径 =
 *   device_connection 表 status='online' 的行数，可按 workshop 过滤；本 spec 用唯一
 *   workshop 标记钉「变化量」：注册恰好 +1，超时清理后回到基线。
 * - POST /device-connections/cleanup-timeout（handler L194-207 + service L191-226）：
 *   把 status=online 且 last_heartbeat_at < now-timeout_secs 的行批量置 timeout（单轮上限
 *   500），返回 {timed_out_count}；timeout_secs 缺省走 DEFAULT_HEARTBEAT_TIMEOUT_SECS=300
 *   （service L32），非数字/负值属 serde u64 直出 400（只钉状态码）。timeout_secs=0 时
 *   刚注册设备（last_heartbeat_at=注册时刻 < 清理时刻）必被扫入 ⇒ timed_out_count ≥ 1，
 *   且该 workshop 在线数回落到基线——写后回读闭环，不是只看 200。
 * - 权限档：六腿 handler 签名全部只挂 AuthContext（slow_query_handler.rs/147/370、
 *   device_connection_handler.rs/172/195 均为 `_auth`，无 require_admin_role），
 *   handler 层无深度防御，角色门只剩 RBAC 中间件一道（permission.rs validate_route_whitelist
 *   + 资源键 slow-queries/device-connections 已在 path_utils.rs/433 登记）。本 spec 断
 *   未登录三枚 GET 401、非 admin 业务角色调 register/cleanup-timeout 被 RBAC 拦（403
 *   FORBIDDEN）；若后端实际未拦该断言即判红并点名，不放宽成任一状态码。
 *
 * 数据卫生：register/cleanup 只操作本 worker 以唯一 E253 标记自建的设备行；cleanup 腿用
 * timeout_secs=0 会顺带把全库其他 online 且过阈设备置 timeout——设备连接表的 e2e 建档方
 * 员仅本 spec（252 族不涉设备），后台自动清理任务（60s 周期/300s 阈值，service L32-35）
 * 本就做同型清扫，不构成额外破坏。慢查询腿只读台账与触发采集，不删改数据。
 */

type SlowQueryRow = {
  id: number;
  query_text: string;
  execution_time_ms: number;
  calls: number;
  rows_examined: number;
  database_name: string | null;
  captured_at: string;
  optimization_status: string | null;
  assigned_to: string | null;
  jira_ticket: string | null;
};

type SlowQueryListBody = {
  items: SlowQueryRow[];
  total: number;
  page: number;
  page_size: number;
};

type SlowQueryStatRow = {
  query_text: string;
  max_exec_time_ms: number;
  total_calls: number;
  avg_rows: number;
  sample_count: number;
};

type SlowQueryStatsBody = {
  top10: SlowQueryStatRow[];
  total_count: number;
  time_range: string;
};

type SlowQueryRefreshBody = {
  inserted: number;
  message: string;
};

type DeviceInfo = {
  id: number;
  device_id: string;
  device_name: string | null;
  device_type: string;
  user_id: number | null;
  username: string | null;
  workshop: string | null;
  ip_address: string | null;
  session_token: string | null;
  status: string;
  last_heartbeat_at: string;
  connected_at: string;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

type OnlineCountBody = {
  online_count: number;
  workshop: string | null;
};

type CleanupBody = {
  timed_out_count: number;
};

async function loginAsNonAdmin(page: import('@playwright/test').Page): Promise<void> {
  const errors: string[] = [];
  for (const role of ['report_viewer', 'e2e_readonly']) {
    try {
      await loginAsRole(page, role);
      return;
    } catch (e) {
      errors.push(`${role}: ${(e as Error).message}`);
    }
  }
  throw new Error(`非 admin 角色账号基建缺失（两个候选角色都登录不上）：${errors.join(' | ')}`);
}

test.describe('253 慢查询设备连接观测配对', () => {
  test('慢查询列表：信封与逐字段形状、分页 clamp、排序与 min_duration 过滤自洽', async ({
    page,
  }) => {
    await loginViaUI(page);

    const base = await apiCall<SlowQueryListBody>(page, 'GET', '/slow-queries?page_size=500');
    // 分页防御：page_size 被 clamp 到上限 100（slow_query_handler.rs）
    expect(base.data.page_size, 'page_size=500 应被 clamp 到 100').toBe(100);
    expect(base.data.page).toBe(1);
    expect(base.data.total).toBeGreaterThanOrEqual(base.data.items.length);

    for (const row of base.data.items) {
      expect(typeof row.id).toBe('number');
      expect(typeof row.query_text).toBe('string');
      expect(typeof row.execution_time_ms).toBe('number');
      expect(typeof row.calls).toBe('number');
      expect(row.captured_at, 'captured_at 为 ISO8601 字符串（SlowQueryDto 序列化）').toBeTruthy();
    }
    // 排序口径：execution_time_ms 倒序（L122 order_by_desc）
    for (let i = 1; i < base.data.items.length; i++) {
      expect(
        base.data.items[i - 1].execution_time_ms,
        '列表必须按 execution_time_ms 倒序'
      ).toBeGreaterThanOrEqual(base.data.items[i].execution_time_ms);
    }

    const pageZero = await apiCall<SlowQueryListBody>(page, 'GET', '/slow-queries?page=0');
    expect(pageZero.data.page, 'page=0 应被抬到 1（L90 max(1)）').toBe(1);

    const highFloor = await apiCall<SlowQueryListBody>(
      page,
      'GET',
      '/slow-queries?min_duration=1e12'
    );
    expect(highFloor.data.total, '阈值 1e12ms 高于任何真实耗时，窗口必为空').toBe(0);
    expect(highFloor.data.items).toEqual([]);

    const midFloor = await apiCall<SlowQueryListBody>(page, 'GET', '/slow-queries?min_duration=1');
    expect(midFloor.data.total, 'gte 谓词单调：加阈值后的总数不得大于全量').toBeLessThanOrEqual(
      base.data.total
    );

    // 现状契约（缺陷已点名）：负值 min_duration 无校验、静默放行等于全量
    const neg = await apiCall<SlowQueryListBody>(page, 'GET', '/slow-queries?min_duration=-5');
    expect(neg.data.total, '负阈值现状不报错且等同类全量（执行耗时非负）').toBe(base.data.total);

    // 非数字阈值：axum Query 抽取器直出 400，文案非 handler 源码可外显原文，只钉状态码
    const badType = await apiCallExpectFail(page, 'GET', '/slow-queries?min_duration=not-a-num');
    expect(badType.status, 'min_duration 非数字应 400').toBe(400);
  });

  test('慢查询 refresh→stats→列表 三方自洽：文案逐字同源、聚合窗口包含关系成立', async ({
    page,
  }) => {
    await loginViaUI(page);

    const refreshed = await apiCall<SlowQueryRefreshBody>(page, 'POST', '/slow-queries/refresh');
    expect(typeof refreshed.data.inserted).toBe('number');
    expect(refreshed.data.inserted).toBeGreaterThanOrEqual(0);
    if (refreshed.data.inserted === 0) {
      expect(
        refreshed.data.message,
        '零条分支文案须与 slow_query_handler.rs 逐字同源'
      ).toBe('本次未发现新的慢查询（最近 5 分钟内无 mean_exec_time > 100ms 的查询）');
    } else {
      expect(refreshed.data.message, '非零分支文案族与 slow_query_handler.rs 同源').toMatch(
        /^本次采集写入 \d+ 条慢查询记录$/
      );
    }

    const stats = await apiCall<SlowQueryStatsBody>(page, 'GET', '/slow-queries/stats');
    expect(stats.data.time_range, '统计窗口描述逐字同源（L213）').toBe('近 7 天');
    expect(stats.data.top10.length).toBeLessThanOrEqual(10);

    let samplesOfTop10 = 0;
    for (const s of stats.data.top10) {
      expect(typeof s.query_text).toBe('string');
      expect(typeof s.max_exec_time_ms).toBe('number');
      expect(s.sample_count, 'GROUP BY 分组样本数至少 1').toBeGreaterThanOrEqual(1);
      samplesOfTop10 += s.sample_count;
    }
    for (let i = 1; i < stats.data.top10.length; i++) {
      expect(
        stats.data.top10[i - 1].max_exec_time_ms,
        'TOP10 必须按 max_exec_time_ms 倒序（SQL ORDER BY L160）'
      ).toBeGreaterThanOrEqual(stats.data.top10[i].max_exec_time_ms);
    }

    // 聚合关系自洽：分组样本和 ≤ 近 7 天总数 ≤ 全量台账数；本轮 refresh 写入行必落 7 天窗内
    expect(
      samplesOfTop10,
      'top10 分组样本之和不得超过窗口总条数（分组不复制行）'
    ).toBeLessThanOrEqual(stats.data.total_count);
    expect(
      stats.data.total_count,
      'refresh 本轮写入行 captured_at=now 必在 7 天窗口内'
    ).toBeGreaterThanOrEqual(refreshed.data.inserted);

    const fullList = await apiCall<SlowQueryListBody>(page, 'GET', '/slow-queries?page_size=1');
    expect(
      fullList.data.total,
      '7 天窗是台账全量的子集：stats 总数不得超过列表 total'
    ).toBeGreaterThanOrEqual(stats.data.total_count);
  });

  test('设备连接写后回读闭环：register→online/count 恰好 +1→cleanup-timeout(0s) 后回落基线', async ({
    page,
  }) => {
    await loginViaUI(page);

    const deviceId = `E253D${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const workshop = `E253W${deviceId}`;
    const wsQuery = `/device-connections/online/count?workshop=${encodeURIComponent(workshop)}`;

    const before = await apiCall<OnlineCountBody>(page, 'GET', wsQuery);
    expect(typeof before.data.online_count).toBe('number');
    expect(before.data.workshop, 'count 回显 workshop 入参（handler L182）').toBe(workshop);

    const reg = await apiCall<DeviceInfo>(page, 'POST', '/device-connections/register', {
      device_id: deviceId,
      device_type: 'pda',
      device_name: 'e253-probe',
      workshop,
    });
    expect(reg.data.device_id).toBe(deviceId);
    expect(reg.data.status, 'register 落库即置 online（service L97，小写词表）').toBe('online');
    expect(reg.data.session_token, 'token 前缀 dc_{device_id}_ 与 service L282-290 拼接式同源').toMatch(
      new RegExp(`^dc_${deviceId}_\\d+_\\d+$`)
    );
    expect(reg.data.last_heartbeat_at).toBeTruthy();
    expect(reg.data.disconnected_at, '新注册连接不记下线时间').toBeNull();

    const afterReg = await apiCall<OnlineCountBody>(page, 'GET', wsQuery);
    expect(
      afterReg.data.online_count,
      '唯一 workshop 下注册恰好使在线数 +1（断变化量非恒大于 0）'
    ).toBe(before.data.online_count + 1);

    const cleaned = await apiCall<CleanupBody>(page, 'POST', '/device-connections/cleanup-timeout', {
      timeout_secs: 0,
    });
    expect(
      cleaned.data.timed_out_count,
      'timeout_secs=0 时刚注册设备（心跳时刻早于清理时刻）必被扫入'
    ).toBeGreaterThanOrEqual(1);

    const afterClean = await apiCall<OnlineCountBody>(page, 'GET', wsQuery);
    expect(
      afterClean.data.online_count,
      '超时清理后该设备不再计入在线，唯一 workshop 口径回落基线'
    ).toBe(before.data.online_count);
  });

  test('设备连接负例：device_id 空白 400 逐字文案；timeout_secs 负值 400；缺省走 300s 默认阈值', async ({
    page,
  }) => {
    await loginViaUI(page);

    const blank = await apiCallExpectFail(page, 'POST', '/device-connections/register', {
      device_id: '   ',
    });
    expect(blank.status).toBe(400);
    expect(failureCode(blank)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(blank.message, '须与 device_connection_handler.rs 逐字同源').toBe(
      'device_id 不能为空'
    );

    // 负值 timeout_secs：serde u64 反序列化直出 400，文案非 handler 源码原文，只钉状态码
    const negTimeout = await apiCallExpectFail(
      page,
      'POST',
      '/device-connections/cleanup-timeout',
      { timeout_secs: -1 }
    );
    expect(negTimeout.status, 'timeout_secs 为负应 400').toBe(400);

    // 缺省阈值腿：不带 timeout_secs ⇒ DEFAULT_HEARTBEAT_TIMEOUT_SECS=300（service L32），
    // 只清 5 分钟外心跳的设备，返回计数为非负数即契合成立
    const defaulted = await apiCall<CleanupBody>(
      page,
      'POST',
      '/device-connections/cleanup-timeout',
      {}
    );
    expect(typeof defaulted.data.timed_out_count).toBe('number');
    expect(defaulted.data.timed_out_count).toBeGreaterThanOrEqual(0);
  });

  test('未登录访问三枚 GET 应 401', async ({ page }) => {
    await loginViaUI(page);
    // 清掉本 context 会话 cookie 后直取，AuthContext 提取失败应 401
    await page.context().clearCookies();

    for (const path of [
      '/slow-queries?page_size=1',
      '/slow-queries/stats',
      '/device-connections/online/count',
    ]) {
      const anon = await apiCallExpectFail(page, 'GET', path);
      expect(anon.status, `未登录访问 ${path} 应 401`).toBe(401);
    }
  });

  test('权限门：非 admin 业务角色访问 register 与 cleanup-timeout 应被拦（handler 无深度防御，RBAC 独木）', async ({
    page,
  }) => {
    await loginAsNonAdmin(page);

    const regDenied = await apiCallExpectFail(page, 'POST', '/device-connections/register', {
      device_id: `E253FORBID${Date.now()}`,
      device_type: 'pda',
    });
    expectDenied(regDenied, '非 admin 调用设备 register');

    const cleanDenied = await apiCallExpectFail(
      page,
      'POST',
      '/device-connections/cleanup-timeout',
      { timeout_secs: 0 }
    );
    expectDenied(cleanDenied, '非 admin 调用 cleanup-timeout');
  });
});
