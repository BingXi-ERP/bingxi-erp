import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  genCode,
  tryCleanup,
  loginAsRole,
  verifyPermissionDenied,
  APP_ERROR_CODES,
} from './helpers';

/**
 * 445 成本归集分摊对平 与 全端操作审计追溯链
 *
 * 覆盖面。成本归集单（cost_collections）按五个费用明细列（direct_material
 * 直接材料、direct_labor 直接人工、manufacturing_overhead 制造费用、
 * processing_fee 加工费、dyeing_fee 染费）登记分摊，落库时服务端把五列相加
 * 生成 total_cost，本 spec 从单据侧与批次归集侧两侧回读并按分精确对平，
 * 再经删除与审核写操作验证审计日志的落库、追溯、防篡改与脱敏面。
 *
 * 端点真相（frontend/scripts/route-snapshot.txt 逐条可查，挂载前缀 /api/v1/erp）。
 * POST /production/cost-collections（cost_collection_handler::create_collection），
 * GET /production/cost-collections（list_collections，出参 data 为模型数组本体，
 * 非分页四键信封），GET /production/cost-collections/{id}（get_collection 详情），
 * GET /production/cost-collections/analysis/by-batch?batch_no=（get_cost_by_batch
 * 批次归集，出参 BatchCostAnalysis 数组，含全部五明细列与 total_cost 与 status），
 * POST /production/cost-collections/{id}/audit（audit_collection，入参 approved 布尔），
 * DELETE /production/cost-collections/{id}（delete_collection，内部走
 * AuditLogService::delete_with_audit 落删除审计）。
 * GET /audit-logs（audit_log_handler::list_audit_logs，出参分页四键
 * items,total,page,page_size，支持 resource_type 与 operation_type 与 resource_id
 * 筛选），GET /audit-logs/{id}（get_audit_log 详情，比列表条目多 before_snapshot
 * 与 after_snapshot 两键）。快照中不存在 PUT 与 DELETE /audit-logs 路由。
 *
 * 词表与算量真相（backend/src/services/cost_collection_service.rs 与
 * handlers/cost_collection_handler.rs、services/audit_log_service.rs）。
 * 建单 status 固定写 draft，审核通过写 approved、拒绝写 rejected，
 * 非 draft 再审核被业务门拒绝且文案不含状态字面量。单号 COST 前缀加日期八位加流水三位。
 * total_cost 为五明细列直加，无其他系数；unit_cost 为总额除以产量后 round_dp(2)，
 * 产量缺省存 NULL。rust_decimal 出参为字符串。删除审计行 operation_type 为 DELETE
 * 大写、severity 为 INFO、username 由 user_id 反查、before_snapshot 为删除前整行快照、
 * after_snapshot 为 NULL，且该服务侧写入路径不携带请求上下文，ip_address 与
 * user_agent 与 request_path 与 request_id 落 NULL（终端维度缺口，见下缺陷点名）。
 *
 * 本支暴露的源码缺陷（只写会红的断言，不修源码）。
 * 一，创建与更新与审核写操作未接任何审计写入，create 与 update 与 audit 三个
 * 写端点落库后 /audit-logs 查不到 CREATE 留痕，445-05 末段断言即为此暴露，预期红。
 * 二，分摊金额无负数与非空校验，direct_material 传 -100.00 会被原样接受并落库，
 * 445-04 期望按仓内校验拒掉，预期红。
 * 三，审计条目 DTO 无角色维度、删除审计无终端字段真值，本 spec 按实际形态断言
 * user_id 与 username 与时间，不编造 role 字段名，缺口在此点名。
 *
 * 假绿防线。金额一律按序列化字符串拆成整数分比对，不做浮点加法、不再舍入，
 * 五列之和与 total_cost 逐分对平，禁止合计凑平。每次被拒写操作紧跟列表回读
 * 探针断零残留。状态词表逐字符比对 draft 与 approved 与 rejected。
 * 负例走 apiCallExpectFail 读统一信封机器码，不读文案。数据以 genCode 唯一缸号与归集单号隔离，
 * 批次号只在 445-02 为构造"同批次多笔"前置而复用一次，收尾用 tryCleanup 显式删除并留日志。
 */

type Row = Record<string, unknown>;

/** 五个费用明细列名（与 backend/src/models/cost_collection.rs 字段逐字符一致） */
const FEE_COLUMNS = [
  'direct_material',
  'direct_labor',
  'manufacturing_overhead',
  'processing_fee',
  'dyeing_fee',
] as const;

interface FeeSet {
  direct_material: string;
  direct_labor: string;
  manufacturing_overhead: string;
  processing_fee: string;
  dyeing_fee: string;
}

/**
 * 把 DECIMAL 序列化字符串按整数分解析。
 * 功能，测试内精确加和的唯一手段，杜绝浮点误差与二次舍入伪装对平。
 * 入参，列值（必须是字符串形态的十进制数，小数位不超过 2，即库列 scale）。
 * 形态异常直接断言失败外显原值，不做 String 强转兜底。
 */
function centsOf(v: unknown, label: string): number {
  expect(typeof v, `${label} 应为 DECIMAL 序列化字符串，实际类型 ${typeof v}`).toBe('string');
  const s = String(v);
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  expect(m, `${label} 应为最多两位小数的十进制字符串，实际 ${s}`).not.toBeNull();
  const sign = (m as RegExpExecArray)[1] === '-' ? -1 : 1;
  const frac = ((m as RegExpExecArray)[3] ?? '').padEnd(2, '0');
  return sign * (Number((m as RegExpExecArray)[2]) * 100 + Number(frac));
}

/** 对一行数据的五明细列与 total_cost 做逐分对平，返回单据总额分 */
function assertLineReconciled(row: Row, label: string): number {
  const feeCents = FEE_COLUMNS.map(c => centsOf(row[c], `${label}.${c}`));
  const sumCents = feeCents.reduce((a, b) => a + b, 0);
  const totalCents = centsOf(row.total_cost, `${label}.total_cost`);
  expect(
    sumCents,
    `${label} 五明细列按分加和 ${sumCents} 应与 total_cost ${totalCents} 逐分对平`
  ).toBe(totalCents);
  return totalCents;
}

/** 跨测试传递的单据句柄（serial 顺序保证写入先于读取） */
interface DocHandle {
  id: number;
  collectionNo: string;
  batchNo: string;
  dyeLotNo: string;
  totalCents: number;
}
let docA: DocHandle | undefined;
let docB: DocHandle | undefined;
let deleteAuditId: number | undefined;

/**
 * 建一张成本归集单并做详情回读，入参为五列金额与批次缸号。
 * 批次与缸号缺省各自新造唯一值（负例与清理腿靠它互相隔离）；调用方传入 batchNo 时按该批次落单，
 * 供「同一批次多笔归集」的批次分析腿构造前置（cost_collections.batch_no 无唯一约束，
 * 见 migration 快照 001_consolidated_schema.sql 的 idx_cost_collections_batch 普通索引）。
 */
async function createCostDoc(
  page: Page,
  fees: FeeSet,
  reuse?: { batchNo: string }
): Promise<DocHandle> {
  const batchNo = reuse?.batchNo ?? genCode('E445B');
  const dyeLotNo = genCode('E445L');
  const body: Record<string, unknown> = {
    collection_date: new Date().toISOString().slice(0, 10),
    batch_no: batchNo,
    dye_lot_no: dyeLotNo,
    color_no: genCode('E445C'),
    workshop: 'E445 染整车间',
    output_quantity_meters: '100.00',
    ...fees,
  };
  const created = await apiCallRaw<Row>(page, 'POST', '/production/cost-collections', body);
  console.log(`[445] 建单成功 collection_no=${created.collection_no} id=${created.id}`);

  expect(
    String(created.collection_no),
    `单号应为 COST 加日期八位加流水三位，实际 ${created.collection_no}`
  ).toMatch(/^COST\d{11}$/);
  expect(created.status, '建单状态应逐字符等于 draft（service create 固定值）').toBe('draft');
  expect(created.batch_no, '创建响应应回显批次').toBe(batchNo);
  expect(created.dye_lot_no, '创建响应应回显缸号').toBe(dyeLotNo);

  const detail = await apiCallRaw<Row>(page, 'GET', `/production/cost-collections/${created.id}`);
  expect(Number(detail.id), '详情 id 应与建单 id 一致').toBe(Number(created.id));
  expect(detail.total_cost, '详情 total_cost 应与创建响应同串').toBe(created.total_cost);
  const totalCents = assertLineReconciled(detail, `单据 ${created.collection_no} 详情侧`);

  return {
    id: Number(created.id),
    collectionNo: String(created.collection_no),
    batchNo,
    dyeLotNo,
    totalCents,
  };
}

test.describe.serial('445 成本归集分摊对平与审计追溯链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('445-01 分摊录入两侧回读，五明细列与总额逐分对平', async ({ page }) => {
    docA = await createCostDoc(page, {
      direct_material: '1000.11',
      direct_labor: '200.22',
      manufacturing_overhead: '300.33',
      processing_fee: '150.05',
      dyeing_fee: '400.44',
    });

    // 明细侧回读，批次列表出参 data 为模型数组本体，逐列与录入串等值
    const rows = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/production/cost-collections?batch_no=${docA.batchNo}`
    );
    expect(Array.isArray(rows), '列表端点 data 应为模型数组').toBe(true);
    const mine = rows.filter(r => r.collection_no === docA?.collectionNo);
    expect(mine.length, `批次列表应恰含本次单据 1 行，实际 ${mine.length}`).toBe(1);
    expect(mine[0].dyeing_fee, '列表侧染费应与录入串逐字符一致').toBe('400.44');
    expect(mine[0].unit_cost_meters, '产量 100.00 时单位成本应非 NULL').not.toBeNull();
    assertLineReconciled(mine[0], `单据 ${docA.collectionNo} 列表侧`);
  });

  test('445-02 同批次多笔归集，批次分析侧与单据侧逐分一致', async ({ page }) => {
    if (!docA) {
      throw new Error(
        '445-02 前置不成立：445-01 未落库成本归集单，取不到单据 A 句柄，批次对平无从谈起'
      );
    }
    const a = docA;
    // 批次分析腿的前置是「同一批次两笔」，第二笔必须复用 A 的批次号；缸号仍逐单唯一，
    // 445-04b 依赖按缸号在删除快照里回溯本单。
    const b = await createCostDoc(
      page,
      {
        direct_material: '500.06',
        direct_labor: '50.07',
        manufacturing_overhead: '60.08',
        processing_fee: '0.00',
        dyeing_fee: '120.12',
      },
      { batchNo: a.batchNo }
    );
    docB = b;

    const analysis = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/production/cost-collections/analysis/by-batch?batch_no=${a.batchNo}`
    );
    expect(Array.isArray(analysis), '批次分析端点 data 应为 BatchCostAnalysis 数组').toBe(true);
    expect(analysis.length, `同批次应归集到 2 行，实际 ${analysis.length}`).toBe(2);

    let batchSumCents = 0;
    for (const row of analysis) {
      const cents = assertLineReconciled(row, `批次分析行 ${row.collection_no}`);
      batchSumCents += cents;
      const handle = row.collection_no === a.collectionNo ? a : b;
      expect(cents, `批次分析行 ${row.collection_no} 的 total_cost 应与单据侧逐分一致`).toBe(
        handle.totalCents
      );
      expect(row.status, '批次分析行应回显草稿状态 draft').toBe('draft');
    }
    const bothDocsCents = a.totalCents + b.totalCents;
    expect(
      batchSumCents,
      `批次归集两笔合计 ${batchSumCents} 应与两侧单据总额分之和 ${bothDocsCents} 对平`
    ).toBe(bothDocsCents);
  });

  test('445-03 审核状态门，draft 到 approved 逐字符回读且拒绝重复审核', async ({ page }) => {
    expect(docA, '445-03 依赖 445-01 的单据句柄').toBeDefined();
    const approved = await apiCallRaw<Row>(
      page,
      'POST',
      `/production/cost-collections/${docA?.id}/audit`,
      { approved: true }
    );
    expect(approved.status, '审核通过状态应逐字符等于 approved').toBe('approved');
    console.log(`[445] 单据 ${docA?.collectionNo} 审核通过`);

    const again = await apiCallExpectFail(
      page,
      'POST',
      `/production/cost-collections/${docA?.id}/audit`,
      { approved: true }
    );
    expect(again.status, '非 draft 再审核应被拒').toBeGreaterThanOrEqual(400);
    expect(failureCode(again), `重复审核拒绝机器码应为 BUSINESS_ERROR，实际 ${again.code}`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );

    const after = await apiCallRaw<Row>(page, 'GET', `/production/cost-collections/${docA?.id}`);
    expect(after.status, '被拒审核不得改状态').toBe('approved');

    await tryCleanup(
      page,
      'DELETE',
      `/production/cost-collections/${docA?.id}`,
      `清理单据 A ${docA?.collectionNo}`
    );
  });

  test('445-04 非法分摊拦截，缺列必拒，负额应被仓内校验拒掉且零残留', async ({ page }) => {
    const probeBatch = genCode('E445NEG');

    // 空值面，dyeing_fee 为必填列，缺键必须被反序列化校验拒绝
    const missing = await apiCallExpectFail(page, 'POST', '/production/cost-collections', {
      collection_date: new Date().toISOString().slice(0, 10),
      batch_no: probeBatch,
      direct_material: '1.00',
      direct_labor: '1.00',
      manufacturing_overhead: '1.00',
      processing_fee: '1.00',
    });
    expect(missing.status, '缺必填染费列应被拒').toBeGreaterThanOrEqual(400);
    expect(
      [APP_ERROR_CODES.VALIDATION_ERROR, APP_ERROR_CODES.BAD_REQUEST],
      `缺列拒绝机器码应落在反序列化校验族，实际 ${missing.code}`
    ).toContain(failureCode(missing));

    // 负额面，仓内无金额下限校验即为目标口径缺口，断言拒绝以暴露缺陷
    const negative = await apiCallExpectFail(page, 'POST', '/production/cost-collections', {
      collection_date: new Date().toISOString().slice(0, 10),
      batch_no: probeBatch,
      direct_material: '-100.00',
      direct_labor: '0.00',
      manufacturing_overhead: '0.00',
      processing_fee: '0.00',
      dyeing_fee: '0.00',
    });
    if (negative.status < 400) {
      const leaked = (negative as unknown as { data?: Row }).data;
      console.error(`[445] 缺陷暴露，负额分摊被接受并落库 id=${leaked?.id}`);
      if (leaked?.id !== undefined) {
        await tryCleanup(
          page,
          'DELETE',
          `/production/cost-collections/${leaked.id}`,
          '回收负额残行'
        );
      }
    }
    expect(negative.status, '负额分摊应被校验拒绝，源码缺陷本支只暴露不修').toBeGreaterThanOrEqual(
      400
    );

    const residue = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/production/cost-collections?batch_no=${probeBatch}`
    );
    expect(residue.length, `两次被拒写操作后批次 ${probeBatch} 应零残留`).toBe(0);
  });

  test('445-04b 删除审计落库可按单号缸号回溯，条目形态不含快照与请求体', async ({ page }) => {
    expect(docB, '445-04b 依赖 445-02 的单据句柄').toBeDefined();
    await apiCall(page, 'DELETE', `/production/cost-collections/${docB?.id}`);
    console.log(`[445] 单据 ${docB?.collectionNo} 已删除，转入审计追溯`);

    const logs = await apiCallRaw<{ items: Row[]; total: number; page: number; page_size: number }>(
      page,
      'GET',
      `/audit-logs?resource_type=cost_collection&operation_type=DELETE&resource_id=${docB?.id}&page=1&page_size=20`
    );
    expect(logs.total, '删除审计应至少落 1 行').toBeGreaterThanOrEqual(1);
    const hit = logs.items.filter(it => String(it.resource_id) === String(docB?.id));
    expect(hit.length, `按 resource_id=${docB?.id} 应命中删除审计`).toBeGreaterThanOrEqual(1);

    const item = hit[0];
    expect(Number(item.user_id), '审计应记录操作人 id 且为正').toBeGreaterThan(0);
    expect(typeof item.username, '删除审计 username 由 user_id 反查落库').toBe('string');
    expect(String(item.username).length, '审计操作账号名应非空').toBeGreaterThan(0);
    expect(item.operation_type, '高危标记形态为 operation_type 大写 DELETE').toBe('DELETE');
    expect(item.severity, '仓内删除审计 severity 实际落 INFO，未走高危标级，按真实形态断言').toBe(
      'INFO'
    );
    expect(String(item.created_at), '审计应落操作时间').toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // 脱敏面，列表条目 DTO 不携带快照与请求体两键，详情端点才展开
    expect('before_snapshot' in item, '列表条目不应外显变更前快照').toBe(false);
    expect('request_body' in item, '列表条目不应外显请求体').toBe(false);
    deleteAuditId = Number(item.id);

    const detail = await apiCallRaw<Row>(page, 'GET', `/audit-logs/${deleteAuditId}`);
    expect(detail.before_snapshot, '删除审计详情应含删除前整行快照').not.toBeNull();
    const snap = JSON.stringify(detail.before_snapshot);
    expect(snap.includes(docB?.collectionNo as string), '快照应可按单号回溯').toBe(true);
    expect(snap.includes(docB?.dyeLotNo as string), '快照应可按缸号回溯').toBe(true);
    expect(detail.after_snapshot, '删除操作无变更后镜像，详情 after_snapshot 应为 NULL').toBeNull();
  });

  test('445-05 审计不可篡改，仓内未注册任何改删审计路由且记录仍在', async ({ page }) => {
    expect(deleteAuditId, '445-05 依赖 445-04b 命中的审计 id').toBeDefined();

    const del = await apiCallExpectFail(page, 'DELETE', `/audit-logs/${deleteAuditId}`);
    expect([404, 405], `审计删除通道应不存在于路由快照，实际 status=${del.status}`).toContain(
      del.status
    );
    const put = await apiCallExpectFail(page, 'PUT', `/audit-logs/${deleteAuditId}`, {
      description: '篡改尝试',
    });
    expect([404, 405], `审计改道通道应不存在，实际 status=${put.status}`).toContain(put.status);

    const still = await apiCallRaw<Row>(page, 'GET', `/audit-logs/${deleteAuditId}`);
    expect(Number(still.id), '改删被拒后审计记录必须原样存在').toBe(deleteAuditId);
    expect(still.before_snapshot, '改删被拒后快照不得丢失').not.toBeNull();

    // 创建留痕缺口，create 与 audit 写端点未接 AuditLogService，目标口径要求写操作前后镜像留痕
    const createLogs = await apiCallRaw<{ items: Row[] }>(
      page,
      'GET',
      '/audit-logs?resource_type=cost_collection&operation_type=CREATE&page=1&page_size=100'
    );
    const createHit = (createLogs.items ?? []).filter(
      it =>
        String(it.resource_id) === String(docA?.id) || String(it.resource_id) === String(docB?.id)
    );
    expect(
      createHit.length,
      `建单写操作应留 CREATE 审计，实际命中 ${createHit.length}，源码 create 未接审计写入，本支只暴露不修`
    ).toBeGreaterThanOrEqual(1);
  });

  test('445-06 审计端点对非授权岗位整体拒绝，admin 对照可达', async ({ page }) => {
    const adminView = await apiCallRaw<{ items: Row[] }>(
      page,
      'GET',
      '/audit-logs?page=1&page_size=5'
    );
    expect(Array.isArray(adminView.items), 'admin 基线应可读审计列表').toBe(true);

    await loginAsRole(page, 'report_viewer');
    await verifyPermissionDenied(page, 'GET', '/audit-logs?page=1&page_size=5');
    console.log('[445] report_viewer 读审计被 FORBIDDEN 拒绝，操作审计面按岗收口');
  });
});
