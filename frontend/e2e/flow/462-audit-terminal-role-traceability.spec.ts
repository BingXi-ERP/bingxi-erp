import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  genCode,
  loginAsRole,
  testUsername,
  APP_ERROR_CODES,
} from './helpers';
import { createDepartmentUI } from './ui-helpers';

/**
 * 462 审计定位维度（终端/角色/单号/原因/风险）落库与追溯链 e2e
 *
 * **声明：本文件未在本地实跑（本机禁跑 Playwright），仅按后端源码契约编写，待 CI 分片验证。**
 *
 * 覆盖面。审计定位维度写入与读取的真实闭环：经真实登录会话（每 worker 独立 admin 账号，
 * 见 global-setup 的分片建号通道）用真实 UI 表单链建一条部门（前端 axios 请求携带浏览器
 * User-Agent 与 Referer，后端按生产中间件判定终端与页面），按 resource 定位该审计行走详情
 * 通道逐维断言；再以真实删除端点造一次高风险操作，断言 risk_flag 自动落 DELETE；随后对
 * 追溯筛选面（terminal_type 等值 / risk_flag 精筛与 high 并集 / doc_no 等值 / role_code 等值）
 * 逐面钉列表信封与逐行等值；最后以无审计读面权限的岗位做 403 对照，错误码不断成"非 200 就行"。
 *
 * 端点真相（route-snapshot 与 routes/system.rs、routes/iam.rs、routes/production.rs 可查，
 * 挂载前缀 /api/v1/erp）。POST /departments（department_handler 经 crud_macro 的 create，
 * service 层 department_service::create 另写一条 resource_type=department、resource_id=真实
 * id 的 CREATE 审计，crud_macro 自身的补审计 resource_id 为 NULL、resource_type 为服务名，
 * 两者按键值筛可区分，本用例只追溯 service 那条）；GET /departments/{id} 出参 data 为实体
 * 本体；GET /audit-logs（audit_log_handler::list_audit_logs，出参四键 items,total,page,page_size，
 * 支持 start_time、end_time、user_id、operation_type、severity、resource_type、request_id、
 * keyword、doc_no、terminal_type、risk_flag 与分页参数，按 created_at 倒序）；
 * GET /audit-logs/{id}（get_audit_log，详情比列表多 before_snapshot、after_snapshot、
 * old_value、new_value 四键，列表条目不携带任何快照键）。POST /production/cost-collections
 * 建成本归集单（出参 data 为实体本体，单号 COST 前缀加日期加流水），
 * DELETE /production/cost-collections/{id} 内部走 AuditLogService::delete_with_audit
 * 同步落 resource_type=cost_collection 的 DELETE 审计（同事务单点，响应返回时行已可查）。
 * 快照中不存在 PUT 与 DELETE /audit-logs 路由，审计行无删除通道。
 *
 * 词表真相（与 backend/src/middleware/audit_context.rs 常量逐字符相同）。
 * 终端 TERMINAL_PC=PC、TERMINAL_H5=H5、TERMINAL_MINIPROGRAM=MINIPROGRAM、TERMINAL_UNKNOWN=UNKNOWN；
 * 高风险标记 RISK_DELETE=DELETE、RISK_REVERSE=REVERSE、RISK_VOID=VOID。操作类型与严重级别为
 * 大写（models/audit_log.rs 的 OperationType 与 Severity as_str）。删除的高风险标记由写入单点
 * 自动补（audit_log_service.rs 的 insert_delete_audit_log），更新与异步单点从请求作用域取五维。
 *
 * 如实声明的覆盖面缺口（只写会红的断言与真实形态，不修源码、不编造端点）。
 * 一，作废与红冲：mark_audit_high_risk 在本支生产代码无业务调用点（仅契约测试夹具调用），
 * 仓内不存在会落 risk_flag=VOID 或 REVERSE 的真实端点，故高风险面本用例只断删除这一枚。
 * 二，doc_no：set_audit_doc_no 在本支生产代码同样无业务调用点，真实建档路径的 doc_no 按
 * NULL 落库，故出参断言按 None 形态（null）钉真值；"按 doc_no 等值筛命中本链"的正向腿
 * 待业务侧单号登记接线的支落库后升级，本文件对该筛只钉等值语义（见 462-03 的排他探针）。
 * 三，角色维：并行在途支为审计表新增角色码列与按角色筛选参数，出参键名与查询参数名按
 * 口径 role_code 断言（等值于会话角色码 admin）；本支 handler 尚无该键，该断言在合入前
 * 会红，属口径对表的暴露而非假绿；若在途支最终键名漂移，红面直指漂移点。
 * 四，change_reason：真实建档路径不登记变更原因，按 None 出参形态（null）断言。
 *
 * 岗与权限真相（permission.rs 超管旁路 + init_service_ops 矩阵 + admin_checker 深度防御）。
 * 操作岗取每 worker 真实持有的 admin 会话账号：部门建的 POST /departments 经权限中间件
 * 的超管旁路放行（is_admin_role 按角色表 code == admin 判定），init 矩阵里显式持有
 * ("departments","*") 的 hr_manager 到不了审计读面（handler 层 admin/auditor 角色门），
 * 建档—追溯闭环只能落在 admin 岗上，这不是越权冒充成功而是岗位真实持有面。
 * 越权对照取仓内先例岗位 report_viewer（无审计读权限码且非 admin/auditor）。
 *
 * 假绿防线。列表信封声明为必填四键并在运行时逐键钉类型，不给默认值兜底；快照类断言一律
 * 走详情通道（列表条目无快照键，状态跃迁不在列表上断）；等值筛选逐行断"每行都满足条件"，
 * 另用业务名称值做 doc_no 等值排他探针（命中零行即证明筛选未泄漏成跨列模糊匹配），
 * keyword 通道作同值对照证明"该值真实存在且可检"，避免恒过断言；异步落库通道（record_async
 * 走进程内总线）用有界轮询等待行出现，超时可外显点名，不是 sleep 猜时序；负例走
 * apiCallExpectFail + failureCode 钉 HTTP 403 与机器码 FORBIDDEN 双判据，不读文案。
 * 数据以 genCode 唯一批次与 UI 表单唯一部门名隔离；审计行无删除端点，残留按 445 先例以
 * 唯一标记点名（见 462-04 收尾日志），不登记会打空的删除位点，不伪装 404 回读核验。
 */

type Row = Record<string, unknown>;

/** 终端取值（与 middleware/audit_context.rs 的 TERMINAL_PC 逐字符相同） */
const TERMINAL_PC = 'PC';
/** 高风险标记取值（与 middleware/audit_context.rs 的 RISK_DELETE 逐字符相同） */
const RISK_DELETE = 'DELETE';

/**
 * 审计列表项出参键名（以 handlers/audit_log_handler.rs 的 AuditLogListItem 为准逐个字段核）。
 * 除 role_code 外全部为当前 handler 实有键；role_code 为并行在途支的角色码列口径键名
 * （Option 语义：值可为 null，但键必须存在）。所有键必填不给孩子型可选——键缺失即断言面
 * 判红，比静默 undefined 更接近契约真相。
 */
interface AuditListItem {
  id: number;
  user_id: number | null;
  username: string | null;
  operation_type: string | null;
  severity: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  request_method: string | null;
  request_path: string | null;
  created_at: string | null;
  terminal_type: string | null;
  operation_page: string | null;
  doc_no: string | null;
  change_reason: string | null;
  risk_flag: string | null;
  role_code: string | null;
}

/** 审计详情出参 = 列表项摊平（serde flatten）+ 四快照键（get_audit_log） */
interface AuditDetailItem extends AuditListItem {
  before_snapshot: Row | null;
  after_snapshot: Row | null;
  old_value: Row | null;
  new_value: Row | null;
}

/** 列表信封（AuditLogListResponse 四键，声明必填、不给默认值兜底） */
interface AuditListEnvelope {
  items: AuditListItem[];
  total: number;
  page: number;
  page_size: number;
}

/**
 * 钉列表信封形状：data 必须是含 items 数组与 total/page/page_size 三数的对象。
 * 调用方：各审计列表断言前置。入参：apiCallRaw 解出的 data 运行时值。
 * 传给谁：调用方的逐行断言腿。存什么/存哪里：不持久化，只做形状判定。
 * 形状失配即抛错外显实际键集合，绝不退化成"当空列表处理"。
 */
function assertAuditEnvelope(raw: unknown, context: string): AuditListEnvelope {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `[${context}] 审计列表信封失配：期望对象{items,total,page,page_size}，实际 ${typeof raw}`
    );
  }
  const env = raw as Record<string, unknown>;
  if (!Array.isArray(env.items)) {
    throw new Error(
      `[${context}] 审计列表信封失配：items 应为数组，实际键集合=${JSON.stringify(
        Object.keys(env)
      )}`
    );
  }
  for (const key of ['total', 'page', 'page_size'] as const) {
    if (typeof env[key] !== 'number') {
      throw new Error(
        `[${context}] 审计列表信封失配：${key} 应为数字，实际 ${typeof env[key]}（值 ${String(
          env[key]
        )}）`
      );
    }
  }
  return env as unknown as AuditListEnvelope;
}

/**
 * 有界轮询等待审计列表按查询串命中行（异步总线落库通道的确定性等待）。
 * 调用方：462-01 的部门 CREATE 行定位。入参：page、resource 定位查询串、外显点名用的标签。
 * 传给谁：调用方的逐字段断言腿。存什么/存哪里：不持久化，只回传命中行数组。
 * 超过 60 秒仍未出现即抛错点名查询串，不静默放行空结果。
 */
async function pollAuditRows(
  page: Page,
  listQuery: string,
  label: string
): Promise<AuditListItem[]> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const env = assertAuditEnvelope(
      await apiCallRaw<unknown>(page, 'GET', `/audit-logs?${listQuery}&page=1&page_size=100`),
      label
    );
    if (env.items.length > 0) return env.items;
    if (Date.now() >= deadline) {
      throw new Error(
        `[${label}] 60 秒内审计行未出现（查询串 ${listQuery}）——写入通道未落库或键名漂移，判红不放过`
      );
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
}

/** 跨测试传递的句柄（serial 顺序保证写入先于读取与筛选） */
let deptAuditId: number | undefined;
let deptId: number | undefined;
let deleteAuditId: number | undefined;
let costCollectionNo: string | undefined;

test.describe.serial('462 审计定位维度落库与追溯链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('462-01 真实 UI 会话建档，审计行终端/页面/角色逐维落库且快照只在详情', async ({ page }) => {
    // 建档请求必须出自浏览器页面：真实 axios 请求携带桌面浏览器 User-Agent（判 PC 的桌面
    // 特征）与同源 Referer（页面标识来源），这是终端维在真实链路上的权威写入形态。
    const createdId = await createDepartmentUI(page);
    if (!createdId) {
      throw new Error(
        '[462-01] 部门 UI 建档失败（createDepartmentUI 返回空），建档审计无从谈起，显式判红'
      );
    }
    deptId = createdId;
    const dept = await apiCallRaw<Row>(page, 'GET', `/departments/${deptId}`);
    expect(Number(dept.id), '部门详情 id 应与建档返回 id 一致').toBe(deptId);

    // 按 resource 定位 service 写入方那条 CREATE 行（crud_macro 的补审计 resource_id 为 NULL，
    // 被 resource_id 等值条件天然排除）
    const rows = await pollAuditRows(
      page,
      `resource_type=department&operation_type=CREATE&resource_id=${deptId}`,
      '462-01 部门建档审计定位'
    );
    expect(rows.length, `resource_id=${deptId} 的建档审计应恰命中 1 行，实际 ${rows.length}`).toBe(
      1
    );
    const item = rows[0];
    deptAuditId = Number(item.id);

    // 逐字符词表断言（audit_context.rs 常量口径）
    expect(
      item.terminal_type,
      '浏览器会话建档应判终端 PC（桌面 UA 特征），实际 ' + String(item.terminal_type)
    ).toBe(TERMINAL_PC);
    expect(
      item.operation_page,
      `页面维应取自同源 Referer 的 /departments，实际 ${String(item.operation_page)}`
    ).toBe('/departments');
    expect(
      item.role_code,
      '角色维应等于本会话真实持有的角色码 admin（并行在途支 role_code 列口径；' +
        '本支出参尚无该键时此断言按口径对表判红）'
    ).toBe('admin');
    // 写入侧未登记单号与原因的真实形态：出参 null（键存在、值 null），不是"存在即可"
    expect(item.doc_no, '建档路径未接业务侧单号登记，doc_no 应按 NULL 落库出参 null').toBeNull();
    expect(
      item.change_reason,
      '建档路径未登记变更原因，change_reason 应按 NULL 落库出参 null'
    ).toBeNull();
    expect(item.risk_flag, '普通建档非高风险操作，risk_flag 应为 NULL').toBeNull();
    expect(item.operation_type, '操作类型应逐字符为大写 CREATE').toBe('CREATE');
    expect(item.severity, '严重级别应逐字符为大写 INFO').toBe('INFO');
    expect(Number(item.user_id), '审计应记录操作人 id 且为正').toBeGreaterThan(0);
    expect(
      item.username,
      `username 由 user_id 反查落库，应为本 worker 会话账号 ${testUsername()}`
    ).toBe(testUsername());
    expect(String(item.created_at), '审计应落操作时间').toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 快照只在详情出参：列表条目不得携带任何快照键（445 已实证的形态）
    expect('before_snapshot' in item, '列表条目不应外显变更前快照').toBe(false);
    expect('after_snapshot' in item, '列表条目不应外显变更后快照').toBe(false);

    // 详情通道断快照（状态跃迁类断言不走列表）
    const detail = await apiCallRaw<AuditDetailItem>(page, 'GET', `/audit-logs/${deptAuditId}`);
    expect(Number(detail.id), '详情 id 应与定位到的列表行一致').toBe(deptAuditId);
    expect(
      detail.terminal_type,
      '详情的终端维应与列表行同值（同一落库行的两个读面）'
    ).toBe(TERMINAL_PC);
    expect(detail.after_snapshot, 'CREATE 详情应含变更后快照').not.toBeNull();
    expect(
      Number((detail.after_snapshot as Row).id),
      'after_snapshot 应回显新建部门 id'
    ).toBe(deptId);
    expect(
      String(detail.description),
      '描述应为写入方文案口径 创建部门: {名称}'
    ).toBe(`创建部门: ${String(dept.name)}`);
    expect(detail.before_snapshot, 'CREATE 无变更前镜像，before_snapshot 应为 null').toBeNull();
  });

  test('462-02 真实删除落高风险 DELETE 标记，删除审计可按单号回溯且无后镜像', async ({ page }) => {
    const batchNo = genCode('E462B');
    const created = await apiCallRaw<Row>(page, 'POST', '/production/cost-collections', {
      collection_date: new Date().toISOString().slice(0, 10),
      batch_no: batchNo,
      dye_lot_no: genCode('E462L'),
      color_no: genCode('E462C'),
      workshop: 'E462 车间',
      output_quantity_meters: '100.00',
      direct_material: '10.00',
      direct_labor: '10.00',
      manufacturing_overhead: '10.00',
      processing_fee: '10.00',
      dyeing_fee: '10.00',
    });
    const costId = Number(created.id);
    expect(costId, '成本归集单创建应回自增 id').toBeGreaterThan(0);
    costCollectionNo = String(created.collection_no);
    expect(
      costCollectionNo,
      `业务单号应为 COST 加日期加流水形态，实际 ${costCollectionNo}`
    ).toMatch(/^COST\d{11}$/);

    await apiCall(page, 'DELETE', `/production/cost-collections/${costId}`);

    // 删除审计由写入单点同步落库（delete_with_audit 在响应返回前完成 insert）
    const rows = (
      await pollAuditRows(
        page,
        `resource_type=cost_collection&operation_type=DELETE&resource_id=${costId}`,
        '462-02 删除审计定位'
      )
    ).filter(it => String(it.resource_id) === String(costId));
    expect(rows.length, `resource_id=${costId} 的删除审计应恰命中 1 行`).toBe(1);
    const item = rows[0];
    deleteAuditId = Number(item.id);
    // 高风险标记由写入单点自动补（业务未显式登记也落），词表逐字符等于 audit_context.rs
    expect(
      item.risk_flag,
      `删除审计的 risk_flag 应逐字符为 ${RISK_DELETE}，实际 ${String(item.risk_flag)}`
    ).toBe(RISK_DELETE);
    expect(item.operation_type, '删除审计操作类型应逐字符为大写 DELETE').toBe('DELETE');
    expect('before_snapshot' in item, '列表条目不应外显快照').toBe(false);

    const detail = await apiCallRaw<AuditDetailItem>(page, 'GET', `/audit-logs/${deleteAuditId}`);
    expect(detail.before_snapshot, '删除审计详情应含删除前整行快照').not.toBeNull();
    expect(
      JSON.stringify(detail.before_snapshot).includes(costCollectionNo as string),
      '删除前快照应可按业务单号回溯'
    ).toBe(true);
    expect(detail.after_snapshot, '删除无变更后镜像，应为 null').toBeNull();
  });

  test('462-03 追溯筛选面：先钉信封，终端/风险/角色逐行等值，doc_no 等值语义排他', async ({
    page,
  }) => {
    expect(deptAuditId, '462-03 依赖 462-01 的建档审计行句柄').toBeDefined();
    expect(deleteAuditId, '462-03 依赖 462-02 的删除审计行句柄').toBeDefined();

    // 信封先钉：分页回显与 total 关系
    const base = assertAuditEnvelope(
      await apiCallRaw<unknown>(page, 'GET', '/audit-logs?page=1&page_size=10'),
      '462-03 信封基线'
    );
    expect(base.page, '信封应回显请求页码').toBe(1);
    expect(base.page_size, '信封应回显请求页长').toBe(10);
    expect(
      base.total,
      `total(${base.total}) 应不小于本页返回条数(${base.items.length})`
    ).toBeGreaterThanOrEqual(base.items.length);

    // 终端等值筛选：结果集每行都满足 terminal_type=PC，且本链建档行在其中
    const pcEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/audit-logs?terminal_type=${TERMINAL_PC}&resource_type=department&page=1&page_size=100`
      ),
      '462-03 终端筛选'
    );
    for (const it of pcEnv.items) {
      expect(it.terminal_type, `terminal_type=PC 筛选结果每行应等值，失配行 id=${it.id}`).toBe(
        TERMINAL_PC
      );
    }
    expect(
      pcEnv.items.some(it => Number(it.id) === deptAuditId),
      '浏览器会话建档行应出现在 terminal_type=PC 筛选结果中'
    ).toBe(true);

    // 风险精筛：risk_flag=DELETE 每行等值且含删除行；risk_flag=high 为"任意非空标记"并集，
    // 含删除行、不得含 risk_flag 为 NULL 的建档行
    const delEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/audit-logs?risk_flag=${RISK_DELETE}&page=1&page_size=100`
      ),
      '462-03 风险精筛 DELETE'
    );
    for (const it of delEnv.items) {
      expect(it.risk_flag, `risk_flag=DELETE 精筛每行应等值，失配行 id=${it.id}`).toBe(RISK_DELETE);
    }
    expect(
      delEnv.items.some(it => Number(it.id) === deleteAuditId),
      '删除审计行应出现在 risk_flag=DELETE 精筛结果中'
    ).toBe(true);
    const highEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(page, 'GET', '/audit-logs?risk_flag=high&page=1&page_size=100'),
      '462-03 风险并集 high'
    );
    for (const it of highEnv.items) {
      expect(
        it.risk_flag,
        `risk_flag=high 结果每行标记应非空（NULL 行不得混入），失配行 id=${it.id}`
      ).not.toBeNull();
    }
    expect(
      highEnv.items.some(it => Number(it.id) === deleteAuditId),
      '删除审计行应出现在 risk_flag=high 并集结果中'
    ).toBe(true);
    expect(
      highEnv.items.some(it => Number(it.id) === deptAuditId),
      '普通建档行 risk_flag 为 NULL，不得出现在 high 并集里'
    ).toBe(false);

    // 角色等值筛选（并行在途支 role_code 口径；本支 handler 尚无该查询参数与出参键时，
    // 逐行等值面对未知键取 undefined 会红，属口径对表的暴露）
    const roleEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        '/audit-logs?role_code=admin&resource_type=department&page=1&page_size=100'
      ),
      '462-03 角色筛选'
    );
    for (const it of roleEnv.items) {
      expect(it.role_code, `role_code=admin 筛选每行应等值，失配行 id=${it.id}`).toBe('admin');
    }
    expect(
      roleEnv.items.some(it => Number(it.id) === deptAuditId),
      'admin 会话建档行应出现在 role_code=admin 筛选结果中（角色维在途支落库口径）'
    ).toBe(true);

    // doc_no 等值语义排他探针：部门名称真实存在于该行的 resource_name/description 列，
    // 若 doc_no 筛选被误实现成跨列模糊匹配就会命中它；等值只打 doc_no 列则应零行。
    // 同时用 keyword 通道证明该名称确实可检（排除"库里根本没这行"的假通过）。
    const deptDetail = await apiCallRaw<Row>(page, 'GET', `/departments/${deptId}`);
    const deptName = String(deptDetail.name);
    const docNoEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/audit-logs?doc_no=${encodeURIComponent(deptName)}&page=1&page_size=100`
      ),
      '462-03 doc_no 等值排他'
    );
    expect(
      docNoEnv.total,
      `doc_no 应为等值筛选：部门名只存在于名称/描述列，按 doc_no 筛应零命中，实际 ${docNoEnv.total}`
    ).toBe(0);
    const kwEnv = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/audit-logs?keyword=${encodeURIComponent(deptName)}&page=1&page_size=100`
      ),
      '462-03 keyword 对照'
    );
    expect(
      kwEnv.items.some(it => Number(it.id) === deptAuditId),
      'keyword 模糊通道应能命中同一建档行（证明上一步零命中来自等值语义而非行不存在）'
    ).toBe(true);
    // 本链业务单号的等值筛选：写入侧单号登记未落本支（文件头缺口二），正向命中腿待接线
    // 落库后升级；此处先钉"命中的每行都等值"的排他面。
    const byNo = assertAuditEnvelope(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/audit-logs?doc_no=${encodeURIComponent(costCollectionNo as string)}&page=1&page_size=100`
      ),
      '462-03 doc_no 本链筛选'
    );
    for (const it of byNo.items) {
      expect(it.doc_no, `按单号追溯每行 doc_no 应等值，失配行 id=${it.id}`).toBe(costCollectionNo);
    }
  });

  test('462-04 越权对照：无审计读面岗位 403 钉 FORBIDDEN，收尾点名残留唯一标记', async ({
    page,
  }) => {
    // admin 基线可读：apiCall 对非 200 业务信封直接抛错，信封钉形即证明端点真实可达，
    // 后续同端点的 403 拒绝才能归因于岗位而不是路由或会话失效
    assertAuditEnvelope(
      await apiCallRaw<unknown>(page, 'GET', '/audit-logs?page=1&page_size=5'),
      '462-04 admin 基线'
    );

    // 切到仓内先例越权岗：report_viewer 无审计读权限码且非 admin/auditor（audit_log_handler
    // 的角色深度防御拒绝，445 已实证该岗被 FORBIDDEN）
    await loginAsRole(page, 'report_viewer');

    const deniedList = await apiCallExpectFail(page, 'GET', '/audit-logs?page=1&page_size=5');
    expect(deniedList.status, '无审计读面岗位打列表端点应被拒 403').toBe(403);
    expect(
      failureCode(deniedList),
      `列表拒绝机器码应为 FORBIDDEN（权限门/角色门统一码），实际 ${String(deniedList.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    const deniedDetail = await apiCallExpectFail(page, 'GET', `/audit-logs/${deptAuditId}`);
    expect(deniedDetail.status, '同岗位打详情端点应同样被角色门拒 403').toBe(403);
    expect(
      failureCode(deniedDetail),
      `详情拒绝机器码应为 FORBIDDEN，实际 ${String(deniedDetail.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 残留点名：审计行按后端现实没有 DELETE 端点（路由快照中审计面只有 GET），不登记会
    // 打空的删除位点；业务侧成本归集单已由 462-02 的被测删除清掉，部门行按本仓先例保留，
    // 以唯一标记点名如下。
    console.log(
      `[462] 残留点名 部门 id=${deptId} 审计行 id=${deptAuditId}；` +
        `删除审计行 id=${deleteAuditId} 关联业务单号 ${costCollectionNo}（单据本体已删）；` +
        `批次唯一标记前缀 E462B/E462L/E462C`
    );
  });
});
